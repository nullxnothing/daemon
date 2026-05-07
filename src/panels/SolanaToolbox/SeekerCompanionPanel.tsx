import { useMemo, useState } from 'react'
import './SeekerCompanionPanel.css'

type StatusTone = 'live' | 'pending' | 'warning' | 'locked'

type ProjectInfoLike = {
  isSolana?: boolean | null
  framework?: string | null
  hasAnchor?: boolean | null
  hasPackageJson?: boolean | null
  hasEnv?: boolean | null
  hasTests?: boolean | null
  programId?: string | null
}

type ToolStatusLike = {
  installed?: boolean | null
  ok?: boolean | null
  version?: string | null
  status?: string | null
}

type ToolchainLike = Record<string, ToolStatusLike | string | boolean | null | undefined>

type ValidatorLike = {
  running?: boolean | null
  mode?: string | null
  status?: string | null
  endpoint?: string | null
}

type McpLike = {
  id?: string | null
  name?: string | null
  enabled?: boolean | null
  status?: string | null
}

interface SeekerCompanionPanelProps {
  projectId?: string | null
  projectPath?: string | null
  projectInfo?: ProjectInfoLike | null
  toolchain?: ToolchainLike | null
  validator?: ValidatorLike | null
  mcps?: McpLike[] | null
}

interface ApprovalItem {
  id: string
  label: string
  detail: string
  risk: 'low' | 'medium' | 'high'
  status: 'pending' | 'approved' | 'rejected'
}

const DEFAULT_APPROVALS: ApprovalItem[] = [
  {
    id: 'agent-diff',
    label: 'Agent file diff',
    detail: 'Review 4 generated changes before the desktop agent writes to disk.',
    risk: 'medium',
    status: 'pending',
  },
  {
    id: 'devnet-deploy',
    label: 'Devnet deploy',
    detail: 'Approve the build command and hand off the deploy signature to Seeker.',
    risk: 'high',
    status: 'pending',
  },
  {
    id: 'x402-test',
    label: 'x402 payment test',
    detail: 'Send a USDC test payment through the mobile wallet approval flow.',
    risk: 'low',
    status: 'pending',
  },
]

const TOOLBOX_ITEMS = [
  'Wallet lookup',
  'Token checker',
  'Transaction decoder',
  'RPC health test',
  'Program authority check',
  'Mobile compatibility scan',
]

function StatusPill({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return <span className={`seeker-status-pill ${tone}`}>{children}</span>
}

function formatPath(path?: string | null) {
  if (!path) return 'No active project selected'
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? path
}

function isToolReady(tool?: ToolStatusLike | string | boolean | null) {
  if (typeof tool === 'boolean') return tool
  if (typeof tool === 'string') return tool.length > 0
  return Boolean(tool?.installed ?? tool?.ok ?? tool?.version ?? tool?.status === 'ok')
}

export function SeekerCompanionPanel({
  projectId,
  projectPath,
  projectInfo,
  toolchain,
  validator,
  mcps,
}: SeekerCompanionPanelProps) {
  const [paired, setPaired] = useState(false)
  const [approvals, setApprovals] = useState<ApprovalItem[]>(DEFAULT_APPROVALS)
  const [copied, setCopied] = useState(false)

  const enabledMcps = useMemo(() => (mcps ?? []).filter((mcp) => Boolean(mcp.enabled)).length, [mcps])
  const readiness = useMemo(() => {
    const checks = [
      Boolean(projectId || projectPath),
      Boolean(projectInfo?.isSolana || projectInfo?.hasAnchor || projectInfo?.programId),
      Boolean(projectInfo?.hasPackageJson),
      Boolean(projectInfo?.hasEnv),
      Boolean(projectInfo?.hasTests),
      Boolean(validator?.running),
      isToolReady(toolchain?.node),
      isToolReady(toolchain?.solana),
      enabledMcps > 0,
    ]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
  }, [enabledMcps, projectId, projectInfo, projectPath, toolchain, validator])

  const pendingApprovals = approvals.filter((item) => item.status === 'pending').length
  const pairingCode = useMemo(() => {
    const seed = `${projectId ?? projectPath ?? 'daemon-seeker'}-mobile`
    let hash = 0
    for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
    return `DMN-${Math.abs(hash).toString(36).slice(0, 4).toUpperCase()}-${readiness}`
  }, [projectId, projectPath, readiness])

  const updateApproval = (id: string, status: ApprovalItem['status']) => {
    setApprovals((items) => items.map((item) => (item.id === id ? { ...item, status } : item)))
  }

  const copyPairingCode = async () => {
    try {
      await navigator.clipboard?.writeText(pairingCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="seeker-companion">
      <section className="seeker-hero-card">
        <div className="seeker-hero-copy">
          <div className="solana-token-launch-kicker">Daemon for Seeker</div>
          <h2 className="seeker-title">Mobile command center for Solana builders</h2>
          <p className="seeker-copy">
            Pair a Seeker device to review agent work, approve risky commands, sign wallet actions, and monitor launches without turning the phone into a cramped IDE.
          </p>
          <div className="seeker-hero-actions">
            <button type="button" className="sol-btn primary" onClick={() => setPaired((value) => !value)}>
              {paired ? 'Seeker paired' : 'Pair Seeker'}
            </button>
            <button type="button" className="sol-btn secondary" onClick={copyPairingCode}>
              {copied ? 'Copied' : 'Copy pairing code'}
            </button>
          </div>
        </div>
        <div className="seeker-phone-shell" aria-label="Seeker mobile preview">
          <div className="seeker-phone-topbar">
            <span>Daemon</span>
            <StatusPill tone={paired ? 'live' : 'pending'}>{paired ? 'Paired' : 'Ready'}</StatusPill>
          </div>
          <div className="seeker-phone-score">{readiness}</div>
          <div className="seeker-phone-label">Launch Score</div>
          <div className="seeker-phone-stack">
            <span>{pendingApprovals} approvals waiting</span>
            <span>{enabledMcps} integrations enabled</span>
            <span>{validator?.running ? 'Validator online' : 'Validator offline'}</span>
          </div>
        </div>
      </section>

      <section className="seeker-grid">
        <article className="seeker-card seeker-project-card">
          <div className="seeker-card-head">
            <div>
              <div className="seeker-card-label">Active project</div>
              <h3>{formatPath(projectPath)}</h3>
            </div>
            <StatusPill tone={projectPath ? 'live' : 'warning'}>{projectPath ? 'Connected' : 'Missing'}</StatusPill>
          </div>
          <div className="seeker-metric-grid">
            <div>
              <span>Readiness</span>
              <strong>{readiness}%</strong>
            </div>
            <div>
              <span>Framework</span>
              <strong>{projectInfo?.framework ?? (projectInfo?.hasAnchor ? 'Anchor' : 'Unknown')}</strong>
            </div>
            <div>
              <span>Program</span>
              <strong>{projectInfo?.programId ? 'Detected' : 'Not set'}</strong>
            </div>
            <div>
              <span>Validator</span>
              <strong>{validator?.running ? validator.mode ?? 'Local' : 'Offline'}</strong>
            </div>
          </div>
        </article>

        <article className="seeker-card">
          <div className="seeker-card-head">
            <div>
              <div className="seeker-card-label">Device pairing</div>
              <h3>Secure mobile approval layer</h3>
            </div>
            <StatusPill tone={paired ? 'live' : 'pending'}>{paired ? 'Active' : 'Prototype'}</StatusPill>
          </div>
          <div className="seeker-pairing-code">{pairingCode}</div>
          <p className="seeker-muted">
            This code is the front-end placeholder for the future Seeker deep link / QR handoff. The backend should exchange it for an encrypted desktop session.
          </p>
        </article>
      </section>

      <section className="seeker-grid seeker-grid-wide">
        <article className="seeker-card">
          <div className="seeker-card-head">
            <div>
              <div className="seeker-card-label">Agent approval queue</div>
              <h3>Review before Daemon executes</h3>
            </div>
            <StatusPill tone={pendingApprovals > 0 ? 'warning' : 'live'}>{pendingApprovals} pending</StatusPill>
          </div>
          <div className="seeker-approval-list">
            {approvals.map((approval) => (
              <div key={approval.id} className={`seeker-approval-row ${approval.status}`}>
                <div className="seeker-approval-main">
                  <div className="seeker-approval-title-row">
                    <strong>{approval.label}</strong>
                    <span className={`seeker-risk ${approval.risk}`}>{approval.risk} risk</span>
                  </div>
                  <p>{approval.detail}</p>
                </div>
                <div className="seeker-approval-actions">
                  {approval.status === 'pending' ? (
                    <>
                      <button type="button" className="sol-btn secondary" onClick={() => updateApproval(approval.id, 'rejected')}>Reject</button>
                      <button type="button" className="sol-btn primary" onClick={() => updateApproval(approval.id, 'approved')}>Approve</button>
                    </>
                  ) : (
                    <button type="button" className="sol-btn secondary" onClick={() => updateApproval(approval.id, 'pending')}>Reset</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="seeker-card">
          <div className="seeker-card-head">
            <div>
              <div className="seeker-card-label">Pocket toolbox</div>
              <h3>Seeker-first Solana utilities</h3>
            </div>
            <StatusPill tone="pending">MVP</StatusPill>
          </div>
          <div className="seeker-toolbox-list">
            {TOOLBOX_ITEMS.map((item) => (
              <button type="button" key={item} className="seeker-toolbox-item">
                <span>{item}</span>
                <small>mobile action</small>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="seeker-card seeker-roadmap-card">
        <div className="seeker-card-head">
          <div>
            <div className="seeker-card-label">Implementation path</div>
            <h3>What needs backend wiring next</h3>
          </div>
          <StatusPill tone="locked">Next</StatusPill>
        </div>
        <div className="seeker-roadmap-grid">
          <div>
            <strong>1. Session relay</strong>
            <p>Encrypted desktop-to-Seeker channel for approval cards, diffs, and agent run state.</p>
          </div>
          <div>
            <strong>2. Wallet handoff</strong>
            <p>Mobile Wallet Adapter signing flow for deploys, payments, staking, and ownership checks.</p>
          </div>
          <div>
            <strong>3. Push alerts</strong>
            <p>Notifications for failed builds, completed deploys, pending approvals, and received payments.</p>
          </div>
          <div>
            <strong>4. Seeker packaging</strong>
            <p>Dedicated Android shell that opens directly into this companion command-center experience.</p>
          </div>
        </div>
      </section>
    </div>
  )
}

export default SeekerCompanionPanel
