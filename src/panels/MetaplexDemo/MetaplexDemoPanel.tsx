import { useMemo, useState } from 'react'
import { useEffect } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useAppActions } from '../../store/appActions'
import { useUIStore } from '../../store/ui'
import {
  METAPLEX_DEMO_BOUNDARY,
  METAPLEX_DEMO_CAPABILITIES,
  METAPLEX_DEMO_PREVIEWS,
  METAPLEX_DEMO_PROJECT_NAME,
  METAPLEX_DEMO_PROJECT_PATH,
  METAPLEX_FOCUS_WORKFLOWS,
  type MetaplexDemoCapability,
  type MetaplexFocusWorkflow,
} from './metaplexDemoData'
import {
  DEFAULT_AGENT_TOKEN_OPERATOR_DRAFT,
  DEFAULT_DAS_INSPECTOR_INPUT,
  buildAgentTokenOperatorPlan,
  buildDasInspectorRequest,
  buildOperatorReceipt,
  type AgentTokenOperatorDraft,
  type DasInspectorInput,
  type MetaplexLaunchType,
  type MetaplexOperatorNetwork,
} from './operatorPlan'
import './MetaplexDemoPanel.css'

type CategoryFilter = 'All' | MetaplexDemoCapability['category']
type CapabilityLane = 'Assets and Metadata' | 'Launch and Liquidity' | 'Agents' | 'Developer Tooling'

const CATEGORY_FILTERS: CategoryFilter[] = ['All', 'NFTs', 'Tokens', 'Agents', 'Smart Contracts', 'Dev Tools', 'Launch']
const CAPABILITY_LANE_ORDER: CapabilityLane[] = ['Assets and Metadata', 'Launch and Liquidity', 'Agents', 'Developer Tooling']
const CORE_AGENT_ACKNOWLEDGEMENT = 'CREATE DEVNET CORE ASSET'

type SignerWalletOption = {
  id: string
  name: string
  address: string
  isDefault: boolean
}

function getCapabilityLane(capability: MetaplexDemoCapability): CapabilityLane {
  if (capability.id === 'core-candy-machine' || capability.id === 'genesis') return 'Launch and Liquidity'
  if (capability.category === 'Agents') return 'Agents'
  if (capability.category === 'Dev Tools' || capability.id === 'mpl-hybrid' || capability.id === 'inscriptions') return 'Developer Tooling'
  return 'Assets and Metadata'
}

function getWorkflowStatusLabel(status: MetaplexFocusWorkflow['status']) {
  if (status === 'primary') return 'Primary focus'
  if (status === 'priority') return 'Priority lane'
  return 'Support lane'
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function joinDemoPath(relativePath: string): string {
  return `${METAPLEX_DEMO_PROJECT_PATH}/${relativePath}`
}

export function MetaplexDemoPanel() {
  const [filter, setFilter] = useState<CategoryFilter>('All')
  const [selectedId, setSelectedId] = useState(METAPLEX_DEMO_CAPABILITIES[0]?.id ?? '')
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(METAPLEX_FOCUS_WORKFLOWS[0]?.id ?? '')
  const [operatorDraft, setOperatorDraft] = useState<AgentTokenOperatorDraft>(DEFAULT_AGENT_TOKEN_OPERATOR_DRAFT)
  const [dasInput, setDasInput] = useState<DasInspectorInput>(DEFAULT_DAS_INSPECTOR_INPUT)
  const [dasStatus, setDasStatus] = useState<string | null>(null)
  const [signerWallets, setSignerWallets] = useState<SignerWalletOption[]>([])
  const [selectedWalletId, setSelectedWalletId] = useState('')
  const [executionAck, setExecutionAck] = useState('')
  const [executeStatus, setExecuteStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const setProjects = useUIStore((s) => s.setProjects)
  const setActiveProject = useUIStore((s) => s.setActiveProject)
  const openFile = useUIStore((s) => s.openFile)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const setCenterMode = useUIStore((s) => s.setCenterMode)
  const focusTerminal = useAppActions((s) => s.focusTerminal)

  const visibleCapabilities = useMemo(
    () => filter === 'All'
      ? METAPLEX_DEMO_CAPABILITIES
      : METAPLEX_DEMO_CAPABILITIES.filter((capability) => capability.category === filter),
    [filter],
  )
  const groupedCapabilities = useMemo(
    () => CAPABILITY_LANE_ORDER.map((lane) => ({
      lane,
      items: visibleCapabilities.filter((capability) => getCapabilityLane(capability) === lane),
    })).filter((group) => group.items.length > 0),
    [visibleCapabilities],
  )
  const selected = METAPLEX_DEMO_CAPABILITIES.find((capability) => capability.id === selectedId) ?? METAPLEX_DEMO_CAPABILITIES[0]
  const selectedWorkflow = METAPLEX_FOCUS_WORKFLOWS.find((workflow) => workflow.id === selectedWorkflowId) ?? METAPLEX_FOCUS_WORKFLOWS[0]
  const selectedWorkflowCapabilities = METAPLEX_DEMO_CAPABILITIES.filter((capability) => selectedWorkflow.capabilityIds.includes(capability.id))
  const operatorPreviewPlan = useMemo(
    () => buildAgentTokenOperatorPlan(operatorDraft),
    [operatorDraft],
  )
  const selectedWallet = signerWallets.find((wallet) => wallet.id === selectedWalletId) ?? null

  useEffect(() => {
    let cancelled = false
    async function loadSignerWallets() {
      const dashboardRes = await daemon.wallet.dashboard(activeProjectId)
      if (!dashboardRes.ok || !dashboardRes.data) return
      const checks = await Promise.all(dashboardRes.data.wallets.map(async (wallet) => {
        const hasKeypair = await daemon.wallet.hasKeypair(wallet.id)
        return { wallet, canSign: hasKeypair.ok && hasKeypair.data === true }
      }))
      if (cancelled) return
      const nextWallets = checks
        .filter((entry) => entry.canSign)
        .map(({ wallet }) => ({
          id: wallet.id,
          name: wallet.name,
          address: wallet.address,
          isDefault: wallet.isDefault,
        }))
      setSignerWallets(nextWallets)
      setSelectedWalletId((current) => current || nextWallets.find((wallet) => wallet.isDefault)?.id || nextWallets[0]?.id || '')
    }
    void loadSignerWallets()
    return () => {
      cancelled = true
    }
  }, [activeProjectId])
  async function ensureDemoProject() {
    const listRes = await daemon.projects.list()
    if (!listRes.ok || !listRes.data) {
      throw new Error(listRes.error ?? 'Could not read DAEMON projects.')
    }
    const existing = listRes.data.find((project) => normalizePath(project.path) === normalizePath(METAPLEX_DEMO_PROJECT_PATH))
    if (existing) {
      setProjects([existing, ...listRes.data.filter((project) => project.id !== existing.id)])
      setActiveProject(existing.id, existing.path)
      return existing
    }

    const createRes = await daemon.projects.create({
      name: METAPLEX_DEMO_PROJECT_NAME,
      path: METAPLEX_DEMO_PROJECT_PATH,
    })
    if (!createRes.ok || !createRes.data) {
      throw new Error(createRes.error ?? 'Could not register the Metaplex demo project.')
    }
    setProjects([createRes.data, ...listRes.data])
    setActiveProject(createRes.data.id, createRes.data.path)
    return createRes.data
  }

  async function handleActivateProject() {
    setBusy('activate')
    setNotice(null)
    try {
      const project = await ensureDemoProject()
      setNotice(`${project.name} is active inside DAEMON.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not activate the Metaplex demo project.')
    } finally {
      setBusy(null)
    }
  }

  async function handleOpenFile(relativePath: string) {
    setBusy(relativePath)
    setNotice(null)
    try {
      const project = await ensureDemoProject()
      const filePath = joinDemoPath(relativePath)
      const fileRes = await daemon.fs.readFile(filePath)
      if (!fileRes.ok || !fileRes.data) {
        throw new Error(fileRes.error ?? `Could not open ${relativePath}.`)
      }
      openFile({
        projectId: project.id,
        path: fileRes.data.path,
        name: relativePath.split('/').pop() ?? relativePath,
        content: fileRes.data.content,
      })
      setCenterMode('canvas')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `Could not open ${relativePath}.`)
    } finally {
      setBusy(null)
    }
  }

  async function handleRunCommand(command: string, label: string) {
    setBusy(command)
    setNotice(null)
    try {
      const project = await ensureDemoProject()
      const terminalRes = await daemon.terminal.create({
        cwd: project.path,
        startupCommand: command,
        userInitiated: true,
      })
      if (!terminalRes.ok || !terminalRes.data) {
        throw new Error(terminalRes.error ?? `Could not run ${command}.`)
      }
      addTerminal(project.id, terminalRes.data.id, label, terminalRes.data.agentId)
      setCenterMode('canvas')
      focusTerminal()
      setNotice(`${label} opened in DAEMON terminal.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `Could not run ${command}.`)
    } finally {
      setBusy(null)
    }
  }

  function updateOperatorDraft<K extends keyof AgentTokenOperatorDraft>(key: K, value: AgentTokenOperatorDraft[K]) {
    setOperatorDraft((current) => ({ ...current, [key]: value }))
  }

  function updateDasInput<K extends keyof DasInspectorInput>(key: K, value: DasInspectorInput[K]) {
    setDasInput((current) => ({ ...current, [key]: value }))
  }

  async function writeJsonAndOpen(relativePath: string, payload: unknown, successMessage: string) {
    const project = await ensureDemoProject()
    const filePath = joinDemoPath(relativePath)
    const content = `${JSON.stringify(payload, null, 2)}\n`
    const writeRes = await daemon.fs.writeFile(filePath, content)
    if (!writeRes.ok) {
      throw new Error(writeRes.error ?? `Could not write ${relativePath}.`)
    }
    openFile({
      projectId: project.id,
      path: filePath,
      name: relativePath.split('/').pop() ?? relativePath,
      content,
    })
    setCenterMode('canvas')
    setNotice(successMessage)
    return { project, filePath }
  }

  async function handleBuildOperatorPlan() {
    setBusy('build-operator-plan')
    setNotice(null)
    try {
      const plan = buildAgentTokenOperatorPlan(operatorDraft)
      await writeJsonAndOpen(
        'operator/agent-token-plan.json',
        plan,
        'Agent Token Operator plan saved. No wallet action was executed.',
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not build the operator plan.')
    } finally {
      setBusy(null)
    }
  }

  async function handleStorePreviewReceipt() {
    setBusy('store-operator-receipt')
    setNotice(null)
    try {
      const project = await ensureDemoProject()
      const receiptsPath = joinDemoPath('operator/receipts/metaplex-agent-token-receipts.json')
      let receipts: unknown[] = []
      const readRes = await daemon.fs.readFile(receiptsPath)
      if (readRes.ok && readRes.data?.content) {
        try {
          const parsed = JSON.parse(readRes.data.content)
          if (Array.isArray(parsed)) receipts = parsed
        } catch {
          receipts = []
        }
      }
      const receipt = buildOperatorReceipt(operatorPreviewPlan)
      const content = `${JSON.stringify([receipt, ...receipts], null, 2)}\n`
      const writeRes = await daemon.fs.writeFile(receiptsPath, content)
      if (!writeRes.ok) {
        throw new Error(writeRes.error ?? 'Could not store the preview receipt.')
      }
      openFile({
        projectId: project.id,
        path: receiptsPath,
        name: 'metaplex-agent-token-receipts.json',
        content,
      })
      setCenterMode('canvas')
      setNotice('Preview receipt stored. It proves review, not execution.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not store the preview receipt.')
    } finally {
      setBusy(null)
    }
  }

  async function handleRunDasInspector() {
    setBusy('run-das-inspector')
    setNotice(null)
    setDasStatus('Preparing read-only DAS request.')
    try {
      const request = buildDasInspectorRequest(dasInput)
      const inspection: Record<string, unknown> = {
        generatedAt: new Date().toISOString(),
        network: operatorDraft.network,
        rpcUrl: dasInput.rpcUrl,
        safetyBoundary: 'Read-only DAS JSON-RPC request. No transaction, wallet signature, mint, launch, register, set-token, or fee claim is sent.',
        request,
        status: request ? 'pending' : 'skipped-missing-target',
        result: null,
      }
      if (request) {
        try {
          const response = await fetch(dasInput.rpcUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(request),
          })
          inspection.status = response.ok ? 'complete' : 'http-error'
          inspection.result = await response.json()
          setDasStatus(response.ok ? `${dasInput.method} completed and was written to disk.` : `${dasInput.method} returned HTTP ${response.status}.`)
        } catch (error) {
          inspection.status = 'request-error'
          inspection.result = { error: error instanceof Error ? error.message : 'DAS request failed.' }
          setDasStatus('DAS request failed; error was written to disk.')
        }
      } else {
        setDasStatus('DAS read skipped because the selected method needs an asset, owner, or collection.')
      }
      await writeJsonAndOpen('operator/das-inspection.json', inspection, 'DAS inspection file updated. No wallet action was executed.')
    } catch (error) {
      setDasStatus(null)
      setNotice(error instanceof Error ? error.message : 'Could not run the DAS inspector.')
    } finally {
      setBusy(null)
    }
  }

  async function handleExecuteCoreAgentAsset() {
    setBusy('execute-core-agent-asset')
    setNotice(null)
    setExecuteStatus('Submitting devnet Core asset write through DAEMON signer.')
    try {
      if (!selectedWallet) {
        throw new Error('Select a DAEMON signing wallet before executing.')
      }
      const res = await daemon.metaplex.createCoreAgentAsset({
        walletId: selectedWallet.id,
        network: 'devnet',
        rpcUrl: operatorDraft.rpcUrl,
        name: operatorPreviewPlan.draft.agentName,
        uri: operatorPreviewPlan.draft.assetUri,
        confirmedAt: Date.now(),
        acknowledgement: executionAck,
      })
      if (!res.ok || !res.data) {
        throw new Error(res.error ?? 'Metaplex Core asset write failed.')
      }
      const executionReceipt = {
        ...res.data,
        planId: operatorPreviewPlan.id,
        agentName: operatorPreviewPlan.draft.agentName,
        agentSymbol: operatorPreviewPlan.draft.agentSymbol,
      }
      const project = await ensureDemoProject()
      const receiptsPath = joinDemoPath('operator/receipts/metaplex-agent-token-receipts.json')
      let receipts: unknown[] = []
      const readRes = await daemon.fs.readFile(receiptsPath)
      if (readRes.ok && readRes.data?.content) {
        try {
          const parsed = JSON.parse(readRes.data.content)
          if (Array.isArray(parsed)) receipts = parsed
        } catch {
          receipts = []
        }
      }
      const content = `${JSON.stringify([executionReceipt, ...receipts], null, 2)}\n`
      const writeRes = await daemon.fs.writeFile(receiptsPath, content)
      if (!writeRes.ok) {
        throw new Error(writeRes.error ?? 'Metaplex write confirmed, but receipt storage failed.')
      }
      openFile({
        projectId: project.id,
        path: receiptsPath,
        name: 'metaplex-agent-token-receipts.json',
        content,
      })
      setCenterMode('canvas')
      setExecutionAck('')
      setExecuteStatus(`Devnet Core asset created: ${res.data.asset}`)
      setNotice(`Metaplex devnet write confirmed: ${res.data.signature.slice(0, 8)}...${res.data.signature.slice(-8)}`)
    } catch (error) {
      setExecuteStatus(error instanceof Error ? error.message : 'Metaplex Core asset write failed.')
      setNotice(error instanceof Error ? error.message : 'Metaplex Core asset write failed.')
    } finally {
      setBusy(null)
    }
  }

  function handleFilter(nextFilter: CategoryFilter) {
    setFilter(nextFilter)
    const next = nextFilter === 'All'
      ? METAPLEX_DEMO_CAPABILITIES[0]
      : METAPLEX_DEMO_CAPABILITIES.find((capability) => capability.category === nextFilter)
    if (next) setSelectedId(next.id)
  }

  return (
    <div className="metaplex-demo-panel">
      <section className="metaplex-demo-head">
        <div>
          <span className="metaplex-demo-kicker">DAEMON / Metaplex</span>
          <h2>Metaplex capability workbench</h2>
          <p>Native DAEMON operator surface for Agent Registry, agent tokens, Genesis launches, creator-fee receipts, Core assets, DAS verification, and CLI handoff.</p>
        </div>
        <div className="metaplex-demo-actions">
          <button type="button" onClick={handleActivateProject} disabled={busy !== null}>
            {busy === 'activate' ? 'Activating...' : 'Activate project'}
          </button>
          <button type="button" onClick={() => void handleOpenFile('docs/MEETING_SCRIPT.md')} disabled={busy !== null}>
            Meeting script
          </button>
          <button type="button" onClick={() => void handleOpenFile('docs/METAPLEX_PARTNERSHIP_MEETING_GUIDE.md')} disabled={busy !== null}>
            Partnership guide
          </button>
          <button type="button" onClick={() => void handleRunCommand('npm run check', 'Metaplex Demo Check')} disabled={busy !== null}>
            Run checks
          </button>
          <button type="button" onClick={() => void handleRunCommand('npm run readiness', 'Metaplex Readiness')} disabled={busy !== null}>
            Readiness
          </button>
        </div>
      </section>

      <section className="metaplex-demo-metrics" aria-label="Metaplex demo metrics">
        <div><strong>{METAPLEX_FOCUS_WORKFLOWS.length}</strong><span>focus workflows</span></div>
        <div><strong>{METAPLEX_DEMO_CAPABILITIES.length}</strong><span>capabilities</span></div>
        <div><strong>{METAPLEX_DEMO_PREVIEWS.length}</strong><span>generated previews</span></div>
        <div><strong>1</strong><span>devnet write gate</span></div>
      </section>

      {notice ? <div className="metaplex-demo-notice">{notice}</div> : null}

      <section className="metaplex-demo-operator" aria-label="Agent Token Operator workbench">
        <div className="metaplex-demo-operator-copy">
          <span className="metaplex-demo-kicker">Agent Token Operator</span>
          <h3>Devnet path for Metaplex agent identity, Genesis launch config, and proof receipts.</h3>
          <p>
            This is the actual product wedge: users prepare the agent, preview the token launch, inspect creator-fee routing,
            run DAS reads, and store receipts before DAEMON ever exposes a wallet signing path.
          </p>
          <div className="metaplex-demo-operator-actions">
            <button type="button" onClick={() => void handleBuildOperatorPlan()} disabled={busy !== null}>
              {busy === 'build-operator-plan' ? 'Building...' : 'Build devnet plan'}
            </button>
            <button type="button" onClick={() => void handleStorePreviewReceipt()} disabled={busy !== null}>
              {busy === 'store-operator-receipt' ? 'Storing...' : 'Store preview receipt'}
            </button>
            <button type="button" onClick={() => void handleRunDasInspector()} disabled={busy !== null}>
              {busy === 'run-das-inspector' ? 'Reading...' : 'Run DAS read'}
            </button>
          </div>
          <div className="metaplex-demo-operator-warning">
            <strong>Execution boundary</strong>
            <p>{operatorPreviewPlan.safetyBoundary}</p>
          </div>
          <div className="metaplex-demo-live-write">
            <strong>Live write enabled: devnet Core asset</strong>
            <p>
              This creates the first real Metaplex object: a Core asset for the agent. Agent Registry, Genesis launch,
              set-token, and creator-fee claims remain blocked until their separate gates are added.
            </p>
            <label>
              <span>Signer wallet</span>
              <select value={selectedWalletId} onChange={(event) => setSelectedWalletId(event.target.value)}>
                {signerWallets.length === 0 ? <option value="">No signing wallets</option> : null}
                {signerWallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name} ({wallet.address.slice(0, 4)}...{wallet.address.slice(-4)})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Type confirmation</span>
              <input
                value={executionAck}
                placeholder={CORE_AGENT_ACKNOWLEDGEMENT}
                onChange={(event) => setExecutionAck(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => void handleExecuteCoreAgentAsset()}
              disabled={busy !== null || !selectedWallet || executionAck !== CORE_AGENT_ACKNOWLEDGEMENT}
            >
              {busy === 'execute-core-agent-asset' ? 'Creating on devnet...' : 'Create devnet Core asset'}
            </button>
            {executeStatus ? <p className="metaplex-demo-das-status">{executeStatus}</p> : null}
          </div>
        </div>

        <div className="metaplex-demo-operator-form">
          <label>
            <span>Agent name</span>
            <input
              value={operatorDraft.agentName}
              onChange={(event) => updateOperatorDraft('agentName', event.target.value)}
            />
          </label>
          <label>
            <span>Token symbol</span>
            <input
              value={operatorDraft.agentSymbol}
              onChange={(event) => updateOperatorDraft('agentSymbol', event.target.value)}
            />
          </label>
          <label>
            <span>Launch type</span>
            <select
              value={operatorDraft.launchType}
              onChange={(event) => updateOperatorDraft('launchType', event.target.value as MetaplexLaunchType)}
            >
              <option value="bonding-curve">Bonding curve</option>
              <option value="launchpool">Launchpool</option>
              <option value="presale">Presale</option>
              <option value="auction">Auction</option>
            </select>
          </label>
          <label>
            <span>Network</span>
            <select
              value={operatorDraft.network}
              onChange={(event) => updateOperatorDraft('network', event.target.value as MetaplexOperatorNetwork)}
            >
              <option value="devnet">Devnet</option>
              <option value="mainnet-beta">Mainnet beta preview</option>
            </select>
          </label>
          <label>
            <span>Creator fee bps</span>
            <input
              type="number"
              min="0"
              max="1000"
              value={operatorDraft.creatorFeeBps}
              onChange={(event) => updateOperatorDraft('creatorFeeBps', Number(event.target.value))}
            />
          </label>
          <label>
            <span>First buy SOL</span>
            <input
              value={operatorDraft.firstBuySol}
              onChange={(event) => updateOperatorDraft('firstBuySol', event.target.value)}
            />
          </label>
          <label className="wide">
            <span>Agent asset URI</span>
            <input
              value={operatorDraft.assetUri}
              onChange={(event) => updateOperatorDraft('assetUri', event.target.value)}
            />
          </label>
          <label className="wide">
            <span>Creator fee recipient</span>
            <input
              value={operatorDraft.creatorFeeRecipient}
              onChange={(event) => updateOperatorDraft('creatorFeeRecipient', event.target.value)}
            />
          </label>
          <label className="wide">
            <span>RPC URL</span>
            <input
              value={operatorDraft.rpcUrl}
              onChange={(event) => {
                updateOperatorDraft('rpcUrl', event.target.value)
                updateDasInput('rpcUrl', event.target.value)
              }}
            />
          </label>
        </div>

        <div className="metaplex-demo-operator-plan">
          <div className="metaplex-demo-operator-plan-head">
            <span>Plan stages</span>
            <strong>{operatorPreviewPlan.status}</strong>
          </div>
          {operatorPreviewPlan.stages.map((stage, index) => (
            <div key={stage.id} className="metaplex-demo-operator-stage">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{stage.title}</strong>
                <p>{stage.daemonCheck}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="metaplex-demo-das-box">
          <div className="metaplex-demo-operator-plan-head">
            <span>DAS inspector</span>
            <strong>read-only</strong>
          </div>
          <label>
            <span>Method</span>
            <select
              value={dasInput.method}
              onChange={(event) => updateDasInput('method', event.target.value as DasInspectorInput['method'])}
            >
              <option value="getAsset">getAsset</option>
              <option value="getAssetsByOwner">getAssetsByOwner</option>
              <option value="getAssetsByGroup">getAssetsByGroup</option>
              <option value="searchAssets">searchAssets</option>
            </select>
          </label>
          <label>
            <span>Asset ID</span>
            <input value={dasInput.assetId} onChange={(event) => updateDasInput('assetId', event.target.value)} />
          </label>
          <label>
            <span>Owner</span>
            <input value={dasInput.owner} onChange={(event) => updateDasInput('owner', event.target.value)} />
          </label>
          <label>
            <span>Collection</span>
            <input value={dasInput.collection} onChange={(event) => updateDasInput('collection', event.target.value)} />
          </label>
          {dasStatus ? <p className="metaplex-demo-das-status">{dasStatus}</p> : null}
        </div>
      </section>

      <section className="metaplex-demo-workflows" aria-label="Current Metaplex focus workflows">
        <div className="metaplex-demo-workflow-list">
          {METAPLEX_FOCUS_WORKFLOWS.map((workflow) => (
            <button
              key={workflow.id}
              type="button"
              className={workflow.id === selectedWorkflow.id ? 'metaplex-demo-workflow-card active' : 'metaplex-demo-workflow-card'}
              onClick={() => {
                setSelectedWorkflowId(workflow.id)
                const nextCapability = METAPLEX_DEMO_CAPABILITIES.find((capability) => workflow.capabilityIds.includes(capability.id))
                if (nextCapability) setSelectedId(nextCapability.id)
              }}
            >
              <span>{getWorkflowStatusLabel(workflow.status)}</span>
              <strong>{workflow.title}</strong>
              <p>{workflow.bestFor}</p>
            </button>
          ))}
        </div>
        <article className="metaplex-demo-workflow-detail">
          <span className="metaplex-demo-kicker">Product flow</span>
          <h3>{selectedWorkflow.title}</h3>
          <p>{selectedWorkflow.bestFor}</p>
          <div className="metaplex-demo-workflow-grid">
            <div>
              <strong>User does</strong>
              <p>{selectedWorkflow.userAction}</p>
            </div>
            <div>
              <strong>DAEMON does</strong>
              <p>{selectedWorkflow.daemonAction}</p>
            </div>
            <div>
              <strong>Proof record</strong>
              <p>{selectedWorkflow.proofRecord}</p>
            </div>
          </div>
          <div className="metaplex-demo-workflow-tags" aria-label="Related capabilities">
            {selectedWorkflowCapabilities.map((capability) => <button key={capability.id} type="button" onClick={() => setSelectedId(capability.id)}>{capability.title}</button>)}
          </div>
          <button type="button" className="metaplex-demo-doc-link" onClick={() => void daemon.shell.openExternal(selectedWorkflow.docsUrl)}>
            Open focus docs
          </button>
        </article>
      </section>

      <section className="metaplex-demo-grid">
        <aside className="metaplex-demo-nav">
          <div className="metaplex-demo-filter" aria-label="Capability filters">
            {CATEGORY_FILTERS.map((category) => (
              <button
                key={category}
                type="button"
                className={filter === category ? 'active' : ''}
                onClick={() => handleFilter(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="metaplex-demo-preview-list">
            <span>Generated previews</span>
            {METAPLEX_DEMO_PREVIEWS.map((preview) => (
              <button key={preview} type="button" onClick={() => void handleOpenFile(preview)} disabled={busy !== null}>
                {preview.split('/').pop()}
              </button>
            ))}
          </div>
        </aside>

        <div className="metaplex-demo-list" aria-label="Metaplex capabilities">
          {groupedCapabilities.map((group) => (
            <section className="metaplex-demo-lane" key={group.lane}>
              <div className="metaplex-demo-lane-head">
                <span>{group.lane}</span>
                <strong>{group.items.length}</strong>
              </div>
              <div className="metaplex-demo-lane-grid">
                {group.items.map((capability) => (
                  <button
                    key={capability.id}
                    type="button"
                    className={capability.id === selected.id ? 'metaplex-demo-card active' : 'metaplex-demo-card'}
                    onClick={() => setSelectedId(capability.id)}
                  >
                    <span>{capability.category}</span>
                    <strong>{capability.title}</strong>
                    <p>{capability.summary}</p>
                    <code>{capability.status}</code>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <article className="metaplex-demo-detail">
          <span className="metaplex-demo-kicker">{selected.category}</span>
          <h3>{selected.title}</h3>
          <p>{selected.summary}</p>
          <div className="metaplex-demo-detail-grid">
            <div>
              <strong>Demo mode</strong>
              <p>{selected.demoMode}</p>
            </div>
            <div>
              <strong>Boundary</strong>
              <p>{METAPLEX_DEMO_BOUNDARY}</p>
            </div>
          </div>
          <div className="metaplex-demo-package-box">
            <strong>Packages</strong>
            {selected.packages.map((packageName) => <code key={packageName}>{packageName}</code>)}
          </div>
          <div className="metaplex-demo-flow">
            {selected.shows.map((step, index) => (
              <div key={step}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
          <div className="metaplex-demo-detail-actions">
            <button type="button" onClick={() => void daemon.shell.openExternal(selected.docsUrl)}>Open docs</button>
            <button type="button" onClick={() => void handleOpenFile('docs/SAFETY_BOUNDARIES.md')} disabled={busy !== null}>Safety boundary</button>
          </div>
        </article>
      </section>
    </div>
  )
}

export default MetaplexDemoPanel
