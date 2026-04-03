import { useState, useEffect } from 'react'
import { useUIStore } from '../../store/ui'
import { useDashboardData } from './useDashboardData'
import { Sparkline } from './Sparkline'
import './Dashboard.css'

function formatPrice(price: number): string {
  if (price < 0.000001) return price.toExponential(4)
  if (price < 0.001) return price.toFixed(7)
  if (price < 1) return price.toFixed(5)
  return price.toFixed(4)
}

function formatMarketCap(price: number, supply: number, decimals: number): string {
  const adjustedSupply = supply / Math.pow(10, decimals)
  const mcap = price * adjustedSupply
  if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(2)}M`
  if (mcap >= 1_000) return `$${(mcap / 1_000).toFixed(1)}K`
  return `$${mcap.toFixed(0)}`
}

function truncateAddress(addr: string, chars = 6): string {
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`
}

function formatAmount(amount: number, decimals: number): string {
  const adj = amount / Math.pow(10, decimals)
  if (adj >= 1_000_000) return `${(adj / 1_000_000).toFixed(2)}M`
  if (adj >= 1_000) return `${(adj / 1_000).toFixed(1)}K`
  return adj.toFixed(2)
}

interface TokenOption {
  mint: string
  name: string
  symbol: string
}

function useTokenList(): TokenOption[] {
  const [tokens, setTokens] = useState<TokenOption[]>([])

  useEffect(() => {
    window.daemon.launch.listTokens().then((res) => {
      if (res.ok && res.data) {
        setTokens(res.data.map((t) => ({ mint: t.mint, name: t.name, symbol: t.symbol })))
      }
    }).catch(() => {})
  }, [])

  return tokens
}

export function DashboardCanvas() {
  const activeMint = useUIStore((s) => s.activeDashboardMint)
  const setActiveMint = useUIStore((s) => s.setActiveDashboardMint)
  const openLaunchWizard = useUIStore((s) => s.openLaunchWizard)

  const tokens = useTokenList()
  const { price, priceChange, priceHistory, metadata, holders, isLoading, error, refetchHolders } = useDashboardData(activeMint)

  const isPositive = priceChange !== null ? priceChange >= 0 : null
  const priceColor = isPositive === false ? 'var(--red)' : 'var(--green)'

  const mcapText = price !== null && metadata
    ? formatMarketCap(price, metadata.supply, metadata.decimals)
    : '—'

  const handleBuy = () => {
    if (!activeMint) return
    window.daemon.shell.openExternal(`https://pump.fun/coin/${activeMint}`)
  }

  const handleSell = () => {
    if (!activeMint) return
    window.daemon.shell.openExternal(`https://pump.fun/coin/${activeMint}`)
  }

  const handleClaimFees = () => {
    if (!activeMint) return
    window.daemon.pumpfun.collectFees(activeMint).catch(() => {})
  }

  if (tokens.length === 0) {
    return (
      <div className="dash-canvas">
        <div className="dash-canvas-empty">
          <span className="dash-canvas-empty-title">No tokens launched</span>
          <span className="dash-canvas-empty-sub">Launch your first token to see live data here</span>
          <button className="dash-btn dash-btn-primary dash-btn-lg" onClick={openLaunchWizard}>
            Launch Token
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dash-canvas">
      <div className="dash-canvas-header">
        <div className="dash-canvas-header-left">
          {metadata?.image && (
            <img className="dash-token-image" src={metadata.image} alt={metadata.symbol} />
          )}
          <div className="dash-canvas-title-group">
            <span className="dash-canvas-token-name">{metadata?.name ?? '—'}</span>
            <span className="dash-canvas-token-symbol">{metadata?.symbol ?? ''}</span>
          </div>
          <select
            className="dash-select"
            value={activeMint ?? ''}
            onChange={(e) => setActiveMint(e.target.value || null)}
          >
            <option value="">Select token</option>
            {tokens.map((t) => (
              <option key={t.mint} value={t.mint}>
                {t.symbol} — {truncateAddress(t.mint, 4)}
              </option>
            ))}
          </select>
        </div>
        <div className="dash-canvas-header-right">
          <button className="dash-btn dash-btn-primary" onClick={openLaunchWizard}>
            + Launch Token
          </button>
        </div>
      </div>

      {isLoading && !price && !error && (
        <div className="dash-canvas-loading">Fetching live data...</div>
      )}

      {error && (
        <div className="dash-canvas-error">{error}</div>
      )}

      {activeMint && (
        <>
          <div className="dash-metrics-row">
            <div className="dash-metric-card">
              <span className="dash-metric-card-label">Price</span>
              <span className="dash-metric-card-value" style={{ color: priceColor }}>
                {price !== null ? `$${formatPrice(price)}` : '—'}
              </span>
            </div>
            <div className="dash-metric-card">
              <span className="dash-metric-card-label">24h Change</span>
              <span className={`dash-metric-card-value ${isPositive === true ? 'positive' : isPositive === false ? 'negative' : ''}`}>
                {priceChange !== null ? `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%` : '—'}
              </span>
            </div>
            <div className="dash-metric-card">
              <span className="dash-metric-card-label">Holders</span>
              <span className="dash-metric-card-value">
                {holders ? holders.count.toLocaleString() : '—'}
              </span>
            </div>
            <div className="dash-metric-card">
              <span className="dash-metric-card-label">Market Cap</span>
              <span className="dash-metric-card-value">{mcapText}</span>
            </div>
          </div>

          <div className="dash-chart-section">
            <div className="dash-chart-header">
              <span className="dash-chart-label">Price — last {priceHistory.length} samples (30s interval)</span>
            </div>
            <div className="dash-chart-area">
              <Sparkline
                points={priceHistory}
                width={600}
                height={120}
                color={priceColor}
                strokeWidth={2}
              />
            </div>
          </div>

          <div className="dash-bottom-row">
            <div className="dash-holders-table">
              <div className="dash-section-title">
                Top Holders
                <button className="dash-refresh-btn" onClick={refetchHolders} title="Refresh holders">
                  Refresh
                </button>
              </div>
              {holders && holders.topHolders.length > 0 ? (
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Address</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holders.topHolders.slice(0, 10).map((h, i) => (
                      <tr key={h.address}>
                        <td className="dash-table-rank">{i + 1}</td>
                        <td className="dash-table-addr">{truncateAddress(h.address)}</td>
                        <td className="dash-table-amount">
                          {metadata ? formatAmount(h.amount, metadata.decimals) : h.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <span className="dash-table-empty">No holder data</span>
              )}
            </div>

            <div className="dash-actions-panel">
              <div className="dash-section-title">Actions</div>
              <div className="dash-actions-group">
                <button className="dash-btn dash-btn-green dash-btn-block" onClick={handleBuy}>
                  Buy on Pump.fun
                </button>
                <button className="dash-btn dash-btn-red dash-btn-block" onClick={handleSell}>
                  Sell on Pump.fun
                </button>
                <button className="dash-btn dash-btn-muted dash-btn-block" onClick={handleClaimFees}>
                  Claim Creator Fees
                </button>
              </div>
              {activeMint && (
                <div className="dash-mint-display">
                  <span className="dash-mint-label">Contract</span>
                  <span className="dash-mint-addr">{activeMint}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!activeMint && !isLoading && (
        <div className="dash-canvas-hint">Select a token from the dropdown above</div>
      )}
    </div>
  )
}
