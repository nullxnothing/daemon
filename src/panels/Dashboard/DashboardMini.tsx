import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
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

function useTokenList() {
  const [tokens, setTokens] = useState<TokenOption[]>([])

  const reload = useCallback(() => {
    window.daemon.launch.listTokens().then((res) => {
      if (res.ok && res.data) {
        setTokens(res.data.map((t) => ({ mint: t.mint, name: t.name, symbol: t.symbol })))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => { reload() }, [reload])

  return { tokens, reload }
}

function ExpandIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}

function ImportMintForm({ walletId, onImported }: { walletId: string; onImported: () => void }) {
  const [mintInput, setMintInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleImport = async () => {
    const mint = mintInput.trim()
    if (!mint) return
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await window.daemon.dashboard.importToken(mint, walletId)
      if (!res.ok) {
        setStatus('error')
        setErrorMsg(res.error ?? 'Import failed')
        return
      }
      setMintInput('')
      setStatus('idle')
      onImported()
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Import failed')
    }
  }

  return (
    <div className="dash-import-form">
      <input
        className="dash-import-input"
        placeholder="Paste mint address..."
        value={mintInput}
        onChange={(e) => setMintInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleImport() }}
        disabled={status === 'loading'}
      />
      <button
        className="dash-btn dash-btn-primary"
        onClick={handleImport}
        disabled={status === 'loading' || !mintInput.trim()}
      >
        {status === 'loading' ? '...' : 'Import'}
      </button>
      {status === 'error' && (
        <span className="dash-import-error">{errorMsg}</span>
      )}
    </div>
  )
}

export function DashboardMini() {
  const activeMint = useUIStore((s) => s.activeDashboardMint)
  const setActiveMint = useUIStore((s) => s.setActiveDashboardMint)
  const openLaunchWizard = useUIStore((s) => s.openLaunchWizard)
  const toggleDashboardTab = useUIStore((s) => s.toggleDashboardTab)

  const dashboard = useWalletStore((s) => s.dashboard)
  const activeWalletId = dashboard?.wallets?.find((w) => w.isDefault)?.id ?? null

  const { tokens, reload } = useTokenList()
  const { price, priceChange, priceHistory, metadata, holders, isLoading } = useDashboardData(activeMint)

  const [showImport, setShowImport] = useState(false)

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

  const handleImported = () => {
    setShowImport(false)
    reload()
  }

  if (tokens.length === 0) {
    return (
      <div className="dash-mini">
        <div className="dash-mini-toolbar">
          <button className="dash-mini-expand-btn" onClick={toggleDashboardTab} title="Expand dashboard (Ctrl+Shift+D)">
            <ExpandIcon size={12} />
          </button>
        </div>
        <div className="dash-mini-empty">
          <span className="dash-mini-empty-label">No tokens launched yet</span>
          <button className="dash-btn dash-btn-primary" onClick={openLaunchWizard}>
            Launch Token
          </button>
          {activeWalletId && !showImport && (
            <button className="dash-btn dash-btn-outline-full" onClick={() => setShowImport(true)}>
              Import Token
            </button>
          )}
          {showImport && activeWalletId && (
            <ImportMintForm walletId={activeWalletId} onImported={handleImported} />
          )}
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
        <button className="dash-mini-expand-btn" onClick={toggleDashboardTab} title="Expand dashboard (Ctrl+Shift+D)">
          <ExpandIcon size={12} />
        </button>
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
        {activeWalletId && (
          <button
            className="dash-btn dash-btn-outline-full"
            onClick={() => setShowImport((v) => !v)}
          >
            {showImport ? 'Cancel Import' : 'Import Token'}
          </button>
        )}
      </div>

      {showImport && activeWalletId && (
        <div className="dash-mini-import-section">
          <ImportMintForm walletId={activeWalletId} onImported={handleImported} />
        </div>
      )}
    </div>
  )
}
