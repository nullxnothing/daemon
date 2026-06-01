import { useEffect, useMemo, useRef, useState } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useAppActions } from '../../store/appActions'
import { useAgentOpsStore } from '../../store/agentops'
import { useUIStore } from '../../store/ui'
import { useClipboard } from '../../hooks/useClipboard'
import { LiveRegion } from '../../components/LiveRegion'
import './AgentOpsPanel.css'

type AgentOpsNetwork = 'devnet' | 'mainnet-beta'
type AgentOpsTab = 'onboarding' | 'operate' | 'foundry' | 'inspector' | 'receipts'
type BusyAction = 'save' | 'scaffold' | 'mint' | 'register' | 'read' | 'core' | 'sign' | 'inspect' | 'folder' | null

interface AgentOpsDraft {
  name: string
  assetAddress: string
  network: AgentOpsNetwork
  serviceUrl: string
  priceUsdc: string
}

interface AgentOpsRecord extends AgentOpsDraft {
  webManagerUrl: string
  updatedAt: string
}

interface DerivedAccounts {
  agentIdentityPda?: string
  assetSignerPda?: string
}

interface SignerWalletOption {
  id: string
  name: string
  address: string
  isDefault: boolean
}

interface AgentOpsReceipt {
  id: string
  action: string
  title: string
  detail: string
  createdAt: string
  payload: unknown
}

interface InspectorFrame {
  id: string
  direction: 'in' | 'out' | 'system'
  body: string
  createdAt: string
}

const AGENTOPS_WEB_URL = import.meta.env.VITE_AGENTOPS_WEB_URL || 'https://daemon-landing.vercel.app/agentops'
const RECORDS_STORAGE_KEY = 'daemon:agentops:desktop-records'
const RECEIPTS_STORAGE_KEY = 'daemon:agentops:receipts'
const CORE_AGENT_ACKNOWLEDGEMENT = 'CREATE DEVNET CORE ASSET'
const MINT_REGISTERED_AGENT_ACKNOWLEDGEMENT = 'MINT REGISTERED AGENT'
const REGISTER_AGENT_IDENTITY_ACKNOWLEDGEMENT = 'REGISTER AGENT IDENTITY'
const DEFAULT_PROJECT_ROOT = 'C:\\Users\\offic\\Projects'
const DEFAULT_DRAFT: AgentOpsDraft = {
  name: 'DAEMON Auditor',
  assetAddress: '',
  network: 'devnet',
  serviceUrl: 'ws://127.0.0.1:8787/agent',
  priceUsdc: '2.00',
}
const METAPLEX_ONBOARDING_STEPS = [
  ['Skill', 'Load the Metaplex skill so the agent has current protocol context.'],
  ['Mint an Agent', 'Use Metaplex API + Agent Registry SDK to create the Core asset and Agent Identity PDA atomically.'],
  ['Register an Agent', 'Attach an Agent Identity PDA to an existing Core asset with registerIdentityV1.'],
  ['Read Agent Data', 'Verify the Agent Identity PDA before DAEMON trusts runs, payments, or receipts.'],
  ['Agent Finance', 'Activate/fund the Asset Signer PDA used by the agent operational wallet.'],
  ['Agent Commerce', 'Publish x402/payment endpoints and gate runs behind settlement verification.'],
  ['Create an Agent Token', 'Use Genesis after identity and commerce are working.'],
] as const

function isLikelySolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim())
}

function short(value: string, head = 6, tail = 6) {
  if (!value) return ''
  if (value.length <= head + tail + 3) return value
  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

function webNetwork(network: AgentOpsNetwork) {
  return network === 'devnet' ? 'solana-devnet' : 'solana-mainnet'
}

function desktopNetwork(network?: 'solana-devnet' | 'solana-mainnet'): AgentOpsNetwork {
  return network === 'solana-mainnet' ? 'mainnet-beta' : 'devnet'
}

function buildWebManagerUrl(draft: AgentOpsDraft, mode: 'manage' | 'passport' = 'manage') {
  const params = new URLSearchParams({
    mode,
    network: webNetwork(draft.network),
    service: draft.serviceUrl.trim(),
    price: draft.priceUsdc.trim(),
  })
  if (draft.assetAddress.trim()) params.set('asset', draft.assetAddress.trim())
  return `${AGENTOPS_WEB_URL}?${params.toString()}`
}

function buildDaemonLink(draft: AgentOpsDraft) {
  const params = new URLSearchParams({
    network: webNetwork(draft.network),
    service: draft.serviceUrl.trim(),
    price: draft.priceUsdc.trim(),
  })
  if (draft.assetAddress.trim()) params.set('asset', draft.assetAddress.trim())
  return `daemon://agentops/open?${params.toString()}`
}

function buildHandoffRecord(draft: AgentOpsDraft, derived: DerivedAccounts) {
  return {
    product: 'Metaplex AgentOps by DAEMON',
    agentAsset: draft.assetAddress.trim(),
    network: draft.network,
    serviceUrl: draft.serviceUrl.trim(),
    priceUsdc: draft.priceUsdc.trim(),
    webManagerUrl: buildWebManagerUrl(draft),
    passportUrl: buildWebManagerUrl(draft, 'passport'),
    daemonDeepLink: buildDaemonLink(draft),
    derivedAccounts: derived,
  }
}

function safeProjectName(value: string) {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || 'metaplex-agent'
}

function joinWindowsPath(root: string, child: string) {
  return `${root.replace(/[\\/]+$/, '')}\\${child}`
}

function normalizePath(value: string) {
  return value.replace(/\//g, '\\').replace(/\\+$/g, '').toLowerCase()
}

function defaultRoot(activeProjectPath: string | null) {
  if (!activeProjectPath) return DEFAULT_PROJECT_ROOT
  const normalized = activeProjectPath.replace(/\//g, '\\')
  const index = normalized.lastIndexOf('\\')
  return index > 2 ? normalized.slice(0, index) : DEFAULT_PROJECT_ROOT
}

function receiptId() {
  return globalThis.crypto?.randomUUID?.() ?? `agentops-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function buildSiwsMessage(draft: AgentOpsDraft, nonce: string, derived: DerivedAccounts) {
  const issuedAt = new Date().toISOString()
  const domain = (() => {
    try {
      return new URL(draft.serviceUrl).host
    } catch {
      return 'daemon.local'
    }
  })()
  return [
    `${domain} wants you to sign in with your Solana account.`,
    '',
    `Agent: ${draft.name.trim() || 'Unnamed agent'}`,
    `Asset: ${draft.assetAddress.trim() || 'pending'}`,
    `Network: ${webNetwork(draft.network)}`,
    `Agent Identity PDA: ${derived.agentIdentityPda ?? 'pending'}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n')
}

function frame(direction: InspectorFrame['direction'], body: string): InspectorFrame {
  return {
    id: receiptId(),
    direction,
    body,
    createdAt: new Date().toISOString(),
  }
}

function DataRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="agentops-data-row">
      <span>{label}</span>
      <code>{value || 'pending'}</code>
    </div>
  )
}

export function AgentOpsPanel() {
  const [draft, setDraft] = useState<AgentOpsDraft>(DEFAULT_DRAFT)
  const [records, setRecords] = useState<AgentOpsRecord[]>([])
  const [receipts, setReceipts] = useState<AgentOpsReceipt[]>([])
  const [tab, setTab] = useState<AgentOpsTab>('onboarding')
  const [status, setStatus] = useState('Ready')
  const [busy, setBusy] = useState<BusyAction>(null)
  const { copiedKey: copied, copy } = useClipboard({ resetMs: 1400 })
  const [signerWallets, setSignerWallets] = useState<SignerWalletOption[]>([])
  const [selectedWalletId, setSelectedWalletId] = useState('')
  const [projectName, setProjectName] = useState('daemon-metaplex-agent')
  const [projectRoot, setProjectRoot] = useState(DEFAULT_PROJECT_ROOT)
  const [assetUri, setAssetUri] = useState('https://arweave.net/daemon-agent.json')
  const [agentDescription, setAgentDescription] = useState('Metaplex-registered DAEMON agent for signed work, service discovery, payments, and receipts.')
  const [agentRegistrationUri, setAgentRegistrationUri] = useState('https://arweave.net/daemon-agent-registration.json')
  const [executionAck, setExecutionAck] = useState('')
  const [inspectorFrames, setInspectorFrames] = useState<InspectorFrame[]>([])
  const [inspectorMessage, setInspectorMessage] = useState('{"type":"agentops.status"}')
  const [derived, setDerived] = useState<DerivedAccounts>({})
  const wsRef = useRef<WebSocket | null>(null)
  const handledOpenRequestRef = useRef<string | null>(null)

  const openRequest = useAgentOpsStore((state) => state.openRequest)
  const clearOpenRequest = useAgentOpsStore((state) => state.clearOpenRequest)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const setProjects = useUIStore((s) => s.setProjects)
  const setActiveProject = useUIStore((s) => s.setActiveProject)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const setCenterMode = useUIStore((s) => s.setCenterMode)
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)
  const focusTerminal = useAppActions((s) => s.focusTerminal)

  const selectedWallet = signerWallets.find((wallet) => wallet.id === selectedWalletId) ?? null
  const hasAsset = isLikelySolanaAddress(draft.assetAddress)
  const webManagerUrl = useMemo(() => buildWebManagerUrl(draft), [draft])
  const passportUrl = useMemo(() => buildWebManagerUrl(draft, 'passport'), [draft])
  const daemonLink = useMemo(() => buildDaemonLink(draft), [draft])
  const foundrySlug = safeProjectName(projectName)
  const foundryPath = joinWindowsPath(projectRoot, foundrySlug)

  useEffect(() => {
    setProjectRoot(defaultRoot(activeProjectPath))
  }, [activeProjectPath])

  useEffect(() => {
    let cancelled = false
    const assetAddress = draft.assetAddress.trim()
    if (!isLikelySolanaAddress(assetAddress)) {
      setDerived({})
      return () => {
        cancelled = true
      }
    }

    daemon.agentops.deriveAccounts(assetAddress)
      .then((res) => {
        if (!cancelled) setDerived(res.ok && res.data ? res.data : {})
      })
      .catch(() => {
        if (!cancelled) setDerived({})
      })

    return () => {
      cancelled = true
    }
  }, [draft.assetAddress])

  useEffect(() => {
    try {
      const rawRecords = window.localStorage.getItem(RECORDS_STORAGE_KEY)
      const rawReceipts = window.localStorage.getItem(RECEIPTS_STORAGE_KEY)
      setRecords(rawRecords ? JSON.parse(rawRecords) as AgentOpsRecord[] : [])
      setReceipts(rawReceipts ? JSON.parse(rawReceipts) as AgentOpsReceipt[] : [])
    } catch {
      setRecords([])
      setReceipts([])
    }
  }, [])

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

  useEffect(() => {
    if (!openRequest || handledOpenRequestRef.current === openRequest.receivedAt) return
    handledOpenRequestRef.current = openRequest.receivedAt
    setDraft((current) => ({
      ...current,
      assetAddress: openRequest.asset ?? current.assetAddress,
      network: desktopNetwork(openRequest.network),
      serviceUrl: openRequest.service ?? current.serviceUrl,
      priceUsdc: openRequest.price ?? current.priceUsdc,
    }))
    setTab('operate')
    setStatus('Opened from website handoff.')
    addReceipt('web-handoff', 'Website handoff received', openRequest.asset ?? 'No asset supplied', openRequest)
    clearOpenRequest(openRequest.receivedAt)
  }, [clearOpenRequest, openRequest])

  function updateDraft<K extends keyof AgentOpsDraft>(key: K, value: AgentOpsDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function addReceipt(action: string, title: string, detail: string, payload: unknown) {
    const nextReceipt: AgentOpsReceipt = {
      id: receiptId(),
      action,
      title,
      detail,
      payload,
      createdAt: new Date().toISOString(),
    }
    setReceipts((current) => {
      const next = [nextReceipt, ...current].slice(0, 40)
      window.localStorage.setItem(RECEIPTS_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  function saveRecord() {
    if (!hasAsset) {
      setStatus('Paste or create a valid Core asset first.')
      return
    }
    setBusy('save')
    const nextRecord: AgentOpsRecord = {
      ...draft,
      assetAddress: draft.assetAddress.trim(),
      serviceUrl: draft.serviceUrl.trim(),
      priceUsdc: draft.priceUsdc.trim(),
      webManagerUrl,
      updatedAt: new Date().toISOString(),
    }
    const nextRecords = [nextRecord, ...records.filter((record) => record.assetAddress !== nextRecord.assetAddress)].slice(0, 8)
    setRecords(nextRecords)
    window.localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(nextRecords))
    addReceipt('agentops-save', 'AgentOps record saved', nextRecord.assetAddress, buildHandoffRecord(nextRecord, derived))
    setStatus('AgentOps record saved.')
    setBusy(null)
  }

  function copyValue(kind: string, value: string) {
    void copy(value, kind)
  }

  async function pickProjectRoot() {
    setBusy('folder')
    try {
      const res = await daemon.projects.openDialog()
      if (res.ok && res.data) setProjectRoot(res.data)
    } finally {
      setBusy(null)
    }
  }

  async function ensureProject(name: string, projectPath: string): Promise<Project> {
    const listRes = await daemon.projects.list()
    if (!listRes.ok || !listRes.data) throw new Error(listRes.error ?? 'Could not read DAEMON projects.')
    const existing = listRes.data.find((project) => normalizePath(project.path) === normalizePath(projectPath))
    if (existing) {
      setProjects([existing, ...listRes.data.filter((project) => project.id !== existing.id)])
      setActiveProject(existing.id, existing.path)
      return existing
    }
    const createRes = await daemon.projects.create({ name, path: projectPath })
    if (!createRes.ok || !createRes.data) throw new Error(createRes.error ?? 'Could not register AgentOps project.')
    setProjects([createRes.data, ...listRes.data])
    setActiveProject(createRes.data.id, createRes.data.path)
    return createRes.data
  }

  async function scaffoldAgent() {
    setBusy('scaffold')
    try {
      const project = await ensureProject(foundrySlug, foundryPath)
      const command = `npx create-metaplex-agent ${foundrySlug}`
      const terminalRes = await daemon.terminal.create({
        cwd: projectRoot,
        startupCommand: command,
        userInitiated: true,
        isAgent: true,
      })
      if (!terminalRes.ok || !terminalRes.data) throw new Error(terminalRes.error ?? 'Could not open AgentOps terminal.')
      addTerminal(project.id, terminalRes.data.id, 'Metaplex Agent Foundry', terminalRes.data.agentId)
      setCenterMode('canvas')
      focusTerminal()
      setStatus('Metaplex agent scaffold started in terminal.')
      addReceipt('foundry-scaffold', 'Metaplex agent scaffold started', foundryPath, { command, cwd: projectRoot, project })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not scaffold Metaplex agent.')
    } finally {
      setBusy(null)
    }
  }

  async function createDevnetAsset() {
    setBusy('core')
    try {
      if (!selectedWallet) throw new Error('Select a signing wallet first.')
      const res = await daemon.metaplex.createCoreAgentAsset({
        walletId: selectedWallet.id,
        network: 'devnet',
        rpcUrl: 'https://api.devnet.solana.com',
        name: draft.name.slice(0, 32),
        uri: assetUri,
        confirmedAt: Date.now(),
        acknowledgement: executionAck,
      })
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Metaplex Core asset write failed.')
      updateDraft('assetAddress', res.data.asset)
      updateDraft('network', 'devnet')
      setExecutionAck('')
      setStatus(`Devnet Core asset created: ${short(res.data.asset)}`)
      addReceipt('metaplex-core-create', 'Devnet Core asset created', res.data.asset, res.data)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Metaplex Core asset write failed.')
    } finally {
      setBusy(null)
    }
  }

  async function mintRegisteredAgent() {
    setBusy('mint')
    try {
      if (!selectedWallet) throw new Error('Select a signing wallet first.')
      const res = await daemon.metaplex.mintRegisteredAgent({
        walletId: selectedWallet.id,
        network: 'devnet',
        rpcUrl: 'https://api.devnet.solana.com',
        name: draft.name.slice(0, 32),
        description: agentDescription,
        uri: assetUri,
        serviceUrl: draft.serviceUrl,
        priceUsdc: draft.priceUsdc,
        confirmedAt: Date.now(),
        acknowledgement: executionAck,
      })
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Metaplex agent mint/register failed.')
      updateDraft('assetAddress', res.data.asset)
      updateDraft('network', 'devnet')
      setExecutionAck('')
      setStatus(`Registered Metaplex agent: ${short(res.data.asset)}`)
      addReceipt('metaplex-agent-mint-register', 'Metaplex agent minted and registered', res.data.asset, res.data)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Metaplex agent mint/register failed.')
    } finally {
      setBusy(null)
    }
  }

  async function registerExistingAgentIdentity() {
    setBusy('register')
    try {
      if (!selectedWallet) throw new Error('Select a signing wallet first.')
      if (!hasAsset) throw new Error('Paste a valid Core asset first.')
      const res = await daemon.metaplex.registerAgentIdentity({
        walletId: selectedWallet.id,
        network: 'devnet',
        rpcUrl: 'https://api.devnet.solana.com',
        assetAddress: draft.assetAddress.trim(),
        agentRegistrationUri,
        confirmedAt: Date.now(),
        acknowledgement: executionAck,
      })
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Agent identity registration failed.')
      setExecutionAck('')
      setStatus(`Agent Identity registered: ${short(res.data.agentIdentityPda)}`)
      addReceipt('metaplex-agent-register-identity', 'Agent Identity registered', res.data.agentIdentityPda, res.data)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Agent identity registration failed.')
    } finally {
      setBusy(null)
    }
  }

  async function readAgentIdentity() {
    setBusy('read')
    try {
      if (!hasAsset) throw new Error('Paste a valid Core asset first.')
      const res = await daemon.metaplex.readAgentIdentity({
        network: draft.network,
        rpcUrl: draft.network === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com',
        assetAddress: draft.assetAddress.trim(),
      })
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Could not read Agent Identity.')
      setStatus(res.data.registered ? `Agent Identity verified: ${short(res.data.agentIdentityPda)}` : 'No Agent Identity PDA found for this asset.')
      addReceipt('metaplex-agent-read-identity', res.data.registered ? 'Agent Identity verified' : 'Agent Identity missing', res.data.agentIdentityPda, res.data)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not read Agent Identity.')
    } finally {
      setBusy(null)
    }
  }

  async function signPassport() {
    setBusy('sign')
    try {
      if (!selectedWallet) throw new Error('Select a signing wallet first.')
      const nonce = receiptId().replace(/-/g, '')
      const message = buildSiwsMessage(draft, nonce, derived)
      const res = await daemon.wallet.signMessage(selectedWallet.id, message)
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Wallet signing failed.')
      const payload = { ...res.data, asset: draft.assetAddress.trim(), network: webNetwork(draft.network), nonce }
      addReceipt('siws-passport-sign', 'Agent passport signed', res.data.walletAddress, payload)
      await copyValue('signature', JSON.stringify(payload, null, 2))
      setStatus('Agent passport signature copied.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Wallet signing failed.')
    } finally {
      setBusy(null)
    }
  }

  function appendFrame(nextFrame: InspectorFrame) {
    setInspectorFrames((current) => [nextFrame, ...current].slice(0, 18))
  }

  function connectInspector() {
    setBusy('inspect')
    try {
      wsRef.current?.close()
      const ws = new WebSocket(draft.serviceUrl.trim())
      wsRef.current = ws
      ws.onopen = () => {
        const hello = {
          type: 'agentops.hello',
          asset: draft.assetAddress.trim() || null,
          network: webNetwork(draft.network),
          agentIdentityPda: derived.agentIdentityPda ?? null,
        }
        ws.send(JSON.stringify(hello))
        appendFrame(frame('system', 'connected'))
        appendFrame(frame('out', JSON.stringify(hello)))
        setBusy(null)
      }
      ws.onerror = () => {
        appendFrame(frame('system', 'connection error'))
        setBusy(null)
      }
      ws.onclose = () => appendFrame(frame('system', 'closed'))
      ws.onmessage = async (event) => {
        const body = String(event.data)
        appendFrame(frame('in', body))
        const parsed = parseJson(body)
        const challengeMessage = parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string'
          ? parsed.message
          : null
        const nonce = parsed && typeof parsed === 'object' && 'nonce' in parsed && typeof parsed.nonce === 'string'
          ? parsed.nonce
          : receiptId().replace(/-/g, '')
        const isChallenge = parsed && typeof parsed === 'object' && (
          ('type' in parsed && String(parsed.type).toLowerCase().includes('challenge')) || challengeMessage !== null
        )
        if (!isChallenge || !selectedWallet) return
        const message = challengeMessage ?? buildSiwsMessage(draft, nonce, derived)
        const res = await daemon.wallet.signMessage(selectedWallet.id, message)
        if (!res.ok || !res.data) {
          appendFrame(frame('system', res.error ?? 'signing failed'))
          return
        }
        const response = {
          type: 'agentops.auth',
          publicKey: res.data.walletAddress,
          signature: res.data.signatureBase58,
          message: res.data.message,
          asset: draft.assetAddress.trim() || null,
          network: webNetwork(draft.network),
          agentIdentityPda: derived.agentIdentityPda ?? null,
        }
        ws.send(JSON.stringify(response))
        appendFrame(frame('out', JSON.stringify(response)))
        addReceipt('inspector-auth', 'Inspector challenge signed', res.data.walletAddress, response)
      }
    } catch (error) {
      setBusy(null)
      setStatus(error instanceof Error ? error.message : 'Inspector connection failed.')
    }
  }

  function sendInspectorMessage() {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setStatus('Connect the inspector first.')
      return
    }
    ws.send(inspectorMessage)
    appendFrame(frame('out', inspectorMessage))
  }

  const handoffRecord = useMemo(() => buildHandoffRecord(draft, derived), [derived, draft])

  return (
    <div className="agentops-panel">
      <LiveRegion message={copied ? `${copied} copied to clipboard` : ''} />
      <section className="agentops-card">
        <header className="agentops-card-head">
          <div>
            <span>Metaplex AgentOps by DAEMON</span>
            <h2>{draft.name || 'AgentOps'}</h2>
          </div>
          <div className="agentops-status-pill" data-ready={hasAsset ? 'true' : 'false'}>
            {status}
          </div>
        </header>

        <nav className="agentops-tabs" aria-label="AgentOps sections">
          {(['onboarding', 'operate', 'foundry', 'inspector', 'receipts'] as AgentOpsTab[]).map((item) => (
            <button key={item} type="button" data-active={tab === item ? 'true' : 'false'} onClick={() => setTab(item)}>
              {item}
            </button>
          ))}
        </nav>

        <div className="agentops-card-grid">
          <main className="agentops-card-main">
            {tab === 'onboarding' && (
              <div className="agentops-section-stack">
                <div className="agentops-step-list">
                  {METAPLEX_ONBOARDING_STEPS.map(([title, detail], index) => (
                    <div key={title} className="agentops-step-card">
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{title}</strong>
                      <p>{detail}</p>
                    </div>
                  ))}
                </div>

                <div className="agentops-data-grid">
                  <DataRow label="Core asset" value={hasAsset ? draft.assetAddress.trim() : undefined} />
                  <DataRow label="Agent Identity PDA" value={derived.agentIdentityPda} />
                  <DataRow label="Asset Signer PDA" value={derived.assetSignerPda} />
                  <DataRow label="Service discovery" value={draft.serviceUrl.trim()} />
                  <DataRow label="Commerce price" value={draft.priceUsdc.trim() ? `${draft.priceUsdc.trim()} USDC` : undefined} />
                  <DataRow label="Token launch" value={hasAsset ? 'Genesis-ready after identity verification' : undefined} />
                </div>

                <div className="agentops-actions">
                  <button type="button" onClick={() => void mintRegisteredAgent()} disabled={!selectedWallet || busy === 'mint'}>
                    Mint + register
                  </button>
                  <button type="button" onClick={() => void registerExistingAgentIdentity()} disabled={!selectedWallet || !hasAsset || busy === 'register'}>
                    Register existing
                  </button>
                  <button type="button" onClick={() => void readAgentIdentity()} disabled={!hasAsset || busy === 'read'}>
                    Read identity
                  </button>
                  <button type="button" onClick={() => void daemon.shell.openExternal('https://www.metaplex.com/docs/agents/agent-onboarding')}>
                    Docs
                  </button>
                </div>
              </div>
            )}

            {tab === 'operate' && (
              <div className="agentops-section-stack">
                <div className="agentops-field-grid">
                  <label>
                    <span>Agent name</span>
                    <input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} />
                  </label>
                  <label>
                    <span>Network</span>
                    <select value={draft.network} onChange={(event) => updateDraft('network', event.target.value as AgentOpsNetwork)}>
                      <option value="devnet">Devnet</option>
                      <option value="mainnet-beta">Mainnet</option>
                    </select>
                  </label>
                </div>

                <label>
                  <span>Metaplex Core agent asset</span>
                  <input
                    value={draft.assetAddress}
                    placeholder="Core asset address"
                    onChange={(event) => updateDraft('assetAddress', event.target.value)}
                  />
                </label>

                <div className="agentops-field-grid">
                  <label>
                    <span>Service endpoint</span>
                    <input value={draft.serviceUrl} onChange={(event) => updateDraft('serviceUrl', event.target.value)} />
                  </label>
                  <label>
                    <span>USDC price</span>
                    <input value={draft.priceUsdc} onChange={(event) => updateDraft('priceUsdc', event.target.value)} />
                  </label>
                </div>

                <div className="agentops-actions">
                  <button type="button" onClick={saveRecord} disabled={busy === 'save'}>Save</button>
                  <button type="button" onClick={() => void daemon.shell.openExternal(webManagerUrl)}>Website</button>
                  <button type="button" onClick={() => void daemon.shell.openExternal(passportUrl)}>Passport</button>
                  <button type="button" onClick={() => void copyValue('handoff', JSON.stringify(handoffRecord, null, 2))}>
                    {copied === 'handoff' ? 'Copied' : 'Copy JSON'}
                  </button>
                </div>

                <div className="agentops-data-grid">
                  <DataRow label="Agent Identity PDA" value={derived.agentIdentityPda} />
                  <DataRow label="Asset Signer PDA" value={derived.assetSignerPda} />
                  <DataRow label="DAEMON link" value={daemonLink} />
                  <DataRow label="Web manager" value={webManagerUrl} />
                </div>
              </div>
            )}

            {tab === 'foundry' && (
              <div className="agentops-section-stack">
                <div className="agentops-field-grid">
                  <label>
                    <span>Project name</span>
                    <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
                  </label>
                  <label>
                    <span>Template</span>
                    <select defaultValue="agent-service">
                      <option value="agent-service">Agent service</option>
                      <option value="agent-wallet">Wallet-gated agent</option>
                      <option value="agent-market">Agent marketplace</option>
                    </select>
                  </label>
                </div>
                <label>
                  <span>Project root</span>
                  <input value={projectRoot} onChange={(event) => setProjectRoot(event.target.value)} />
                </label>
                <div className="agentops-inline-plan">
                  <strong>{foundrySlug}</strong>
                  <code>{foundryPath}</code>
                  <span>npx create-metaplex-agent {foundrySlug}</span>
                </div>
                <div className="agentops-actions">
                  <button type="button" onClick={() => void pickProjectRoot()} disabled={busy === 'folder'}>Folder</button>
                  <button type="button" onClick={() => void scaffoldAgent()} disabled={busy === 'scaffold'}>Scaffold</button>
                  <button type="button" onClick={() => openWorkspaceTool('metaplex-demo')}>Advanced</button>
                </div>
              </div>
            )}

            {tab === 'inspector' && (
              <div className="agentops-section-stack">
                <div className="agentops-field-grid">
                  <label>
                    <span>Signing wallet</span>
                    <select value={selectedWalletId} onChange={(event) => setSelectedWalletId(event.target.value)}>
                      {signerWallets.length === 0 ? <option value="">No signing wallets</option> : null}
                      {signerWallets.map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          {wallet.name} ({short(wallet.address, 4, 4)})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Inspector endpoint</span>
                    <input value={draft.serviceUrl} onChange={(event) => updateDraft('serviceUrl', event.target.value)} />
                  </label>
                </div>

                <label>
                  <span>Message</span>
                  <textarea value={inspectorMessage} onChange={(event) => setInspectorMessage(event.target.value)} />
                </label>

                <div className="agentops-actions">
                  <button type="button" onClick={() => void signPassport()} disabled={!selectedWallet || busy === 'sign'}>
                    {copied === 'signature' ? 'Copied' : 'Sign passport'}
                  </button>
                  <button type="button" onClick={connectInspector} disabled={busy === 'inspect'}>Connect</button>
                  <button type="button" onClick={sendInspectorMessage}>Send</button>
                </div>

                <div className="agentops-log">
                  {inspectorFrames.length === 0 ? <span>No inspector frames yet.</span> : null}
                  {inspectorFrames.map((item) => (
                    <div key={item.id} data-direction={item.direction}>
                      <span>{item.direction}</span>
                      <code>{item.body}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'receipts' && (
              <div className="agentops-section-stack">
                <div className="agentops-receipts">
                  {receipts.length === 0 ? <p>No AgentOps receipts yet.</p> : null}
                  {receipts.map((receipt) => (
                    <button
                      key={receipt.id}
                      type="button"
                      onClick={() => void copyValue(receipt.id, JSON.stringify(receipt, null, 2))}
                    >
                      <strong>{receipt.title}</strong>
                      <span>{receipt.detail}</span>
                      <time>{new Date(receipt.createdAt).toLocaleString()}</time>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </main>

          <aside className="agentops-card-rail">
            <section className="agentops-rail-section">
              <h3>Agent onboarding</h3>
              <label>
                <span>Description</span>
                <textarea value={agentDescription} onChange={(event) => setAgentDescription(event.target.value)} />
              </label>
              <label>
                <span>Metadata URI</span>
                <input value={assetUri} onChange={(event) => setAssetUri(event.target.value)} />
              </label>
              <label>
                <span>Registration URI</span>
                <input value={agentRegistrationUri} onChange={(event) => setAgentRegistrationUri(event.target.value)} />
              </label>
              <label>
                <span>Acknowledgement</span>
                <input value={executionAck} placeholder={MINT_REGISTERED_AGENT_ACKNOWLEDGEMENT} onChange={(event) => setExecutionAck(event.target.value)} />
              </label>
              <label>
                <span>Signer</span>
                <select value={selectedWalletId} onChange={(event) => setSelectedWalletId(event.target.value)}>
                  {signerWallets.length === 0 ? <option value="">No signing wallets</option> : null}
                  {signerWallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name} ({short(wallet.address, 4, 4)})
                    </option>
                  ))}
                </select>
              </label>
              <div className="agentops-ack-list">
                <code>{MINT_REGISTERED_AGENT_ACKNOWLEDGEMENT}</code>
                <code>{REGISTER_AGENT_IDENTITY_ACKNOWLEDGEMENT}</code>
                <code>{CORE_AGENT_ACKNOWLEDGEMENT}</code>
              </div>
              <div className="agentops-rail-actions">
                <button type="button" onClick={() => void mintRegisteredAgent()} disabled={!selectedWallet || busy === 'mint'}>
                  Mint + register
                </button>
                <button type="button" onClick={() => void registerExistingAgentIdentity()} disabled={!selectedWallet || !hasAsset || busy === 'register'}>
                  Register existing
                </button>
                <button type="button" onClick={() => void readAgentIdentity()} disabled={!hasAsset || busy === 'read'}>
                  Read identity
                </button>
                <button type="button" onClick={() => void createDevnetAsset()} disabled={!selectedWallet || busy === 'core'}>
                  Core only
                </button>
              </div>
            </section>

            <section className="agentops-rail-section">
              <h3>Saved agents</h3>
              <div className="agentops-record-list">
                {records.length === 0 ? <p>No local records.</p> : null}
                {records.map((record) => (
                  <button
                    key={`${record.network}-${record.assetAddress}`}
                    type="button"
                    onClick={() => {
                      setDraft({
                        name: record.name,
                        assetAddress: record.assetAddress,
                        network: record.network,
                        serviceUrl: record.serviceUrl,
                        priceUsdc: record.priceUsdc,
                      })
                      setStatus('AgentOps record loaded.')
                    }}
                  >
                    <strong>{record.name}</strong>
                    <code>{short(record.assetAddress)}</code>
                    <span>{record.network}</span>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </div>
  )
}
