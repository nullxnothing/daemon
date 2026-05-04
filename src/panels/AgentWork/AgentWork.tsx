import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banner, PanelHeader, Stat } from '../../components/Panel'
import { EmptyState } from '../../components/EmptyState'
import { useUIStore } from '../../store/ui'
import './AgentWork.css'

const DEFAULT_ACCEPTANCE = 'Verifier can reproduce the change, required tests pass, and the diff matches the task prompt.'

type AgentWalletOption = {
  id: string
  name: string
  address: string
  agent_id: string
  wallet_type: string
}

function formatSol(value: number): string {
  if (value === 0) return '0 SOL'
  if (value < 0.001) return `${value.toFixed(6)} SOL`
  return `${value.toFixed(3)} SOL`
}

function shortHash(hash: string | null | undefined): string {
  if (!hash) return '-'
  return hash.length > 14 ? `${hash.slice(0, 7)}...${hash.slice(-5)}` : hash
}

function statusLabel(status: AgentWorkTask['status']): string {
  return status.replace('-', ' ')
}

function buildAgentPrompt(task: AgentWorkTask): string {
  return [
    'DAEMON agent work task',
    '',
    `Task ID: ${task.id}`,
    `Title: ${task.title}`,
    `Bounty: ${formatSol(task.bounty_sol)}`,
    `Repo hash: ${task.repo_hash}`,
    `Prompt hash: ${task.prompt_hash}`,
    `Acceptance hash: ${task.acceptance_hash}`,
    '',
    'Task prompt:',
    task.prompt,
    '',
    'Acceptance criteria:',
    task.acceptance,
    '',
    'Work in the current repo. When finished, leave the diff ready for review and summarize the tests you ran. DAEMON will submit a signed work receipt from the commit, diff, test, and artifact hashes.',
  ].join('\n')
}

function latestRegistrySignature(task: AgentWorkTask): string | null {
  return [
    task.settled_signature,
    task.review_signature,
    task.receipt_signature,
    task.start_signature,
    task.create_signature,
  ].find((signature) => signature && !signature.startsWith('local:')) ?? null
}

const DEMO_TASKS: AgentWorkTask[] = [
  {
    id: 'demo-1',
    title: 'Implement WebSocket reconnection logic',
    prompt: 'Add automatic reconnection to the WebSocket client with exponential backoff. Include connection state tracking and emit events for connect/disconnect/error states.',
    acceptance: 'Tests pass for connection retry, backoff timing is correct, and the integration works in the dev environment.',
    project_id: 'demo-project-1',
    project_name: 'DAEMON',
    project_path: 'C:\\Users\\offic\\Projects\\DAEMON',
    wallet_id: 'demo-wallet-1',
    wallet_name: 'Dev Wallet',
    wallet_address: 'EaGxK...8pMz',
    agent_id: 'solana-agent',
    agent_name: 'Solana Agent',
    agent_wallet_id: 'demo-agent-wallet-1',
    agent_wallet_address: 'Fv2nQ...7kLp',
    verifier_wallet: 'EaGxK...8pMz',
    repo_hash: 'a3f7d82',
    prompt_hash: 'b9e4c31',
    acceptance_hash: 'c2d8f45',
    bounty_lamports: 100000000,
    bounty_sol: 0.1,
    deadline_at: null,
    onchain_task_id: 'GxT8p...9wQm',
    create_signature: '5kR9p...7mNx',
    start_signature: '4nP8w...3qLz',
    receipt_signature: '2mK7v...8rTy',
    review_signature: '9jH6s...4pWq',
    status: 'settled',
    session_id: 'session-demo-1',
    commit_hash: 'd4f9a21',
    diff_hash: 'e8c3b67',
    tests_hash: 'f1d7e92',
    artifact_uri: 'ipfs://Qm...abc',
    submitted_at: Date.now() - 3600000,
    approved_at: Date.now() - 1800000,
    settled_signature: '7tG5r...2kMn',
    created_at: Date.now() - 7200000,
    updated_at: Date.now() - 1800000,
  },
  {
    id: 'demo-2',
    title: 'Fix memory leak in terminal panel',
    prompt: 'Identify and fix the memory leak occurring when terminals are frequently opened and closed. Add proper cleanup in useEffect hooks.',
    acceptance: 'Memory usage stays stable when opening/closing 50+ terminals. No leaked event listeners.',
    project_id: 'demo-project-1',
    project_name: 'DAEMON',
    project_path: 'C:\\Users\\offic\\Projects\\DAEMON',
    wallet_id: 'demo-wallet-1',
    wallet_name: 'Dev Wallet',
    wallet_address: 'EaGxK...8pMz',
    agent_id: 'solana-agent',
    agent_name: 'Solana Agent',
    agent_wallet_id: 'demo-agent-wallet-1',
    agent_wallet_address: 'Fv2nQ...7kLp',
    verifier_wallet: 'EaGxK...8pMz',
    repo_hash: 'a3f7d82',
    prompt_hash: 'c5a9f14',
    acceptance_hash: 'd7b2e38',
    bounty_lamports: 150000000,
    bounty_sol: 0.15,
    deadline_at: null,
    onchain_task_id: 'HyU9q...8xRn',
    create_signature: '6lS8q...4nPx',
    start_signature: '3mN7v...9rUz',
    receipt_signature: '8pL4s...2wTq',
    review_signature: null,
    status: 'approved',
    session_id: 'session-demo-2',
    commit_hash: 'e5g8b32',
    diff_hash: 'f9d4c78',
    tests_hash: 'g2e8f03',
    artifact_uri: 'ipfs://Qm...def',
    submitted_at: Date.now() - 1800000,
    approved_at: Date.now() - 900000,
    settled_signature: null,
    created_at: Date.now() - 5400000,
    updated_at: Date.now() - 900000,
  },
  {
    id: 'demo-3',
    title: 'Add syntax highlighting to code diffs',
    prompt: 'Integrate a syntax highlighter for the code diff viewer. Support TypeScript, Rust, and Python.',
    acceptance: 'Diffs render with correct syntax highlighting. Performance is acceptable for large diffs.',
    project_id: 'demo-project-1',
    project_name: 'DAEMON',
    project_path: 'C:\\Users\\offic\\Projects\\DAEMON',
    wallet_id: 'demo-wallet-1',
    wallet_name: 'Dev Wallet',
    wallet_address: 'EaGxK...8pMz',
    agent_id: 'solana-agent',
    agent_name: 'Solana Agent',
    agent_wallet_id: 'demo-agent-wallet-1',
    agent_wallet_address: 'Fv2nQ...7kLp',
    verifier_wallet: 'EaGxK...8pMz',
    repo_hash: 'a3f7d82',
    prompt_hash: 'e6b1g25',
    acceptance_hash: 'f8c3h49',
    bounty_lamports: 80000000,
    bounty_sol: 0.08,
    deadline_at: null,
    onchain_task_id: 'JzV0r...7yTp',
    create_signature: '7mT9r...5oQy',
    start_signature: '4nO8w...0qMz',
    receipt_signature: '9qM5t...3rVw',
    review_signature: null,
    status: 'submitted',
    session_id: 'session-demo-3',
    commit_hash: 'f6h9c43',
    diff_hash: 'g0e5d89',
    tests_hash: 'h3f9g14',
    artifact_uri: null,
    submitted_at: Date.now() - 900000,
    approved_at: null,
    settled_signature: null,
    created_at: Date.now() - 3600000,
    updated_at: Date.now() - 900000,
  },
  {
    id: 'demo-4',
    title: 'Optimize database query performance',
    prompt: 'Add indexes to frequently queried columns in the agent_work table. Measure query time before and after.',
    acceptance: 'Query time reduced by at least 50%. All existing tests still pass.',
    project_id: 'demo-project-1',
    project_name: 'DAEMON',
    project_path: 'C:\\Users\\offic\\Projects\\DAEMON',
    wallet_id: 'demo-wallet-1',
    wallet_name: 'Dev Wallet',
    wallet_address: 'EaGxK...8pMz',
    agent_id: 'solana-agent',
    agent_name: 'Solana Agent',
    agent_wallet_id: 'demo-agent-wallet-1',
    agent_wallet_address: 'Fv2nQ...7kLp',
    verifier_wallet: 'EaGxK...8pMz',
    repo_hash: 'a3f7d82',
    prompt_hash: 'g7c2h36',
    acceptance_hash: 'h9d4i50',
    bounty_lamports: 50000000,
    bounty_sol: 0.05,
    deadline_at: null,
    onchain_task_id: 'KaW1s...6zUq',
    create_signature: '8nU0s...6pRz',
    start_signature: '5oP9x...1rNa',
    receipt_signature: null,
    review_signature: null,
    status: 'running',
    session_id: 'session-demo-4',
    commit_hash: null,
    diff_hash: null,
    tests_hash: null,
    artifact_uri: null,
    submitted_at: null,
    approved_at: null,
    settled_signature: null,
    created_at: Date.now() - 1800000,
    updated_at: Date.now() - 600000,
  },
  {
    id: 'demo-5',
    title: 'Build transaction batching system',
    prompt: 'Create a system to batch multiple Solana transactions into versioned transactions for better efficiency.',
    acceptance: 'Can batch up to 8 transactions. Verifier can replay batched transactions on devnet.',
    project_id: 'demo-project-2',
    project_name: 'Solana DApp',
    project_path: 'C:\\Users\\offic\\Projects\\solana-dapp',
    wallet_id: 'demo-wallet-1',
    wallet_name: 'Dev Wallet',
    wallet_address: 'EaGxK...8pMz',
    agent_id: 'solana-agent',
    agent_name: 'Solana Agent',
    agent_wallet_id: 'demo-agent-wallet-1',
    agent_wallet_address: 'Fv2nQ...7kLp',
    verifier_wallet: 'EaGxK...8pMz',
    repo_hash: 'b4g8e93',
    prompt_hash: 'h8d3i47',
    acceptance_hash: 'i0e5j61',
    bounty_lamports: 200000000,
    bounty_sol: 0.2,
    deadline_at: null,
    onchain_task_id: 'LbX2t...5aVr',
    create_signature: '9oV1t...7qSa',
    start_signature: null,
    receipt_signature: null,
    review_signature: null,
    status: 'funded',
    session_id: null,
    commit_hash: null,
    diff_hash: null,
    tests_hash: null,
    artifact_uri: null,
    submitted_at: null,
    approved_at: null,
    settled_signature: null,
    created_at: Date.now() - 900000,
    updated_at: Date.now() - 900000,
  },
  {
    id: 'demo-6',
    title: 'Create comprehensive test suite',
    prompt: 'Write integration tests for the wallet panel covering all major user flows.',
    acceptance: 'Test coverage above 80%. All tests pass in CI.',
    project_id: 'demo-project-1',
    project_name: 'DAEMON',
    project_path: 'C:\\Users\\offic\\Projects\\DAEMON',
    wallet_id: 'demo-wallet-1',
    wallet_name: 'Dev Wallet',
    wallet_address: 'EaGxK...8pMz',
    agent_id: 'claude-sonnet',
    agent_name: 'Claude Sonnet',
    agent_wallet_id: 'demo-agent-wallet-2',
    agent_wallet_address: 'GwR3m...9nKq',
    verifier_wallet: 'EaGxK...8pMz',
    repo_hash: 'a3f7d82',
    prompt_hash: 'i9e4j58',
    acceptance_hash: 'j1f6k72',
    bounty_lamports: 120000000,
    bounty_sol: 0.12,
    deadline_at: null,
    onchain_task_id: null,
    create_signature: null,
    start_signature: null,
    receipt_signature: null,
    review_signature: null,
    status: 'draft',
    session_id: null,
    commit_hash: null,
    diff_hash: null,
    tests_hash: null,
    artifact_uri: null,
    submitted_at: null,
    approved_at: null,
    settled_signature: null,
    created_at: Date.now() - 300000,
    updated_at: Date.now() - 300000,
  },
]

export function AgentWork() {
  const demoMode = useUIStore((s) => s.demoMode)
  const [tasks, setTasks] = useState<AgentWorkTask[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [wallets, setWallets] = useState<WalletListEntry[]>([])
  const [agentWallets, setAgentWallets] = useState<AgentWalletOption[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'review' | 'complete'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState({
    title: 'Fix failing test and ship receipt',
    prompt: 'Find the failing test, make the smallest correct code change, and leave the repo ready for review.',
    acceptance: DEFAULT_ACCEPTANCE,
    bountySol: '0.05',
    projectId: '',
    walletId: '',
    agentId: '',
    agentWalletId: '',
    verifierWallet: '',
  })

  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const setCenterMode = useUIStore((s) => s.setCenterMode)

  const load = useCallback(async () => {
    if (demoMode) {
      // Use demo data
      setTasks(DEMO_TASKS)
      setProjects([
        { id: 'demo-project-1', name: 'DAEMON', path: 'C:\\Users\\offic\\Projects\\DAEMON', git_remote: null, default_agent_id: null, status: 'active', session_summary: null, infra: '', aliases: '', wallet_id: null, created_at: Date.now(), last_active: Date.now() },
        { id: 'demo-project-2', name: 'Solana DApp', path: 'C:\\Users\\offic\\Projects\\solana-dapp', git_remote: null, default_agent_id: null, status: 'active', session_summary: null, infra: '', aliases: '', wallet_id: null, created_at: Date.now(), last_active: Date.now() },
      ])
      setWallets([
        { id: 'demo-wallet-1', name: 'Dev Wallet', address: 'EaGxKwP8...Kh8pMz', is_default: 1, wallet_type: 'user', assigned_project_ids: [], created_at: Date.now() },
      ])
      setAgents([
        { id: 'solana-agent', name: 'Solana Agent', system_prompt: '', model: 'claude-sonnet-4-20250514', mcps: '', shortcut: null, created_at: Date.now() },
        { id: 'claude-sonnet', name: 'Claude Sonnet', system_prompt: '', model: 'claude-sonnet-4-20250514', mcps: '', shortcut: null, created_at: Date.now() },
      ])
      setAgentWallets([
        { id: 'demo-agent-wallet-1', name: 'Solana Agent Wallet', address: 'Fv2nQmT9...Kp7kLp', agent_id: 'solana-agent', wallet_type: 'agent' },
        { id: 'demo-agent-wallet-2', name: 'Claude Wallet', address: 'GwR3mKp4...Lq9nKq', agent_id: 'claude-sonnet', wallet_type: 'agent' },
      ])
      return
    }

    const [taskRes, projectRes, walletRes, agentRes, agentWalletRes] = await Promise.all([
      window.daemon.registry.listAgentWork(50),
      window.daemon.projects.list(),
      window.daemon.wallet.list(),
      window.daemon.agents.list(),
      window.daemon.wallet.agentWallets(),
    ])

    if (taskRes.ok && taskRes.data) setTasks(taskRes.data)
    if (projectRes.ok && projectRes.data) setProjects(projectRes.data)
    if (walletRes.ok && walletRes.data) setWallets(walletRes.data)
    if (agentRes.ok && agentRes.data) setAgents(agentRes.data)
    if (agentWalletRes.ok && agentWalletRes.data) setAgentWallets(agentWalletRes.data)
  }, [demoMode])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!activeProjectId) return
    setDraft((current) => current.projectId ? current : { ...current, projectId: activeProjectId })
  }, [activeProjectId])

  useEffect(() => {
    const defaultWallet = wallets.find((wallet) => wallet.is_default) ?? wallets[0]
    if (!defaultWallet) return
    setDraft((current) => ({
      ...current,
      walletId: current.walletId || defaultWallet.id,
      verifierWallet: current.verifierWallet || defaultWallet.address,
    }))
  }, [wallets])

  useEffect(() => {
    const solanaAgent = agents.find((agent) => agent.id === 'solana-agent') ?? agents[0]
    if (!solanaAgent) return
    setDraft((current) => current.agentId ? current : { ...current, agentId: solanaAgent.id })
  }, [agents])

  useEffect(() => {
    if (!draft.agentId) return
    const matching = agentWallets.filter((wallet) => wallet.agent_id === draft.agentId)
    if (matching.length === 0) return
    if (matching.some((wallet) => wallet.id === draft.agentWalletId)) return
    setDraft((current) => ({ ...current, agentWalletId: matching[0].id }))
  }, [agentWallets, draft.agentId, draft.agentWalletId])

  const filteredTasks = useMemo(() => {
    let filtered = tasks

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          task.prompt.toLowerCase().includes(query) ||
          task.project_name?.toLowerCase().includes(query) ||
          task.agent_name?.toLowerCase().includes(query)
      )
    }

    // Apply status filter
    switch (statusFilter) {
      case 'active':
        filtered = filtered.filter((task) => task.status === 'draft' || task.status === 'funded' || task.status === 'running')
        break
      case 'review':
        filtered = filtered.filter((task) => task.status === 'submitted' || task.status === 'approved' || task.status === 'rejected')
        break
      case 'complete':
        filtered = filtered.filter((task) => task.status === 'settled')
        break
    }

    return filtered
  }, [tasks, searchQuery, statusFilter])

  const stats = useMemo(() => ({
    open: tasks.filter((task) => task.status === 'draft' || task.status === 'funded').length,
    running: tasks.filter((task) => task.status === 'running').length,
    receipts: tasks.filter((task) => task.status === 'submitted').length,
    settled: tasks.filter((task) => task.status === 'settled').length,
  }), [tasks])

  const visibleAgentWallets = useMemo(() => {
    if (!draft.agentId) return agentWallets
    return agentWallets.filter((wallet) => wallet.agent_id === draft.agentId)
  }, [agentWallets, draft.agentId])

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  const handleCreate = async () => {
    if (demoMode) {
      setNotice('Demo mode: No actions will be performed.')
      return
    }
    setError(null)
    setNotice(null)
    setBusy('create')
    try {
      const res = await window.daemon.registry.createAgentWork({
        title: draft.title,
        prompt: draft.prompt,
        acceptance: draft.acceptance,
        bountySol: Number.parseFloat(draft.bountySol) || 0,
        projectId: draft.projectId || null,
        walletId: draft.walletId || null,
        agentId: draft.agentId || null,
        agentWalletId: draft.agentWalletId || null,
        verifierWallet: draft.verifierWallet || null,
      })

      if (!res.ok) throw new Error(res.error ?? 'Failed to create task')
      setNotice('Task spec created. Fund it on-chain to open the escrow.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const handleFund = async (task: AgentWorkTask) => {
    if (demoMode) {
      setNotice('Demo mode: No actions will be performed.')
      return
    }
    const ok = await runTaskAction(`fund:${task.id}`, () => window.daemon.registry.fundAgentWork(task.id))
    if (ok) setNotice('Escrow funded on-chain. The task is ready for the agent wallet.')
  }

  const handleStart = async (task: AgentWorkTask) => {
    if (demoMode) {
      setNotice('Demo mode: No actions will be performed.')
      return
    }
    setError(null)
    setNotice(null)
    if (!task.project_id || !task.agent_id) {
      setError('Task needs a project and an agent before it can start.')
      return
    }

    setBusy(`start:${task.id}`)
    try {
      const res = await window.daemon.terminal.spawnAgent({
        agentId: task.agent_id,
        projectId: task.project_id,
        initialPrompt: buildAgentPrompt(task),
      })
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to start agent')

      addTerminal(task.project_id, res.data.id, res.data.agentName ?? task.agent_name ?? 'Agent', res.data.agentId)
      setCenterMode('canvas')

      const startRes = await window.daemon.registry.startAgentWork(task.id, res.data.localSessionId ?? res.data.id)
      if (!startRes.ok) throw new Error(startRes.error ?? 'Failed to mark task running')
      setNotice('Agent session started and task start was written to the registry.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const runTaskAction = async (key: string, action: () => Promise<IpcResponse<AgentWorkTask>>): Promise<boolean> => {
    if (demoMode) {
      setNotice('Demo mode: No actions will be performed.')
      return false
    }
    setError(null)
    setNotice(null)
    setBusy(key)
    try {
      const res = await action()
      if (!res.ok) throw new Error(res.error ?? 'Task update failed')
      await load()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="agent-work">
      <PanelHeader
        className="agent-work-header"
        kicker="Solana work layer"
        brandKicker
        title="Wallet-funded agent work"
        subtitle="Create a scoped coding job, fund the devnet escrow, run an agent, verify the receipt, and settle the bounty."
      />

      <div className="agent-work-stats">
        <button 
          className={`agent-work-stat-btn ${statusFilter === 'active' ? 'active' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
        >
          <Stat label="open" value={stats.open} />
        </button>
        <button 
          className={`agent-work-stat-btn ${statusFilter === 'active' ? 'active' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
        >
          <Stat label="running" value={stats.running} />
        </button>
        <button 
          className={`agent-work-stat-btn ${statusFilter === 'review' ? 'active' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'review' ? 'all' : 'review')}
        >
          <Stat label="receipts" value={stats.receipts} />
        </button>
        <button 
          className={`agent-work-stat-btn ${statusFilter === 'complete' ? 'active' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'complete' ? 'all' : 'complete')}
        >
          <Stat label="settled" value={stats.settled} />
        </button>
      </div>

      {error && <Banner className="agent-work-banner" tone="danger">{error}</Banner>}
      {notice && <Banner className="agent-work-banner" tone="success">{notice}</Banner>}

      <div className="agent-work-toolbar">
        <input
          className="agent-work-search"
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="agent-work-filter-row">
          <button
            className={`agent-work-filter ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All ({tasks.length})
          </button>
          <button
            className={`agent-work-filter ${statusFilter === 'active' ? 'active' : ''}`}
            onClick={() => setStatusFilter('active')}
          >
            Active ({stats.open + stats.running})
          </button>
          <button
            className={`agent-work-filter ${statusFilter === 'review' ? 'active' : ''}`}
            onClick={() => setStatusFilter('review')}
          >
            Review ({stats.receipts})
          </button>
          <button
            className={`agent-work-filter ${statusFilter === 'complete' ? 'active' : ''}`}
            onClick={() => setStatusFilter('complete')}
          >
            Complete ({stats.settled})
          </button>
        </div>
      </div>

      <div className="agent-work-body">
        <section className="agent-work-compose">
          <div className="agent-work-section-title">Create Task</div>
          <div className="agent-work-grid agent-work-grid-essential">
            <label>
              <span>Title</span>
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label>
              <span>Bounty SOL</span>
              <input value={draft.bountySol} onChange={(event) => setDraft({ ...draft, bountySol: event.target.value })} inputMode="decimal" />
            </label>
            <label>
              <span>Project</span>
              <select value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })}>
                <option value="">No project</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
          </div>

          <button
            type="button"
            className="agent-work-toggle-advanced"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? '▼' : '▶'} {showAdvanced ? 'Hide' : 'Show'} advanced options
          </button>

          {showAdvanced && (
            <div className="agent-work-advanced">
              <div className="agent-work-grid">
                <label>
                  <span>Funding Wallet</span>
                  <select value={draft.walletId} onChange={(event) => setDraft({ ...draft, walletId: event.target.value })}>
                    <option value="">Default wallet</option>
                    {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Agent</span>
                  <select
                    value={draft.agentId}
                    onChange={(event) => {
                      const agentId = event.target.value
                      const nextWallet = agentWallets.find((wallet) => wallet.agent_id === agentId)
                      setDraft({ ...draft, agentId, agentWalletId: nextWallet?.id ?? '' })
                    }}
                  >
                    <option value="">Select agent</option>
                    {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Agent Wallet</span>
                  <select value={draft.agentWalletId} onChange={(event) => setDraft({ ...draft, agentWalletId: event.target.value })}>
                    <option value="">Select agent wallet</option>
                    {visibleAgentWallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Verifier Wallet</span>
                  <input value={draft.verifierWallet} onChange={(event) => setDraft({ ...draft, verifierWallet: event.target.value })} />
                </label>
              </div>
              <label className="agent-work-field">
                <span>Prompt</span>
                <textarea value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} rows={4} />
              </label>
              <label className="agent-work-field">
                <span>Acceptance</span>
                <textarea value={draft.acceptance} onChange={(event) => setDraft({ ...draft, acceptance: event.target.value })} rows={3} />
              </label>
            </div>
          )}

          <button className="agent-work-primary" onClick={handleCreate} disabled={busy === 'create'}>
            {busy === 'create' ? 'Creating...' : 'Create Task Spec'}
          </button>
        </section>

        <section className="agent-work-list">
          <div className="agent-work-section-title">Task Ledger</div>
          {filteredTasks.length === 0 ? (
            <EmptyState 
              title={searchQuery ? "No matching tasks" : "No agent work yet"} 
              description={searchQuery ? "Try a different search term" : "Create a funded task to start the verifiable work loop."} 
            />
          ) : (
            filteredTasks.map((task) => {
              const isExpanded = expandedTasks.has(task.id)
              return (
                <article key={task.id} className="agent-work-task">
                  <div className="agent-work-task-head">
                    <div>
                      <div className="agent-work-task-title">{task.title}</div>
                      <div className="agent-work-task-meta">
                        {task.project_name ?? 'No project'} · {task.agent_name ?? 'No agent'} · {formatSol(task.bounty_sol)}
                      </div>
                    </div>
                    <span className={`agent-work-status agent-work-status--${task.status}`}>{statusLabel(task.status)}</span>
                  </div>

                  {isExpanded && (
                    <div className="agent-work-proof-grid">
                      <span>repo {shortHash(task.repo_hash)}</span>
                      <span>prompt {shortHash(task.prompt_hash)}</span>
                      <span>accept {shortHash(task.acceptance_hash)}</span>
                      <span>task {shortHash(task.onchain_task_id)}</span>
                      <span>escrow {shortHash(task.create_signature)}</span>
                      <span>start {shortHash(task.start_signature)}</span>
                      <span>diff {shortHash(task.diff_hash)}</span>
                      <span>tests {shortHash(task.tests_hash)}</span>
                      <span>review {shortHash(task.review_signature)}</span>
                      <span>settle {shortHash(task.settled_signature)}</span>
                    </div>
                  )}

                  <div className="agent-work-actions">
                    <button
                      className="agent-work-expand-btn"
                      onClick={() => toggleTaskExpansion(task.id)}
                    >
                      {isExpanded ? '▼ Hide proofs' : '▶ Show proofs'}
                    </button>
                  {task.status === 'draft' && (
                    <button onClick={() => handleFund(task)} disabled={busy === `fund:${task.id}`}>
                      {busy === `fund:${task.id}` ? 'Funding...' : 'Fund On-Chain'}
                    </button>
                  )}
                  {task.status === 'funded' && (
                    <button onClick={() => handleStart(task)} disabled={busy === `start:${task.id}`}>
                      {busy === `start:${task.id}` ? 'Starting...' : 'Start Agent'}
                    </button>
                  )}
                  {task.status === 'running' && (
                    <button onClick={() => runTaskAction(`submit:${task.id}`, () => window.daemon.registry.submitAgentWork(task.id))} disabled={busy === `submit:${task.id}`}>
                      {busy === `submit:${task.id}` ? 'Submitting...' : 'Submit Receipt'}
                    </button>
                  )}
                  {task.status === 'submitted' && (
                    <>
                      <button onClick={() => runTaskAction(`approve:${task.id}`, () => window.daemon.registry.approveAgentWork(task.id))} disabled={busy === `approve:${task.id}`}>
                        {busy === `approve:${task.id}` ? 'Approving...' : 'Approve'}
                      </button>
                      <button onClick={() => runTaskAction(`reject:${task.id}`, () => window.daemon.registry.rejectAgentWork(task.id))} disabled={busy === `reject:${task.id}`}>
                        {busy === `reject:${task.id}` ? 'Rejecting...' : 'Reject'}
                      </button>
                    </>
                  )}
                  {(task.status === 'approved' || task.status === 'rejected') && (
                    <button onClick={() => runTaskAction(`settle:${task.id}`, () => window.daemon.registry.settleAgentWork(task.id))} disabled={busy === `settle:${task.id}`}>
                      {busy === `settle:${task.id}` ? 'Settling...' : 'Settle'}
                    </button>
                  )}
                  {latestRegistrySignature(task) && (
                    <button onClick={() => window.daemon.shell.openExternal(`https://solscan.io/tx/${latestRegistrySignature(task)}?cluster=devnet`)}>
                      Open Tx
                    </button>
                  )}
                  </div>
                </article>
              )
            })
          )}
        </section>
      </div>
    </div>
  )
}
