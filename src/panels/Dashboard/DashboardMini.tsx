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

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`
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

export function DashboardMini() {
  const activeMint = useUIStore((s) => s.activeDashboardMint)
  const setActiveMint = useUIStore((s) => s.setActiveDashboardMint)
  const openLaunchWizard = useUIStore((s) => s.openLaunchWizard)

  const tokens = useTokenList()
  const { price, priceChange, priceHistory, metadata, holders, isLoading } = useDashboardData(activeMint)

  const isPositive = priceChange !== null ? priceChange >= 0 : null

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
      <div className="dash-mini">
        <div className="dash-mini-empty">
          <span className="dash-mini-empty-label">No tokens launched yet</span>
          <button className="dash-btn dash-btn-primary" onClick={openLaunchWizard}>
            Launch Token
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dash-mini">
      <div className="dash-mini-header">
        <select
          className="dash-select"
          value={activeMint ?? ''}
          onChange={(e) => setActiveMint(e.target.value || null)}
        >
          <option value="">Select token</option>
          {tokens.map((t) => (
            <option key={t.mint} value={t.mint}>
              {t.symbol} — {truncateAddress(t.mint)}
            </option>
          ))}
        </select>
      </div>

      {!activeMint ? (
        <div className="dash-mini-hint">Select a token to monitor</div>
      ) : isLoading && !price ? (
        <div className="dash-mini-hint">Loading...</div>
      ) : (
        <>
          <div className="dash-mini-price-row">
            <span className="dash-price-label">
              {metadata ? metadata.symbol : truncateAddress(activeMint)}
            </span>
            <div className="dash-price-values">
              <span className="dash-price-main">
                {price !== null ? `$${formatPrice(price)}` : '—'}
              </span>
              {isPositive !== null && priceChange !== null && (
                <span className={`dash-price-change ${isPositive ? 'positive' : 'negative'}`}>
                  {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
                </span>
              )}
            </div>
          </div>

          <div className="dash-mini-chart">
            <Sparkline
              points={priceHistory}
              width={230}
              height={48}
              color={isPositive === false ? 'var(--red)' : 'var(--green)'}
            />
          </div>

          <div className="dash-mini-metrics">
            <div className="dash-metric-cell">
              <span className="dash-metric-label">Holders</span>
              <span className="dash-metric-value">
                {holders ? holders.count.toLocaleString() : '—'}
              </span>
            </div>
            <div className="dash-metric-cell">
              <span className="dash-metric-label">Mkt Cap</span>
              <span className="dash-metric-value">
                {price !== null && metadata
                  ? formatMarketCap(price, metadata.supply, metadata.decimals)
                  : '—'}
              </span>
            </div>
          </div>

          <div className="dash-mini-actions">
            <button className="dash-btn dash-btn-green" onClick={handleBuy}>Buy</button>
            <button className="dash-btn dash-btn-red" onClick={handleSell}>Sell</button>
            <button className="dash-btn dash-btn-muted" onClick={handleClaimFees}>Fees</button>
          </div>
        </>
      )}

      <div className="dash-mini-footer">
        <button className="dash-btn dash-btn-outline-full" onClick={openLaunchWizard}>
          + Launch New Token
        </button>
      </div>
    </div>
  )
}
