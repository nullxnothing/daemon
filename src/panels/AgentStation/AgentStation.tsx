import { useState, useEffect, useCallback } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { SkeletonRows } from '../../components/Panel'
import { useAppActions } from '../../store/appActions'
import { useUIStore } from '../../store/ui'
import type { SynapseSapAgent, SynapseSapCluster, SynapseSapDiscoveryResult, WalletListEntry } from '../../types/daemon'
import css from './AgentStation.module.css'

const TEMPLATES: Array<{ id: AgentTemplate; name: string; desc: string; defaultPlugins: string[] }> = [
  { id: 'basic', name: 'Basic', desc: 'Blank slate with all plugins. Add custom logic.', defaultPlugins: ['token', 'defi', 'misc'] },
  { id: 'defi-trader', name: 'DeFi Trader', desc: 'Jupiter swaps + Pyth price feeds.', defaultPlugins: ['token', 'defi', 'misc'] },
  { id: 'portfolio-monitor', name: 'Portfolio Monitor', desc: 'Watch wallet balances and alert on changes.', defaultPlugins: ['token', 'misc'] },
  { id: 'nft-minter', name: 'NFT Minter', desc: 'Mint NFTs via Metaplex Core.', defaultPlugins: ['nft', 'misc'] },
  { id: 'metaplex-meterflow-operator', name: 'Metaplex + Meterflow', desc: 'Onchain identity + paid x402 tool call + DAEMON receipt.', defaultPlugins: ['nft', 'misc'] },
]

const ALL_PLUGINS = ['token', 'defi', 'nft', 'misc', 'blinks']
const SAP_CLUSTER: SynapseSapCluster = 'devnet'
const DEFAULT_PROTOCOL_IDS = ['daemon', 'solana-agent-kit']
const DEFAULT_DISCOVERY_QUERY = 'daemon:agent'

const PLUGIN_CAPABILITIES: Record<string, string> = {
  token: 'daemon:token',
  defi: 'daemon:defi',
  nft: 'daemon:nft',
  misc: 'daemon:tools',
  blinks: 'daemon:blinks',
}

function StatusDot({ status }: { status: AgentStationStatus }) {
  return (
    <span
      className={`${css.statusDot} ${
        status === 'running' ? css.statusRunning
        : status === 'stopped' ? css.statusStopped
        : css.statusIdle
      }`}
    />
  )
}

function formatPath(p: string) {
  return p.length > 48 ? '...' + p.slice(-45) : p
}

function shortAddress(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-6)}` : value
}

function defaultCapabilityIds(config: AgentStationConfig, plugins: string[]) {
  return [
    DEFAULT_DISCOVERY_QUERY,
    `daemon:${config.template}`,
    ...plugins.map((plugin) => PLUGIN_CAPABILITIES[plugin]).filter(Boolean),
  ]
}

// ---- Create Form ----

interface CreateFormProps {
  onCreated: (config: AgentStationConfig) => void
  onCancel: () => void
}

function CreateForm({ onCreated, onCancel }: CreateFormProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState<AgentTemplate>('basic')
  const [plugins, setPlugins] = useState<string[]>(['token', 'defi', 'misc'])
  const [rpcUrl, setRpcUrl] = useState('')
  const [model, setModel] = useState('gpt-4o')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function togglePlugin(p: string) {
    setPlugins((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  function selectTemplate(t: AgentTemplate) {
    setTemplate(t)
    const tmpl = TEMPLATES.find((x) => x.id === t)
    if (tmpl) setPlugins(tmpl.defaultPlugins)
  }

  async function handleSubmit() {
    if (!name.trim()) { setError('Name is required'); return }
    if (plugins.length === 0) { setError('Select at least one plugin'); return }
    setBusy(true)
    setError(null)
    const res = await daemon.agentStation.create({
      name: name.trim(),
      description: description.trim() || undefined,
      template,
      plugins,
      rpc_url: rpcUrl.trim() || null,
      model,
    })
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'Failed to create agent'); return }
    onCreated(res.data!)
  }

  return (
    <div className={css.formPanel}>
      <div className={css.formTitle}>New Solana Agent</div>

      <div className={css.field}>
        <label className={css.label}>Template</label>
        <div className={css.templateGrid}>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${css.templateCard} ${template === t.id ? css.templateCardSelected : ''}`}
              onClick={() => selectTemplate(t.id)}
            >
              <div className={css.templateCardName}>{t.name}</div>
              <div className={css.templateCardDesc}>{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className={css.field}>
        <label className={css.label}>Name</label>
        <input
          className={css.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My DeFi Trader"
          maxLength={80}
        />
      </div>

      <div className={css.field}>
        <label className={css.label}>Description (optional)</label>
        <textarea
          className={css.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this agent do?"
          maxLength={400}
        />
      </div>

      <div className={css.field}>
        <label className={css.label}>Plugins</label>
        <div className={css.pluginsRow}>
          {ALL_PLUGINS.map((p) => (
            <button
              key={p}
              type="button"
              className={`${css.pluginToggle} ${plugins.includes(p) ? css.pluginToggleActive : ''}`}
              onClick={() => togglePlugin(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className={css.field}>
        <label className={css.label}>AI Model</label>
        <select className={css.select} value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="gpt-4o">GPT-4o</option>
          <option value="gpt-4o-mini">GPT-4o Mini</option>
          <option value="gpt-4-turbo">GPT-4 Turbo</option>
          <option value="claude-opus-4-20250514">Claude Opus 4</option>
          <option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
        </select>
      </div>

      <div className={css.field}>
        <label className={css.label}>RPC URL (optional)</label>
        <input
          className={css.input}
          value={rpcUrl}
          onChange={(e) => setRpcUrl(e.target.value)}
          placeholder="https://api.mainnet-beta.solana.com"
        />
      </div>

      {error && <div className={css.errorMsg}>{error}</div>}

      <div className={css.formActions}>
        <button className={css.cancelBtn} type="button" onClick={onCancel}>Cancel</button>
        <button className={css.submitBtn} type="button" onClick={handleSubmit} disabled={busy}>
          {busy ? 'Creating...' : 'Create Agent'}
        </button>
      </div>
    </div>
  )
}

// ---- Agent Card ----

interface AgentCardProps {
  config: AgentStationConfig
  wallets: WalletListEntry[]
  onDeleted: (id: string) => void
  onStatusChange: (id: string, status: AgentStationStatus) => void
}

function AgentCard({ config, wallets, onDeleted, onStatusChange }: AgentCardProps) {
  const [scaffolding, setScaffolding] = useState(false)
  const [scaffoldMsg, setScaffoldMsg] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [running, setRunning] = useState(false)
  const [walletId, setWalletId] = useState(config.wallet_id ?? '')
  const [sapAgent, setSapAgent] = useState<SynapseSapAgent | null>(null)
  const [sapLoading, setSapLoading] = useState(false)
  const [sapPublishing, setSapPublishing] = useState(false)
  const [sapMsg, setSapMsg] = useState<string | null>(null)
  const projects = useUIStore((s) => s.projects)
  const setProjects = useUIStore((s) => s.setProjects)
  const setActiveProject = useUIStore((s) => s.setActiveProject)
  const setCenterMode = useUIStore((s) => s.setCenterMode)
  const setActiveWorkspaceTool = useUIStore((s) => s.setActiveWorkspaceTool)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const focusTerminal = useAppActions((s) => s.focusTerminal)

  const plugins: string[] = (() => { try { return JSON.parse(config.plugins) } catch { return [] } })()
  const selectedWallet = wallets.find((wallet) => wallet.id === walletId)

  useEffect(() => {
    if (walletId || wallets.length === 0) return
    const defaultWallet = wallets.find((wallet) => wallet.is_default) ?? wallets[0]
    setWalletId(defaultWallet.id)
  }, [walletId, wallets])

  useEffect(() => {
    let cancelled = false
    async function loadSapAgent() {
      if (!selectedWallet) {
        setSapAgent(null)
        return
      }
      setSapLoading(true)
      const res = await daemon.synapse.getAgent(selectedWallet.address, { cluster: SAP_CLUSTER })
      if (!cancelled) {
        setSapAgent(res.ok ? res.data ?? null : null)
        setSapLoading(false)
      }
    }
    void loadSapAgent()
    return () => { cancelled = true }
  }, [selectedWallet])

  async function handleScaffold() {
    setScaffolding(true)
    setScaffoldMsg(null)
    const dirRes = await daemon.agentStation.pickOutputDir()
    if (!dirRes.ok || !dirRes.data) { setScaffolding(false); return }
    const res = await daemon.agentStation.scaffold(config.id, dirRes.data)
    setScaffolding(false)
    if (!res.ok) { setScaffoldMsg('Error: ' + (res.error ?? 'scaffold failed')); return }
    setScaffoldMsg('Scaffolded to ' + res.data!.projectPath)
  }

  async function handleRun() {
    if (!config.project_path) {
      setScaffoldMsg('Scaffold the project first')
      return
    }
    setRunning(true)
    let project = projects.find((item) => item.path === config.project_path)
    if (!project) {
      const created = await daemon.projects.create({ name: config.name, path: config.project_path })
      if (!created.ok || !created.data) {
        setRunning(false)
        setScaffoldMsg('Failed to register project: ' + (created.error ?? 'unknown error'))
        return
      }
      project = created.data
      setProjects([created.data, ...projects])
    }
    setActiveProject(project.id, project.path)
    setCenterMode('canvas')
    setActiveWorkspaceTool(null)
    focusTerminal()

    const termRes = await daemon.terminal.create({ cwd: config.project_path, startupCommand: 'npm start', userInitiated: true })
    setRunning(false)
    if (!termRes.ok) { setScaffoldMsg('Failed to open terminal: ' + termRes.error); return }
    addTerminal(project.id, termRes.data!.id, `${config.name} Agent`, termRes.data!.agentId)
    focusTerminal()
    await daemon.agentStation.updateStatus(config.id, 'running')
    onStatusChange(config.id, 'running')
    setScaffoldMsg('Running in Terminal')
  }

  async function handleStop() {
    await daemon.agentStation.updateStatus(config.id, 'stopped')
    onStatusChange(config.id, 'stopped')
  }

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    await daemon.agentStation.delete(config.id)
    onDeleted(config.id)
  }

  async function handlePublishSap() {
    if (!walletId) {
      setSapMsg('Select a signing wallet first')
      return
    }
    setSapPublishing(true)
    setSapMsg(null)
    const res = await daemon.synapse.registerAgent({
      walletId,
      agentStationId: config.id,
      cluster: SAP_CLUSTER,
      capabilityIds: defaultCapabilityIds(config, plugins),
      protocolIds: DEFAULT_PROTOCOL_IDS,
    })
    setSapPublishing(false)
    if (!res.ok || !res.data) {
      setSapMsg('SAP error: ' + (res.error ?? 'publish failed'))
      return
    }
    setSapMsg(`SAP published: ${shortAddress(res.data.signature)}`)
    if (selectedWallet) {
      const agentRes = await daemon.synapse.getAgent(selectedWallet.address, { cluster: SAP_CLUSTER })
      if (agentRes.ok) setSapAgent(agentRes.data ?? null)
    }
  }

  const templateLabel = TEMPLATES.find((t) => t.id === config.template)?.name ?? config.template

  return (
    <div className={css.card}>
      <div className={css.cardHeader}>
        <span className={css.cardName}>{config.name}</span>
        <StatusDot status={config.status} />
      </div>

      <div className={css.cardMeta}>
        <span className={`${css.metaChip} ${css.metaChipAccent}`}>{templateLabel}</span>
        {plugins.map((p) => (
          <span key={p} className={css.metaChip}>{p}</span>
        ))}
        <span className={css.metaChip}>{config.model}</span>
        <span className={`${css.metaChip} ${sapAgent ? css.metaChipSuccess : ''}`}>
          SAP {sapLoading ? 'checking' : sapAgent ? 'published' : 'devnet'}
        </span>
      </div>

      {config.description && (
        <div className={css.cardDesc}>{config.description}</div>
      )}

      {config.project_path && (
        <div className={css.cardPath}>{formatPath(config.project_path)}</div>
      )}

      {scaffoldMsg && (
        <div className={scaffoldMsg.startsWith('Error') ? css.errorMsg : css.successMsg} style={{ marginBottom: 8 }}>
          {scaffoldMsg}
        </div>
      )}

      <div className={css.sapBox}>
        <select className={css.sapSelect} value={walletId} onChange={(event) => setWalletId(event.target.value)}>
          <option value="">Select wallet</option>
          {wallets.map((wallet) => (
            <option key={wallet.id} value={wallet.id}>
              {wallet.name} - {shortAddress(wallet.address)}
            </option>
          ))}
        </select>
        {sapAgent && <span className={css.sapPda}>SAP {shortAddress(sapAgent.pda)}</span>}
        <button
          type="button"
          className={`${css.actionBtn} ${css.sapBtn}`}
          onClick={handlePublishSap}
          disabled={sapPublishing || sapLoading || !!sapAgent || wallets.length === 0}
        >
          {sapPublishing ? 'Publishing...' : sapAgent ? 'Published' : 'Publish to SAP'}
        </button>
      </div>

      {sapMsg && (
        <div className={sapMsg.startsWith('SAP error') ? css.errorMsg : css.successMsg} style={{ marginBottom: 8 }}>
          {sapMsg}
        </div>
      )}

      <div className={css.cardActions}>
        {config.status !== 'running' ? (
          <button type="button" className={`${css.actionBtn} ${css.runBtn}`} onClick={handleRun} disabled={running}>
            {running ? 'Opening...' : 'Run'}
          </button>
        ) : (
          <button type="button" className={`${css.actionBtn} ${css.stopBtn}`} onClick={handleStop}>
            Stop
          </button>
        )}
        <button
          className={`${css.actionBtn} ${css.scaffoldBtn}`}
          onClick={handleScaffold}
          disabled={scaffolding}
        >
          {scaffolding ? 'Scaffolding...' : config.project_path ? 'Rescaffold' : 'Scaffold'}
        </button>
        <button
          className={`${css.actionBtn} ${css.deleteBtn}`}
          onClick={handleDelete}
          disabled={deleting}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function SynapseDiscoveryPanel() {
  const [mode, setMode] = useState<'capability' | 'protocol'>('capability')
  const [query, setQuery] = useState(DEFAULT_DISCOVERY_QUERY)
  const [result, setResult] = useState<SynapseSapDiscoveryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch() {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    const input = { cluster: SAP_CLUSTER, limit: 10, capabilityId: query.trim(), protocolId: query.trim() }
    const res = mode === 'capability'
      ? await daemon.synapse.discoverByCapability(input)
      : await daemon.synapse.discoverByProtocol(input)
    setLoading(false)
    if (!res.ok || !res.data) {
      setResult(null)
      setError(res.error ?? 'SAP discovery failed')
      return
    }
    setResult(res.data)
  }

  return (
    <div className={css.discoveryPanel}>
      <div className={css.discoveryTop}>
        <div>
          <div className={css.discoveryTitle}>SAP Discovery</div>
          <div className={css.discoveryMeta}>{SAP_CLUSTER}</div>
        </div>
        <div className={css.discoveryModes}>
          <button type="button" className={mode === 'capability' ? css.discoveryModeActive : ''} onClick={() => setMode('capability')}>Capability</button>
          <button type="button" className={mode === 'protocol' ? css.discoveryModeActive : ''} onClick={() => setMode('protocol')}>Protocol</button>
        </div>
      </div>
      <div className={css.discoverySearch}>
        <input
          className={css.input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={mode === 'capability' ? DEFAULT_DISCOVERY_QUERY : 'daemon'}
        />
        <button type="button" className={css.actionBtn} onClick={handleSearch} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>
      {error && <div className={css.errorMsg}>{error}</div>}
      {result && (
        <div className={css.discoveryResults}>
          <div className={css.discoveryCount}>{result.total} indexed / {result.agents.length} loaded</div>
          {result.agents.map((agent) => (
            <div key={agent.pda} className={css.discoveryAgent}>
              <span>{agent.name}</span>
              <span>{shortAddress(agent.wallet)}</span>
              <span>{agent.protocols.slice(0, 2).join(', ') || 'no protocol'}</span>
            </div>
          ))}
          {result.agents.length === 0 && <div className={css.infoMsg}>No SAP agents found for this query.</div>}
        </div>
      )}
    </div>
  )
}

// ---- Main Panel ----

export function AgentStation() {
  const [configs, setConfigs] = useState<AgentStationConfig[]>([])
  const [wallets, setWallets] = useState<WalletListEntry[]>([])
  const [view, setView] = useState<'list' | 'create'>('list')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [agentsRes, walletsRes] = await Promise.all([
      daemon.agentStation.list(),
      daemon.wallet.list(),
    ])
    if (agentsRes.ok && agentsRes.data) setConfigs(agentsRes.data)
    if (walletsRes.ok && walletsRes.data) setWallets(walletsRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function handleCreated(config: AgentStationConfig) {
    setConfigs((prev) => [config, ...prev])
    setView('list')
  }

  function handleDeleted(id: string) {
    setConfigs((prev) => prev.filter((c) => c.id !== id))
  }

  function handleStatusChange(id: string, status: AgentStationStatus) {
    setConfigs((prev) => prev.map((c) => c.id === id ? { ...c, status } : c))
  }

  return (
    <div className={css.root}>
      <div className={css.header}>
        <div className={css.headerLeft}>
          <span className={css.headerTitle}>Agent Station</span>
          <span className={css.headerBadge}>SAK</span>
        </div>
        {view === 'list' && (
          <button className={css.newBtn} type="button" onClick={() => setView('create')}>
            + New Agent
          </button>
        )}
      </div>

      <div className={css.body}>
        {view === 'create' ? (
          <CreateForm
            onCreated={handleCreated}
            onCancel={() => setView('list')}
          />
        ) : loading ? (
          <div role="status" aria-busy="true" aria-live="polite">
            <span className={css.srOnly}>Loading agents…</span>
            <SkeletonRows rows={3} />
          </div>
        ) : configs.length === 0 ? (
          <div className={css.emptyState}>
            <svg className={css.emptyIcon} width="48" height="48" viewBox="0 0 24 24" fill="none" strokeWidth="1.2" stroke="currentColor">
              <path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z" />
              <path d="M9.5 9.5 12 7l2.5 2.5M12 7v6.5M9.5 16.5h5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className={css.emptyTitle}>No agents yet</div>
            <div className={css.emptyDesc}>
              Spin up a Solana agent on Solana Agent Kit. Start from a template — DeFi trading, portfolio watching, NFT minting — or build your own.
            </div>
            <button className={css.emptyAction} type="button" onClick={() => setView('create')}>
              + Create your first agent
            </button>
          </div>
        ) : (
          <div className={css.listStack}>
            <SynapseDiscoveryPanel />
            <div className={`${css.cardList} motion-stagger`}>
              {configs.map((config) => (
                <AgentCard
                  key={config.id}
                  config={config}
                  wallets={wallets}
                  onDeleted={handleDeleted}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AgentStation
