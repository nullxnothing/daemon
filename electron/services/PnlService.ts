import { getDb } from '../db/db'
import { LogService } from './LogService'
import * as PriceService from './PriceService'
import * as TradeParser from './TradeParser'
import type { PnlHolding, PnlPortfolio, PnlTokenDetail, CostBasisEntry, PnlSyncResult } from '../shared/types'

const SOL_MINT = 'So11111111111111111111111111111111111111112'

interface WalletRow {
  id: string
  name: string
  address: string
}

interface HoldingRow {
  mint: string
  symbol: string
  name: string
  amount: number
  logoUri: string | null
}

function getWallets(): WalletRow[] {
  const db = getDb()
  return db.prepare('SELECT id, name, address FROM wallets').all() as WalletRow[]
}

function getCostBasis(wallet: string, mint: string): CostBasisEntry | null {
  const db = getDb()
  const row = db.prepare(
    'SELECT wallet, mint, total_bought, total_sol_spent, total_sold, total_sol_received, avg_buy_price, realized_pnl_sol, last_updated FROM pnl_cost_basis WHERE wallet = ? AND mint = ?'
  ).get(wallet, mint) as {
    wallet: string; mint: string; total_bought: number; total_sol_spent: number
    total_sold: number; total_sol_received: number; avg_buy_price: number
    realized_pnl_sol: number; last_updated: number
  } | undefined

  if (!row) return null

  return {
    wallet: row.wallet,
    mint: row.mint,
    totalBought: row.total_bought,
    totalSolSpent: row.total_sol_spent,
    totalSold: row.total_sold,
    totalSolReceived: row.total_sol_received,
    avgBuyPrice: row.avg_buy_price,
    realizedPnlSol: row.realized_pnl_sol,
    lastUpdated: row.last_updated,
  }
}

function getTradeCount(wallet: string, mint: string): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) as c FROM pnl_trades WHERE wallet = ? AND mint = ?').get(wallet, mint) as { c: number }
  return row.c
}

export async function getPortfolio(walletAddress: string, holdings: HoldingRow[]): Promise<PnlPortfolio> {
  const solPrice = PriceService.getSolPriceUsd()

  // Get prices for all held tokens
  const mints = holdings.map((h) => h.mint).filter((m) => m !== SOL_MINT)
  const prices = await PriceService.getPrices(mints)
  const priceMap = new Map(prices.map((p) => [p.mint, p]))

  const pnlHoldings: PnlHolding[] = []
  let totalValueUsd = 0
  let totalCostBasisUsd = 0
  let totalRealizedPnlUsd = 0

  for (const holding of holdings) {
    const costBasis = getCostBasis(walletAddress, holding.mint)
    const priceData = priceMap.get(holding.mint)
    const tradeCount = getTradeCount(walletAddress, holding.mint)

    let currentPriceUsd = 0
    let currentPriceSol = 0
    let priceSource = 'none'

    if (holding.mint === SOL_MINT) {
      currentPriceUsd = solPrice
      currentPriceSol = 1
      priceSource = 'jupiter'
    } else if (priceData) {
      currentPriceUsd = priceData.priceUsd
      currentPriceSol = priceData.priceSol
      priceSource = priceData.source
    }

    const valueUsd = holding.amount * currentPriceUsd
    const avgBuyPriceSol = costBasis?.avgBuyPrice ?? 0
    const avgBuyPriceUsd = avgBuyPriceSol * solPrice
    const costBasisUsd = holding.amount * avgBuyPriceUsd
    const unrealizedPnlUsd = costBasis ? valueUsd - costBasisUsd : 0
    const unrealizedPnlPct = costBasisUsd > 0 ? (unrealizedPnlUsd / costBasisUsd) * 100 : 0
    const realizedPnlUsd = (costBasis?.realizedPnlSol ?? 0) * solPrice

    totalValueUsd += valueUsd
    totalCostBasisUsd += costBasisUsd
    totalRealizedPnlUsd += realizedPnlUsd

    pnlHoldings.push({
      mint: holding.mint,
      symbol: holding.symbol,
      name: holding.name,
      logoUri: holding.logoUri,
      amount: holding.amount,
      currentPriceUsd,
      currentPriceSol,
      valueUsd,
      avgBuyPriceSol,
      avgBuyPriceUsd,
      costBasisUsd,
      unrealizedPnlUsd,
      unrealizedPnlPct,
      realizedPnlUsd,
      totalTrades: tradeCount,
      priceSource,
    })
  }

  // Sort by value descending
  pnlHoldings.sort((a, b) => b.valueUsd - a.valueUsd)

  const totalUnrealizedPnlUsd = totalValueUsd - totalCostBasisUsd
  const totalUnrealizedPnlPct = totalCostBasisUsd > 0 ? (totalUnrealizedPnlUsd / totalCostBasisUsd) * 100 : 0

  return {
    totalValueUsd,
    totalCostBasisUsd,
    totalUnrealizedPnlUsd,
    totalUnrealizedPnlPct,
    totalRealizedPnlUsd,
    holdings: pnlHoldings,
    lastPriceUpdate: Date.now(),
    syncStatus: 'idle',
  }
}

export async function syncAllWallets(): Promise<PnlSyncResult> {
  const wallets = getWallets()
  let totalTradesFound = 0
  let totalNewTrades = 0

  for (const wallet of wallets) {
    try {
      const result = await TradeParser.syncWalletTrades(wallet.address)
      totalTradesFound += result.tradesFound
      totalNewTrades += result.newTrades
    } catch (err) {
      LogService.warn('PnlService', `Failed to sync wallet ${wallet.address}: ` + (err as Error).message)
    }
  }

  return {
    tradesFound: totalTradesFound,
    newTrades: totalNewTrades,
    walletsProcessed: wallets.length,
  }
}

export async function syncSingleWallet(walletAddress: string): Promise<PnlSyncResult> {
  const result = await TradeParser.syncWalletTrades(walletAddress)
  return {
    tradesFound: result.tradesFound,
    newTrades: result.newTrades,
    walletsProcessed: 1,
  }
}

export async function getTokenDetail(walletAddress: string, mint: string): Promise<PnlTokenDetail> {
  const costBasis = getCostBasis(walletAddress, mint)
  const trades = TradeParser.getTradesForToken(walletAddress, mint)

  const prices = await PriceService.getPrices([mint])
  const priceData = prices[0]

  // Get token metadata from existing holdings
  const db = getDb()
  const meta = db.prepare(
    "SELECT json_extract(tokens, '$') as tokens FROM portfolio_snapshots WHERE wallet_id IN (SELECT id FROM wallets WHERE address = ?) ORDER BY snapshot_at DESC LIMIT 1"
  ).get(walletAddress) as { tokens: string } | undefined

  let symbol = mint.slice(0, 6)
  let name = mint.slice(0, 6)

  if (meta?.tokens) {
    try {
      const holdings = JSON.parse(meta.tokens) as Array<{ mint: string; symbol: string; name: string }>
      const found = holdings.find((h) => h.mint === mint)
      if (found) {
        symbol = found.symbol
        name = found.name
      }
    } catch { /* ignore */ }
  }

  return {
    mint,
    symbol,
    name,
    costBasis,
    trades: trades.map((t) => ({
      id: 0,
      signature: t.signature,
      wallet: t.wallet,
      mint: t.mint,
      side: t.side,
      tokenAmount: t.tokenAmount,
      solAmount: t.solAmount,
      pricePerToken: t.pricePerToken,
      source: t.source,
      timestamp: t.timestamp,
    })),
    currentPriceUsd: priceData?.priceUsd ?? 0,
    currentPriceSol: priceData?.priceSol ?? 0,
    priceSource: priceData?.source ?? 'none',
  }
}

export async function refreshPrices(mints: string[]): Promise<void> {
  await PriceService.getPrices(mints)
}
