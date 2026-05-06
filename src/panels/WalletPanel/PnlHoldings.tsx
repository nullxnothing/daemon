import { useEffect, useState, useCallback, useRef } from 'react'
import type { PnlPortfolio, PnlHolding } from '../../types/daemon.d'

interface HoldingInput {
  mint: string
  symbol: string
  name: string
  amount: number
  priceUsd: number
  valueUsd: number
  logoUri: string | null
}

interface PnlHoldingsProps {
  walletAddress: string
  holdings: HoldingInput[]
  onSwapHolding?: (mint: string) => void
  onCopyMint?: (mint: string, symbol: string) => void
}

function formatUsd(v: number): string {
  if (v >= 1000) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (v >= 1) return v.toFixed(2)
  if (v >= 0.01) return v.toFixed(4)
  if (v > 0) return v.toExponential(2)
  return '0.00'
}

function formatPnl(v: number): string {
  const str = formatUsd(Math.abs(v))
  return v >= 0 ? `+$${str}` : `-$${str}`
}

function formatPct(v: number): string {
  const str = Math.abs(v) >= 1000 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(1)
  return v >= 0 ? `+${str}%` : `-${str}%`
}

export function PnlHoldings({ walletAddress, holdings, onSwapHolding, onCopyMint }: PnlHoldingsProps) {
  const [portfolio, setPortfolio] = useState<PnlPortfolio | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPortfolio = useCallback(async () => {
    if (!walletAddress || holdings.length === 0) return
    try {
      const res = await window.daemon.pnl.getPortfolio(walletAddress, holdings)
      if (res.ok && res.data) setPortfolio(res.data)
    } catch { /* ignore */ }
  }, [walletAddress, holdings])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await window.daemon.pnl.syncHistory(walletAddress)
      if (res.ok && res.data) {
        setSyncResult(`${res.data.newTrades} new trades found`)
        await fetchPortfolio()
      } else {
        setSyncResult(res.error ?? 'Sync failed')
      }
    } catch (err) {
      setSyncResult((err as Error).message)
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncResult(null), 3000)
    }
  }, [walletAddress, fetchPortfolio])

  useEffect(() => {
    void fetchPortfolio()
    // Slow background poll — wallet:changed event drives immediate refresh
    pollRef.current = setInterval(() => void fetchPortfolio(), 60_000)
    const unsubscribe = window.daemon.events.on('wallet:changed', () => { void fetchPortfolio() })
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      unsubscribe()
    }
  }, [fetchPortfolio])

  const pnlHoldings = portfolio?.holdings ?? []
  const hasCostBasis = pnlHoldings.some((h: PnlHolding) => h.totalTrades > 0)

  return (
    <section className="wallet-section">
      <div className="wallet-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Holdings</span>
        <button
          className="pnl-sync-btn"
          onClick={handleSync}
          disabled={syncing}
          title="Sync trade history from Helius"
        >
          {syncing ? 'Syncing...' : 'Sync PnL'}
        </button>
      </div>

      {syncResult && (
        <div className="pnl-sync-result">{syncResult}</div>
      )}

      {portfolio && hasCostBasis && (
        <div className="pnl-summary">
          <div className="pnl-summary-row">
            <span className="pnl-summary-label">Unrealized</span>
            <span className={`pnl-summary-value ${portfolio.totalUnrealizedPnlUsd >= 0 ? 'profit' : 'loss'}`}>
              {formatPnl(portfolio.totalUnrealizedPnlUsd)}
              <span className="pnl-pct">{formatPct(portfolio.totalUnrealizedPnlPct)}</span>
            </span>
          </div>
          {portfolio.totalRealizedPnlUsd !== 0 && (
            <div className="pnl-summary-row">
              <span className="pnl-summary-label">Realized</span>
              <span className={`pnl-summary-value ${portfolio.totalRealizedPnlUsd >= 0 ? 'profit' : 'loss'}`}>
                {formatPnl(portfolio.totalRealizedPnlUsd)}
              </span>
            </div>
          )}
        </div>
      )}

        <div className="wallet-holdings">
        {pnlHoldings.length > 0 ? pnlHoldings.map((h: PnlHolding) => (
          <PnlRow key={h.mint} holding={h} onSwapHolding={onSwapHolding} onCopyMint={onCopyMint} />
        )) : holdings.map((h: HoldingInput) => (
          <FallbackRow key={h.mint} holding={h} onSwapHolding={onSwapHolding} onCopyMint={onCopyMint} />
        ))}
      </div>
    </section>
  )
}

function PnlRow({ holding, onSwapHolding, onCopyMint }: {
  holding: PnlHolding
  onSwapHolding?: (mint: string) => void
  onCopyMint?: (mint: string, symbol: string) => void
}) {
  const hasPnl = holding.totalTrades > 0

  return (
    <div className="wallet-holding-row">
      <div className="wallet-holding-main">
        <div className="wallet-label">{holding.symbol}</div>
        <div className="wallet-caption">{holding.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
        <div className="wallet-holding-actions">
          {onSwapHolding && (
            <button type="button" className="wallet-inline-link" onClick={() => onSwapHolding(holding.mint)}>Sell / Swap</button>
          )}
          {onCopyMint && (
            <button type="button" className="wallet-inline-link" onClick={() => onCopyMint(holding.mint, holding.symbol)}>Copy mint</button>
          )}
        </div>
      </div>
      <div className="wallet-holding-value">
        <div>${formatUsd(holding.valueUsd)}</div>
        {hasPnl ? (
          <div className={`pnl-inline ${holding.unrealizedPnlUsd >= 0 ? 'profit' : 'loss'}`}>
            {formatPnl(holding.unrealizedPnlUsd)}
            <span className="pnl-pct-sm">{formatPct(holding.unrealizedPnlPct)}</span>
          </div>
        ) : (
          holding.currentPriceUsd >= 0.01 ? (
            <div className="wallet-caption">${formatUsd(holding.currentPriceUsd)}</div>
          ) : null
        )}
      </div>
    </div>
  )
}

function FallbackRow({ holding, onSwapHolding, onCopyMint }: {
  holding: HoldingInput
  onSwapHolding?: (mint: string) => void
  onCopyMint?: (mint: string, symbol: string) => void
}) {
  return (
    <div className="wallet-holding-row">
      <div className="wallet-holding-main">
        <div className="wallet-label">{holding.symbol}</div>
        <div className="wallet-caption">{holding.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
        <div className="wallet-holding-actions">
          {onSwapHolding && (
            <button type="button" className="wallet-inline-link" onClick={() => onSwapHolding(holding.mint)}>Sell / Swap</button>
          )}
          {onCopyMint && (
            <button type="button" className="wallet-inline-link" onClick={() => onCopyMint(holding.mint, holding.symbol)}>Copy mint</button>
          )}
        </div>
      </div>
      <div className="wallet-holding-value">
        <div>${formatUsd(holding.valueUsd)}</div>
        {holding.priceUsd >= 0.01 ? (
          <div className="wallet-caption">${formatUsd(holding.priceUsd)}</div>
        ) : null}
      </div>
    </div>
  )
}
