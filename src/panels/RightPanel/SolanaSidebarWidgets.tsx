import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useSolanaToolboxStore } from '../../store/solanaToolbox'
import { useUIStore } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import type { WalletDashboard } from '../../types/daemon'
import {
  readRightSidebarWidgetConfig,
  RIGHT_SIDEBAR_WIDGET_EVENT,
  writeRightSidebarWidgetConfig,
} from './sidebarAgentWidgetConfig'

const EMPTY_WALLETS: WalletDashboard['wallets'] = []
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const DEFAULT_INFRA: WalletInfrastructureSettings = {
  rpcProvider: 'helius',
  quicknodeRpcUrl: '',
  customRpcUrl: '',
  swapProvider: 'jupiter',
  preferredWallet: 'phantom',
  executionMode: 'rpc',
  jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
}

function WidgetShell({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
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

function shortMint(mint: string) {
  return mint.length > 12 ? `${mint.slice(0, 4)}...${mint.slice(-4)}` : mint
}

function formatPrice(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '--'
  if (value < 0.000001) return value.toExponential(3)
  if (value < 0.01) return `$${value.toFixed(7)}`
  if (value < 1) return `$${value.toFixed(5)}`
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 })
}

function formatPct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function readinessState(ready: boolean, blocked = false) {
  if (ready) return 'live'
  return blocked ? 'blocked' : 'offline'
}

export function SolanaReadinessSidebarWidget() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)
  const dashboard = useWalletStore((s) => s.dashboard)
  const refreshWallets = useWalletStore((s) => s.refresh)
  const mcps = useSolanaToolboxStore((s) => s.mcps)
  const validator = useSolanaToolboxStore((s) => s.validator)
  const loadMcps = useSolanaToolboxStore((s) => s.loadMcps)
  const detectProject = useSolanaToolboxStore((s) => s.detectProject)
  const loadToolchain = useSolanaToolboxStore((s) => s.loadToolchain)
  const refreshValidatorStatus = useSolanaToolboxStore((s) => s.refreshValidatorStatus)
  const [hasHelius, setHasHelius] = useState(false)
  const [hasJupiter, setHasJupiter] = useState(false)
  const [hasSigner, setHasSigner] = useState(false)
  const [infra, setInfra] = useState<WalletInfrastructureSettings>(DEFAULT_INFRA)

  const wallets = dashboard?.wallets ?? EMPTY_WALLETS
  const activeWallet = dashboard?.activeWallet ?? null

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      const [heliusResult, jupiterResult, infraResult] = await Promise.allSettled([
        daemon.wallet.hasHeliusKey(),
        daemon.wallet.hasJupiterKey(),
        daemon.settings.getWalletInfrastructureSettings(),
        refreshValidatorStatus(),
        refreshWallets(activeProjectId),
      ])
      if (cancelled) return
      const heliusRes = heliusResult.status === 'fulfilled' ? heliusResult.value : null
      const jupiterRes = jupiterResult.status === 'fulfilled' ? jupiterResult.value : null
      const infraRes = infraResult.status === 'fulfilled' ? infraResult.value : null
      setHasHelius(Boolean(heliusRes?.ok && heliusRes.data))
      setHasJupiter(Boolean(jupiterRes?.ok && jupiterRes.data))
      setInfra(infraRes?.ok && infraRes.data ? infraRes.data : DEFAULT_INFRA)
    }
    void refresh()
    const retryTimer = window.setTimeout(() => { void refresh() }, 2500)
    const interval = window.setInterval(() => { void refresh() }, 30_000)
    return () => {
      cancelled = true
      window.clearTimeout(retryTimer)
      window.clearInterval(interval)
    }
  }, [activeProjectId, refreshValidatorStatus, refreshWallets])

  useEffect(() => {
    if (!activeProjectPath) {
      void loadToolchain(undefined)
      return
    }
    void Promise.all([
      loadMcps(activeProjectPath),
      detectProject(activeProjectPath),
      loadToolchain(activeProjectPath),
    ])
  }, [activeProjectPath, detectProject, loadMcps, loadToolchain])

  useEffect(() => {
    let cancelled = false
    async function checkSigner() {
      if (!activeWallet) {
        setHasSigner(false)
        return
      }
      const res = await daemon.wallet.hasKeypair(activeWallet.id)
      if (!cancelled) setHasSigner(Boolean(res.ok && res.data))
    }
    void checkSigner()
    return () => { cancelled = true }
  }, [activeWallet])

  const rpcReady = useMemo(() => {
    if (infra.rpcProvider === 'helius') return hasHelius
    if (infra.rpcProvider === 'quicknode') return infra.quicknodeRpcUrl.trim().length > 0
    if (infra.rpcProvider === 'custom') return infra.customRpcUrl.trim().length > 0
    return true
  }, [hasHelius, infra])

  const rpcLabel = infra.rpcProvider === 'helius' ? 'Helius'
    : infra.rpcProvider === 'quicknode' ? 'QuickNode'
      : infra.rpcProvider === 'custom' ? 'Custom'
        : 'Public'
  const enabledMcpCount = mcps.filter((mcp) => mcp.enabled).length
  const rows = [
    { label: 'Wallet', value: activeWallet ? activeWallet.name : wallets.length ? 'No active' : 'Missing', ready: Boolean(activeWallet) },
    { label: 'Signer', value: hasSigner ? 'Ready' : activeWallet ? 'Watch-only' : 'Missing', ready: hasSigner },
    { label: 'RPC', value: rpcReady ? rpcLabel : `${rpcLabel} missing`, ready: rpcReady },
    { label: 'Jupiter', value: hasJupiter ? 'Ready' : 'Missing', ready: hasJupiter },
    { label: 'MCPs', value: `${enabledMcpCount} enabled`, ready: enabledMcpCount > 0 },
    { label: 'Validator', value: validator.status === 'running' ? `${validator.type ?? 'local'}:${validator.port ?? 8899}` : validator.status, ready: validator.status === 'running' },
  ]
  const readyCount = rows.filter((row) => row.ready).length

  return (
    <WidgetShell kicker="Solana" title={`${readyCount}/${rows.length} ready`}>
      <div className="rp-side-status-list">
        {rows.map((row) => (
          <div key={row.label} className="rp-side-status-row">
            <span className={`rp-side-status-dot ${readinessState(row.ready)}`} />
            <span>{row.label}</span>
            <strong title={row.value}>{row.value}</strong>
          </div>
        ))}
      </div>
      <div className="rp-agent-widget-actions">
        <button type="button" onClick={() => openWorkspaceTool('project-readiness')}>Readiness</button>
        <button type="button" onClick={() => openWorkspaceTool('wallet')}>Wallet</button>
      </div>
    </WidgetShell>
  )
}

export function TokenWatchSidebarWidget() {
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)
  const setActiveDashboardMint = useUIStore((s) => s.setActiveDashboardMint)
  const setWalletView = useWalletStore((s) => s.setActiveView)
  const setPreferredSwap = useWalletStore((s) => s.setPreferredSwap)
  const [mint, setMint] = useState(() => readRightSidebarWidgetConfig().tokenWatchMint ?? '')
  const [draft, setDraft] = useState(mint)
  const [meta, setMeta] = useState<{ name: string; symbol: string; image: string | null } | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [change24h, setChange24h] = useState<number | null>(null)
  const [holders, setHolders] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hasMint = MINT_RE.test(mint)

  useEffect(() => {
    const refresh = () => {
      const nextMint = readRightSidebarWidgetConfig().tokenWatchMint ?? ''
      setMint(nextMint)
      setDraft(nextMint)
    }
    window.addEventListener(RIGHT_SIDEBAR_WIDGET_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(RIGHT_SIDEBAR_WIDGET_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const saveMint = useCallback((nextMint: string) => {
    const clean = nextMint.trim()
    if (clean && !MINT_RE.test(clean)) {
      setError('Invalid mint')
      return
    }
    const current = readRightSidebarWidgetConfig()
    writeRightSidebarWidgetConfig({ ...current, tokenWatchMint: clean || null })
    setMint(clean)
    setDraft(clean)
    setError(null)
  }, [])

  useEffect(() => {
    if (!hasMint) {
      setMeta(null)
      setPrice(null)
      setChange24h(null)
      setHolders(null)
      return
    }
    let cancelled = false
    async function load() {
      setError(null)
      const [metaRes, priceRes, holdersRes] = await Promise.all([
        daemon.dashboard.tokenMetadata(mint),
        daemon.dashboard.tokenPrice(mint),
        daemon.dashboard.tokenHolders(mint),
      ])
      if (cancelled) return
      setMeta(metaRes.ok && metaRes.data ? metaRes.data : null)
      setPrice(priceRes.ok && priceRes.data ? priceRes.data.price : null)
      setChange24h(priceRes.ok && priceRes.data ? priceRes.data.priceChange24h : null)
      setHolders(holdersRes.ok && holdersRes.data ? holdersRes.data.count : null)
      if (!metaRes.ok && !priceRes.ok) setError(metaRes.error ?? priceRes.error ?? 'Token lookup failed')
    }
    void load()
    const interval = window.setInterval(() => { void load() }, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [hasMint, mint])

  const openSwap = (mode: 'buy' | 'sell') => {
    if (!hasMint) return
    setPreferredSwap(mode === 'buy'
      ? { inputMint: SOL_MINT, outputMint: mint }
      : { inputMint: mint, outputMint: SOL_MINT })
    setWalletView('swap')
    openWorkspaceTool('wallet')
  }

  const openDashboard = () => {
    if (hasMint) setActiveDashboardMint(mint)
    openWorkspaceTool('dashboard')
  }

  return (
    <WidgetShell kicker="Token watch" title={meta?.symbol ?? (hasMint ? shortMint(mint) : 'Track mint')}>
      <div className="rp-token-watch-input-row">
        <input
          className="rp-token-watch-input"
          value={draft}
          placeholder="Paste token mint"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveMint(draft) }}
        />
        <button type="button" className="rp-agent-widget-action" onClick={() => saveMint(draft)}>Track</button>
      </div>

      {hasMint ? (
        <>
          <div className="rp-token-watch-headline">
            {meta?.image && <img src={meta.image} alt="" />}
            <div>
              <strong>{formatPrice(price)}</strong>
              <span className={change24h != null && change24h < 0 ? 'down' : 'up'}>{formatPct(change24h)} 24h</span>
            </div>
          </div>
          <div className="rp-agent-widget-grid rp-side-widget-grid">
            <div><span>Holders</span><strong>{holders?.toLocaleString() ?? '--'}</strong></div>
            <div><span>Mint</span><strong>{shortMint(mint)}</strong></div>
          </div>
          <div className="rp-agent-widget-actions">
            <button type="button" onClick={() => openSwap('buy')}>Buy</button>
            <button type="button" onClick={() => openSwap('sell')}>Sell</button>
            <button type="button" onClick={openDashboard}>Chart</button>
          </div>
        </>
      ) : (
        <div className="rp-agent-widget-empty">{error ?? 'Paste a Solana token mint to track price and holders.'}</div>
      )}
      {error && hasMint && <div className="rp-agent-widget-empty">{error}</div>}
    </WidgetShell>
  )
}
