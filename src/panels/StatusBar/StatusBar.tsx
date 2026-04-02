import { useState, useEffect, memo } from 'react'
import { useUIStore } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import { useEmailStore } from '../../store/email'
import { formatCompactUsd } from '../../utils/format'
import styles from './StatusBar.module.css'

const EMPTY_MARKET: MarketTickerEntry[] = []

export const StatusBar = memo(function StatusBar() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)

  const handleCopyPath = () => {
    if (activeProjectPath) {
      navigator.clipboard.writeText(activeProjectPath).catch(() => {})
    }
  }

  return (
    <div className={styles.statusbar} data-tour="statusbar">
      <div className={styles.left}>
        <div className={styles.statusGroup}>
          <span className={styles.item}>DAEMON</span>
        </div>
        <div className={styles.statusGroup}>
          <GitBranch />
          <TerminalCount />
        </div>
      </div>
      <div className={styles.center}>
        <MarketTape />
      </div>
      <div className={styles.right}>
        <div className={styles.statusGroup}>
          <EmailIndicator />
          <ClaudeStatus />
        </div>
        {activeProjectPath && (
          <div className={styles.statusGroup}>
            <span
              className={`${styles.item} ${styles.path} ${styles.clickable}`}
              onClick={handleCopyPath}
              title="Copy path to clipboard"
            >
              {activeProjectPath}
            </span>
          </div>
        )}
      </div>
    </div>
  )
})

function TerminalCount() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const count = useUIStore((s) => s.terminals.filter((t) => t.projectId === activeProjectId).length)

  const handleClick = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', ctrlKey: true, bubbles: true }))
  }

  return (
    <span
      className={`${styles.item} ${styles.clickable}`}
      onClick={handleClick}
      title="Toggle terminal"
    >
      {count} terminal{count !== 1 ? 's' : ''}
    </span>
  )
}

function GitBranch() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const [branch, setBranch] = useState<string | null>(null)

  useEffect(() => {
    if (!activeProjectPath) { setBranch(null); return }
    window.daemon.git.branch(activeProjectPath).then((res) => {
      setBranch(res.ok ? res.data as string : null)
    })
  }, [activeProjectPath])

  if (!branch) return null
  return (
    <span
      className={`${styles.item} ${styles.branch} ${styles.clickable}`}
      onClick={() => setActivePanel('git')}
      title="Open Git panel"
    >
      {branch}
    </span>
  )
}

function EmailIndicator() {
  const unreadTotal = useEmailStore((s) => s.unreadTotal)
  const setActivePanel = useUIStore((s) => s.setActivePanel)

  if (unreadTotal <= 0) return null

  return (
    <button
      className={styles.emailBtn}
      onClick={() => setActivePanel('email')}
      title={`${unreadTotal} unread email${unreadTotal !== 1 ? 's' : ''}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <polyline points="22,4 12,13 2,4" />
      </svg>
      <span className={styles.emailBadge}>
        {unreadTotal > 999 ? `${Math.floor(unreadTotal / 1000)}k+` : unreadTotal}
      </span>
    </button>
  )
}

function ClaudeStatus() {
  const [authMode, setAuthMode] = useState<string | null>(null)

  useEffect(() => {
    const check = () => {
      window.daemon.claude.getConnection().then((res) => {
        setAuthMode(res.ok && res.data ? res.data.authMode : 'none')
      })
    }
    check()
    const interval = setInterval(check, 300_000) // re-check every 5 min
    return () => clearInterval(interval)
  }, [])

  const isConnected = authMode === 'cli' || authMode === 'both' || authMode === 'api'
  const dotColor = isConnected ? 'var(--green)' : 'var(--red)'
  const label = isConnected ? 'Claude connected' : 'Claude disconnected'

  return (
    <span
      className={styles.item}
      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
      onClick={() => { if (!isConnected) { import('../../store/onboarding').then((m) => m.useOnboardingStore.getState().openWizard()) } }}
      title={label}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <span style={{ fontSize: 10 }}>Claude</span>
    </span>
  )
}

function MarketTape() {
  const visible = useWalletStore((s) => s.showMarketTape)
  const dashboard = useWalletStore((s) => s.dashboard)
  const items = dashboard?.market ?? EMPTY_MARKET

  if (!visible || items.length === 0 || items.every((i) => i.priceUsd === 0)) return null

  return (
    <div className={styles.marketTape}>
      {items.map((item) => {
        const isSignificant = Math.abs(item.change24hPct) >= 5
        const direction = item.change24hPct >= 0 ? 'up' : 'down'
        const changeClass = isSignificant
          ? (direction === 'up' ? styles.upSignificant : styles.downSignificant)
          : (direction === 'up' ? styles.up : styles.down)
        return (
          <span key={item.symbol} className={styles.marketTapeItem}>
            <span className={styles.marketSymbol}>{item.symbol}</span>
            <span className={styles.marketPrice}>${formatCompactUsd(item.priceUsd)}</span>
            <span className={`${styles.marketChange} ${changeClass}`}>
              {item.change24hPct >= 0 ? '+' : '-'}{Math.abs(item.change24hPct).toFixed(2)}%
            </span>
          </span>
        )
      })}
    </div>
  )
}
