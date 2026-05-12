import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useUIStore } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import type { WalletDashboard } from '../../types/daemon'
import { SpawnAgentSidebarWidget } from './SpawnAgentSidebarWidget'
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

function shortPath(path: string | null) {
  if (!path) return 'No project'
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts.slice(-2).join('/')
}

function WidgetShell({
  kicker,
  title,
  children,
}: {
  kicker: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="rp-side-widget">
      <div className="rp-side-widget-head">
        <div>
          <div className="rp-agent-widget-kicker">{kicker}</div>
          <div className="rp-side-widget-title">{title}</div>
        </div>
      </div>
      {children}
    </section>
  )
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
    <WidgetShell kicker="Workspace" title={activeProject?.name ?? 'Project'}>
      <div className="rp-side-widget-line" title={activeProjectPath ?? undefined}>{shortPath(activeProjectPath)}</div>
      <div className="rp-agent-widget-grid rp-side-widget-grid">
        <div><span>Files</span><strong>{projectFiles.length}</strong></div>
        <div><span>Terms</span><strong>{projectTerminals.length}</strong></div>
      </div>
    </WidgetShell>
  )
}

function WalletSnapshotWidget() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const dashboard = useWalletStore((s) => s.dashboard)
  const wallets = dashboard?.wallets ?? EMPTY_WALLETS
  const refresh = useWalletStore((s) => s.refresh)
  const fallbackWallet = wallets.find((wallet) => wallet.isDefault) ?? wallets[0] ?? null
  const activeWalletName = dashboard?.activeWallet?.name ?? fallbackWallet?.name ?? null
  const activeHoldingCount = dashboard?.activeWallet?.holdings.length ?? 0

  useEffect(() => {
    if (!dashboard) void refresh(activeProjectId)
  }, [activeProjectId, dashboard, refresh])

  return (
    <WidgetShell kicker="Wallet" title={money(dashboard?.portfolio.totalUsd ?? 0)}>
      <div className="rp-side-widget-line">{activeWalletName ?? 'No wallet loaded'}</div>
      <div className="rp-agent-widget-grid rp-side-widget-grid">
        <div><span>Wallets</span><strong>{wallets.length}</strong></div>
        <div><span>Tokens</span><strong>{activeHoldingCount}</strong></div>
      </div>
    </WidgetShell>
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
    <WidgetShell kicker="Assistants" title="AI Status">
      <div className="rp-side-status-list">
        {rows.map(([name, status]) => (
          <div key={name} className="rp-side-status-row">
            <span className={`rp-side-status-dot ${status === 'live' ? 'live' : ''}`} />
            <span>{name}</span>
            <strong>{status}</strong>
          </div>
        ))}
      </div>
    </WidgetShell>
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
      {config.enabled['ai-status'] && <AiStatusWidget />}
      <SpawnAgentSidebarWidget />
    </>
  )
}
