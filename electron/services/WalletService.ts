import * as SecureKey from './SecureKeyService'
import { getDb } from '../db/db'

const HELIUS_BASE = 'https://api.helius.xyz/v1'
const COINGECKO_SIMPLE_PRICE = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana,ethereum&vs_currencies=usd&include_24hr_change=true'
const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000

interface WalletRow {
  id: string
  name: string
  address: string
  keypair_path: string | null
  is_default: number
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

export async function getDashboard(projectId?: string | null) {
  const heliusKey = SecureKey.getKey('HELIUS_API_KEY')
  const heliusConfigured = Boolean(heliusKey)
  const wallets = listWalletsRaw()
  const projectAssignments = getProjectAssignments()

  const market = await getMarketTape()

  if (!heliusConfigured || wallets.length === 0) {
    return {
      heliusConfigured,
      market,
      portfolio: {
        totalUsd: 0,
        delta24hUsd: 0,
        delta24hPct: 0,
        walletCount: wallets.length,
      },
      wallets: wallets.map((wallet) => ({
        id: wallet.id,
        name: wallet.name,
        address: wallet.address,
        isDefault: wallet.is_default === 1,
        totalUsd: 0,
        tokenCount: 0,
        assignedProjectIds: projectAssignments.get(wallet.id) ?? [],
      })),
      activeWallet: null,
      feed: [] as PortfolioFeedEntry[],
      recentActivity: [] as HeliusHistoryEvent[],
    }
  }

  const apiKey = heliusKey as string
  const activeWalletRow = resolveActiveWallet(wallets, projectId ?? null)
  const walletResults = await Promise.allSettled(
    wallets.map(async (wallet) => {
      const balances = await getWalletBalances(wallet.address, apiKey)
      const holdings = normalizeHoldings(balances.balances)
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
    })
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
  const delta24hUsd = previousTotalUsd !== null ? totalUsd - previousTotalUsd : 0
  const delta24hPct = previousTotalUsd !== null && previousTotalUsd > 0
    ? (delta24hUsd / previousTotalUsd) * 100
    : 0

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
  return db.prepare('SELECT * FROM wallets WHERE id = ?').get(id)
}

export function deleteWallet(id: string) {
  const db = getDb()
  const row = db.prepare('SELECT is_default FROM wallets WHERE id = ?').get(id) as { is_default: number } | undefined
  db.prepare('UPDATE projects SET wallet_id = NULL WHERE wallet_id = ?').run(id)
  db.prepare('DELETE FROM wallets WHERE id = ?').run(id)

  if (row?.is_default === 1) {
    const replacement = db.prepare('SELECT id FROM wallets ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined
    if (replacement) db.prepare('UPDATE wallets SET is_default = 1 WHERE id = ?').run(replacement.id)
  }
}

export function setDefaultWallet(id: string) {
  const db = getDb()
  db.prepare('UPDATE wallets SET is_default = 0').run()
  db.prepare('UPDATE wallets SET is_default = 1 WHERE id = ?').run(id)
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

export function storeHeliusKey(value: string) {
  SecureKey.storeKey('HELIUS_API_KEY', value)
}

export function deleteHeliusKey() {
  SecureKey.deleteKey('HELIUS_API_KEY')
}

export function hasHeliusKey() {
  return Boolean(SecureKey.getKey('HELIUS_API_KEY'))
}

async function getMarketTape() {
  try {
    const response = await fetch(COINGECKO_SIMPLE_PRICE)
    if (!response.ok) throw new Error(`CoinGecko error: ${response.status}`)
    const json = await response.json() as Record<string, { usd: number; usd_24h_change?: number }>
    return [
      { symbol: 'BTC', priceUsd: json.bitcoin?.usd ?? 0, change24hPct: json.bitcoin?.usd_24h_change ?? 0 },
      { symbol: 'SOL', priceUsd: json.solana?.usd ?? 0, change24hPct: json.solana?.usd_24h_change ?? 0 },
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
  const url = new URL(`${HELIUS_BASE}/wallet/${address}/balances`)
  url.searchParams.set('api-key', apiKey)
  url.searchParams.set('showNative', 'true')
  url.searchParams.set('showZeroBalance', 'false')
  url.searchParams.set('limit', '100')

  const response = await fetch(url.toString())
  if (!response.ok) throw new Error(`Helius balances error: ${response.status}`)
  return response.json() as Promise<HeliusBalancesResponse>
}

async function getWalletHistory(address: string, apiKey: string): Promise<HeliusHistoryEvent[]> {
  try {
    const url = new URL(`${HELIUS_BASE}/wallet/${address}/history`)
    url.searchParams.set('api-key', apiKey)
    url.searchParams.set('limit', '8')
    const response = await fetch(url.toString())
    if (!response.ok) return []
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

function listWalletsRaw(): WalletRow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM wallets ORDER BY is_default DESC, created_at ASC').all() as WalletRow[]
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
  if (latest && Date.now() - latest.snapshot_at < SNAPSHOT_INTERVAL_MS) return

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
}

function getPreviousTotalUsd(walletIds: string[]): number | null {
  if (walletIds.length === 0) return null
  const db = getDb()
  const threshold = Date.now() - 24 * 60 * 60 * 1000

  // Get the most recent snapshot before 24h ago for each wallet
  let total = 0
  let hasAny = false

  for (const walletId of walletIds) {
    const row = db.prepare(
      'SELECT total_usd FROM portfolio_snapshots WHERE wallet_id = ? AND snapshot_at <= ? ORDER BY snapshot_at DESC LIMIT 1'
    ).get(walletId, threshold) as { total_usd: number } | undefined

    if (row) {
      total += row.total_usd
      hasAny = true
    }
  }

  return hasAny ? total : null
}

function truncateMint(mint: string): string {
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function isValidSolanaAddress(value: string): boolean {
  if (value.length < 32 || value.length > 44) return false
  let bytes = [0]

  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char)
    if (digit === -1) return false

    let carry = digit
    for (let i = 0; i < bytes.length; i += 1) {
      const next = bytes[i] * 58 + carry
      bytes[i] = next & 0xff
      carry = next >> 8
    }

    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }

  for (const char of value) {
    if (char !== '1') break
    bytes.push(0)
  }

  return bytes.length === 32
}
