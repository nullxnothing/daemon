import * as SecureKey from './SecureKeyService'
import { getDb } from '../db/db'
import { API_ENDPOINTS, RETRY_CONFIG } from '../config/constants'
import { Keypair, Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js'
import { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction, getAccount } from '@solana/spl-token'
import bs58 from 'bs58'
import { getConnection, getHeliusApiKey, withKeypair } from './SolanaService'

async function fetchWithRetry(url: string, retries = RETRY_CONFIG.MAX_RETRIES): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(url)
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

// In-memory balance cache with 30-second TTL
const balanceCache = new Map<string, { data: HeliusBalancesResponse; timestamp: number }>()
const BALANCE_CACHE_TTL = 30_000
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

  // Process wallets with bounded concurrency to avoid overwhelming the Helius API
  const WALLET_CONCURRENCY = 3
  const walletResults = await runWithConcurrency(
    wallets,
    WALLET_CONCURRENCY,
    async (wallet) => {
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
  return db.prepare('SELECT id, name, address, is_default, created_at FROM wallets WHERE id = ?').get(id)
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

export async function storeHeliusKey(value: string) {
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${value}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
  })
  if (!res.ok) throw new Error('Invalid Helius API key — connection failed')
  SecureKey.storeKey('HELIUS_API_KEY', value)
}

export function deleteHeliusKey() {
  SecureKey.deleteKey('HELIUS_API_KEY')
}

export function hasHeliusKey() {
  return Boolean(getHeliusApiKey())
}

async function getMarketTape() {
  try {
    const response = await fetch(API_ENDPOINTS.COINGECKO_PRICE)
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
        mint: 'So11111111111111111111111111111111111111112',
        balance: solAmount,
        decimals: 9,
        symbol: 'SOL',
        name: 'Solana',
        pricePerToken: solPrice,
        usdValue: solAmount * solPrice,
        logoUri: undefined,
      },
      ...raw.balances,
    ]
  }

  balanceCache.set(address, { data: raw, timestamp: Date.now() })
  return raw
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

// ---------------------------------------------------------------------------
// Solana Transaction Support
// ---------------------------------------------------------------------------

function sendWithTimeout(connection: Connection, transaction: Transaction, signers: Keypair[], timeoutMs = 60_000): Promise<string> {
  const txPromise = sendAndConfirmTransaction(connection, transaction, signers)
  let timer: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Transaction confirmation timed out (60s). It may still confirm — check Solscan.')), timeoutMs)
  })
  return Promise.race([txPromise, timeoutPromise]).finally(() => clearTimeout(timer!))
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

export async function transferSOL(fromWalletId: string, toAddress: string, amountSol?: number, sendMax = false) {
  if (!sendMax && (!amountSol || amountSol <= 0)) throw new Error('Amount must be greater than 0')
  if (!isValidSolanaAddress(toAddress)) throw new Error('Invalid destination address')

  const db = getDb()

  const walletRow = db.prepare('SELECT wallet_type FROM wallets WHERE id = ?').get(fromWalletId) as { wallet_type: string } | undefined

  return withKeypair(fromWalletId, async (keypair) => {
    const connection = getConnection()
    const fromAddress = keypair.publicKey.toBase58()

    const balance = await connection.getBalance(keypair.publicKey)
    const feeBufferLamports = 10_000
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
      const row = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM transaction_history WHERE wallet_id = ? AND status = ? AND type = ? AND created_at > ?').get(fromWalletId, 'confirmed', 'sol_transfer', dayAgo) as { total: number }
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

      const signature = await sendWithTimeout(connection, transaction, [keypair])

      db.prepare('UPDATE transaction_history SET signature = ?, status = ? WHERE id = ?').run(signature, 'confirmed', txId)
      return { id: txId, signature, status: 'confirmed' }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      db.prepare('UPDATE transaction_history SET status = ?, error = ? WHERE id = ?').run('failed', errorMsg, txId)
      throw err
    }
  })
}

export async function transferToken(fromWalletId: string, toAddress: string, mint: string, amount?: number, sendMax = false) {
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
    const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals ?? 9
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

      // Create destination ATA if it doesn't exist
      try {
        await getAccount(connection, toAta)
      } catch {
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

      const signature = await sendWithTimeout(connection, transaction, [keypair])

      db.prepare('UPDATE transaction_history SET signature = ?, status = ? WHERE id = ?').run(signature, 'confirmed', txId)
      return { id: txId, signature, status: 'confirmed' }
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

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote'
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap'
const LAMPORTS_DECIMALS = 9

interface JupiterQuoteResponse {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  priceImpactPct: string
  routePlan: Array<{ swapInfo: { label: string; ammKey: string }; percent: number }>
}

interface SwapQuoteResult {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  priceImpactPct: string
  routePlan: Array<{ label: string; percent: number }>
  rawQuoteResponse: unknown
}

export async function getSwapQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number,
): Promise<SwapQuoteResult> {
  if (!isValidSolanaAddress(inputMint)) throw new Error('Invalid input mint')
  if (!isValidSolanaAddress(outputMint)) throw new Error('Invalid output mint')
  if (amount <= 0) throw new Error('Amount must be greater than 0')
  if (inputMint === outputMint) throw new Error('Input and output mints must differ')

  // Resolve decimals for the input mint to convert human amount to raw
  const decimals = await getMintDecimals(inputMint)
  const rawAmount = BigInt(Math.round(amount * Math.pow(10, decimals)))

  const url = new URL(JUPITER_QUOTE_API)
  url.searchParams.set('inputMint', inputMint)
  url.searchParams.set('outputMint', outputMint)
  url.searchParams.set('amount', rawAmount.toString())
  url.searchParams.set('slippageBps', String(slippageBps))

  const response = await fetch(url.toString())
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Jupiter quote failed (${response.status}): ${body}`)
  }

  const data = await response.json() as JupiterQuoteResponse

  // Convert raw amounts to human-readable
  const outputDecimals = await getMintDecimals(outputMint)
  const humanInAmount = (Number(BigInt(data.inAmount)) / Math.pow(10, decimals)).toString()
  const humanOutAmount = (Number(BigInt(data.outAmount)) / Math.pow(10, outputDecimals)).toString()

  return {
    inputMint: data.inputMint,
    outputMint: data.outputMint,
    inAmount: humanInAmount,
    outAmount: humanOutAmount,
    priceImpactPct: data.priceImpactPct,
    routePlan: (data.routePlan ?? []).map((r) => ({
      label: r.swapInfo?.label ?? 'Unknown',
      percent: r.percent,
    })),
    // The raw Jupiter response is passed back to executeSwap so it can use the
    // exact quote the user reviewed rather than fetching at a potentially different price.
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
): Promise<{ signature: string }> {
  if (!isValidSolanaAddress(inputMint)) throw new Error('Invalid input mint')
  if (!isValidSolanaAddress(outputMint)) throw new Error('Invalid output mint')
  if (amount <= 0) throw new Error('Amount must be greater than 0')

  const db = getDb()

  return withKeypair(walletId, async (keypair) => {
    const connection = getConnection()
    const userPublicKey = keypair.publicKey.toBase58()

    // Balance check: verify the wallet holds enough of the input token before
    // building the transaction. This prevents sending a doomed tx to the network.
    const decimals = await getMintDecimals(inputMint)
    const SOL_MINT = 'So11111111111111111111111111111111111111112'
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

    // Use the quote the user reviewed when provided. Fall back to fetching a fresh
    // quote only if no rawQuoteResponse was supplied (e.g. programmatic calls).
    let quoteData: unknown
    if (rawQuoteResponse) {
      // H2: validate that the quote matches the parameters the user approved
      const q = rawQuoteResponse as Record<string, unknown>

      if (typeof q.inputMint !== 'string' || q.inputMint !== inputMint) {
        throw new Error(`Quote inputMint mismatch: expected ${inputMint}, got ${String(q.inputMint)}`)
      }
      if (typeof q.outputMint !== 'string' || q.outputMint !== outputMint) {
        throw new Error(`Quote outputMint mismatch: expected ${outputMint}, got ${String(q.outputMint)}`)
      }

      // inAmount in the raw Jupiter quote is in lamports/raw units — compare against
      // the raw amount derived from the same decimals used when the quote was fetched.
      const rawRequested = Math.round(amount * Math.pow(10, decimals))
      const quoteInAmount = parseInt(String(q.inAmount ?? '0'), 10)
      if (isNaN(quoteInAmount) || quoteInAmount <= 0) {
        throw new Error('Quote inAmount is invalid')
      }
      const drift = Math.abs(quoteInAmount - rawRequested) / rawRequested
      if (drift > 0.01) {
        throw new Error(
          `Quote inAmount ${quoteInAmount} deviates more than 1% from requested ${rawRequested}`
        )
      }

      quoteData = rawQuoteResponse
    } else {
      const rawAmount = BigInt(Math.round(amount * Math.pow(10, decimals)))
      const quoteUrl = new URL(JUPITER_QUOTE_API)
      quoteUrl.searchParams.set('inputMint', inputMint)
      quoteUrl.searchParams.set('outputMint', outputMint)
      quoteUrl.searchParams.set('amount', rawAmount.toString())
      quoteUrl.searchParams.set('slippageBps', String(slippageBps))

      const quoteRes = await fetch(quoteUrl.toString())
      if (!quoteRes.ok) throw new Error(`Jupiter quote failed: ${quoteRes.status}`)
      quoteData = await quoteRes.json()
    }

    // Get the swap transaction from Jupiter
    const swapRes = await fetch(JUPITER_SWAP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey,
        wrapAndUnwrapSol: true,
      }),
    })

    if (!swapRes.ok) {
      const body = await swapRes.text()
      throw new Error(`Jupiter swap failed (${swapRes.status}): ${body}`)
    }

    const { swapTransaction } = await swapRes.json() as { swapTransaction: string }

    // Deserialize, sign, and send the versioned transaction
    const { VersionedTransaction: VTx } = await import('@solana/web3.js')
    const txBuf = Buffer.from(swapTransaction, 'base64')
    const transaction = VTx.deserialize(txBuf)
    transaction.sign([keypair])

    const txId = crypto.randomUUID()
    db.prepare(
      'INSERT INTO transaction_history (id, wallet_id, type, from_address, to_address, amount, mint, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(txId, walletId, 'swap', userPublicKey, '', amount, `${inputMint}→${outputMint}`, 'pending', Date.now())

    try {
      const rawTx = transaction.serialize()
      const signature = await connection.sendRawTransaction(rawTx, {
        skipPreflight: false,
        maxRetries: 3,
      })

      // Confirm the transaction
      const latestBlockhash = await connection.getLatestBlockhash()
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      })

      db.prepare('UPDATE transaction_history SET signature = ?, status = ? WHERE id = ?').run(signature, 'confirmed', txId)
      return { signature }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      db.prepare('UPDATE transaction_history SET status = ?, error = ? WHERE id = ?').run('failed', errorMsg, txId)
      throw err
    }
  })
}

async function getMintDecimals(mint: string): Promise<number> {
  // SOL native mint
  if (mint === 'So11111111111111111111111111111111111111112') return LAMPORTS_DECIMALS

  try {
    const connection = getConnection()
    const mintPubkey = new PublicKey(mint)
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey)
    return (mintInfo.value?.data as any)?.parsed?.info?.decimals ?? 9
  } catch {
    return 9
  }
}

export async function getBalance(walletId: string) {
  const db = getDb()
  const row = db.prepare('SELECT address FROM wallets WHERE id = ?').get(walletId) as { address: string } | undefined
  if (!row) throw new Error('Wallet not found')

  const connection = getConnection()
  const lamports = await connection.getBalance(new PublicKey(row.address))
  return { sol: lamports / LAMPORTS_PER_SOL, lamports }
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
