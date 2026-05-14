import { useCallback, useEffect, useMemo, useState } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useUIStore } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import type { WalletDashboard } from '../../types/daemon'
import type {
  SpawnAgentPublicPortfolio,
  SpawnAgentPublicProfile,
  SpawnAgentRecord,
} from '../../../electron/services/SpawnAgentsService'
import {
  readRightSidebarWidgetConfig,
  RIGHT_SIDEBAR_WIDGET_EVENT,
  writeRightSidebarWidgetConfig,
} from './sidebarAgentWidgetConfig'
import { SPAWN_AGENT_PNL_COLORS } from '../../styles/daemonTheme'

const EMPTY_WALLETS: WalletDashboard['wallets'] = []

function fmt(n: number, d = 4) {
  if (!Number.isFinite(n)) return '--'
  return n.toLocaleString(undefined, { maximumFractionDigits: d })
}

function truncate(s: string, n = 4) {
  return s.length <= n * 2 + 3 ? s : `${s.slice(0, n)}...${s.slice(-n)}`
}

function pnlColor(n: number) {
  if (n > 0) return SPAWN_AGENT_PNL_COLORS.positive
  if (n < 0) return SPAWN_AGENT_PNL_COLORS.negative
  return 'var(--t2)'
}

function agentProfileUrl(agentId: string) {
  return `https://spawnagents.fun/agent?id=${encodeURIComponent(agentId)}`
}

function ageLabel(bornAt?: string | null) {
  if (!bornAt) return '--'
  const born = Date.parse(bornAt.replace(' ', 'T') + 'Z')
  if (!Number.isFinite(born)) return '--'
  const days = Math.max(0, Math.floor((Date.now() - born) / (24 * 60 * 60 * 1000)))
  return `${days}d`
}

export function SpawnAgentSidebarWidget() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const wallets = useWalletStore((s) => s.dashboard?.wallets ?? EMPTY_WALLETS)
  const lowPowerMode = useWalletStore((s) => s.lowPowerMode)
  const refreshWallets = useWalletStore((s) => s.refresh)
  const [config, setConfig] = useState(readRightSidebarWidgetConfig)
  const [agent, setAgent] = useState<SpawnAgentRecord | null>(null)
  const [profile, setProfile] = useState<SpawnAgentPublicProfile | null>(null)
  const [portfolio, setPortfolio] = useState<SpawnAgentPublicPortfolio | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const onConfig = () => setConfig(readRightSidebarWidgetConfig())
    window.addEventListener(RIGHT_SIDEBAR_WIDGET_EVENT, onConfig)
    window.addEventListener('storage', onConfig)
    return () => {
      window.removeEventListener(RIGHT_SIDEBAR_WIDGET_EVENT, onConfig)
      window.removeEventListener('storage', onConfig)
    }
  }, [])

  useEffect(() => {
    if (lowPowerMode) return
    if (!config.enabled['spawn-agent'] || config.spawnAgentId || wallets.length > 0) return
    void refreshWallets(activeProjectId)
  }, [activeProjectId, config.spawnAgentId, config.enabled, lowPowerMode, refreshWallets, wallets.length])

  const ownerWallet = useMemo(() => {
    if (wallets.length === 0) return null
    return wallets.find((wallet) => wallet.isDefault) ?? wallets[0]
  }, [wallets])

  const load = useCallback(async () => {
    if (!config.enabled['spawn-agent']) return
    let cancelled = false
    setLoading(true)

    try {
      let nextAgent: SpawnAgentRecord | null = null
      const targetId = config.spawnAgentId

      if (targetId) {
        const res = await daemon.spawnAgents.get(targetId)
        if (res.ok && res.data) nextAgent = res.data
      } else if (ownerWallet) {
        const res = await daemon.spawnAgents.list(ownerWallet.address)
        if (res.ok && res.data) nextAgent = res.data[0] ?? null
      }

      if (cancelled) return
      setAgent(nextAgent)
      setProfile(null)
      setPortfolio(null)

      if (nextAgent) {
        const [profileRes, portfolioRes] = await Promise.all([
          daemon.spawnAgents.publicProfile(nextAgent.id),
          daemon.spawnAgents.publicPortfolio(nextAgent.id),
        ])
        if (cancelled) return
        setProfile(profileRes.ok && profileRes.data ? profileRes.data : null)
        setPortfolio(portfolioRes.ok && portfolioRes.data ? portfolioRes.data : null)
      }
    } finally {
      if (!cancelled) setLoading(false)
    }

    return () => { cancelled = true }
  }, [config.spawnAgentId, config.enabled, ownerWallet])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        let nextAgent: SpawnAgentRecord | null = null

        if (config.spawnAgentId) {
          const res = await daemon.spawnAgents.get(config.spawnAgentId)
          if (!cancelled && res.ok && res.data) nextAgent = res.data
        } else if (ownerWallet) {
          const res = await daemon.spawnAgents.list(ownerWallet.address)
          if (!cancelled && res.ok && res.data) nextAgent = res.data[0] ?? null
        }

        if (cancelled) return
        setAgent(nextAgent)
        setProfile(null)
        setPortfolio(null)

        if (!nextAgent) return

        const [profileRes, portfolioRes] = await Promise.all([
          daemon.spawnAgents.publicProfile(nextAgent.id),
          daemon.spawnAgents.publicPortfolio(nextAgent.id),
        ])
        if (cancelled) return
        setProfile(profileRes.ok && profileRes.data ? profileRes.data : null)
        setPortfolio(portfolioRes.ok && portfolioRes.data ? portfolioRes.data : null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (!config.enabled['spawn-agent']) return () => { cancelled = true }
    if (lowPowerMode && !config.spawnAgentId) return () => { cancelled = true }
    if (lowPowerMode) {
      const timer = window.setTimeout(() => { void run() }, 10_000)
      return () => {
        cancelled = true
        window.clearTimeout(timer)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [config.spawnAgentId, config.enabled, lowPowerMode, ownerWallet])

  if (!config.enabled['spawn-agent']) return null

  const profileAgent = profile?.agent
  const liveAgent = profileAgent ?? agent
  const pnl = profileAgent?.total_pnl ?? liveAgent?.total_pnl_sol ?? 0
  const predictions = (profile?.predictionOpen.length ?? 0) + (profile?.predictionClosed.length ?? 0)
  const totalValueSol = portfolio?.sol_balance ?? (
    agent ? agent.initial_capital_sol + agent.total_pnl_sol - agent.total_withdrawn_sol : 0
  )
  const avatar = liveAgent?.avatar ?? profileAgent?.meta?.avatar ?? null

  return (
    <section className="rp-agent-widget rp-agent-widget--spawnagents">
      <div className="rp-agent-widget-head">
        <div className="rp-agent-widget-agent">
          <div className="rp-agent-widget-avatar">{avatar ? <img src={avatar} alt="" /> : <span />}</div>
          <div className="rp-agent-widget-name-wrap">
            <div className="rp-agent-widget-kicker">Spawn agent</div>
            <div className="rp-agent-widget-title">{liveAgent?.name ?? (loading ? 'Loading...' : 'No agent')}</div>
          </div>
        </div>
        <button
          type="button"
          className="rp-agent-widget-close"
          aria-label="Remove Spawn agent sidebar widget"
          onClick={() => writeRightSidebarWidgetConfig({
            ...config,
            enabled: { ...config.enabled, 'spawn-agent': false },
          })}
        >
          x
        </button>
      </div>

      {liveAgent ? (
        <>
          <div className="rp-agent-widget-pnl" style={{ color: pnlColor(pnl) }}>
            {pnl >= 0 ? '+' : ''}{fmt(pnl)} SOL
          </div>
          <div className="rp-agent-widget-grid">
            <div><span>Value</span><strong>{fmt(totalValueSol)} SOL</strong></div>
            <div><span>Predictions</span><strong>{predictions}</strong></div>
            <div><span>Age</span><strong>{ageLabel(liveAgent.born_at)}</strong></div>
            <div><span>Win</span><strong>{Math.round(profile?.winRate ?? 0)}%</strong></div>
          </div>
          <div className="rp-agent-widget-meta">
            <span>GEN {liveAgent.generation}</span>
            <span>{truncate(liveAgent.agent_wallet)}</span>
          </div>
          <div className="rp-agent-widget-actions">
            <button type="button" onClick={() => void daemon.shell.openExternal(agentProfileUrl(liveAgent.id))}>Open</button>
            <button type="button" onClick={() => void load()}>Refresh</button>
          </div>
        </>
      ) : (
        <div className="rp-agent-widget-empty">
          {loading ? 'Loading agent...' : 'Open a SpawnAgents detail page and add an agent.'}
        </div>
      )}
    </section>
  )
}
