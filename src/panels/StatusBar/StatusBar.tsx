import { useState, useEffect, useRef, memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useUIStore } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import { useEmailStore } from '../../store/email'
import { useOnboardingStore } from '../../store/onboarding'
import { useSolanaToolboxStore } from '../../store/solanaToolbox'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { useShellLayout } from '../../hooks/useShellLayout'
import { daemon } from '../../lib/daemonBridge'
import { formatCompactUsd } from '../../utils/format'
import { EmailQuickView } from '../../components/QuickView/EmailQuickView'
import { BugReportModal } from '../../components/BugReportModal/BugReportModal'
import styles from './StatusBar.module.css'

const EMPTY_MARKET: MarketTickerEntry[] = []

export const StatusBar = memo(function StatusBar() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const { tier, isDesktop, isCompact, isTablet, isSmall } = useShellLayout()

  const handleCopyPath = () => {
    if (activeProjectPath) {
      navigator.clipboard.writeText(activeProjectPath).catch(() => {})
    }
  }

  const showCenterTape = isDesktop
  const showPath = isDesktop
  const showHackathon = isDesktop || isCompact
  const showReportLabel = isDesktop || isCompact
  const statusbarClassName = [
    styles.statusbar,
    isDesktop ? styles.desktop : '',
    isCompact ? styles.compact : '',
    isTablet ? styles.tablet : '',
    isSmall ? styles.small : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={statusbarClassName} data-tour="statusbar">
      <div className={styles.left}>
        <div className={styles.statusGroup}>
          <span className={styles.item}>DAEMON</span>
        </div>
        <div className={styles.statusGroup}>
          <GitBranch />
          {showHackathon && <HackathonCountdown />}
          <TerminalCount />
          <ValidatorStatus />
        </div>
      </div>

      {showCenterTape && (
        <div className={styles.center}>
          <MarketTape maxItems={4} />
        </div>
      )}

      {!showCenterTape && (isCompact || isTablet) && (
        <div className={styles.inlineMarket}>
          <MarketTape maxItems={isCompact ? 2 : 0} />
        </div>
      )}

      <div className={styles.right}>
        <div className={styles.statusGroup}>
          <BugReportButton showLabel={showReportLabel} />
          <EmailIndicator />
          <ClaudeStatus />
        </div>
        {showPath && activeProjectPath && (
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
        <PanelToggles />
      </div>
    </div>
  )
})

function TerminalCount() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const count = useUIStore((s) =>
    s.terminals.reduce((n, t) => n + (t.projectId === activeProjectId ? 1 : 0), 0)
  )

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

function ValidatorStatus() {
  const validator = useSolanaToolboxStore((s) => s.validator)
  const setDrawerTool = useWorkflowShellStore((s) => s.setDrawerTool)

  if (validator.status === 'stopped') return null

  const color = validator.status === 'running' ? 'var(--green)' : validator.status === 'starting' ? 'var(--amber)' : 'var(--red)'
  const label = validator.type === 'surfpool' ? 'Surfpool' : 'Validator'
  const port = validator.port ? ` :${validator.port}` : ''

  return (
    <span
      className={`${styles.item} ${styles.clickable}`}
      onClick={() => setDrawerTool('solana-toolbox')}
      title="Open Solana Toolbox"
    >
      <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: color, marginRight: 4 }} />
      {label}{port}
    </span>
  )
}

function GitBranch() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const setDrawerTool = useWorkflowShellStore((s) => s.setDrawerTool)
  const [branch, setBranch] = useState<string | null>(null)

  useEffect(() => {
    if (!activeProjectPath) { setBranch(null); return }
    daemon.git.branch(activeProjectPath).then((res) => {
      setBranch(res.ok ? res.data as string : null)
    })
  }, [activeProjectPath])

  if (!branch) return null
  return (
    <span
      className={`${styles.item} ${styles.branch} ${styles.clickable}`}
      onClick={() => setDrawerTool('git')}
      title="Open Git panel"
    >
      {branch}
    </span>
  )
}

function BugReportButton({ showLabel }: { showLabel: boolean }) {
  const [open, setOpen] = useState(false)
  const drawerTool = useWorkflowShellStore((s) => s.drawerTool)

  return (
    <>
      <button
        type="button"
        className={`${styles.item} ${styles.clickable} ${styles.bugButton}`}
        onClick={() => setOpen(true)}
        title="Report a bug"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2v4M8 6h8l-1 4H9l-1-4z" />
          <path d="M7 10c0 4 2 8 5 8s5-4 5-8" />
          <path d="M4 14h3M17 14h3M5 18h2M17 18h2" />
        </svg>
        {showLabel && <span className={styles.bugLabel}>Report</span>}
      </button>
      <BugReportModal
        open={open}
        onClose={() => setOpen(false)}
        activePanel={drawerTool ?? undefined}
      />
    </>
  )
}

function EmailIndicator() {
  const unreadTotal = useEmailStore((s) => s.unreadTotal)
  const emailQuickViewOpen = useUIStore((s) => s.emailQuickViewOpen)
  const toggleEmailQuickView = useUIStore((s) => s.toggleEmailQuickView)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={triggerRef}
        className={styles.emailBtn}
        onClick={toggleEmailQuickView}
        title={unreadTotal > 0 ? `${unreadTotal} unread email${unreadTotal !== 1 ? 's' : ''}` : 'Email'}
        aria-haspopup="dialog"
        aria-expanded={emailQuickViewOpen}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <polyline points="22,4 12,13 2,4" />
        </svg>
        {unreadTotal > 0 && (
          <span className={styles.emailBadge}>
            {unreadTotal > 999 ? `${Math.floor(unreadTotal / 1000)}k+` : unreadTotal}
          </span>
        )}
      </button>
      {emailQuickViewOpen && <EmailQuickView triggerRef={triggerRef} />}
    </>
  )
}

function ClaudeStatus() {
  const [authMode, setAuthMode] = useState<string | null>(null)
  const { isSmall } = useShellLayout()

  useEffect(() => {
    const check = () => {
      daemon.claude.getConnection().then((res) => {
        setAuthMode(res.ok && res.data ? res.data.authMode : 'none')
      })
    }
    check()
    const interval = setInterval(check, 300_000)
    return () => clearInterval(interval)
  }, [])

  const isConnected = authMode === 'cli' || authMode === 'both' || authMode === 'api'
  const dotColor = isConnected ? 'var(--green)' : 'var(--red)'
  const label = isConnected ? 'Claude connected' : 'Claude disconnected'

  return (
    <span
      className={styles.item}
      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
      onClick={() => { if (!isConnected) { useOnboardingStore.getState().openWizard() } }}
      title={label}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      {!isSmall && <span style={{ fontSize: 10 }}>Claude</span>}
    </span>
  )
}

function HackathonCountdown() {
  const setDrawerTool = useWorkflowShellStore((s) => s.setDrawerTool)
  const [label, setLabel] = useState<string | null>(null)
  const [urgency, setUrgency] = useState<'normal' | 'warning' | 'urgent'>('normal')

  useEffect(() => {
    const DEADLINE_KEY = 'daemon:hackathon-deadline'

    const tick = () => {
      const raw = localStorage.getItem(DEADLINE_KEY)
      if (!raw) { setLabel(null); return }
      const dl = Number(raw)
      if (isNaN(dl)) { setLabel(null); return }

      const ms = dl - Date.now()
      if (ms <= 0) {
        setLabel('Deadline passed')
        setUrgency('urgent')
        return
      }

      const days = Math.floor(ms / 86_400_000)
      const hours = Math.floor((ms % 86_400_000) / 3_600_000)
      setLabel(`Frontier: ${days}d ${hours}h`)
      setUrgency(ms < 86_400_000 ? 'urgent' : ms < 604_800_000 ? 'warning' : 'normal')
    }

    tick()
    const interval = setInterval(tick, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (!label) return null

  const colorClass = urgency === 'urgent' ? styles.hackathonUrgent
    : urgency === 'warning' ? styles.hackathonWarning
    : styles.hackathonNormal

  return (
    <button
      className={`${styles.hackathonBtn} ${colorClass}`}
      onClick={() => setDrawerTool('hackathon')}
      title="Hackathon deadline"
    >
      {label}
    </button>
  )
}

function PanelToggles() {
  const dispatchKey = (key: string, ctrl = true, shift = false) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: ctrl, shiftKey: shift, bubbles: true }))
  }

  return (
    <div className={styles.panelToggles}>
      <button
        className={styles.panelToggle}
        onClick={() => dispatchKey('e')}
        title="Toggle Sidebar (Ctrl+E)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      </button>
      <button
        className={styles.panelToggle}
        onClick={() => dispatchKey('`')}
        title="Toggle Terminal (Ctrl+`)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="15" x2="21" y2="15" />
        </svg>
      </button>
      <button
        className={styles.panelToggle}
        onClick={() => dispatchKey('b')}
        title="Toggle Right Panel (Ctrl+B)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      </button>
    </div>
  )
}

function MarketTape({ maxItems }: { maxItems: number }) {
  const visible = useWalletStore((s) => s.showMarketTape)
  const items = useWalletStore(useShallow((s) => s.dashboard?.market ?? EMPTY_MARKET))

  if (!visible || maxItems <= 0 || items.length === 0 || items.every((i) => i.priceUsd === 0)) return null

  return (
    <div className={styles.marketTape}>
      {items.slice(0, maxItems).map((item) => {
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
