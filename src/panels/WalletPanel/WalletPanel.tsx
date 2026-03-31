import { useCallback, useEffect, useState } from 'react'
import { useUIStore } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import { Toggle } from '../../components/Toggle'
import './WalletPanel.css'

export function WalletPanel() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const dashboard = useWalletStore((s) => s.dashboard)
  const showMarketTape = useWalletStore((s) => s.showMarketTape)
  const showTitlebarWallet = useWalletStore((s) => s.showTitlebarWallet)
  const loading = useWalletStore((s) => s.loading)
  const setStoreShowMarketTape = useWalletStore((s) => s.setShowMarketTape)
  const setStoreShowTitlebarWallet = useWalletStore((s) => s.setShowTitlebarWallet)
  const [showSettings, setShowSettings] = useState(false)
  const [walletName, setWalletName] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [heliusKey, setHeliusKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    await useWalletStore.getState().refresh(activeProjectId)
  }, [activeProjectId])

  useEffect(() => {
    void load()
  }, [load])

  // Fast-poll while wallet panel is visible, downgrades on unmount
  useEffect(() => {
    return useWalletStore.getState().subscribeFastPoll()
  }, [])

  const handleAddWallet = async () => {
    setError(null)
    if (!walletName.trim() || !walletAddress.trim()) return
    const res = await window.daemon.wallet.create({ name: walletName.trim(), address: walletAddress.trim() })
    if (res.ok) {
      setWalletName('')
      setWalletAddress('')
      await load()
      return
    }
    setError(res.error ?? 'Failed to add wallet')
  }

  const handleToggleTape = async (checked: boolean) => {
    await setStoreShowMarketTape(checked)
  }

  const handleToggleTitlebarWallet = async (checked: boolean) => {
    await setStoreShowTitlebarWallet(checked)
  }

  const handleSaveHelius = async () => {
    setError(null)
    if (!heliusKey.trim()) return
    const res = await window.daemon.wallet.storeHeliusKey(heliusKey.trim())
    if (res.ok) {
      setHeliusKey('')
      await load()
      return
    }
    setError(res.error ?? 'Failed to save Helius key')
  }

  const handleDeleteHelius = async () => {
    setError(null)
    const res = await window.daemon.wallet.deleteHeliusKey()
    if (res.ok) {
      await load()
      return
    }
    setError(res.error ?? 'Failed to delete Helius key')
  }

  if (!dashboard && loading) {
    return (
      <div className="wallet-panel">
        <div className="panel-header">Wallet</div>
        <div className="wallet-empty">Loading wallet data…</div>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="wallet-panel">
        <div className="panel-header">Wallet</div>
        <div className="wallet-empty">Wallet data unavailable</div>
      </div>
    )
  }

  return (
    <div className="wallet-panel">
      <div className="panel-header wallet-panel-header">
        <span>Wallet</span>
        <button className="wallet-icon-btn" onClick={() => setShowSettings((value) => !value)}>
          {showSettings ? 'Close' : 'Settings'}
        </button>
      </div>

      <section className="wallet-section">
        <div className="wallet-section-title">Portfolio</div>
        <div className="wallet-total">${formatUsd(dashboard.portfolio.totalUsd)}</div>
        <div className={`wallet-delta ${dashboard.portfolio.delta24hUsd >= 0 ? 'up' : 'down'}`}>
          {dashboard.portfolio.delta24hUsd >= 0 ? '+' : '-'}${formatUsd(Math.abs(dashboard.portfolio.delta24hUsd))} · {formatPct(dashboard.portfolio.delta24hPct)}
        </div>
        <div className="wallet-caption">{dashboard.portfolio.walletCount} wallet{dashboard.portfolio.walletCount !== 1 ? 's' : ''} tracked</div>
      </section>

      {showSettings && (
        <section className="wallet-section">
          <div className="wallet-section-title">Settings</div>
          {error && <div className="wallet-empty">{error}</div>}
          <div className="wallet-toggle-row">
            <div>
              <div className="wallet-label">Show Market Tape</div>
              <div className="wallet-caption">BTC, SOL, ETH in the bottom bar</div>
            </div>
            <Toggle checked={showMarketTape} onChange={handleToggleTape} />
          </div>
          <div className="wallet-toggle-row">
            <div>
              <div className="wallet-label">Show Titlebar Balance</div>
              <div className="wallet-caption">Display the portfolio balance in the titlebar</div>
            </div>
            <Toggle checked={showTitlebarWallet} onChange={handleToggleTitlebarWallet} />
          </div>
          <div className="wallet-settings-block">
            <div className="wallet-label">Helius API Key</div>
            <div className="wallet-caption">
              {dashboard.heliusConfigured ? 'A Helius key is currently stored for wallet data.' : 'Add a Helius key to enable balances, holdings, and portfolio refresh.'}
            </div>
            <input
              className="wallet-input"
              value={heliusKey}
              onChange={(e) => setHeliusKey(e.target.value)}
              placeholder={dashboard.heliusConfigured ? 'Replace Helius API key' : 'HELIUS_API_KEY'}
            />
            <div className="wallet-actions">
              <button className="wallet-btn primary" onClick={handleSaveHelius}>Save Key</button>
              {dashboard.heliusConfigured && (
                <button className="wallet-btn danger" onClick={handleDeleteHelius}>Delete Key</button>
              )}
            </div>
          </div>

          <div className="wallet-settings-block">
            <div className="wallet-label">Manage Wallets</div>
            <div className="wallet-form">
              <input className="wallet-input" value={walletName} onChange={(e) => setWalletName(e.target.value)} placeholder="Wallet name" />
              <input className="wallet-input" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="Solana address" />
              <button className="wallet-btn primary" onClick={handleAddWallet}>Add Wallet</button>
            </div>

            <div className="wallet-list">
              {dashboard.wallets.map((wallet) => (
                <div key={wallet.id} className="wallet-row">
                  <div className="wallet-row-main">
                    <div className="wallet-name">
                      {wallet.name}
                      {wallet.isDefault && <span className="wallet-badge">default</span>}
                    </div>
                    <div className="wallet-value">${formatUsd(wallet.totalUsd)}</div>
                  </div>
                  <div className="wallet-row-sub">
                    <span>{shortAddress(wallet.address)}</span>
                    <span>{wallet.tokenCount} assets</span>
                  </div>
                  <div className="wallet-actions">
                    {!wallet.isDefault && (
                      <button
                        className="wallet-btn"
                        onClick={async () => {
                          setError(null)
                          const res = await window.daemon.wallet.setDefault(wallet.id)
                          if (res.ok) await load()
                          else setError(res.error ?? 'Failed to set default wallet')
                        }}
                      >
                        Set Default
                      </button>
                    )}
                    {activeProjectId && (
                      <button
                        className="wallet-btn"
                        onClick={async () => {
                          setError(null)
                          const res = await window.daemon.wallet.assignProject(activeProjectId, wallet.id)
                          if (res.ok) await load()
                          else setError(res.error ?? 'Failed to assign wallet to project')
                        }}
                      >
                        Use For Project
                      </button>
                    )}
                    <button
                      className="wallet-btn danger"
                      onClick={async () => {
                        setError(null)
                        const res = await window.daemon.wallet.delete(wallet.id)
                        if (res.ok) await load()
                        else setError(res.error ?? 'Failed to remove wallet')
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {dashboard.wallets.length === 0 && <div className="wallet-empty">No wallets configured</div>}
            </div>
          </div>
        </section>
      )}

      {dashboard.feed.length > 0 && (
        <section className="wallet-section">
          <div className="wallet-section-title">Live Feed</div>
          {dashboard.feed.slice(0, 5).map((entry) => (
            <div key={entry.walletId} className="wallet-feed-row">
              <span className="wallet-feed-name">{entry.walletName}</span>
              <span className={`wallet-feed-delta ${entry.deltaUsd >= 0 ? 'up' : 'down'}`}>
                {entry.deltaUsd >= 0 ? '+' : '-'}${formatUsd(Math.abs(entry.deltaUsd))}
              </span>
            </div>
          ))}
        </section>
      )}

      {dashboard.activeWallet && (
        <section className="wallet-section">
          <div className="wallet-section-title">{dashboard.activeWallet.name}</div>
          <div className="wallet-holdings">
            {dashboard.activeWallet.holdings.map((holding) => (
              <div key={holding.mint} className="wallet-holding-row">
                <div>
                  <div className="wallet-label">{holding.symbol}</div>
                  <div className="wallet-caption">{holding.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                </div>
                <div className="wallet-holding-value">
                  <div>${formatUsd(holding.valueUsd)}</div>
                  <div className="wallet-caption">${formatUsd(holding.priceUsd)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {dashboard.recentActivity.length > 0 && (
        <section className="wallet-section">
          <div className="wallet-section-title">Recent Activity</div>
          {dashboard.recentActivity.slice(0, 6).map((event) => (
            <div key={event.signature} className="wallet-activity-row">
              <div className="wallet-label">{event.type ?? 'Transaction'}</div>
              <div className="wallet-caption">{event.description ?? shortSignature(event.signature)}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: value >= 1000 ? 0 : 2, maximumFractionDigits: 2 })
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '-'
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

function shortAddress(value: string): string {
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

function shortSignature(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-8)}`
}
