import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banner, PanelHeader, Stat } from '../../components/Panel'
import { EmptyState } from '../../components/EmptyState'
import { useUIStore } from '../../store/ui'
import { useNotificationsStore } from '../../store/notifications'
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

export function AgentWork() {
  const [tasks, setTasks] = useState<AgentWorkTask[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [wallets, setWallets] = useState<WalletListEntry[]>([])
  const [agentWallets, setAgentWallets] = useState<AgentWalletOption[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
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
  }, [])

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

  const handleCreate = async () => {
    setError(null)
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

      if (!res.ok) {
        const contextualError = res.error || 'Failed to create task'
        const hint = !draft.projectId ? ' Select a project to associate this task with.'
          : !draft.walletId ? ' Choose a funding wallet.'
          : !draft.agentId ? ' Select an agent to run this task.'
          : ''
        throw new Error(contextualError + hint)
      }
      useNotificationsStore.getState().pushSuccess('Task spec created. Fund it on-chain to open the escrow.', 'Agent Work')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const handleFund = async (task: AgentWorkTask) => {
    const ok = await runTaskAction(`fund:${task.id}`, () => window.daemon.registry.fundAgentWork(task.id))
    if (ok) useNotificationsStore.getState().pushSuccess('Escrow funded on-chain. Task is ready for the agent wallet.', 'Agent Work')
  }

  const handleStart = async (task: AgentWorkTask) => {
    setError(null)
    if (!task.project_id || !task.agent_id) {
      setError('Cannot start task: ' + (!task.project_id ? 'No project assigned.' : 'No agent assigned.') + ' Edit the task to add missing configuration.')
      return
    }

    setBusy(`start:${task.id}`)
    try {
      const res = await window.daemon.terminal.spawnAgent({
        agentId: task.agent_id,
        projectId: task.project_id,
        initialPrompt: buildAgentPrompt(task),
      })
      if (!res.ok || !res.data) throw new Error(res.error || 'Failed to start agent session. Check that the agent ID is valid and the project exists.')

      addTerminal(task.project_id, res.data.id, res.data.agentName ?? task.agent_name ?? 'Agent', res.data.agentId)
      setCenterMode('canvas')

      const startRes = await window.daemon.registry.startAgentWork(task.id, res.data.localSessionId ?? res.data.id)
      if (!startRes.ok) throw new Error(startRes.error || 'Failed to mark task as running in the registry. The agent session started but the on-chain state was not updated.')
      useNotificationsStore.getState().pushSuccess('Agent session started and task start was written to the registry.', 'Agent Work')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const runTaskAction = async (key: string, action: () => Promise<IpcResponse<AgentWorkTask>>): Promise<boolean> => {
    setError(null)
    setBusy(key)
    try {
      const res = await action()
      if (!res.ok) throw new Error(res.error || 'Task update failed. The on-chain transaction may have been rejected or the registry may be unavailable.')
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
        subtitle="Create tasks, fund escrows, run agents, and settle bounties on Solana."
      />

      <Banner className="agent-work-banner" tone="info">
        How it works: Create a task spec → Fund the escrow on-chain → Start an agent session → Submit work receipt → Verify and settle.
      </Banner>

      <div className="agent-work-stats">
        <Stat label="open" value={stats.open} />
        <Stat label="running" value={stats.running} />
        <Stat label="receipts" value={stats.receipts} />
        <Stat label="settled" value={stats.settled} />
      </div>

      {error && <Banner className="agent-work-banner" tone="danger">{error}</Banner>}

      <div className="agent-work-body">
        <section className="agent-work-compose">
          <div className="agent-work-section-title">Create Task</div>
          <div className="agent-work-grid">
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
          <button type="button" className="agent-work-primary" onClick={handleCreate} disabled={busy === 'create'}>
            {busy === 'create' ? 'Creating...' : 'Create Task Spec'}
          </button>
        </section>

        <section className="agent-work-list">
          <div className="agent-work-section-title">Task Ledger</div>
          {tasks.length === 0 ? (
            <EmptyState title="No agent work yet" description="Create a funded task to start the verifiable work loop." />
          ) : (
            tasks.map((task) => (
              <article key={task.id} className="agent-work-task">
                <div className="agent-work-task-head">
                  <div>
                    <div className="agent-work-task-title">{task.title}</div>
                    <div className="agent-work-task-meta">
                      {task.project_name ?? 'No project'} / {task.agent_name ?? 'No agent'} / {formatSol(task.bounty_sol)}
                    </div>
                  </div>
                  <span className={`agent-work-status agent-work-status--${task.status}`}>{statusLabel(task.status)}</span>
                </div>

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

                <div className="agent-work-actions">
                  {task.status === 'draft' && (
                    <button type="button" onClick={() => handleFund(task)} disabled={busy === `fund:${task.id}`}>
                      {busy === `fund:${task.id}` ? 'Funding...' : 'Fund On-Chain'}
                    </button>
                  )}
                  {task.status === 'funded' && (
                    <button type="button" onClick={() => handleStart(task)} disabled={busy === `start:${task.id}`}>
                      {busy === `start:${task.id}` ? 'Starting...' : 'Start Agent'}
                    </button>
                  )}
                  {task.status === 'running' && (
                    <button type="button" onClick={() => runTaskAction(`submit:${task.id}`, () => window.daemon.registry.submitAgentWork(task.id))} disabled={busy === `submit:${task.id}`}>
                      {busy === `submit:${task.id}` ? 'Submitting...' : 'Submit Receipt'}
                    </button>
                  )}
                  {task.status === 'submitted' && (
                    <>
                      <button type="button" onClick={() => runTaskAction(`approve:${task.id}`, () => window.daemon.registry.approveAgentWork(task.id))} disabled={busy === `approve:${task.id}`}>
                        {busy === `approve:${task.id}` ? 'Approving...' : 'Approve'}
                      </button>
                      <button type="button" onClick={() => runTaskAction(`reject:${task.id}`, () => window.daemon.registry.rejectAgentWork(task.id))} disabled={busy === `reject:${task.id}`}>
                        {busy === `reject:${task.id}` ? 'Rejecting...' : 'Reject'}
                      </button>
                    </>
                  )}
                  {(task.status === 'approved' || task.status === 'rejected') && (
                    <button type="button" onClick={() => runTaskAction(`settle:${task.id}`, () => window.daemon.registry.settleAgentWork(task.id))} disabled={busy === `settle:${task.id}`}>
                      {busy === `settle:${task.id}` ? 'Settling...' : 'Settle'}
                    </button>
                  )}
                  {latestRegistrySignature(task) && (
                    <button type="button" onClick={() => window.daemon.shell.openExternal(`https://solscan.io/tx/${latestRegistrySignature(task)}?cluster=devnet`)}>
                      Open Tx
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
