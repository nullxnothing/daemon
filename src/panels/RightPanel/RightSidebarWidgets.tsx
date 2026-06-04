import { useEffect, useMemo, useState } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useUIStore } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import type { WalletDashboard } from '../../types/daemon'
import { compactPathLabel } from '../../utils/textDisplay'
import { RightRailSection } from './RightRailSection'
import { ClawpumpGlyph } from '../../lib/ClawpumpGlyph'
import { SolanaReadinessSidebarWidget, TokenWatchSidebarWidget } from './SolanaSidebarWidgets'
import {
  readRightSidebarWidgetConfig,
  RIGHT_SIDEBAR_WIDGET_EVENT,
  type RightSidebarWidgetConfig,
} from './sidebarAgentWidgetConfig'

const EMPTY_WALLETS: WalletDashboard['wallets'] = []

function money(value: number) {
  if (!Number.isFinite(value)) return '--'
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

function receiptAmount(receipt: MeterflowReceipt): number {
  const value = receipt.amountUsd ?? receipt.amountUSDC ?? receipt.amount_usd
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/^\$/, '').trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function isSettledMeterflowReceipt(receipt: MeterflowReceipt): boolean {
  const status = String(receipt.paymentState ?? receipt.status ?? '').toLowerCase()
  return status.includes('settled') || status.includes('verified') || status.includes('success') || status.includes('paid')
}

function openZauthWorkspace(pageId?: 'database' | 'provider-hub') {
  if (pageId) {
    try {
      window.localStorage.setItem('daemon:zauth:activePage', pageId)
      window.dispatchEvent(new CustomEvent('daemon:zauth-open', { detail: pageId }))
    } catch {
      // The workspace tool still opens on its default page if storage/events are unavailable.
    }
  }
  useUIStore.getState().openWorkspaceTool('zauth')
}

function useRightSidebarWidgetConfig() {
  const [config, setConfig] = useState<RightSidebarWidgetConfig>(readRightSidebarWidgetConfig)

  useEffect(() => {
    const refresh = () => setConfig(readRightSidebarWidgetConfig())
    window.addEventListener(RIGHT_SIDEBAR_WIDGET_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(RIGHT_SIDEBAR_WIDGET_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return config
}

function ProjectStatusWidget() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const projects = useUIStore((s) => s.projects)
  const terminals = useUIStore((s) => s.terminals)
  const openFiles = useUIStore((s) => s.openFiles)
  const activeProject = projects.find((project) => project.id === activeProjectId)
  const projectTerminals = terminals.filter((terminal) => terminal.projectId === activeProjectId)
  const projectFiles = openFiles.filter((file) => file.projectId === activeProjectId)

  return (
    <RightRailSection kicker="Workspace" title={activeProject?.name ?? 'Project'}>
      <div className="rp-side-widget-line" title={activeProjectPath ?? undefined}>{compactPathLabel(activeProjectPath)}</div>
      <div className="rp-agent-widget-grid rp-side-widget-grid">
        <div><span>Files</span><strong>{projectFiles.length}</strong></div>
        <div><span>Terms</span><strong>{projectTerminals.length}</strong></div>
      </div>
    </RightRailSection>
  )
}

function WalletSnapshotWidget() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const dashboard = useWalletStore((s) => s.dashboard)
  const lowPowerMode = useWalletStore((s) => s.lowPowerMode)
  const wallets = dashboard?.wallets ?? EMPTY_WALLETS
  const refresh = useWalletStore((s) => s.refresh)
  const fallbackWallet = wallets.find((wallet) => wallet.isDefault) ?? wallets[0] ?? null
  const activeWalletName = dashboard?.activeWallet?.name ?? fallbackWallet?.name ?? null
  const activeHoldingCount = dashboard?.activeWallet?.holdings.length ?? 0

  useEffect(() => {
    if (lowPowerMode) return
    if (!dashboard) void refresh(activeProjectId)
  }, [activeProjectId, dashboard, lowPowerMode, refresh])

  return (
    <RightRailSection kicker="Wallet" title={money(dashboard?.portfolio.totalUsd ?? 0)}>
      <div className="rp-side-widget-line">{activeWalletName ?? (lowPowerMode ? 'Cached until opened' : 'No wallet loaded')}</div>
      <div className="rp-agent-widget-grid rp-side-widget-grid">
        <div><span>Wallets</span><strong>{wallets.length}</strong></div>
        <div><span>Tokens</span><strong>{activeHoldingCount}</strong></div>
      </div>
    </RightRailSection>
  )
}

function AiStatusWidget() {
  const [claude, setClaude] = useState<'live' | 'offline' | 'checking'>('checking')
  const [codex, setCodex] = useState<'live' | 'offline' | 'checking'>('checking')

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      const [claudeRes, codexRes] = await Promise.all([
        daemon.claude.verifyConnection(),
        daemon.codex.verifyConnection(),
      ])
      if (cancelled) return
      setClaude(claudeRes.ok && claudeRes.data?.isAuthenticated ? 'live' : 'offline')
      setCodex(codexRes.ok && codexRes.data && (codexRes.data.isAuthenticated || codexRes.data.authMode !== 'none') ? 'live' : 'offline')
    }
    void refresh()
    const unsubscribe = daemon.events.on('auth:changed', () => { void refresh() })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const rows = useMemo(() => [
    ['Claude', claude],
    ['Codex', codex],
  ] as const, [claude, codex])

  return (
    <RightRailSection kicker="Assistants" title="AI Status">
      <div className="rp-side-status-list">
        {rows.map(([name, status]) => (
          <div key={name} className="rp-side-status-row">
            <span className={`rp-side-status-dot ${status === 'live' ? 'live' : ''}`} />
            <span>{name}</span>
            <strong>{status}</strong>
          </div>
        ))}
      </div>
    </RightRailSection>
  )
}

function ZauthSidebarWidget() {
  const rows = [
    { label: 'Database', value: 'Registry', ready: true },
    { label: 'Provider Hub', value: 'Console', ready: true },
    { label: 'Layer', value: 'x402', ready: true },
  ]

  return (
    <RightRailSection kicker="x402" title="Zauth" className="rp-zauth-widget">
      <div className="rp-side-status-list">
        {rows.map((row) => (
          <div key={row.label} className="rp-side-status-row">
            <span className={`rp-side-status-dot ${row.ready ? 'live' : ''}`} />
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
      <div className="rp-agent-widget-actions">
        <button type="button" onClick={() => openZauthWorkspace('database')}>Database</button>
        <button type="button" onClick={() => openZauthWorkspace('provider-hub')}>Hub</button>
        <button type="button" onClick={() => openZauthWorkspace()}>Full</button>
      </div>
    </RightRailSection>
  )
}

function MeterflowSidebarWidget() {
  const setRightPanelTab = useUIStore((s) => s.setRightPanelTab)
  const [overview, setOverview] = useState<MeterflowOverview | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      const status = await daemon.meterflow.status()
      if (cancelled) return
      setConfigured(Boolean(status.ok && status.data?.configured))
      if (!status.ok || !status.data?.configured) {
        setOverview(null)
        return
      }
      const res = await daemon.meterflow.overview()
      if (!cancelled && res.ok && res.data) setOverview(res.data)
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  const receipts = overview?.receipts ?? []
  const settled = receipts.filter(isSettledMeterflowReceipt)
  const gross = settled.reduce((sum, receipt) => sum + receiptAmount(receipt), 0)
  const latest = receipts[0]
  const latestStatus = latest ? String(latest.paymentState ?? latest.status ?? 'recorded') : configured ? 'No receipts' : 'Key missing'

  return (
    <RightRailSection
      kicker="Meterflow"
      title={configured ? money(gross) : 'Setup'}
      className="rp-meterflow-widget"
      action={<button type="button" className="rp-agent-widget-action" onClick={() => setRightPanelTab('meterflow')}>Open</button>}
    >
      <div className="rp-side-widget-line">{latestStatus}</div>
      <div className="rp-agent-widget-grid rp-side-widget-grid">
        <div><span>Receipts</span><strong>{receipts.length}</strong></div>
        <div><span>Settled</span><strong>{settled.length}</strong></div>
      </div>
    </RightRailSection>
  )
}

function ClawpumpSidebarWidget() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [agentCount, setAgentCount] = useState<number | null>(null)
  const [liveCount, setLiveCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      const cfg = await daemon.clawpump.isConfigured()
      if (cancelled) return
      const isConfigured = cfg.ok && Boolean(cfg.data)
      setConfigured(isConfigured)
      if (!isConfigured) { setAgentCount(null); setLiveCount(0); return }
      const list = await daemon.clawpump.list()
      if (cancelled) return
      const agents = list.ok ? (list.data ?? []) : []
      setAgentCount(list.ok ? agents.length : null)
      setLiveCount(agents.filter((a) => {
        const s = String(a.status ?? '').toLowerCase()
        return s === 'running' || s === 'active' || s === 'alive'
      }).length)
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  const title = configured === null
    ? 'Checking'
    : configured
      ? (agentCount == null ? 'Connected' : `${agentCount} agent${agentCount === 1 ? '' : 's'}`)
      : 'Setup'

  return (
    <RightRailSection
      kicker="ClawPump"
      title={title}
      className="rp-agent-widget--clawpump"
      media={<ClawpumpGlyph size={22} />}
      action={<button type="button" className="rp-agent-widget-action" onClick={() => useUIStore.getState().openWorkspaceTool('clawpump')}>Open</button>}
    >
      <div className="rp-side-status-list">
        <div className="rp-side-status-row">
          <span className={`rp-side-status-dot ${configured ? 'live' : ''}`} />
          <span>API key</span>
          <strong>{configured === null ? '…' : configured ? 'Connected' : 'Missing'}</strong>
        </div>
        {configured && (
          <div className="rp-side-status-row">
            <span className={`rp-side-status-dot ${liveCount > 0 ? 'live' : ''}`} />
            <span>Running</span>
            <strong>{agentCount == null ? '—' : `${liveCount}/${agentCount}`}</strong>
          </div>
        )}
      </div>
    </RightRailSection>
  )
}

export function RightSidebarWidgets() {
  const config = useRightSidebarWidgetConfig()

  return (
    <>
      {config.enabled['project-status'] && <ProjectStatusWidget />}
      {config.enabled['wallet-snapshot'] && <WalletSnapshotWidget />}
      {config.enabled['solana-readiness'] && <SolanaReadinessSidebarWidget />}
      {config.enabled['token-watch'] && <TokenWatchSidebarWidget />}
      {config.enabled['zauth'] && <ZauthSidebarWidget />}
      {config.enabled['meterflow'] && <MeterflowSidebarWidget />}
      {config.enabled['ai-status'] && <AiStatusWidget />}
      {config.enabled['clawpump'] && <ClawpumpSidebarWidget />}
    </>
  )
}
