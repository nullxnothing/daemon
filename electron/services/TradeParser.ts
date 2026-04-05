import { getDb } from '../db/db'
import { API_ENDPOINTS } from '../config/constants'
import * as SecureKey from './SecureKeyService'

interface HeliusTokenTransfer {
  fromUserAccount: string
  toUserAccount: string
  fromTokenAccount: string
  toTokenAccount: string
  tokenAmount: number
  mint: string
  tokenStandard: string
}

interface HeliusNativeTransfer {
  fromUserAccount: string
  toUserAccount: string
  amount: number
}

interface HeliusEnhancedTx {
  signature: string
  timestamp: number
  type: string
  source: string
  tokenTransfers: HeliusTokenTransfer[]
  nativeTransfers: HeliusNativeTransfer[]
  fee: number
  feePayer: string
}

export interface ParsedTrade {
  signature: string
  wallet: string
  mint: string
  side: 'buy' | 'sell'
  tokenAmount: number
  solAmount: number
  pricePerToken: number
  source: string
  timestamp: number
}

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const WSOL_MINT = SOL_MINT
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
const STABLE_MINTS = new Set([USDC_MINT, USDT_MINT, SOL_MINT, WSOL_MINT])

function normalizeSource(source: string): string {
  const s = source.toLowerCase()
  if (s.includes('jupiter')) return 'jupiter'
  if (s.includes('raydium')) return 'raydium'
  if (s.includes('pump') || s.includes('pumpfun')) return 'pumpfun'
  if (s.includes('orca')) return 'orca'
  if (s.includes('meteora')) return 'meteora'
  return source.toLowerCase() || 'unknown'
}

function extractSwaps(tx: HeliusEnhancedTx, walletAddress: string): ParsedTrade[] {
  if (tx.type !== 'SWAP' && tx.type !== 'TRANSFER') return []

  const trades: ParsedTrade[] = []
  const source = normalizeSource(tx.source)

  // Find token transfers involving our wallet
  const tokensIn: { mint: string; amount: number }[] = []
  const tokensOut: { mint: string; amount: number }[] = []

  for (const tt of tx.tokenTransfers) {
    if (tt.toUserAccount === walletAddress && tt.tokenAmount > 0 && !STABLE_MINTS.has(tt.mint)) {
      tokensIn.push({ mint: tt.mint, amount: tt.tokenAmount })
    }
    if (tt.fromUserAccount === walletAddress && tt.tokenAmount > 0 && !STABLE_MINTS.has(tt.mint)) {
      tokensOut.push({ mint: tt.mint, amount: tt.tokenAmount })
    }
  }

  // Calculate SOL delta for this wallet
  let solDelta = 0
  for (const nt of tx.nativeTransfers) {
    if (nt.toUserAccount === walletAddress) solDelta += nt.amount
    if (nt.fromUserAccount === walletAddress) solDelta -= nt.amount
  }
  // Also check for WSOL/SOL token transfers
  for (const tt of tx.tokenTransfers) {
    if (STABLE_MINTS.has(tt.mint)) {
      if (tt.toUserAccount === walletAddress) solDelta += tt.tokenAmount * 1e9
      if (tt.fromUserAccount === walletAddress) solDelta -= tt.tokenAmount * 1e9
    }
  }

  const solLamports = Math.abs(solDelta)
  const solAmount = solLamports / 1e9

  // Buy: SOL goes out, token comes in
  for (const tokenIn of tokensIn) {
    if (solDelta < 0 && tokenIn.amount > 0) {
      trades.push({
        signature: tx.signature,
        wallet: walletAddress,
        mint: tokenIn.mint,
        side: 'buy',
        tokenAmount: tokenIn.amount,
        solAmount,
        pricePerToken: tokenIn.amount > 0 ? solAmount / tokenIn.amount : 0,
        source,
        timestamp: tx.timestamp * 1000,
      })
    }
  }

  // Sell: token goes out, SOL comes in
  for (const tokenOut of tokensOut) {
    if (solDelta > 0 && tokenOut.amount > 0) {
      trades.push({
        signature: tx.signature,
        wallet: walletAddress,
        mint: tokenOut.mint,
        side: 'sell',
        tokenAmount: tokenOut.amount,
        solAmount,
        pricePerToken: tokenOut.amount > 0 ? solAmount / tokenOut.amount : 0,
        source,
        timestamp: tx.timestamp * 1000,
      })
    }
  }

  return trades
}

export async function syncWalletTrades(walletAddress: string): Promise<{ tradesFound: number; newTrades: number }> {
  const apiKey = SecureKey.getKey('HELIUS_API_KEY')
  if (!apiKey) throw new Error('Helius API key not configured')

  const db = getDb()

  // Check sync state
  const syncState = db.prepare('SELECT last_signature, is_full_sync_done FROM pnl_sync_state WHERE wallet = ?')
    .get(walletAddress) as { last_signature: string | null; is_full_sync_done: number } | undefined

  let allTrades: ParsedTrade[] = []
  let lastSig = syncState?.last_signature ?? undefined
  let page = 0
  const maxPages = 50 // Safety limit

  // Fetch transaction history from Helius
  while (page < maxPages) {
    const url = `${API_ENDPOINTS.HELIUS_TX_HISTORY}/${walletAddress}/transactions?api-key=${apiKey}&type=SWAP`
    const body: Record<string, unknown> = {}
    if (lastSig && page === 0 && syncState?.is_full_sync_done) {
      // Incremental: only fetch newer transactions
      // Helius returns newest first, so we fetch until we hit our last known signature
    }

    try {
      const res = await fetch(url)
      if (!res.ok) {
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 2000))
          continue
        }
        break
      }

      const txns = await res.json() as HeliusEnhancedTx[]
      if (!Array.isArray(txns) || txns.length === 0) break

      for (const tx of txns) {
        // Stop if we've reached a transaction we already processed
        if (syncState?.is_full_sync_done && tx.signature === syncState.last_signature) {
          page = maxPages // Break outer loop
          break
        }
        const trades = extractSwaps(tx, walletAddress)
        allTrades.push(...trades)
      }

      // Helius paginates via the last signature
      const lastTx = txns[txns.length - 1]
      if (lastTx) {
        lastSig = lastTx.signature
      }

      page++

      // If less than 100 results, we've reached the end
      if (txns.length < 100) break
    } catch {
      break
    }
  }

  // Insert trades into DB
  let newTrades = 0
  if (allTrades.length > 0) {
    const insertStmt = db.prepare(
      `INSERT OR IGNORE INTO pnl_trades (signature, wallet, mint, side, token_amount, sol_amount, price_per_token, source, timestamp)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )

    db.transaction(() => {
      for (const trade of allTrades) {
        const result = insertStmt.run(
          trade.signature, trade.wallet, trade.mint, trade.side,
          trade.tokenAmount, trade.solAmount, trade.pricePerToken,
          trade.source, trade.timestamp
        )
        if (result.changes > 0) newTrades++
      }
    })()
  }

  // Update sync state
  const newestSig = allTrades.length > 0 ? allTrades[0].signature : syncState?.last_signature ?? null
  db.prepare(
    `INSERT OR REPLACE INTO pnl_sync_state (wallet, last_signature, last_timestamp, is_full_sync_done)
     VALUES (?,?,?,1)`
  ).run(walletAddress, newestSig, Date.now())

  // Recompute cost basis for affected mints
  const affectedMints = [...new Set(allTrades.map((t) => t.mint))]
  for (const mint of affectedMints) {
    recomputeCostBasis(walletAddress, mint)
  }

  return { tradesFound: allTrades.length, newTrades }
}

export function recomputeCostBasis(wallet: string, mint: string) {
  const db = getDb()

  const trades = db.prepare(
    'SELECT side, token_amount, sol_amount FROM pnl_trades WHERE wallet = ? AND mint = ? ORDER BY timestamp ASC'
  ).all(wallet, mint) as Array<{ side: string; token_amount: number; sol_amount: number }>

  let totalBought = 0
  let totalSolSpent = 0
  let totalSold = 0
  let totalSolReceived = 0

  for (const t of trades) {
    if (t.side === 'buy') {
      totalBought += t.token_amount
      totalSolSpent += t.sol_amount
    } else {
      totalSold += t.token_amount
      totalSolReceived += t.sol_amount
    }
  }

  const avgBuyPrice = totalBought > 0 ? totalSolSpent / totalBought : 0
  const realizedPnlSol = totalSold > 0 ? totalSolReceived - (totalSold * avgBuyPrice) : 0

  db.prepare(
    `INSERT OR REPLACE INTO pnl_cost_basis (wallet, mint, total_bought, total_sol_spent, total_sold, total_sol_received, avg_buy_price, realized_pnl_sol, last_updated)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(wallet, mint, totalBought, totalSolSpent, totalSold, totalSolReceived, avgBuyPrice, realizedPnlSol, Date.now())
}

export function getTradesForToken(wallet: string, mint: string): ParsedTrade[] {
  const db = getDb()
  const rows = db.prepare(
    'SELECT id, signature, wallet, mint, side, token_amount, sol_amount, price_per_token, source, timestamp FROM pnl_trades WHERE wallet = ? AND mint = ? ORDER BY timestamp DESC'
  ).all(wallet, mint) as Array<{
    id: number; signature: string; wallet: string; mint: string; side: string
    token_amount: number; sol_amount: number; price_per_token: number; source: string; timestamp: number
  }>

  return rows.map((r) => ({
    signature: r.signature,
    wallet: r.wallet,
    mint: r.mint,
    side: r.side as 'buy' | 'sell',
    tokenAmount: r.token_amount,
    solAmount: r.sol_amount,
    pricePerToken: r.price_per_token,
    source: r.source,
    timestamp: r.timestamp,
  }))
}
