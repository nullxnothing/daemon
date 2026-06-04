import { useState, useEffect, useRef, memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useUIStore } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import { useEmailStore } from '../../store/email'
import { useOnboardingStore } from '../../store/onboarding'
import { useSolanaToolboxStore } from '../../store/solanaToolbox'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { useAppActions } from '../../store/appActions'
import { useClipboard } from '../../hooks/useClipboard'
import { LiveRegion } from '../../components/LiveRegion'
import { useShellLayout } from '../../hooks/useShellLayout'
import { daemon } from '../../lib/daemonBridge'
import { formatCompactUsd } from '../../utils/format'
import { EmailQuickView } from '../../components/QuickView/EmailQuickView'
import { BugReportModal } from '../../components/BugReportModal/BugReportModal'
import { StatusDot } from '../../components/Panel'
import { getClusterDisplayName, getExecutionModeDisplayName } from '../WalletPanel/walletCopy'
import { middleEllipsisPath } from '../../utils/textDisplay'
import styles from './StatusBar.module.css'

const EMPTY_MARKET: MarketTickerEntry[] = []

export const StatusBar = memo(function StatusBar() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const { tier, isDesktop, isCompact, isTablet, isSmall } = useShellLayout()
  const { copied: pathCopied, copy: copyPath } = useClipboard()

  const handleCopyPath = () => {
    if (activeProjectPath) void copyPath(activeProjectPath)
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
          <WalletRuntimeStatus />
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
            <button
              type="button"
              className={`${styles.item} ${styles.path} ${styles.clickable} ${styles.linkButton}`}
              onClick={handleCopyPath}
              title={pathCopied ? 'Copied to clipboard' : 'Copy path to clipboard'}
              aria-label={pathCopied ? 'Project path copied' : `Copy project path ${activeProjectPath}`}
            >
              {pathCopied ? 'Copied' : middleEllipsisPath(activeProjectPath)}
            </button>
            <LiveRegion message={pathCopied ? 'Project path copied to clipboard' : ''} />
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
  const focusTerminal = useAppActions((s) => s.focusTerminal)

  return (
    <button
      type="button"
      className={`${styles.item} ${styles.clickable} ${styles.linkButton}`}
      onClick={focusTerminal}
      title="Toggle terminal"
      aria-label={`Toggle terminal (${count} active)`}
    >
      {count} terminal{count !== 1 ? 's' : ''}
    </button>
  )
}

function ValidatorStatus() {
  const validator = useSolanaToolboxStore((s) => s.validator)

  if (validator.status === 'stopped') return null

  const tone = validator.status === 'running' ? 'success' : validator.status === 'starting' ? 'warning' : 'danger'
  const label = validator.type === 'surfpool' ? 'Surfpool' : 'Validator'
  const port = validator.port ? ` :${validator.port}` : ''

  return (
    <>
      <button
        type="button"
        className={`${styles.item} ${styles.clickable} ${styles.linkButton}`}
        onClick={() => useUIStore.getState().openWorkspaceTool('solana-toolbox')}
        title="Open Solana Workflow"
        aria-label={`${label} ${validator.status}${port}. Open Solana Workflow`}
      >
        <StatusDot tone={tone} className={styles.inlineDot} />
        {label}{port}
      </button>
      <LiveRegion message={`${label} ${validator.status}`} />
    </>
  )
}

function WalletRuntimeStatus() {
  const dashboard = useWalletStore((s) => s.dashboard)
  const activeWallet = dashboard?.activeWallet ?? null
  const dashboardLoaded = Boolean(dashboard)
  const [infrastructure, setInfrastructure] = useState<WalletInfrastructureSettings | null>(null)
  const [signerReady, setSignerReady] = useState<boolean | null>(null)
  const { isSmall } = useShellLayout()

  useEffect(() => {
    let cancelled = false
    const loadInfrastructure = () => {
      daemon.settings.getWalletInfrastructureSettings()
        .then((res) => {
          if (!cancelled && res.ok && res.data) setInfrastructure(res.data)
        })
        .catch(() => {})
    }

    loadInfrastructure()
    window.addEventListener('focus', loadInfrastructure)
    return () => {
      cancelled = true
      window.removeEventListener('focus', loadInfrastructure)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setSignerReady(null)

    if (!activeWallet?.id) return

    daemon.wallet.hasKeypair(activeWallet.id)
      .then((res) => {
        if (!cancelled) setSignerReady(res.ok && res.data === true)
      })
      .catch(() => {
        if (!cancelled) setSignerReady(null)
      })

    return () => {
      cancelled = true
    }
  }, [activeWallet?.id])

  const rpcReady = infrastructure ? getStatusBarRpcReady(infrastructure, Boolean(dashboard?.heliusConfigured)) : Boolean(dashboard?.heliusConfigured)
  const clusterLabel = getClusterDisplayName(infrastructure?.cluster ?? 'devnet')
  const executionLabel = getExecutionModeDisplayName(infrastructure?.executionMode)
  const walletLabel = !dashboardLoaded
    ? 'Wallet not loaded'
    : activeWallet
    ? signerReady === true
      ? 'Signer ready'
      : signerReady === false
        ? 'Watch-only'
        : 'Checking signer'
    : 'No wallet'
  const statusClass = !dashboardLoaded || !activeWallet
    ? styles.walletRuntimeMuted
    : rpcReady && signerReady === true
      ? styles.walletRuntimeLive
      : styles.walletRuntimeWarning
  const title = !dashboardLoaded
    ? `Wallet runtime: ${clusterLabel}. Open Wallet to load wallet status.`
    : activeWallet
    ? `Wallet runtime: ${activeWallet.name} on ${clusterLabel}. ${walletLabel}. RPC ${rpcReady ? 'ready' : 'needs setup'}. Execution: ${executionLabel}.`
    : `Wallet runtime: ${clusterLabel}. No active wallet selected.`

  return (
    <button
      type="button"
      className={`${styles.item} ${styles.clickable} ${styles.linkButton} ${styles.walletRuntime} ${statusClass}`}
      onClick={() => useUIStore.getState().openWorkspaceTool('wallet')}
      title={title}
      aria-label={title}
    >
      <StatusDot
        tone={!dashboardLoaded || !activeWallet ? 'neutral' : rpcReady && signerReady === true ? 'success' : 'warning'}
        label={title}
        className={styles.inlineDot}
      />
      {!isSmall && (
        <span className={styles.walletRuntimeText}>
          {clusterLabel} · {walletLabel}
        </span>
      )}
    </button>
  )
}

function getStatusBarRpcReady(settings: WalletInfrastructureSettings, heliusConfigured: boolean): boolean {
  if (settings.rpcProvider === 'helius') return heliusConfigured
  if (settings.rpcProvider === 'quicknode') return settings.quicknodeRpcUrl.trim().length > 0
  if (settings.rpcProvider === 'custom') return settings.customRpcUrl.trim().length > 0
  return true
}

function GitBranch() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const [branch, setBranch] = useState<string | null>(null)

  useEffect(() => {
    if (!activeProjectPath) { setBranch(null); return }
    daemon.git.branch(activeProjectPath).then((res) => {
      setBranch(res.ok ? res.data as string : null)
    })
  }, [activeProjectPath])

  if (!branch) return null
  return (
    <button
      type="button"
      className={`${styles.item} ${styles.branch} ${styles.clickable} ${styles.linkButton}`}
      onClick={() => useUIStore.getState().openWorkspaceTool('git')}
      title="Open Git panel"
      aria-label={`Git branch ${branch}. Open Git panel`}
    >
      {branch}
    </button>
  )
}

function BugReportButton({ showLabel }: { showLabel: boolean }) {
  const [open, setOpen] = useState(false)
  const drawerTool = useWorkflowShellStore((s) => s.drawerTool)
  const activeWorkspaceToolId = useUIStore((s) => s.activeWorkspaceToolId)

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
        activePanel={activeWorkspaceToolId ?? drawerTool ?? undefined}
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
  const label = isConnected ? 'Claude connected' : 'Claude disconnected'

  return (
    <button
      type="button"
      className={`${styles.item} ${styles.linkButton} ${styles.claudeStatus}`}
      onClick={() => { if (!isConnected) { useOnboardingStore.getState().openWizard() } }}
      title={label}
      aria-label={label}
    >
      <StatusDot tone={isConnected ? 'success' : 'danger'} label={label} className={styles.inlineDot} />
      {!isSmall && <span className={styles.claudeLabel}>Claude</span>}
    </button>
  )
}

function HackathonCountdown() {
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
      onClick={() => useUIStore.getState().openWorkspaceTool('hackathon')}
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
