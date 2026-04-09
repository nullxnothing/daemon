import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import { useWorkflowShellStore } from '../../store/workflowShell'
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

type ImportPanelMode = 'none' | 'manual' | 'scan'

interface ScanResult {
  mint: string
  name: string
  symbol: string
  image: string | null
  selected: boolean
}

function ImportPanel({
  walletId,
  walletAddress,
  onImported,
  onClose,
}: {
  walletId: string
  walletAddress: string | null
  onImported: () => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<ImportPanelMode>('none')
  const [mintInput, setMintInput] = useState('')
  const [manualStatus, setManualStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [manualError, setManualError] = useState('')

  const [scanResults, setScanResults] = useState<ScanResult[]>([])
  const [scanStatus, setScanStatus] = useState<'idle' | 'loading' | 'importing' | 'error'>('idle')
  const [scanError, setScanError] = useState('')

  const handleManualImport = async () => {
    const mint = mintInput.trim()
    if (!mint) return
    setManualStatus('loading')
    setManualError('')
    try {
      const res = await window.daemon.dashboard.importToken(mint, walletId)
      if (!res.ok) {
        setManualStatus('error')
        setManualError(res.error ?? 'Import failed')
        return
      }
      setMintInput('')
      setManualStatus('idle')
      onImported()
    } catch (err) {
      setManualStatus('error')
      setManualError(err instanceof Error ? err.message : 'Import failed')
    }
  }

  const handleScan = async () => {
    if (!walletAddress) return
    setScanStatus('loading')
    setScanError('')
    setScanResults([])
    try {
      const res = await window.daemon.dashboard.detectTokens(walletAddress)
      if (!res.ok || !res.data) {
        setScanStatus('error')
        setScanError(res.error ?? 'Scan failed')
        return
      }
      setScanResults(res.data.map((t) => ({ ...t, selected: true })))
      setScanStatus('idle')
    } catch (err) {
      setScanStatus('error')
      setScanError(err instanceof Error ? err.message : 'Scan failed')
    }
  }

  const toggleSelect = (mint: string) => {
    setScanResults((prev) => prev.map((r) => r.mint === mint ? { ...r, selected: !r.selected } : r))
  }

  const handleImportSelected = async () => {
    const toImport = scanResults.filter((r) => r.selected)
    if (toImport.length === 0) return
    setScanStatus('importing')
    try {
      for (const token of toImport) {
        await window.daemon.dashboard.importToken(token.mint, walletId)
      }
      setScanResults([])
      setScanStatus('idle')
      onImported()
    } catch (err) {
      setScanStatus('error')
      setScanError(err instanceof Error ? err.message : 'Import failed')
    }
  }

  return (
    <div className="dash-import-panel">
      <div className="dash-import-panel-header">
        <span className="dash-import-panel-title">Import Token</span>
        <button className="dash-import-close-btn" onClick={onClose}>x</button>
      </div>

      <div className="dash-import-mode-tabs">
        <button
          className={`dash-import-tab ${mode === 'manual' ? 'active' : ''}`}
          onClick={() => setMode('manual')}
        >
          By Mint Address
        </button>
        {walletAddress && (
          <button
            className={`dash-import-tab ${mode === 'scan' ? 'active' : ''}`}
            onClick={() => { setMode('scan'); if (scanResults.length === 0 && scanStatus === 'idle') handleScan() }}
          >
            Scan Wallet
          </button>
        )}
      </div>

      {mode === 'manual' && (
        <div className="dash-import-manual">
          <input
            className="dash-import-input"
            placeholder="Paste mint address..."
            value={mintInput}
            onChange={(e) => setMintInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleManualImport() }}
            disabled={manualStatus === 'loading'}
          />
          <button
            className="dash-btn dash-btn-primary"
            onClick={handleManualImport}
            disabled={manualStatus === 'loading' || !mintInput.trim()}
          >
            {manualStatus === 'loading' ? 'Importing...' : 'Import'}
          </button>
          {manualStatus === 'error' && (
            <span className="dash-import-error">{manualError}</span>
          )}
        </div>
      )}

      {mode === 'scan' && (
        <div className="dash-import-scan">
          {scanStatus === 'loading' && (
            <div className="dash-import-scanning">Scanning wallet for created tokens...</div>
          )}
          {scanStatus === 'error' && (
            <div className="dash-import-error">{scanError}</div>
          )}
          {scanStatus !== 'loading' && scanResults.length === 0 && scanStatus !== 'error' && (
            <div className="dash-import-scanning">
              No tokens found where this wallet has authority.
              <button className="dash-btn dash-btn-muted" onClick={handleScan} style={{ marginTop: 8 }}>
                Re-scan
              </button>
            </div>
          )}
          {scanResults.length > 0 && (
            <>
              <div className="dash-scan-results">
                {scanResults.map((t) => (
                  <label key={t.mint} className="dash-scan-row">
                    <input
                      type="checkbox"
                      checked={t.selected}
                      onChange={() => toggleSelect(t.mint)}
                    />
                    {t.image && (
                      <img className="dash-scan-img" src={t.image} alt={t.symbol} />
                    )}
                    <span className="dash-scan-name">{t.symbol} — {t.name}</span>
                    <span className="dash-scan-mint">{truncateAddress(t.mint, 4)}</span>
                  </label>
                ))}
              </div>
              <div className="dash-scan-actions">
                <button
                  className="dash-btn dash-btn-primary"
                  onClick={handleImportSelected}
                  disabled={scanStatus === 'importing' || !scanResults.some((r) => r.selected)}
                >
                  {scanStatus === 'importing' ? 'Importing...' : `Import ${scanResults.filter((r) => r.selected).length} Selected`}
                </button>
                <button className="dash-btn dash-btn-muted" onClick={handleScan} disabled={scanStatus === 'importing'}>
                  Re-scan
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function DashboardCanvas() {
  const activeMint = useUIStore((s) => s.activeDashboardMint)
  const setActiveMint = useUIStore((s) => s.setActiveDashboardMint)
  const openTokenLaunch = useCallback(() => {
    useWorkflowShellStore.getState().setDrawerTool('token-launch')
  }, [])

  const dashboard = useWalletStore((s) => s.dashboard)
  const defaultWallet = dashboard?.wallets?.find((w) => w.isDefault) ?? null
  const activeWalletId = defaultWallet?.id ?? null
  const activeWalletAddress = defaultWallet?.address ?? null

  const { tokens, reload } = useTokenList()
  const { price, priceChange, priceHistory, metadata, holders, isLoading, error, refetchHolders } = useDashboardData(activeMint)

  const [showImport, setShowImport] = useState(false)

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
    if (!activeWalletId) return
    window.daemon.pumpfun.collectFees(activeWalletId).catch(() => {})
  }

  const handleImported = () => {
    setShowImport(false)
    reload()
  }

  if (tokens.length === 0 && !showImport) {
    return (
      <div className="dash-canvas">
        <div className="dash-canvas-empty">
          <span className="dash-canvas-empty-title">No tokens launched</span>
          <span className="dash-canvas-empty-sub">Launch your first token to see live data here</span>
          <button className="dash-btn dash-btn-primary dash-btn-lg" onClick={openTokenLaunch}>
            Open Token Launch
          </button>
          {activeWalletId && (
            <button className="dash-btn dash-btn-outline-full" onClick={() => setShowImport(true)}>
              Import Existing Token
            </button>
          )}
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
          {activeWalletId && (
            <button
              className="dash-btn dash-btn-muted"
              onClick={() => setShowImport((v) => !v)}
            >
              {showImport ? 'Cancel' : 'Import Token'}
            </button>
          )}
          <button className="dash-btn dash-btn-primary" onClick={openTokenLaunch}>
            Open Token Launch
          </button>
        </div>
      </div>

      {showImport && activeWalletId && (
        <ImportPanel
          walletId={activeWalletId}
          walletAddress={activeWalletAddress}
          onImported={handleImported}
          onClose={() => setShowImport(false)}
        />
      )}

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

      {!activeMint && !isLoading && !showImport && (
        <div className="dash-canvas-hint">Select a token from the dropdown above</div>
      )}
    </div>
  )
}
