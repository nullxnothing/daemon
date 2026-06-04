import { useEffect, useMemo, useState } from 'react'
import { useAiStore } from '../../store/aiStore'
import { useUIStore } from '../../store/ui'
import {
  CheckboxChip,
  Composer,
  EmptyPanel,
  KpiGrid,
  PanelHeader,
  SegmentedControl,
  Spinner,
  ToolCallRow,
  UnderlineTabs,
} from '../../components/Panel'
import { Button } from '../../components/Button'
import './DaemonAIPanel.css'

type ContextKey = keyof NonNullable<DaemonAiChatRequest['context']>
type RunMode = NonNullable<DaemonAiAgentRunInput['mode']>
type WorkbenchTab = 'chat' | 'runs' | 'approvals' | 'patches' | 'receipts'

const CONTEXT_OPTIONS: Array<{ key: ContextKey; label: string }> = [
  { key: 'activeFile', label: 'Active file' },
  { key: 'projectTree', label: 'Project tree' },
  { key: 'gitDiff', label: 'Git diff' },
  { key: 'terminalLogs', label: 'Terminal logs' },
  { key: 'walletContext', label: 'Wallet context' },
]

const DEFAULT_ALLOWED_TOOLS = 'read_file, search_files, list_project_tree, get_git_status, get_git_diff, write_patch, run_tests'
const MAX_ACTIVE_FILE_CONTENT_CHARS = 120_000

const WORKBENCH_TABS: Array<{ id: WorkbenchTab; label: string; getCount?: (counts: WorkbenchCounts) => number }> = [
  { id: 'chat', label: 'Chat' },
  { id: 'runs', label: 'Runs', getCount: (counts) => counts.runs },
  { id: 'approvals', label: 'Approvals', getCount: (counts) => counts.approvals },
  { id: 'patches', label: 'Patches', getCount: (counts) => counts.patches },
  { id: 'receipts', label: 'Receipts', getCount: (counts) => counts.receipts },
]

type WorkbenchCounts = {
  runs: number
  approvals: number
  patches: number
  receipts: number
}

export function DaemonAIPanel() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const openFiles = useUIStore((s) => s.openFiles)
  const activeFilePath = useUIStore((s) => activeProjectId ? s.activeFilePathByProject[activeProjectId] ?? null : null)
  const activeFile = openFiles.find((file) => file.path === activeFilePath) ?? null
  const activeFileContent = activeFile?.content.slice(0, MAX_ACTIVE_FILE_CONTENT_CHARS) ?? null

  const messages = useAiStore((s) => s.messages)
  const usage = useAiStore((s) => s.usage)
  const features = useAiStore((s) => s.features)
  const models = useAiStore((s) => s.models)
  const agentRuns = useAiStore((s) => s.agentRuns)
  const approvals = useAiStore((s) => s.approvals)
  const patchProposals = useAiStore((s) => s.patchProposals)
  const loading = useAiStore((s) => s.loading)
  const workbenchLoading = useAiStore((s) => s.workbenchLoading)
  const error = useAiStore((s) => s.error)
  const workbenchError = useAiStore((s) => s.workbenchError)
  const load = useAiStore((s) => s.load)
  const loadWorkbench = useAiStore((s) => s.loadWorkbench)
  const send = useAiStore((s) => s.send)
  const createRun = useAiStore((s) => s.createRun)
  const cancelRun = useAiStore((s) => s.cancelRun)
  const decideToolApproval = useAiStore((s) => s.decideToolApproval)
  const decidePatchProposal = useAiStore((s) => s.decidePatchProposal)
  const applyPatchProposal = useAiStore((s) => s.applyPatchProposal)
  const clear = useAiStore((s) => s.clear)

  const [activeTab, setActiveTab] = useState<WorkbenchTab>('chat')
  const [message, setMessage] = useState('')
  const [runTask, setRunTask] = useState('')
  const [allowedTools, setAllowedTools] = useState(DEFAULT_ALLOWED_TOOLS)
  const [accessMode, setAccessMode] = useState<'auto' | 'byok' | 'hosted'>('auto')
  const [mode, setMode] = useState<'ask' | 'plan'>('ask')
  const [runMode, setRunMode] = useState<RunMode>('patch')
  const [approvalPolicy, setApprovalPolicy] = useState<DaemonAiAgentRunInput['approvalPolicy']>('require_for_write_and_terminal')
  const [modelPreference, setModelPreference] = useState<DaemonAiChatRequest['modelPreference']>('auto')
  const [context, setContext] = useState<NonNullable<DaemonAiChatRequest['context']>>({
    activeFile: true,
    projectTree: true,
    gitDiff: false,
    terminalLogs: false,
    walletContext: false,
  })

  useEffect(() => {
    void load()
    void loadWorkbench()
  }, [load, loadWorkbench])

  const canUseHosted = Boolean(features?.hostedAvailable && features.backendConfigured)
  const canSend = message.trim().length > 0 && !loading && (accessMode === 'auto' || accessMode === 'byok' || canUseHosted)
  const canCreateRun = runTask.trim().length > 0 && !workbenchLoading
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending')
  const proposedPatches = patchProposals.filter((proposal) => proposal.status === 'proposed')
  const workbenchCounts = useMemo<WorkbenchCounts>(() => ({
    runs: agentRuns.length,
    approvals: pendingApprovals.length,
    patches: proposedPatches.length,
    receipts: agentRuns.length,
  }), [agentRuns.length, pendingApprovals.length, proposedPatches.length])
  const activeModel = models.find((item) => item.lane === modelPreference)
  const activeContextItems = CONTEXT_OPTIONS
    .filter((option) => context[option.key])
    .map((option) => ({ id: option.key, label: option.label }))

  const remainingLabel = useMemo(() => {
    if (!usage) return 'No usage loaded'
    if (usage.monthlyCredits <= 0) return 'BYOK only'
    return `${usage.remainingCredits.toLocaleString()} / ${usage.monthlyCredits.toLocaleString()} credits`
  }, [usage])

  const handleToggleContext = (key: ContextKey) => {
    setContext((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSend = async () => {
    if (!canSend) return
    const nextMessage = message.trim()
    setMessage('')
    const ok = await send({
      message: nextMessage,
      accessMode,
      mode,
      modelPreference,
      projectId: activeProjectId,
      projectPath: activeProjectPath,
      activeFilePath,
      activeFileContent,
      context,
    })
    if (!ok) setMessage(nextMessage)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await handleSend()
  }

  const handleQueueRun = async () => {
    if (!canCreateRun) return
    const tools = allowedTools.split(',').map((tool) => tool.trim()).filter(Boolean)
    const ok = await createRun({
      task: runTask.trim(),
      mode: runMode,
      accessMode,
      modelPreference,
      approvalPolicy,
      allowedTools: tools,
      projectId: activeProjectId,
      projectPath: activeProjectPath,
      activeFilePath,
      activeFileContent,
      context,
    })
    if (ok) {
      setRunTask('')
      setActiveTab('runs')
    }
  }

  const handleCreateRun = async (event: React.FormEvent) => {
    event.preventDefault()
    await handleQueueRun()
  }

  return (
    <section className="daemon-ai-panel">
      <PanelHeader
        kicker="DAEMON AI"
        title="AI Workbench"
        actions={
          <Button variant="ghost" onClick={() => void loadWorkbench()} disabled={workbenchLoading}>
            Refresh
          </Button>
        }
      />

      <KpiGrid
        cells={[
          { label: 'Plan', value: usage?.plan ?? 'light', meta: accessMode.toUpperCase() },
          { label: 'Usage', value: remainingLabel, meta: usage?.monthlyCredits ? 'monthly credits' : 'local provider' },
          { label: 'Safety Queue', value: pendingApprovals.length + proposedPatches.length, meta: `${pendingApprovals.length} approvals / ${proposedPatches.length} patches`, tone: pendingApprovals.length || proposedPatches.length ? 'warning' : 'success' },
        ]}
      />

      <UnderlineTabs
        tabs={WORKBENCH_TABS.map((tab) => ({
          id: tab.id,
          label: tab.label,
          count: tab.getCount?.(workbenchCounts),
        }))}
        activeId={activeTab}
        onChange={setActiveTab}
      />

      <div className="daemon-ai-controls">
        <SegmentedControl
          ariaLabel="Access mode"
          value={accessMode}
          onChange={setAccessMode}
          items={[
            { id: 'auto', label: 'Auto' },
            { id: 'byok', label: 'BYOK' },
            { id: 'hosted', label: 'Hosted' },
          ]}
        />
        <select className="daemon-ai-select" value={modelPreference} onChange={(e) => setModelPreference(e.target.value as DaemonAiChatRequest['modelPreference'])}>
          {models.map((model) => (
            <option key={model.lane} value={model.lane}>{model.label}</option>
          ))}
        </select>
      </div>

      {accessMode === 'hosted' && !canUseHosted && (
        <div className="daemon-ai-gate">
          Hosted DAEMON AI needs active Pro or holder access. BYOK mode remains available for local provider accounts.
        </div>
      )}

      <div className="daemon-ai-context">
        {CONTEXT_OPTIONS.map((option) => (
          <CheckboxChip key={option.key} checked={Boolean(context[option.key])} onChange={() => handleToggleContext(option.key)}>
            {option.label}
          </CheckboxChip>
        ))}
      </div>

      {activeTab === 'chat' && (
        <>
          <div className="daemon-ai-chat-mode">
            <SegmentedControl
              ariaLabel="Chat mode"
              value={mode}
              onChange={setMode}
              items={[
                { id: 'ask', label: 'Ask' },
                { id: 'plan', label: 'Plan' },
              ]}
            />
            <button type="button" className="daemon-ai-ghost-btn" onClick={clear} disabled={loading || messages.length === 0}>
              Clear Chat
            </button>
          </div>
          <ChatSurface messages={messages} loading={loading} />
          {error && <div className="daemon-ai-error">{error}</div>}
          <form className="daemon-ai-composer" onSubmit={handleSubmit}>
            <Composer
              value={message}
              onChange={setMessage}
              onSend={() => void handleSend()}
              placeholder="Ask DAEMON AI about this project..."
              disabled={loading}
              model={activeModel?.label ?? modelPreference}
              context={activeContextItems}
              onRemoveContext={(key) => handleToggleContext(key as ContextKey)}
            />
          </form>
        </>
      )}

      {activeTab === 'runs' && (
        <div className="daemon-ai-workbench">
          <form className="daemon-ai-run-form" onSubmit={handleCreateRun}>
            <Composer
              value={runTask}
              onChange={setRunTask}
              onSend={() => void handleQueueRun()}
              placeholder="Describe the agent run or patch proposal..."
              sendLabel="Queue Run"
              disabled={workbenchLoading}
              model={runModeLabel(runMode)}
              context={activeContextItems}
              onRemoveContext={(key) => handleToggleContext(key as ContextKey)}
            />
            <SegmentedControl
              ariaLabel="Run mode"
              value={runMode}
              onChange={setRunMode}
              items={[
                { id: 'patch', label: 'Patch' },
                { id: 'agent', label: 'Agent' },
                { id: 'background', label: 'Background' },
              ]}
            />
            <div className="daemon-ai-run-grid">
              <select className="daemon-ai-select" value={approvalPolicy} onChange={(e) => setApprovalPolicy(e.target.value as DaemonAiAgentRunInput['approvalPolicy'])}>
                <option value="require_for_write_and_terminal">Approve write and terminal tools</option>
                <option value="require_for_all_tools">Approve every tool</option>
                <option value="read_only">Read-only tools</option>
              </select>
            </div>
            <input
              className="daemon-ai-input"
              value={allowedTools}
              onChange={(event) => setAllowedTools(event.target.value)}
              placeholder="Allowed tools"
            />
            <button type="submit" className="daemon-ai-primary-btn" disabled={!canCreateRun}>
              Queue Run
            </button>
          </form>
          <RunList runs={agentRuns} onCancel={(runId) => void cancelRun(runId)} />
        </div>
      )}

      {activeTab === 'approvals' && (
        <ApprovalList
          approvals={approvals}
          onDecision={(approval, decision) => void decideToolApproval({
            runId: approval.runId,
            toolCallId: approval.toolCallId,
            decision,
            reason: decision === 'approve' ? 'Approved from DAEMON AI Workbench' : 'Rejected from DAEMON AI Workbench',
          })}
        />
      )}

      {activeTab === 'patches' && (
        <PatchList
          proposals={patchProposals}
          onDecision={(proposal, decision) => void decidePatchProposal({
            proposalId: proposal.id,
            decision,
            reason: decision === 'accept' ? 'Accepted from DAEMON AI Workbench' : 'Rejected from DAEMON AI Workbench',
          })}
          onApply={(proposal) => void applyPatchProposal({
            proposalId: proposal.id,
            reason: 'Applied from DAEMON AI Workbench',
          })}
        />
      )}

      {activeTab === 'receipts' && (
        <ReceiptList runs={agentRuns} approvals={approvals} proposals={patchProposals} />
      )}

      {workbenchError && <div className="daemon-ai-error">{workbenchError}</div>}
      {workbenchLoading && <div className="daemon-ai-thinking">Refreshing workbench...</div>}
    </section>
  )
}

function ChatSurface({ messages, loading }: { messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>; loading: boolean }) {
  return (
    <div className="daemon-ai-chat">
      {messages.length === 0 ? (
        <EmptyPanel
          label="Chat"
          title="No messages"
          description="Ask about the current project, a failing Solana build, a file, or a release plan."
        />
      ) : (
        messages.map((item) => (
          <article key={item.id} className={`daemon-ai-message ${item.role}`}>
            <div className="daemon-ai-message-role">{item.role === 'user' ? 'You' : 'DAEMON AI'}</div>
            <div className="daemon-ai-message-body">{item.content}</div>
          </article>
        ))
      )}
      {loading && (
        <div className="daemon-ai-thinking" role="status" aria-live="polite">
          <Spinner size={14} tone="muted" />
          Working…
        </div>
      )}
    </div>
  )
}

function RunList({ runs, onCancel }: { runs: DaemonAiAgentRun[]; onCancel: (runId: string) => void }) {
  if (runs.length === 0) {
    return (
      <EmptyPanel
        label="Runs"
        title="No runs yet"
        description="Queue a read-only run or a patch proposal to get started."
      />
    )
  }
  return (
    <div className="daemon-ai-card-list motion-stagger">
      {runs.map((run) => (
        <article key={run.id} className="daemon-ai-card">
          <div className="daemon-ai-card-head">
            <div>
              <div className="daemon-ai-card-title">{run.mode} · {run.status}</div>
              <div className="daemon-ai-card-meta">{formatTime(run.updatedAt)} · {run.approvalPolicy}</div>
            </div>
            <span className={`daemon-ai-badge ${run.status}`}>{run.status}</span>
          </div>
          <p>{run.task}</p>
          <div className="daemon-ai-tool-list">
            {run.allowedTools.slice(0, 8).map((tool) => (
              <ToolCallRow
                key={`${run.id}-${tool}`}
                kind={toolCallKind(tool)}
                label={tool}
                meta={run.mode}
                status={toolCallStatus(run.status)}
              />
            ))}
          </div>
          {run.error && <div className="daemon-ai-error">{run.error}</div>}
          <button type="button" className="daemon-ai-ghost-btn" disabled={['completed', 'failed', 'cancelled'].includes(run.status)} onClick={() => onCancel(run.id)}>
            Cancel
          </button>
        </article>
      ))}
    </div>
  )
}

function ApprovalList({ approvals, onDecision }: {
  approvals: DaemonAiToolApprovalRequest[]
  onDecision: (approval: DaemonAiToolApprovalRequest, decision: DaemonAiToolApprovalDecisionInput['decision']) => void
}) {
  if (approvals.length === 0) {
    return (
      <EmptyPanel
        label="Approvals"
        title="No tool approvals"
        description="Risky tools will appear here before they run."
      />
    )
  }
  return (
    <div className="daemon-ai-card-list motion-stagger">
      {approvals.map((approval) => (
        <article key={approval.id} className="daemon-ai-card">
          <div className="daemon-ai-card-head">
            <div>
              <div className="daemon-ai-card-title">{approval.toolName}</div>
              <div className="daemon-ai-card-meta">{formatTime(approval.createdAt)} · run {shortId(approval.runId)}</div>
            </div>
            <span className={`daemon-ai-badge ${approval.riskLevel}`}>{approval.riskLevel}</span>
          </div>
          <p>{approval.summary}</p>
          <ToolCallRow
            kind={toolCallKind(approval.toolName)}
            label={approval.toolName}
            meta={`run ${shortId(approval.runId)}`}
            status={approval.status === 'pending' ? 'pending' : approval.status === 'rejected' ? 'error' : 'done'}
            details={<pre className="daemon-ai-json">{jsonPreview(approval.argumentsPreview)}</pre>}
          />
          <div className="daemon-ai-card-actions">
            <button type="button" className="daemon-ai-primary-btn" disabled={approval.status !== 'pending' || approval.riskLevel === 'blocked'} onClick={() => onDecision(approval, 'approve')}>
              Approve
            </button>
            <button type="button" className="daemon-ai-ghost-btn" disabled={approval.status !== 'pending'} onClick={() => onDecision(approval, 'reject')}>
              Reject
            </button>
            <span className="daemon-ai-card-meta">{approval.status}</span>
          </div>
        </article>
      ))}
    </div>
  )
}

function PatchList({ proposals, onDecision, onApply }: {
  proposals: DaemonAiPatchProposal[]
  onDecision: (proposal: DaemonAiPatchProposal, decision: DaemonAiPatchDecisionInput['decision']) => void
  onApply: (proposal: DaemonAiPatchProposal) => void
}) {
  const [expandedPatchId, setExpandedPatchId] = useState<string | null>(null)
  if (proposals.length === 0) {
    return (
      <EmptyPanel
        label="Patches"
        title="No patch proposals"
        description="Generated code changes will appear here before apply."
      />
    )
  }
  return (
    <div className="daemon-ai-card-list motion-stagger">
      {proposals.map((proposal) => {
        const expanded = expandedPatchId === proposal.id
        return (
        <article key={proposal.id} className="daemon-ai-card">
          <div className="daemon-ai-card-head">
            <div>
              <div className="daemon-ai-card-title">{proposal.title}</div>
              <div className="daemon-ai-card-meta">{proposal.files.length} file{proposal.files.length === 1 ? '' : 's'} · {formatTime(proposal.createdAt)}</div>
            </div>
            <span className={`daemon-ai-badge ${proposal.riskLevel}`}>{proposal.riskLevel}</span>
          </div>
          {proposal.summary && <p>{proposal.summary}</p>}
          {proposal.safetyFindings.length > 0 && (
            <div className="daemon-ai-finding-list">
              {proposal.safetyFindings.map((finding) => (
                <span key={`${proposal.id}-${finding.code}-${finding.filePath ?? ''}`}>{finding.severity}: {finding.message}</span>
              ))}
            </div>
          )}
          <button
            type="button"
            className="daemon-ai-ghost-btn"
            onClick={() => setExpandedPatchId(expanded ? null : proposal.id)}
          >
            {expanded ? 'Hide diff' : `Show diff (${proposal.unifiedDiff.split(/\r?\n/).length.toLocaleString()} lines)`}
          </button>
          {expanded && <pre className="daemon-ai-diff">{proposal.unifiedDiff}</pre>}
          <div className="daemon-ai-card-actions">
            <button type="button" className="daemon-ai-primary-btn" disabled={proposal.status !== 'proposed' || proposal.riskLevel === 'blocked'} onClick={() => onDecision(proposal, 'accept')}>
              Accept
            </button>
            <button type="button" className="daemon-ai-ghost-btn" disabled={proposal.status !== 'proposed'} onClick={() => onDecision(proposal, 'reject')}>
              Reject
            </button>
            <button type="button" className="daemon-ai-primary-btn" disabled={proposal.status !== 'accepted'} onClick={() => onApply(proposal)}>
              Apply
            </button>
            <span className="daemon-ai-card-meta">{proposal.status}</span>
          </div>
        </article>
      )})}
    </div>
  )
}

function ReceiptList({ runs, approvals, proposals }: {
  runs: DaemonAiAgentRun[]
  approvals: DaemonAiToolApprovalRequest[]
  proposals: DaemonAiPatchProposal[]
}) {
  const rows = runs.map((run) => ({
    run,
    approvals: approvals.filter((approval) => approval.runId === run.id),
    proposals: proposals.filter((proposal) => proposal.runId === run.id),
  }))
  if (rows.length === 0) {
    return (
      <EmptyPanel
        label="Receipts"
        title="No receipts"
        description="Receipts will appear after chat, agent runs, approvals, and patches are created."
      />
    )
  }
  return (
    <div className="daemon-ai-card-list motion-stagger">
      {rows.map(({ run, approvals: runApprovals, proposals: runProposals }) => (
        <article key={run.id} className="daemon-ai-card">
          <div className="daemon-ai-card-head">
            <div>
              <div className="daemon-ai-card-title">Receipt {shortId(run.id)}</div>
              <div className="daemon-ai-card-meta">{formatTime(run.updatedAt)} · {run.status}</div>
            </div>
            <span className={`daemon-ai-badge ${run.status}`}>{run.mode}</span>
          </div>
          <p>{run.task}</p>
          <div className="daemon-ai-receipt-grid">
            <span>{runApprovals.length} tool approval{runApprovals.length === 1 ? '' : 's'}</span>
            <span>{runProposals.length} patch proposal{runProposals.length === 1 ? '' : 's'}</span>
            <span>{run.projectPath ? compactPath(run.projectPath) : 'No project path'}</span>
          </div>
          {keycardOpenUrl(run) && (
            <button type="button" className="daemon-ai-ghost-btn" onClick={() => void window.daemon.shell.openExternal(keycardOpenUrl(run)!)}>
              Open Keycard
            </button>
          )}
        </article>
      ))}
    </div>
  )
}

function runModeLabel(mode: RunMode): string {
  if (mode === 'patch') return 'Patch proposal'
  if (mode === 'agent') return 'Agent run'
  return 'Background run'
}

function toolCallKind(name: string): 'read' | 'edit' | 'run' {
  const lower = name.toLowerCase()
  if (lower.includes('write') || lower.includes('patch') || lower.includes('edit')) return 'edit'
  if (lower.includes('run') || lower.includes('test') || lower.includes('terminal') || lower.includes('exec')) return 'run'
  return 'read'
}

function toolCallStatus(status: string): 'pending' | 'running' | 'done' | 'error' {
  if (status === 'queued' || status === 'awaiting_approval') return 'pending'
  if (status === 'running') return 'running'
  if (status === 'failed' || status === 'cancelled' || status === 'rejected') return 'error'
  return 'done'
}

function jsonPreview(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2).slice(0, 2_400)
  } catch {
    return String(value)
  }
}

function shortId(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value
}

function compactPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.slice(-2).join('/')
}

function keycardOpenUrl(run: DaemonAiAgentRun): string | null {
  const result = run.result ?? {}
  const direct = typeof result.keycardOpenUrl === 'string' ? result.keycardOpenUrl : null
  if (direct) return direct

  const artifactUri = typeof result.artifactUri === 'string'
    ? result.artifactUri
    : typeof result.artifact_uri === 'string'
      ? result.artifact_uri
      : null
  const match = artifactUri?.match(/^keycard:\/\/([^#]+)/)
  return match?.[1] ? `https://keycardsol.xyz/open/${match[1]}` : null
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
