import * as SecureKey from './SecureKeyService'
import { getDb } from '../db/db'
import { API_ENDPOINTS, RETRY_CONFIG } from '../config/constants'
import { Keypair, Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, type ParsedAccountData } from '@solana/web3.js'
import { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction, getAccount } from '@solana/spl-token'
import bs58 from 'bs58'
import { dialog } from 'electron'
import fs from 'node:fs'
import { executeTransaction, getConnection, getHeliusApiKey, getJupiterApiKey, getPriorityFeeLamports, withKeypair, type TransactionExecutionResult } from './SolanaService'
import type { JupiterTokenSearchResult, WalletDashboard } from '../shared/types'

const DEFAULT_FETCH_TIMEOUT_MS = 8_000
const KEY_VALIDATION_FETCH_TIMEOUT_MS = 6_000
const SWAP_FETCH_TIMEOUT_MS = 15_000

function isTestRuntime() {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
}

async function fetchWithTimeout(url: string | URL, init: RequestInit = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): Promise<Response> {
  if (isTestRuntime()) return fetch(url, init)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchWithRetry(url: string, retries = RETRY_CONFIG.MAX_RETRIES, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetchWithTimeout(url, undefined, timeoutMs)
    if (response.ok) return response

    if (response.status === 429 && attempt < retries - 1) {
      const retryAfter = response.headers.get('retry-after')
      const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt)
      await new Promise((r) => setTimeout(r, delay))
      continue
    }

    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  throw new Error('Max retries exceeded')
}

interface WalletRow {
  id: string
  name: string
  address: string
  keypair_path: string | null
  is_default: number
  agent_id: string | null
  wallet_type: string
  created_at: number
}

interface HeliusBalance {
  mint: string
  balance: number
  decimals: number
  symbol?: string
  name?: string
  pricePerToken?: number
  usdValue?: number
  logoUri?: string
}

interface HeliusBalancesResponse {
  balances: HeliusBalance[]
  totalUsdValue: number
  pagination?: { page: number; limit: number; hasMore: boolean }
}

interface HeliusDasAsset {
  id?: string
  content?: {
    metadata?: {
      name?: string
      symbol?: string
    }
    links?: {
      image?: string
    }
  }
  token_info?: {
    symbol?: string
    balance?: number | string
    decimals?: number
    price_info?: {
      price_per_token?: number
      total_price?: number
    }
  }
}

interface HeliusDasResponse {
  result?: {
    items?: HeliusDasAsset[]
    nativeBalance?: {
      lamports?: number
      price_per_sol?: number
      total_price?: number
    }
  }
  error?: {
    message?: string
  }
}

interface HeliusHistoryEvent {
  signature: string
  timestamp?: number
  type?: string
  description?: string
}

interface WalletSummary {
  id: string
  name: string
  address: string
  isDefault: boolean
  totalUsd: number
  tokenCount: number
  assignedProjectIds: string[]
}

interface HoldingSummary {
  mint: string
  symbol: string
  name: string
  amount: number
  priceUsd: number
  valueUsd: number
  logoUri: string | null
}

interface PortfolioFeedEntry {
  walletId: string
  walletName: string
  totalUsd: number
  deltaUsd: number
}

const lastWalletTotals = new Map<string, number>()
const exportCooldowns = new Map<string, number>()
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const BASE_SIGNATURE_FEE_LAMPORTS = 5_000
const SOL_TRANSFER_COMPUTE_UNITS = 20_000
const TOKEN_TRANSFER_COMPUTE_UNITS = 80_000
const TOKEN_TRANSFER_WITH_ATA_COMPUTE_UNITS = 140_000

// In-memory balance cache with 30-second TTL
const balanceCache = new Map<string, { data: HeliusBalancesResponse; timestamp: number }>()
const BALANCE_CACHE_TTL = 30_000
const dashboardCache = new Map<string, { data: WalletDashboard; timestamp: number }>()
const dashboardInflight = new Map<string, Promise<WalletDashboard>>()
const DASHBOARD_CACHE_TTL = 30_000
const DASHBOARD_STALE_TTL = 5 * 60_000
let lastSolPrice = 0

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

export async function getDashboard(projectId?: string | null): Promise<WalletDashboard> {
  if (isTestRuntime()) return buildDashboard(projectId)

  const cacheKey = projectId ?? '__default__'
  const cached = dashboardCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < DASHBOARD_CACHE_TTL) return cached.data

  const inflight = dashboardInflight.get(cacheKey)
  if (inflight) return inflight

  const request = buildDashboard(projectId)
    .then((data) => {
      dashboardCache.set(cacheKey, { data, timestamp: Date.now() })
      return data
    })
    .catch((error) => {
      if (cached && Date.now() - cached.timestamp < DASHBOARD_STALE_TTL) return cached.data
      throw error
    })
    .finally(() => {
      dashboardInflight.delete(cacheKey)
    })

  dashboardInflight.set(cacheKey, request)
  return request
}

async function buildDashboard(projectId?: string | null): Promise<WalletDashboard> {
  const heliusKey = SecureKey.getKey('HELIUS_API_KEY')
  const heliusConfigured = Boolean(heliusKey)
  const wallets = listWalletsRaw()
  const projectAssignments = getProjectAssignments()
  const activeWalletRow = resolveActiveWallet(wallets, projectId ?? null)

  const market = await getMarketTape()

  if (!heliusConfigured || wallets.length === 0) {
    const fallbackResults = await runWithConcurrency(
      wallets,
      5,
      async (wallet) => {
        const solHolding = await getNativeSolHolding(wallet.address)
        const holdings = solHolding ? [solHolding] : []
        const walletTotal = holdings.reduce((sum, holding) => sum + holding.valueUsd, 0)
        return { wallet, holdings, walletTotal }
      },
    )

    const fallbackSummaries: WalletSummary[] = []
    let fallbackTotalUsd = 0
    let fallbackActiveWallet: { id: string; name: string; address: string; holdings: HoldingSummary[] } | null = null

    for (const result of fallbackResults) {
      if (result.status !== 'fulfilled') continue
      const { wallet, holdings, walletTotal } = result.value
      fallbackTotalUsd += walletTotal
      fallbackSummaries.push({
        id: wallet.id,
        name: wallet.name,
        address: wallet.address,
        isDefault: wallet.is_default === 1,
        totalUsd: walletTotal,
        tokenCount: holdings.length,
        assignedProjectIds: projectAssignments.get(wallet.id) ?? [],
      })
      if (activeWalletRow && wallet.id === activeWalletRow.id) {
        fallbackActiveWallet = {
          id: wallet.id,
          name: wallet.name,
          address: wallet.address,
          holdings,
        }
      }
    }

    return {
      heliusConfigured,
      market,
      portfolio: {
        totalUsd: fallbackTotalUsd,
        delta24hUsd: 0,
        delta24hPct: 0,
        walletCount: wallets.length,
      },
      wallets: fallbackSummaries.sort((a, b) => b.totalUsd - a.totalUsd),
      activeWallet: fallbackActiveWallet,
      feed: [] as PortfolioFeedEntry[],
      recentActivity: [] as HeliusHistoryEvent[],
    }
  }

  const apiKey = heliusKey as string

  // Process wallets with bounded concurrency to avoid overwhelming the Helius API
  const WALLET_CONCURRENCY = 3
  const walletResults = await runWithConcurrency(
    wallets,
    WALLET_CONCURRENCY,
    async (wallet) => {
      let holdings: HoldingSummary[]
      try {
        const balances = await getWalletBalances(wallet.address, apiKey)
        holdings = normalizeHoldings(balances.balances)
      } catch {
        const solHolding = await getNativeSolHolding(wallet.address)
        holdings = solHolding ? [solHolding] : []
      }
      const walletTotal = holdings.reduce((sum, holding) => sum + holding.valueUsd, 0)
      await maybeSnapshotWallet(wallet.id, holdings)

      const events = activeWalletRow && wallet.id === activeWalletRow.id
        ? await getWalletHistory(wallet.address, apiKey)
        : []

      return {
        wallet,
        holdings,
        walletTotal,
        events,
      }
    },
  )

  const walletSummaries: WalletSummary[] = []
  const feed: PortfolioFeedEntry[] = []
  let totalUsd = 0
  let activeWallet: { id: string; name: string; address: string; holdings: HoldingSummary[] } | null = null
  let activeWalletEvents: HeliusHistoryEvent[] = []

  for (const result of walletResults) {
    if (result.status !== 'fulfilled') continue

    const { wallet, holdings, walletTotal, events } = result.value
    totalUsd += walletTotal

    walletSummaries.push({
      id: wallet.id,
      name: wallet.name,
      address: wallet.address,
      isDefault: wallet.is_default === 1,
      totalUsd: walletTotal,
      tokenCount: holdings.length,
      assignedProjectIds: projectAssignments.get(wallet.id) ?? [],
    })

    const previous = lastWalletTotals.get(wallet.id) ?? walletTotal
    feed.push({
      walletId: wallet.id,
      walletName: wallet.name,
      totalUsd: walletTotal,
      deltaUsd: walletTotal - previous,
    })
    lastWalletTotals.set(wallet.id, walletTotal)

    if (activeWalletRow && wallet.id === activeWalletRow.id) {
      activeWallet = {
        id: wallet.id,
        name: wallet.name,
        address: wallet.address,
        holdings: holdings.slice(0, 12),
      }
      activeWalletEvents = events
    }
  }

  const walletIds = wallets.map((w) => w.id)
  const previousTotalUsd = getPreviousTotalUsd(walletIds)
  // Only show delta if previous snapshot existed and was meaningful (> $1)
  // This avoids absurd percentages from deposits into near-empty wallets
  const hasMeaningfulPrevious = previousTotalUsd !== null && previousTotalUsd > 1
  const delta24hUsd = hasMeaningfulPrevious ? totalUsd - previousTotalUsd : 0
  const rawPct = hasMeaningfulPrevious ? (delta24hUsd / previousTotalUsd!) * 100 : 0
  const delta24hPct = Math.max(-999, Math.min(999, rawPct))

  return {
    heliusConfigured,
    market,
    portfolio: {
      totalUsd,
      delta24hUsd,
      delta24hPct,
      walletCount: wallets.length,
    },
    wallets: walletSummaries.sort((a, b) => b.totalUsd - a.totalUsd),
    activeWallet,
    feed: feed.sort((a, b) => Math.abs(b.deltaUsd) - Math.abs(a.deltaUsd)),
    recentActivity: activeWalletEvents,
  }
}

export function listWallets() {
  const projectAssignments = getProjectAssignments()
  return listWalletsRaw().map((wallet) => ({
    id: wallet.id,
    name: wallet.name,
    address: wallet.address,
    is_default: wallet.is_default,
    wallet_type: wallet.wallet_type ?? 'user',
    created_at: wallet.created_at,
    assigned_project_ids: projectAssignments.get(wallet.id) ?? [],
  }))
}

export function createWallet(name: string, address: string) {
  const trimmedName = name.trim()
  const trimmedAddress = address.trim()
  if (!trimmedName) throw new Error('Wallet name is required')
  if (!isValidSolanaAddress(trimmedAddress)) throw new Error('Invalid Solana wallet address')

  const db = getDb()
  const id = crypto.randomUUID()
  const existingDefault = db.prepare('SELECT id FROM wallets WHERE is_default = 1').get() as { id: string } | undefined
  db.prepare(
    'INSERT INTO wallets (id, name, address, is_default, created_at) VALUES (?,?,?,?,?)'
  ).run(id, trimmedName, trimmedAddress, existingDefault ? 0 : 1, Date.now())
  return db.prepare('SELECT id, name, address, is_default, wallet_type, created_at FROM wallets WHERE id = ?').get(id)
}

export function ensureWatchWallet(name: string, address: string, walletType = 'user') {
  const trimmedName = name.trim()
  const trimmedAddress = address.trim()
  if (!trimmedName) throw new Error('Wallet name is required')
  if (!isValidSolanaAddress(trimmedAddress)) throw new Error('Invalid Solana wallet address')

  const db = getDb()
  const existing = db.prepare('SELECT id FROM wallets WHERE address = ? LIMIT 1').get(trimmedAddress) as { id: string } | undefined
  if (existing) {
    const wallet = listWallets().find((entry) => entry.id === existing.id)
    if (!wallet) throw new Error('Could not resolve existing wallet')
    return wallet
  }

  const created = createWallet(trimmedName, trimmedAddress) as { id: string }
  db.prepare('UPDATE wallets SET wallet_type = ? WHERE id = ?').run(walletType, created.id)
  const wallet = listWallets().find((entry) => entry.id === created.id)
  if (!wallet) throw new Error('Could not resolve created wallet')
  return wallet
}

export function deleteWallet(id: string) {
  const db = getDb()

  // Warn but don't block — user may need to remove a broken wallet
  // The keypair is destroyed so this operation is irreversible for funded wallets

  db.transaction(() => {
    const row = db.prepare('SELECT is_default FROM wallets WHERE id = ?').get(id) as { is_default: number } | undefined

    db.prepare('UPDATE projects SET wallet_id = NULL WHERE wallet_id = ?').run(id)
    db.prepare('DELETE FROM portfolio_snapshots WHERE wallet_id = ?').run(id)
    db.prepare('DELETE FROM transaction_history WHERE wallet_id = ?').run(id)
    db.prepare('DELETE FROM wallets WHERE id = ?').run(id)

    if (row?.is_default === 1) {
      const replacement = db.prepare('SELECT id FROM wallets ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined
      if (replacement) db.prepare('UPDATE wallets SET is_default = 1 WHERE id = ?').run(replacement.id)
    }
  })()
}

export function setDefaultWallet(id: string) {
  const db = getDb()
  db.transaction(() => {
    db.prepare('UPDATE wallets SET is_default = 0').run()
    db.prepare('UPDATE wallets SET is_default = 1 WHERE id = ?').run(id)
  })()
}

export function assignWalletToProject(projectId: string, walletId: string | null) {
  const db = getDb()
  db.prepare('UPDATE projects SET wallet_id = ? WHERE id = ?').run(walletId, projectId)
}

export function getProjectWalletId(projectId: string | null): string | null {
  if (!projectId) return null
  const db = getDb()
  const row = db.prepare('SELECT wallet_id FROM projects WHERE id = ?').get(projectId) as { wallet_id: string | null } | undefined
  return row?.wallet_id ?? null
}

export async function storeHeliusKey(value: string) {
  const res = await fetchWithTimeout(`https://mainnet.helius-rpc.com/?api-key=${value}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
  }, KEY_VALIDATION_FETCH_TIMEOUT_MS)
  if (!res.ok) throw new Error('Invalid Helius API key — connection failed')
  SecureKey.storeKey('HELIUS_API_KEY', value)
}

export function deleteHeliusKey() {
  SecureKey.deleteKey('HELIUS_API_KEY')
}

export function hasHeliusKey() {
  return Boolean(getHeliusApiKey())
}

export async function storeJupiterKey(value: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Jupiter API key is required')

  const res = await fetchWithTimeout('https://api.jup.ag/tokens/v2/search?query=SOL', {
    headers: { 'x-api-key': trimmed },
  }, KEY_VALIDATION_FETCH_TIMEOUT_MS)
  if (!res.ok) throw new Error('Invalid Jupiter API key — connection failed')
  SecureKey.storeKey('JUPITER_API_KEY', trimmed)
}

export function deleteJupiterKey() {
  SecureKey.deleteKey('JUPITER_API_KEY')
}

export function hasJupiterKey() {
  return Boolean(getJupiterApiKey())
}

async function getMarketTape() {
  try {
    const response = await fetchWithTimeout(API_ENDPOINTS.COINGECKO_PRICE)
    if (!response.ok) throw new Error(`CoinGecko error: ${response.status}`)
    const json = await response.json() as Record<string, { usd: number; usd_24h_change?: number }>
    const solPrice = json.solana?.usd ?? 0
    lastSolPrice = solPrice
    return [
      { symbol: 'BTC', priceUsd: json.bitcoin?.usd ?? 0, change24hPct: json.bitcoin?.usd_24h_change ?? 0 },
      { symbol: 'SOL', priceUsd: solPrice, change24hPct: json.solana?.usd_24h_change ?? 0 },
      { symbol: 'ETH', priceUsd: json.ethereum?.usd ?? 0, change24hPct: json.ethereum?.usd_24h_change ?? 0 },
    ]
  } catch {
    return [
      { symbol: 'BTC', priceUsd: 0, change24hPct: 0 },
      { symbol: 'SOL', priceUsd: 0, change24hPct: 0 },
      { symbol: 'ETH', priceUsd: 0, change24hPct: 0 },
    ]
  }
}

async function getWalletBalances(address: string, apiKey: string): Promise<HeliusBalancesResponse> {
  const cached = balanceCache.get(address)
  if (cached && Date.now() - cached.timestamp < BALANCE_CACHE_TTL) {
    return cached.data
  }

  const data = await getWalletBalancesViaDas(address, apiKey).catch(() => getWalletBalancesViaEnhancedApi(address, apiKey))
  balanceCache.set(address, { data, timestamp: Date.now() })
  return data
}

async function getWalletBalancesViaDas(address: string, apiKey: string): Promise<HeliusBalancesResponse> {
  const response = await fetchWithTimeout(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: address,
        page: 1,
        limit: 1000,
        displayOptions: {
          showFungible: true,
          showNativeBalance: true,
          showZeroBalance: false,
        },
      },
    }),
  })

  if (!response.ok) throw new Error(`DAS balances failed (${response.status})`)
  const payload = await response.json() as HeliusDasResponse
  if (payload.error) throw new Error(payload.error.message ?? 'DAS balances failed')

  const result = payload.result
  if (!result) throw new Error('DAS balances response missing result')

  const balances: HeliusBalance[] = []
  const nativeLamports = result.nativeBalance?.lamports ?? 0
  if (nativeLamports > 0) {
    const solAmount = nativeLamports / LAMPORTS_PER_SOL
    const solPrice = result.nativeBalance?.price_per_sol ?? lastSolPrice
    balances.push({
      mint: SOL_MINT,
      balance: solAmount,
      decimals: LAMPORTS_DECIMALS,
      symbol: 'SOL',
      name: 'Solana',
      pricePerToken: solPrice,
      usdValue: result.nativeBalance?.total_price ?? solAmount * solPrice,
      logoUri: undefined,
    })
  }

  for (const asset of result.items ?? []) {
    const tokenInfo = asset.token_info
    if (!asset.id || !tokenInfo) continue

    const decimals = Number.isInteger(tokenInfo.decimals) ? tokenInfo.decimals as number : 0
    const rawBalance = parseNumericTokenBalance(tokenInfo.balance)
    if (rawBalance <= 0) continue

    const balance = rawBalance / Math.pow(10, decimals)
    if (balance <= 0) continue

    balances.push({
      mint: asset.id,
      balance,
      decimals,
      symbol: normalizeTokenLabel(tokenInfo.symbol) ?? normalizeTokenLabel(asset.content?.metadata?.symbol),
      name: normalizeTokenLabel(asset.content?.metadata?.name),
      pricePerToken: tokenInfo.price_info?.price_per_token ?? 0,
      usdValue: tokenInfo.price_info?.total_price ?? 0,
      logoUri: asset.content?.links?.image,
    })
  }

  return {
    balances,
    totalUsdValue: balances.reduce((sum, balance) => sum + (balance.usdValue ?? 0), 0),
  }
}

async function getWalletBalancesViaEnhancedApi(address: string, apiKey: string): Promise<HeliusBalancesResponse> {
  const url = new URL(`${API_ENDPOINTS.HELIUS_BASE}/wallet/${address}/balances`)
  url.searchParams.set('api-key', apiKey)
  url.searchParams.set('showNative', 'true')
  url.searchParams.set('showZeroBalance', 'false')
  url.searchParams.set('limit', '100')

  const response = await fetchWithRetry(url.toString())
  const raw = await response.json() as HeliusBalancesResponse & { nativeBalance?: number }

  // Helius returns native SOL as a top-level `nativeBalance` (lamports), not in the balances array.
  // Inject it as a synthetic balance entry so it appears in holdings.
  if (raw.nativeBalance && raw.nativeBalance > 0) {
    const solAmount = raw.nativeBalance / 1e9
    // Use cached SOL price from market tape (already fetched, no extra network call)
    const solPrice = lastSolPrice
    raw.balances = [
      {
        mint: SOL_MINT,
        balance: solAmount,
        decimals: LAMPORTS_DECIMALS,
        symbol: 'SOL',
        name: 'Solana',
        pricePerToken: solPrice,
        usdValue: solAmount * solPrice,
        logoUri: undefined,
      },
      ...raw.balances,
    ]
  }

  return raw
}

function parseNumericTokenBalance(value: number | string | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizeTokenLabel(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

async function getWalletHistory(address: string, apiKey: string): Promise<HeliusHistoryEvent[]> {
  try {
    const url = new URL(`${API_ENDPOINTS.HELIUS_BASE}/wallet/${address}/history`)
    url.searchParams.set('api-key', apiKey)
    url.searchParams.set('limit', '8')
    const response = await fetchWithRetry(url.toString())
    const json = await response.json() as { events?: HeliusHistoryEvent[]; history?: HeliusHistoryEvent[] }
    return (json.events ?? json.history ?? []).slice(0, 8)
  } catch {
    return []
  }
}

function normalizeHoldings(balances: HeliusBalance[]): HoldingSummary[] {
  return balances
    .filter((balance) => (balance.usdValue ?? 0) > 0.01)
    .map((balance) => ({
      mint: balance.mint,
      symbol: balance.symbol ?? truncateMint(balance.mint),
      name: balance.name ?? balance.symbol ?? truncateMint(balance.mint),
      amount: balance.balance,
      priceUsd: balance.pricePerToken ?? 0,
      valueUsd: balance.usdValue ?? 0,
      logoUri: balance.logoUri ?? null,
    }))
    .sort((a, b) => b.valueUsd - a.valueUsd)
}

async function getNativeSolHolding(address: string): Promise<HoldingSummary | null> {
  try {
    const lamports = await getConnection().getBalance(new PublicKey(address))
    if (!Number.isFinite(lamports) || lamports <= 0) return null
    const amount = lamports / LAMPORTS_PER_SOL
    const priceUsd = lastSolPrice
    return {
      mint: SOL_MINT,
      symbol: 'SOL',
      name: 'Solana',
      amount,
      priceUsd,
      valueUsd: priceUsd > 0 ? amount * priceUsd : 0,
      logoUri: null,
    }
  } catch {
    return null
  }
}

function listWalletsRaw(): WalletRow[] {
  const db = getDb()
  return db.prepare('SELECT id, name, address, is_default, agent_id, wallet_type, created_at FROM wallets ORDER BY is_default DESC, created_at ASC').all() as WalletRow[]
}

function getProjectAssignments(): Map<string, string[]> {
  const db = getDb()
  const rows = db.prepare('SELECT id, wallet_id FROM projects WHERE wallet_id IS NOT NULL').all() as Array<{ id: string; wallet_id: string }>
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const bucket = map.get(row.wallet_id) ?? []
    bucket.push(row.id)
    map.set(row.wallet_id, bucket)
  }
  return map
}

function resolveActiveWallet(wallets: WalletRow[], projectId: string | null): WalletRow | null {
  const projectWalletId = getProjectWalletId(projectId)
  if (projectWalletId) {
    return wallets.find((wallet) => wallet.id === projectWalletId) ?? null
  }
  return wallets.find((wallet) => wallet.is_default === 1) ?? wallets[0] ?? null
}

async function maybeSnapshotWallet(walletId: string, holdings: HoldingSummary[]) {
  const db = getDb()
  const latest = db.prepare('SELECT snapshot_at FROM portfolio_snapshots WHERE wallet_id = ? ORDER BY snapshot_at DESC LIMIT 1').get(walletId) as { snapshot_at: number } | undefined
  if (latest && Date.now() - latest.snapshot_at < RETRY_CONFIG.SNAPSHOT_INTERVAL_MS) return

  const totalUsd = holdings.reduce((sum, holding) => sum + holding.valueUsd, 0)
  const solBalance = holdings.find((holding) => holding.mint === 'So11111111111111111111111111111111111111112')?.amount ?? 0

  db.prepare(
    'INSERT INTO portfolio_snapshots (id, wallet_id, total_usd, sol_balance, tokens, snapshot_at) VALUES (?,?,?,?,?,?)'
  ).run(
    crypto.randomUUID(),
    walletId,
    totalUsd,
    solBalance,
    JSON.stringify(holdings.slice(0, 32)),
    Date.now(),
  )

  // Purge snapshots older than 30 days
  db.prepare('DELETE FROM portfolio_snapshots WHERE wallet_id = ? AND snapshot_at < ?')
    .run(walletId, Date.now() - 30 * 24 * 60 * 60 * 1000)
}

function getPreviousTotalUsd(walletIds: string[]): number | null {
  if (walletIds.length === 0) return null
  const db = getDb()
  const threshold = Date.now() - 24 * 60 * 60 * 1000

  // Single query: pick the most recent snapshot before 24h ago per wallet using ROW_NUMBER
  const placeholders = walletIds.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT total_usd FROM (
      SELECT total_usd, ROW_NUMBER() OVER (PARTITION BY wallet_id ORDER BY snapshot_at DESC) AS rn
      FROM portfolio_snapshots
      WHERE wallet_id IN (${placeholders}) AND snapshot_at <= ?
    ) WHERE rn = 1
  `).all([...walletIds, threshold]) as Array<{ total_usd: number }>

  if (rows.length === 0) return null
  return rows.reduce((sum, r) => sum + r.total_usd, 0)
}

function truncateMint(mint: string): string {
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`
}

function isValidSolanaAddress(value: string): boolean {
  try { new PublicKey(value); return true } catch { return false }
}

interface ParsedMintAccount {
  type: 'mint'
  info: {
    decimals: number
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isParsedMintAccount(value: unknown): value is ParsedMintAccount {
  if (!isRecord(value) || value.type !== 'mint' || !isRecord(value.info)) return false
  return Number.isInteger(value.info.decimals)
}

function readTokenMintDecimals(accountInfo: Awaited<ReturnType<Connection['getParsedAccountInfo']>>['value']): number {
  if (!accountInfo) throw new Error('Token mint account not found')

  const data = accountInfo.data
  if (Buffer.isBuffer(data) || !isRecord(data) || !('parsed' in data)) {
    throw new Error('Token mint account is not parsed token metadata')
  }

  const parsedData = data as ParsedAccountData
  if (parsedData.program !== 'spl-token' && parsedData.program !== 'spl-token-2022') {
    throw new Error('Account is not an SPL Token mint')
  }
  if (!isParsedMintAccount(parsedData.parsed)) {
    throw new Error('Account is not an SPL Token mint')
  }

  const decimals = parsedData.parsed.info.decimals
  if (decimals < 0 || decimals > 255) {
    throw new Error('Token mint decimals are invalid')
  }
  return decimals
}

function toRawTokenAmount(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }

  const [wholePart = '0', fractionalPart = ''] = amount.toString().split('.')
  const normalizedFraction = fractionalPart.padEnd(decimals, '0').slice(0, decimals)
  return BigInt(`${wholePart}${normalizedFraction}`.replace(/^0+(?=\d)/, '') || '0')
}

function formatTokenAmount(rawAmount: bigint, decimals: number): string {
  if (decimals <= 0) return rawAmount.toString()

  const sign = rawAmount < 0n ? '-' : ''
  const absolute = rawAmount < 0n ? -rawAmount : rawAmount
  const divisor = 10n ** BigInt(decimals)
  const whole = absolute / divisor
  const fraction = absolute % divisor

  if (fraction === 0n) return `${sign}${whole.toString()}`

  return `${sign}${whole.toString()}.${fraction.toString().padStart(decimals, '0').replace(/0+$/, '')}`
}

export function generateWallet(name: string, walletType: 'user' | 'agent' = 'user', agentId?: string) {
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('Wallet name is required')

  const kp = Keypair.generate()
  const address = kp.publicKey.toBase58()
  const id = crypto.randomUUID()

  // Store encrypted keypair via SecureKeyService
  SecureKey.storeKey(`WALLET_KEYPAIR_${id}`, bs58.encode(kp.secretKey))
  kp.secretKey.fill(0)

  const db = getDb()
  const existingDefault = db.prepare('SELECT id FROM wallets WHERE is_default = 1').get() as { id: string } | undefined
  db.prepare(
    'INSERT INTO wallets (id, name, address, is_default, wallet_type, agent_id, created_at) VALUES (?,?,?,?,?,?,?)'
  ).run(id, trimmedName, address, existingDefault ? 0 : 1, walletType, agentId ?? null, Date.now())

  return db.prepare('SELECT id, name, address, is_default, wallet_type, agent_id, created_at FROM wallets WHERE id = ?').get(id)
}

function keypairFromBytes(bytes: Uint8Array | number[]): Keypair {
  if (Array.isArray(bytes) && bytes.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new Error('Private key byte values must be between 0 and 255')
  }
  const secret = Uint8Array.from(bytes)
  if (secret.length === 64) return Keypair.fromSecretKey(secret)
  if (secret.length === 32) return Keypair.fromSeed(secret)
  throw new Error('Private key must decode to a 32-byte seed or 64-byte Solana secret key')
}

function cleanPrivateKeyInput(raw: string): string {
  let value = raw.trim()
  const assignment = value.match(/^(?:SOLANA_PRIVATE_KEY|PRIVATE_KEY|SECRET_KEY)\s*=\s*(.+)$/is)
  if (assignment) value = assignment[1].trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim()
  }
  return value
}

function parsePrivateKeyText(raw: string): Keypair {
  const value = cleanPrivateKeyInput(raw)
  if (!value) throw new Error('Private key is required')

  const uint8ArrayMatch = value.match(/^Uint8Array\s*\(([\s\S]+)\)$/i)
  const candidate = uint8ArrayMatch ? uint8ArrayMatch[1].trim() : value

  try {
    const parsed = JSON.parse(candidate)
    if (Array.isArray(parsed)) return keypairFromBytes(parsed)
    if (typeof parsed === 'string') return parsePrivateKeyText(parsed)
    const nested = parsed?._keypair?.secretKey ?? parsed?.secretKey ?? parsed?.privateKey ?? parsed?.secret_key ?? parsed?.seed
    if (Array.isArray(nested)) return keypairFromBytes(nested)
    if (typeof nested === 'string') return parsePrivateKeyText(nested)
  } catch {
    // Fall through to plain text formats.
  }

  const commaBytes = candidate.replace(/^\[/, '').replace(/\]$/, '').trim()
  if (/^\d{1,3}(?:\s*,\s*\d{1,3})+$/.test(commaBytes)) {
    return keypairFromBytes(commaBytes.split(',').map((part) => Number(part.trim())))
  }

  try {
    return keypairFromBytes(bs58.decode(candidate))
  } catch {
    // Continue checking other encodings.
  }

  const hex = candidate.startsWith('0x') ? candidate.slice(2) : candidate
  if (/^[0-9a-fA-F]+$/.test(hex) && (hex.length === 64 || hex.length === 128)) {
    return keypairFromBytes(Buffer.from(hex, 'hex'))
  }

  if (/^[A-Za-z0-9+/]+={0,2}$/.test(candidate)) {
    const bytes = Buffer.from(candidate, 'base64')
    if (bytes.length === 32 || bytes.length === 64) return keypairFromBytes(bytes)
  }

  throw new Error('Unsupported private key format')
}

function parseKeypairFile(raw: string): Keypair {
  return parsePrivateKeyText(raw)
}

async function pickKeypair(): Promise<{ keypair: Keypair; filePath: string } | null> {
  const result = await dialog.showOpenDialog({
    title: 'Import Solana Wallet Keypair',
    filters: [{ name: 'Keypair JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })

  if (result.canceled || !result.filePaths[0]) return null
  const filePath = result.filePaths[0]
  const raw = fs.readFileSync(filePath, 'utf8')
  return { keypair: parseKeypairFile(raw), filePath }
}

export async function importSigningWallet(name: string, privateKey?: string) {
  const picked = privateKey?.trim() ? { keypair: parsePrivateKeyText(privateKey), filePath: null } : await pickKeypair()
  if (!picked) return null

  const { keypair } = picked
  try {
    const address = keypair.publicKey.toBase58()
    const trimmedName = name.trim() || `Imported ${address.slice(0, 4)}…${address.slice(-4)}`
    const db = getDb()
    const existing = db.prepare('SELECT id FROM wallets WHERE address = ? LIMIT 1').get(address) as { id: string } | undefined
    const existingDefault = db.prepare('SELECT id FROM wallets WHERE is_default = 1').get() as { id: string } | undefined
    const id = existing?.id ?? crypto.randomUUID()

    if (existing) {
      if (name.trim()) db.prepare('UPDATE wallets SET name = ? WHERE id = ?').run(trimmedName, id)
    } else {
      db.prepare(
        'INSERT INTO wallets (id, name, address, is_default, wallet_type, created_at) VALUES (?,?,?,?,?,?)'
      ).run(id, trimmedName, address, existingDefault ? 0 : 1, 'user', Date.now())
    }

    SecureKey.storeKey(`WALLET_KEYPAIR_${id}`, bs58.encode(keypair.secretKey))
    return db.prepare('SELECT id, name, address, is_default, wallet_type, created_at FROM wallets WHERE id = ?').get(id)
  } finally {
    keypair.secretKey.fill(0)
  }
}

export async function importKeypair(walletId: string, privateKey?: string): Promise<boolean> {
  const picked = privateKey?.trim() ? { keypair: parsePrivateKeyText(privateKey), filePath: null } : await pickKeypair()
  if (!picked) return false

  const { keypair } = picked
  try {
    const db = getDb()
    const row = db.prepare('SELECT address FROM wallets WHERE id = ?').get(walletId) as { address: string } | undefined
    if (!row) throw new Error('Wallet not found')
    if (keypair.publicKey.toBase58() !== row.address) {
      throw new Error(`Keypair address ${keypair.publicKey.toBase58()} does not match wallet ${row.address}`)
    }

    SecureKey.storeKey(`WALLET_KEYPAIR_${walletId}`, bs58.encode(keypair.secretKey))
    return true
  } finally {
    keypair.secretKey.fill(0)
  }
}

export async function transferSOL(
  fromWalletId: string,
  toAddress: string,
  amountSol?: number,
  sendMax = false,
): Promise<TransactionExecutionResult & { id: string; status: 'confirmed' }> {
  if (!sendMax && (!amountSol || amountSol <= 0)) throw new Error('Amount must be greater than 0')
  if (!isValidSolanaAddress(toAddress)) throw new Error('Invalid destination address')

  const db = getDb()

  const walletRow = db.prepare('SELECT wallet_type FROM wallets WHERE id = ?').get(fromWalletId) as { wallet_type: string } | undefined

  return withKeypair(fromWalletId, async (keypair) => {
    const connection = getConnection()
    const fromAddress = keypair.publicKey.toBase58()

    const balance = await connection.getBalance(keypair.publicKey)
    const priorityFeeLamports = await getPriorityFeeLamports(connection, SOL_TRANSFER_COMPUTE_UNITS)
    const feeBufferLamports = Math.max(10_000, BASE_SIGNATURE_FEE_LAMPORTS + priorityFeeLamports)
    const lamportsToSend = sendMax
      ? Math.max(0, balance - feeBufferLamports)
      : Math.round((amountSol ?? 0) * LAMPORTS_PER_SOL)

    if (lamportsToSend <= 0) {
      throw new Error('Not enough SOL to send after reserving network fees')
    }

    const amountToRecord = lamportsToSend / LAMPORTS_PER_SOL
    const lamportsNeeded = lamportsToSend + feeBufferLamports
    if (balance < lamportsNeeded) {
      throw new Error(`Insufficient balance: have ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL, need ${amountToRecord.toFixed(4)} SOL + fees`)
    }

    // Agent spend limit check — only count SOL transfers toward the SOL-denominated limit
    if (walletRow?.wallet_type === 'agent') {
      const dayAgo = Date.now() - 86_400_000
      const row = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM transaction_history WHERE wallet_id = ? AND status IN (?, ?) AND type = ? AND created_at > ?').get(fromWalletId, 'confirmed', 'pending', 'sol_transfer', dayAgo) as { total: number }
      if (row.total + amountToRecord > 2) throw new Error('Agent wallet daily spend limit (2 SOL) exceeded')
    }

    const txId = crypto.randomUUID()

    db.prepare(
      'INSERT INTO transaction_history (id, wallet_id, type, from_address, to_address, amount, status, created_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run(txId, fromWalletId, 'sol_transfer', fromAddress, toAddress, amountToRecord, 'pending', Date.now())

    try {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new PublicKey(toAddress),
          lamports: lamportsToSend,
        })
      )

      const { signature, transport } = await executeTransaction(connection, transaction, [keypair], {
        computeUnitLimit: SOL_TRANSFER_COMPUTE_UNITS,
      })

      db.prepare('UPDATE transaction_history SET signature = ?, status = ? WHERE id = ?').run(signature, 'confirmed', txId)
      return { id: txId, signature, status: 'confirmed', transport }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      db.prepare('UPDATE transaction_history SET status = ?, error = ? WHERE id = ?').run('failed', errorMsg, txId)
      throw err
    }
  })
}

export async function transferToken(
  fromWalletId: string,
  toAddress: string,
  mint: string,
  amount?: number,
  sendMax = false,
): Promise<TransactionExecutionResult & { id: string; status: 'confirmed' }> {
  if (!sendMax && (!amount || amount <= 0)) throw new Error('Amount must be greater than 0')
  if (!isValidSolanaAddress(toAddress)) throw new Error('Invalid destination address')
  if (!isValidSolanaAddress(mint)) throw new Error('Invalid mint address')

  const db = getDb()

  // Token transfers are not subject to the SOL-denominated spend limit.
  // The SOL spend limit only applies to SOL transfers (see transferSOL).

  return withKeypair(fromWalletId, async (keypair) => {
    const connection = getConnection()
    const fromAddress = keypair.publicKey.toBase58()
    const mintPubkey = new PublicKey(mint)
    const destPubkey = new PublicKey(toAddress)

    // Fetch the source token account balance and validate before building the transaction.
    const fromAta = await getAssociatedTokenAddress(mintPubkey, keypair.publicKey)
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey)
    const decimals = readTokenMintDecimals(mintInfo.value)
    let rawAmount: bigint
    let amountToRecord: number
    try {
      const accountInfo = await getAccount(connection, fromAta)
      const rawBalance = accountInfo.amount
      rawAmount = sendMax
        ? rawBalance
        : toRawTokenAmount(amount ?? 0, decimals)

      if (rawAmount <= 0n) {
        throw new Error('No token balance available to send')
      }
      if (rawBalance < rawAmount) {
        throw new Error(`Insufficient token balance: have ${formatTokenAmount(rawBalance, decimals)}, need ${amount}`)
      }
      amountToRecord = Number.parseFloat(formatTokenAmount(rawAmount, decimals))
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Insufficient')) throw err
      if (err instanceof Error && err.message.startsWith('No token balance')) throw err
      throw new Error('Could not verify token balance — token account may not exist')
    }

    const txId = crypto.randomUUID()

    db.prepare(
      'INSERT INTO transaction_history (id, wallet_id, type, from_address, to_address, amount, mint, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(txId, fromWalletId, 'token_transfer', fromAddress, toAddress, amountToRecord, mint, 'pending', Date.now())

    try {
      const toAta = await getAssociatedTokenAddress(mintPubkey, destPubkey)

      const transaction = new Transaction()

      let needsDestinationAta = false
      // Create destination ATA if it doesn't exist
      try {
        await getAccount(connection, toAta)
      } catch {
        needsDestinationAta = true
        transaction.add(
          createAssociatedTokenAccountInstruction(
            keypair.publicKey,
            toAta,
            destPubkey,
            mintPubkey,
          )
        )
      }

      transaction.add(
        createTransferInstruction(
          fromAta,
          toAta,
          keypair.publicKey,
          rawAmount,
        )
      )

      const { signature, transport } = await executeTransaction(connection, transaction, [keypair], {
        computeUnitLimit: needsDestinationAta ? TOKEN_TRANSFER_WITH_ATA_COMPUTE_UNITS : TOKEN_TRANSFER_COMPUTE_UNITS,
      })

      db.prepare('UPDATE transaction_history SET signature = ?, status = ? WHERE id = ?').run(signature, 'confirmed', txId)
      return { id: txId, signature, status: 'confirmed', transport }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      db.prepare('UPDATE transaction_history SET status = ?, error = ? WHERE id = ?').run('failed', errorMsg, txId)
      throw err
    }
  })
}

// ---------------------------------------------------------------------------
// Jupiter Swap Integration
// ---------------------------------------------------------------------------

const JUPITER_SWAP_ORDER_API = 'https://api.jup.ag/swap/v2/order'
const JUPITER_SWAP_EXECUTE_API = 'https://api.jup.ag/swap/v2/execute'
const JUPITER_TOKENS_SEARCH_API = 'https://api.jup.ag/tokens/v2/search'
const JUPITER_TOKEN_SEARCH_CACHE_TTL = 5 * 60_000
const JUPITER_TOKEN_SEARCH_CACHE_MAX_ENTRIES = 100
const LAMPORTS_DECIMALS = 9
const jupiterTokenSearchCache = new Map<string, { timestamp: number; results: JupiterTokenSearchResult[] }>()
const jupiterTokenSearchInflight = new Map<string, Promise<JupiterTokenSearchResult[]>>()

interface JupiterRoutePlanItem {
  swapInfo?: {
    label?: string
    ammKey?: string
    inputMint?: string
    outputMint?: string
    inAmount?: string
    outAmount?: string
  }
  percent?: number
  bps?: number
  usdValue?: number
}

interface JupiterSwapOrderResponse {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  priceImpact?: number
  priceImpactPct?: string
  routePlan: JupiterRoutePlanItem[]
  transaction: string
  requestId: string
  lastValidBlockHeight?: string
  taker?: string | null
  errorCode?: number
  errorMessage?: string
  error?: string
}

interface JupiterSwapExecuteResponse {
  status: 'Success' | 'Failed'
  signature?: string
  error?: string
  code?: number
}

interface SwapQuoteResult {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  requestId: string
  priceImpactPct: string
  routePlan: Array<{ label: string; percent: number }>
  rawQuoteResponse: unknown
}

export type { TransactionExecutionResult } from './SolanaService'

function getWalletAddressOrThrow(walletId: string): string {
  const db = getDb()
  const row = db.prepare('SELECT address FROM wallets WHERE id = ?').get(walletId) as { address: string } | undefined
  if (!row) throw new Error('Wallet not found')
  if (!isValidSolanaAddress(row.address)) throw new Error('Wallet address is invalid')
  return row.address
}

function parseJupiterSwapOrder(value: unknown): JupiterSwapOrderResponse {
  if (!isRecord(value)) throw new Error('Jupiter order response is not an object')

  const inputMint = value.inputMint
  const outputMint = value.outputMint
  const inAmount = value.inAmount
  const outAmount = value.outAmount
  const transaction = value.transaction
  const requestId = value.requestId

  if (typeof inputMint !== 'string' || !isValidSolanaAddress(inputMint)) {
    throw new Error('Jupiter order has an invalid input mint')
  }
  if (typeof outputMint !== 'string' || !isValidSolanaAddress(outputMint)) {
    throw new Error('Jupiter order has an invalid output mint')
  }
  if (typeof inAmount !== 'string' || !/^\d+$/.test(inAmount) || BigInt(inAmount) <= 0n) {
    throw new Error('Jupiter order has an invalid input amount')
  }
  if (typeof outAmount !== 'string' || !/^\d+$/.test(outAmount) || BigInt(outAmount) <= 0n) {
    throw new Error('Jupiter order has an invalid output amount')
  }
  if (typeof transaction !== 'string' || !isValidBase64Payload(transaction)) {
    const detail = typeof value.errorMessage === 'string' ? `: ${value.errorMessage}` : ''
    throw new Error(`Jupiter order did not include an executable transaction${detail}`)
  }
  if (typeof requestId !== 'string' || requestId.length === 0) {
    throw new Error('Jupiter order is missing requestId')
  }
  if (value.priceImpact !== undefined && typeof value.priceImpact !== 'number') {
    throw new Error('Jupiter order has an invalid price impact')
  }
  if (value.priceImpactPct !== undefined && typeof value.priceImpactPct !== 'string') {
    throw new Error('Jupiter order has an invalid price impact percentage')
  }
  if (!Array.isArray(value.routePlan)) {
    throw new Error('Jupiter order has an invalid route plan')
  }
  for (const route of value.routePlan) {
    if (!isRecord(route)) throw new Error('Jupiter order has an invalid route plan')
    if (route.swapInfo !== undefined && !isRecord(route.swapInfo)) {
      throw new Error('Jupiter order has an invalid route plan')
    }
    if (route.percent !== undefined && typeof route.percent !== 'number') {
      throw new Error('Jupiter order has an invalid route plan')
    }
    if (route.bps !== undefined && typeof route.bps !== 'number') {
      throw new Error('Jupiter order has an invalid route plan')
    }
  }
  if (value.lastValidBlockHeight !== undefined && typeof value.lastValidBlockHeight !== 'string') {
    throw new Error('Jupiter order has an invalid lastValidBlockHeight')
  }
  if (value.taker !== undefined && value.taker !== null && typeof value.taker !== 'string') {
    throw new Error('Jupiter order has an invalid taker')
  }

  return {
    inputMint,
    outputMint,
    inAmount,
    outAmount,
    priceImpact: value.priceImpact,
    priceImpactPct: value.priceImpactPct,
    routePlan: value.routePlan as JupiterRoutePlanItem[],
    transaction,
    requestId,
    lastValidBlockHeight: value.lastValidBlockHeight,
    taker: value.taker,
    errorCode: typeof value.errorCode === 'number' ? value.errorCode : undefined,
    errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : undefined,
    error: typeof value.error === 'string' ? value.error : undefined,
  }
}

function isValidBase64Payload(value: string): boolean {
  if (value.length === 0) return false
  try {
    const decoded = Buffer.from(value, 'base64')
    if (decoded.length === 0) return false
    return decoded.toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '')
  } catch {
    return false
  }
}

function normalizeJupiterPriceImpactPct(order: JupiterSwapOrderResponse): string {
  if (order.priceImpactPct !== undefined) return order.priceImpactPct
  if (order.priceImpact !== undefined) return String(Math.abs(order.priceImpact) * 100)
  return '0'
}

function normalizeJupiterRoutePlan(routePlan: JupiterRoutePlanItem[]): Array<{ label: string; percent: number }> {
  return routePlan.map((route) => ({
    label: route.swapInfo?.label ?? 'Unknown',
    percent: typeof route.percent === 'number'
      ? route.percent
      : typeof route.bps === 'number'
        ? route.bps / 100
        : 0,
  }))
}

function optionalNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function normalizeTokenSearchResult(value: unknown): JupiterTokenSearchResult | null {
  if (!isRecord(value)) return null

  const mint = optionalString(value.id) ?? optionalString(value.mint) ?? optionalString(value.address)
  if (!mint || !isValidSolanaAddress(mint)) return null

  const audit = isRecord(value.audit) ? value.audit : {}
  const tags = Array.isArray(value.tags) ? value.tags.filter((entry): entry is string => typeof entry === 'string') : []
  const decimals = optionalNumber(value.decimals)

  return {
    mint,
    name: optionalString(value.name) ?? mint,
    symbol: optionalString(value.symbol) ?? truncateMint(mint),
    icon: optionalString(value.icon),
    decimals: decimals !== null ? Math.max(0, Math.trunc(decimals)) : 0,
    usdPrice: optionalNumber(value.usdPrice),
    liquidity: optionalNumber(value.liquidity),
    holderCount: optionalNumber(value.holderCount),
    organicScore: optionalNumber(value.organicScore) ?? optionalNumber(audit.organicScore),
    isSus: value.isSus === true || audit.isSus === true,
    verified: value.verified === true || audit.verified === true || tags.includes('verified'),
    tokenProgram: optionalString(value.tokenProgram),
  }
}

function normalizeTokenSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').slice(0, 128)
}

function getTokenSearchCacheKey(query: string): string {
  return query.length >= 32 ? query : query.toLowerCase()
}

function cloneJupiterTokenSearchResults(results: JupiterTokenSearchResult[]): JupiterTokenSearchResult[] {
  return results.map((result) => ({ ...result }))
}

function cacheJupiterTokenSearch(cacheKey: string, results: JupiterTokenSearchResult[]): void {
  if (jupiterTokenSearchCache.has(cacheKey)) jupiterTokenSearchCache.delete(cacheKey)
  jupiterTokenSearchCache.set(cacheKey, { timestamp: Date.now(), results: cloneJupiterTokenSearchResults(results) })

  while (jupiterTokenSearchCache.size > JUPITER_TOKEN_SEARCH_CACHE_MAX_ENTRIES) {
    const oldestKey = jupiterTokenSearchCache.keys().next().value
    if (typeof oldestKey !== 'string') break
    jupiterTokenSearchCache.delete(oldestKey)
  }
}

export async function searchJupiterTokens(query: string): Promise<JupiterTokenSearchResult[]> {
  const trimmed = normalizeTokenSearchQuery(query)
  if (trimmed.length < 2) return []

  const cacheKey = getTokenSearchCacheKey(trimmed)
  const cached = jupiterTokenSearchCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < JUPITER_TOKEN_SEARCH_CACHE_TTL) {
    return cloneJupiterTokenSearchResults(cached.results)
  }

  const inflight = jupiterTokenSearchInflight.get(cacheKey)
  if (inflight) return cloneJupiterTokenSearchResults(await inflight)

  const url = new URL(JUPITER_TOKENS_SEARCH_API)
  url.searchParams.set('query', trimmed)

  const request = (async () => {
    const jupiterApiKey = getJupiterApiKey()
    const response = await fetchWithTimeout(url.toString(), {
      headers: jupiterApiKey ? { 'x-api-key': jupiterApiKey } : {},
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Jupiter token search failed (${response.status}): ${body || response.statusText}`)
    }

    const json = await response.json()
    if (!Array.isArray(json)) return []

    const seen = new Set<string>()
    const results: JupiterTokenSearchResult[] = []
    for (const item of json) {
      const normalized = normalizeTokenSearchResult(item)
      if (!normalized || seen.has(normalized.mint)) continue
      seen.add(normalized.mint)
      results.push(normalized)
      if (results.length >= 20) break
    }
    cacheJupiterTokenSearch(cacheKey, results)
    return results
  })().finally(() => {
    jupiterTokenSearchInflight.delete(cacheKey)
  })

  jupiterTokenSearchInflight.set(cacheKey, request)
  return cloneJupiterTokenSearchResults(await request)
}

async function requestJupiterSwapOrder(
  inputMint: string,
  outputMint: string,
  rawAmount: bigint,
  slippageBps: number,
  taker: string,
  jupiterApiKey: string,
): Promise<JupiterSwapOrderResponse> {
  const url = new URL(JUPITER_SWAP_ORDER_API)
  url.searchParams.set('inputMint', inputMint)
  url.searchParams.set('outputMint', outputMint)
  url.searchParams.set('amount', rawAmount.toString())
  url.searchParams.set('taker', taker)
  url.searchParams.set('swapMode', 'ExactIn')
  url.searchParams.set('slippageBps', String(slippageBps))

  const response = await fetchWithTimeout(url.toString(), {
    headers: { 'x-api-key': jupiterApiKey },
  }, SWAP_FETCH_TIMEOUT_MS)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Jupiter order failed (${response.status}): ${body}`)
  }

  return parseJupiterSwapOrder(await response.json())
}

export async function getSwapQuote(
  walletId: string,
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number,
): Promise<SwapQuoteResult> {
  if (!isValidSolanaAddress(inputMint)) throw new Error('Invalid input mint')
  if (!isValidSolanaAddress(outputMint)) throw new Error('Invalid output mint')
  if (amount <= 0) throw new Error('Amount must be greater than 0')
  if (inputMint === outputMint) throw new Error('Input and output mints must differ')

  const jupiterApiKey = getJupiterApiKey()
  if (!jupiterApiKey) throw new Error('JUPITER_API_KEY not configured. Add it in Wallet settings to enable swaps.')

  const taker = getWalletAddressOrThrow(walletId)

  // Resolve decimals for the input mint to convert human amount to raw
  const decimals = await getMintDecimals(inputMint)
  const rawAmount = BigInt(Math.round(amount * Math.pow(10, decimals)))
  const data = await requestJupiterSwapOrder(inputMint, outputMint, rawAmount, slippageBps, taker, jupiterApiKey)

  // Convert raw amounts to human-readable
  const outputDecimals = await getMintDecimals(outputMint)
  const humanInAmount = (Number(BigInt(data.inAmount)) / Math.pow(10, decimals)).toString()
  const humanOutAmount = (Number(BigInt(data.outAmount)) / Math.pow(10, outputDecimals)).toString()

  return {
    inputMint: data.inputMint,
    outputMint: data.outputMint,
    inAmount: humanInAmount,
    outAmount: humanOutAmount,
    requestId: data.requestId,
    priceImpactPct: normalizeJupiterPriceImpactPct(data),
    routePlan: normalizeJupiterRoutePlan(data.routePlan),
    // The raw Jupiter response is passed back to executeSwap so it can use the
    // exact executable order the user reviewed rather than fetching at a different price.
    rawQuoteResponse: data,
  }
}

export async function executeSwap(
  walletId: string,
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number,
  rawQuoteResponse?: unknown,
): Promise<TransactionExecutionResult> {
  if (!isValidSolanaAddress(inputMint)) throw new Error('Invalid input mint')
  if (!isValidSolanaAddress(outputMint)) throw new Error('Invalid output mint')
  if (amount <= 0) throw new Error('Amount must be greater than 0')

  const jupiterApiKey = getJupiterApiKey()
  if (!jupiterApiKey) throw new Error('JUPITER_API_KEY not configured. Add it in Wallet settings to enable swaps.')

  const db = getDb()

  return withKeypair(walletId, async (keypair) => {
    const connection = getConnection()
    const userPublicKey = keypair.publicKey.toBase58()

    // Balance check: verify the wallet holds enough of the input token before
    // building the transaction. This prevents sending a doomed tx to the network.
    const decimals = await getMintDecimals(inputMint, connection)
    if (inputMint === SOL_MINT) {
      const lamports = await connection.getBalance(keypair.publicKey)
      const requiredLamports = Math.round(amount * Math.pow(10, decimals)) + 10_000 // fee buffer
      if (lamports < requiredLamports) {
        throw new Error(
          `Insufficient SOL: have ${(lamports / Math.pow(10, decimals)).toFixed(4)}, need ${amount} + fees`
        )
      }
    } else {
      const { getAssociatedTokenAddress: getAta, getAccount: getAcc } = await import('@solana/spl-token')
      const mintPubkey = new PublicKey(inputMint)
      try {
        const ata = await getAta(mintPubkey, keypair.publicKey)
        const accountInfo = await getAcc(connection, ata)
        const rawBalance = accountInfo.amount
        const rawRequired = toRawTokenAmount(amount, decimals)
        if (rawBalance < rawRequired) {
          throw new Error(`Insufficient token balance: have ${formatTokenAmount(rawBalance, decimals)}, need ${amount}`)
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Insufficient')) throw err
        throw new Error('Could not verify token balance — token account may not exist')
      }
    }

    // Use the executable order the user reviewed when provided. Fall back to
    // fetching a fresh order only if no rawQuoteResponse was supplied.
    let orderData: JupiterSwapOrderResponse
    const rawRequested = BigInt(Math.round(amount * Math.pow(10, decimals)))
    if (rawQuoteResponse) {
      const q = parseJupiterSwapOrder(rawQuoteResponse)
      if (q.inputMint !== inputMint) {
        throw new Error(`Jupiter order inputMint mismatch: expected ${inputMint}, got ${q.inputMint}`)
      }
      if (q.outputMint !== outputMint) {
        throw new Error(`Jupiter order outputMint mismatch: expected ${outputMint}, got ${q.outputMint}`)
      }
      if (q.taker && q.taker !== userPublicKey) {
        throw new Error(`Jupiter order taker mismatch: expected ${userPublicKey}, got ${q.taker}`)
      }

      // inAmount in the raw Jupiter quote is in lamports/raw units — compare against
      // the raw amount derived from the same decimals used when the quote was fetched.
      const quoteInAmount = BigInt(q.inAmount)
      const driftRaw = quoteInAmount > rawRequested ? quoteInAmount - rawRequested : rawRequested - quoteInAmount
      if (driftRaw * 100n > rawRequested) {
        throw new Error(
          `Quote inAmount ${quoteInAmount} deviates more than 1% from requested ${rawRequested}`
        )
      }

      orderData = q
    } else {
      orderData = await requestJupiterSwapOrder(inputMint, outputMint, rawRequested, slippageBps, userPublicKey, jupiterApiKey)
    }

    // Deserialize and sign Jupiter's assembled V2 order transaction, then hand it
    // back to Jupiter's managed execution endpoint for landing.
    const { VersionedTransaction: VTx } = await import('@solana/web3.js')
    const txBuf = Buffer.from(orderData.transaction, 'base64')
    const transaction = VTx.deserialize(txBuf)
    transaction.sign([keypair])
    const signedTransaction = Buffer.from(transaction.serialize()).toString('base64')

    const txId = crypto.randomUUID()
    db.prepare(
      'INSERT INTO transaction_history (id, wallet_id, type, from_address, to_address, amount, mint, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(txId, walletId, 'swap', userPublicKey, '', amount, `${inputMint}→${outputMint}`, 'pending', Date.now())

    try {
      const executeRes = await fetchWithTimeout(JUPITER_SWAP_EXECUTE_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': jupiterApiKey,
        },
        body: JSON.stringify({
          signedTransaction,
          requestId: orderData.requestId,
          lastValidBlockHeight: orderData.lastValidBlockHeight,
        }),
      }, SWAP_FETCH_TIMEOUT_MS)

      if (!executeRes.ok) {
        const body = await executeRes.text()
        throw new Error(`Jupiter execute failed (${executeRes.status}): ${body}`)
      }

      const executeData = await executeRes.json() as JupiterSwapExecuteResponse
      if (executeData.status !== 'Success' || !executeData.signature) {
        const detail = executeData.error ?? `code ${String(executeData.code ?? 'unknown')}`
        throw new Error(`Jupiter execute failed: ${detail}`)
      }

      db.prepare('UPDATE transaction_history SET signature = ?, status = ? WHERE id = ?').run(executeData.signature, 'confirmed', txId)
      return { signature: executeData.signature, transport: 'jupiter' }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      db.prepare('UPDATE transaction_history SET status = ?, error = ? WHERE id = ?').run('failed', errorMsg, txId)
      throw err
    }
  })
}

async function getMintDecimals(mint: string, connection = getConnection()): Promise<number> {
  // SOL native mint
  if (mint === SOL_MINT) return LAMPORTS_DECIMALS

  const mintPubkey = new PublicKey(mint)
  const mintInfo = await connection.getParsedAccountInfo(mintPubkey)
  return readTokenMintDecimals(mintInfo.value)
}

export async function getBalance(walletId: string) {
  const db = getDb()
  const row = db.prepare('SELECT address FROM wallets WHERE id = ?').get(walletId) as { address: string } | undefined
  if (!row) throw new Error('Wallet not found')

  const connection = getConnection()
  const lamports = await connection.getBalance(new PublicKey(row.address))
  return { sol: lamports / LAMPORTS_PER_SOL, lamports }
}

export async function getWalletHoldings(walletId: string): Promise<HoldingSummary[]> {
  const db = getDb()
  const row = db.prepare('SELECT address FROM wallets WHERE id = ?').get(walletId) as { address: string } | undefined
  if (!row) throw new Error('Wallet not found')

  const heliusKey = getHeliusApiKey()
  if (!heliusKey) return []

  const balances = await getWalletBalances(row.address, heliusKey)
  return normalizeHoldings(balances.balances)
}

export function createAgentWallet(agentId: string, agentName: string) {
  // agentName may already include "Wallet" suffix (from UI default), so use it directly
  return generateWallet(agentName, 'agent', agentId)
}

export function listAgentWallets(agentId?: string) {
  const db = getDb()
  const projectAssignments = getProjectAssignments()

  if (agentId) {
    const rows = db.prepare(
      'SELECT id, name, address, is_default, agent_id, wallet_type, created_at FROM wallets WHERE wallet_type = ? AND agent_id = ? ORDER BY created_at ASC'
    ).all('agent', agentId) as WalletRow[]
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
      is_default: row.is_default,
      agent_id: row.agent_id,
      wallet_type: row.wallet_type,
      created_at: row.created_at,
      assigned_project_ids: projectAssignments.get(row.id) ?? [],
    }))
  }

  const rows = db.prepare(
    'SELECT id, name, address, is_default, agent_id, wallet_type, created_at FROM wallets WHERE wallet_type = ? ORDER BY created_at ASC'
  ).all('agent') as WalletRow[]
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    is_default: row.is_default,
    agent_id: row.agent_id,
    wallet_type: row.wallet_type,
    created_at: row.created_at,
    assigned_project_ids: projectAssignments.get(row.id) ?? [],
  }))
}

export function hasKeypair(walletId: string): boolean {
  const db = getDb()
  const row = db.prepare('SELECT 1 FROM secure_keys WHERE key_name = ?').get(`WALLET_KEYPAIR_${walletId}`)
  return !!row
}

export function getTransactionHistory(walletId: string, limit = 20) {
  const safeLimitVal = Math.min(Math.max(limit ?? 20, 1), 200)
  const db = getDb()
  return db.prepare(
    'SELECT id, wallet_id, type, signature, from_address, to_address, amount, mint, symbol, status, error, created_at FROM transaction_history WHERE wallet_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(walletId, safeLimitVal)
}

export function exportPrivateKey(walletId: string): string {
  const lastExport = exportCooldowns.get(walletId)
  if (lastExport && Date.now() - lastExport < 60_000) {
    throw new Error('Export cooldown active. Please wait 60 seconds between exports for the same wallet.')
  }

  const encrypted = SecureKey.getKey(`WALLET_KEYPAIR_${walletId}`)
  if (!encrypted) throw new Error('No keypair found for this wallet. It may be a watch-only wallet.')

  exportCooldowns.set(walletId, Date.now())
  return encrypted
}
