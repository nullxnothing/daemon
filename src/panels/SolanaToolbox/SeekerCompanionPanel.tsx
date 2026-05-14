import { useCallback, useEffect, useMemo, useState } from 'react'
import { daemon } from '../../lib/daemonBridge'
import type { SolanaMcpEntry, SolanaProjectInfo, SolanaToolchainStatus, ValidatorState } from '../../store/solanaToolbox'
import './SeekerCompanionPanel.css'

type StatusTone = 'live' | 'pending' | 'warning' | 'locked'
type ApprovalStatus = 'pending' | 'approved' | 'rejected'

interface SeekerCompanionPanelProps {
  projectId?: string | null
  projectPath?: string | null
  projectInfo?: SolanaProjectInfo | null
  toolchain?: SolanaToolchainStatus | null
  validator?: ValidatorState | null
  mcps?: SolanaMcpEntry[] | null
}

interface SeekerApprovalRequest {
  id: string
  title: string
  description: string
  risk: 'low' | 'medium' | 'high'
  status: ApprovalStatus
  source: 'agent' | 'deploy' | 'wallet' | 'system'
  command?: string
  diffSummary?: string
  createdAt: number
}

interface SeekerSessionSnapshot {
  session: {
    id: string
    pairingCode: string
    relayUrl: string
    deepLink: string
    projectName: string
    status: 'pairing' | 'paired' | 'expired'
    expiresAt: number
    pairedAt: number | null
    pairedDevice: string | null
  }
  project: {
    name: string
    readiness: number
    framework?: string
    validatorOnline?: boolean
    enabledIntegrations?: number
    pendingApprovals?: number
    walletBalance?: string
    lastDeploy?: string
  }
  approvals: SeekerApprovalRequest[]
  events: Array<{ type: string; payload?: Record<string, unknown>; receivedAt?: number }>
}

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

function formatFramework(framework?: SolanaProjectInfo['framework']) {
  if (!framework) return 'Unknown'
  if (framework === 'client-only') return 'Client only'
  return framework[0].toUpperCase() + framework.slice(1)
}

function formatValidator(validator?: ValidatorState | null) {
  if (!validator || validator.status !== 'running') return 'Offline'
  if (validator.type === 'test-validator') return 'Test validator'
  if (validator.type === 'surfpool') return 'Surfpool'
  return 'Local'
}

function hasProgram(projectInfo?: SolanaProjectInfo | null) {
  return Boolean(projectInfo?.diagnostics?.programCount)
}

function isValidatorRunning(validator?: ValidatorState | null) {
  return validator?.status === 'running'
}

function secondsLeft(expiresAt?: number) {
  if (!expiresAt) return 0
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function SeekerCompanionPanel({
  projectId,
  projectPath,
  projectInfo,
  toolchain,
  validator,
  mcps,
}: SeekerCompanionPanelProps) {
  const [session, setSession] = useState<SeekerSessionSnapshot | null>(null)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [relayError, setRelayError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'code' | 'link' | 'relay' | null>(null)
  const [, setTick] = useState(Date.now())

  const enabledMcps = useMemo(() => (mcps ?? []).filter((mcp) => Boolean(mcp.enabled)).length, [mcps])
  const validatorRunning = isValidatorRunning(validator)
  const localReadiness = useMemo(() => {
    const checks = [
      Boolean(projectId || projectPath),
      Boolean(projectInfo?.isSolanaProject),
      Boolean(projectInfo?.framework),
      Boolean(projectInfo?.diagnostics && projectInfo.diagnostics.status !== 'missing'),
      Boolean(toolchain?.solanaCli.installed),
      Boolean(toolchain?.anchor.installed || projectInfo?.framework !== 'anchor'),
      Boolean(toolchain?.surfpool.installed || toolchain?.testValidator.installed),
      validatorRunning,
      enabledMcps > 0,
    ]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
  }, [enabledMcps, projectId, projectInfo, projectPath, toolchain, validatorRunning])

  const readiness = session?.project.readiness ?? localReadiness
  const approvals = session?.approvals ?? []
  const pendingApprovals = approvals.filter((item) => item.status === 'pending').length
  const pairStatus = session?.session.status ?? 'pairing'
  const isPaired = pairStatus === 'paired'
  const expiresIn = secondsLeft(session?.session.expiresAt)

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!session?.session.pairingCode) return
    const code = session.session.pairingCode
    let cancelled = false
    let timer: number | null = null
    let delayMs = 2200

    async function pollSession() {
      if (cancelled) return
      try {
        const res = await daemon.seeker.getSession(code)
        if (!res.ok) throw new Error(res.error)
        if (!res.data) throw new Error('Pairing session expired')
        if (!cancelled) {
          setSession(res.data)
          setRelayError(null)
          delayMs = 2200
        }
      } catch (error) {
        if (!cancelled) {
          setRelayError(error instanceof Error ? error.message : 'Could not sync Seeker session')
          delayMs = Math.min(10_000, Math.round(delayMs * 1.5))
        }
      } finally {
        if (!cancelled) timer = window.setTimeout(pollSession, delayMs)
      }
    }

    timer = window.setTimeout(pollSession, 1200)
    return () => {
      cancelled = true
      if (timer != null) window.clearTimeout(timer)
    }
  }, [session?.session.pairingCode])

  const createSession = useCallback(async () => {
    setIsCreatingSession(true)
    setRelayError(null)
    try {
      const res = await daemon.seeker.createSession({
        projectId,
        projectPath,
        projectName: formatPath(projectPath),
        project: {
          name: formatPath(projectPath),
          readiness: localReadiness,
          framework: formatFramework(projectInfo?.framework),
          validatorOnline: validatorRunning,
          enabledIntegrations: enabledMcps,
          pendingApprovals,
          lastDeploy: hasProgram(projectInfo) ? 'Program detected' : 'No deploy yet',
          walletBalance: 'Seeker wallet ready',
        },
      })
      if (!res.ok || !res.data) throw new Error(res.ok ? 'Could not create Seeker session' : res.error)
      setSession(res.data)
    } catch (error) {
      setRelayError(error instanceof Error ? error.message : 'Could not create Seeker session')
    } finally {
      setIsCreatingSession(false)
    }
  }, [enabledMcps, localReadiness, pendingApprovals, projectId, projectInfo, projectPath, validatorRunning])

  const sendApprovalEvent = useCallback(async (approvalId: string, status: ApprovalStatus) => {
    if (!session?.session.pairingCode) return
    setRelayError(null)
    try {
      const res = await daemon.seeker.updateApprovalStatus(session.session.pairingCode, approvalId, status)
      if (!res.ok || !res.data) throw new Error(res.ok ? 'Could not update approval' : res.error)
      setSession(res.data)
    } catch (error) {
      setRelayError(error instanceof Error ? error.message : 'Could not update approval')
    }
  }, [session?.session.pairingCode])

  const resetApproval = useCallback(async (approval: SeekerApprovalRequest) => {
    if (!session?.session.pairingCode) return
    setRelayError(null)
    try {
      const res = await daemon.seeker.updateApprovalStatus(session.session.pairingCode, approval.id, 'pending')
      if (!res.ok || !res.data) throw new Error(res.ok ? 'Could not reset approval' : res.error)
      setSession(res.data)
    } catch (error) {
      setRelayError(error instanceof Error ? error.message : 'Could not reset approval')
    }
  }, [session?.session.pairingCode])

  const copyText = useCallback(async (kind: 'code' | 'link' | 'relay', value?: string) => {
    if (!value) return
    try {
      await navigator.clipboard?.writeText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1400)
    } catch {
      setCopied(null)
    }
  }, [])

  const openDeepLink = useCallback(() => {
    if (!session?.session.deepLink) return
    window.location.href = session.session.deepLink
  }, [session?.session.deepLink])

  return (
    <div className="seeker-companion">
      <section className="seeker-hero-card">
        <div className="seeker-hero-copy">
          <div className="solana-token-launch-kicker">Daemon for Seeker</div>
          <h2 className="seeker-title">Mobile command center for Solana builders</h2>
          <p className="seeker-copy">
            Create a live pairing session, send approval cards to Seeker, and use the phone as the safe approval/signing device for Daemon workflows.
          </p>
          <div className="seeker-hero-actions">
            <button type="button" className="sol-btn primary" onClick={createSession} disabled={isCreatingSession}>
              {isCreatingSession ? 'Creating session...' : session ? 'Create new pairing session' : 'Start Seeker pairing'}
            </button>
            <button type="button" className="sol-btn secondary" onClick={() => copyText('link', session?.session.deepLink)} disabled={!session?.session.deepLink}>
              {copied === 'link' ? 'Copied' : 'Copy deep link'}
            </button>
          </div>
          {relayError ? <p className="seeker-error">{relayError}</p> : null}
        </div>
        <div className="seeker-phone-shell" aria-label="Seeker mobile preview">
          <div className="seeker-phone-topbar">
            <span>Daemon</span>
            <StatusPill tone={isPaired ? 'live' : session ? 'pending' : 'locked'}>{isPaired ? 'Paired' : session ? 'Pairing' : 'Ready'}</StatusPill>
          </div>
          <div className="seeker-phone-score">{readiness}</div>
          <div className="seeker-phone-label">Launch Score</div>
          <div className="seeker-phone-stack">
            <span>{pendingApprovals || 0} approvals waiting</span>
            <span>{enabledMcps} integrations enabled</span>
            <span>{validatorRunning ? 'Validator online' : 'Validator offline'}</span>
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
              <strong>{formatFramework(projectInfo?.framework)}</strong>
            </div>
            <div>
              <span>Program</span>
              <strong>{hasProgram(projectInfo) ? 'Detected' : 'Not set'}</strong>
            </div>
            <div>
              <span>Validator</span>
              <strong>{formatValidator(validator)}</strong>
            </div>
          </div>
        </article>

        <article className="seeker-card seeker-pairing-card">
          <div className="seeker-card-head">
            <div>
              <div className="seeker-card-label">Live device pairing</div>
              <h3>Connect Seeker to this desktop</h3>
            </div>
            <StatusPill tone={isPaired ? 'live' : session ? 'pending' : 'locked'}>{isPaired ? 'Active' : session ? `${formatCountdown(secondsLeft(session.session.expiresAt))}` : 'Start'}</StatusPill>
          </div>

          {session ? (
            <>
              <div className="seeker-pair-layout">
                <div className="seeker-pair-visual" aria-label="Pairing code visual">
                  <span>{session.session.pairingCode.split('-')[0]}</span>
                  <strong>{session.session.pairingCode.split('-')[1]}</strong>
                  <small>{session.session.pairingCode.split('-')[2]}</small>
                </div>
                <div className="seeker-pair-details">
                  <div className="seeker-pairing-code">{session.session.pairingCode}</div>
                  <button type="button" className="sol-btn secondary" onClick={() => copyText('code', session.session.pairingCode)}>
                    {copied === 'code' ? 'Copied' : 'Copy code'}
                  </button>
                  <button type="button" className="sol-btn primary" onClick={openDeepLink}>
                    Open mobile link
                  </button>
                </div>
              </div>
              <div className="seeker-link-box">
                <span>Relay URL</span>
                <button type="button" onClick={() => copyText('relay', session.session.relayUrl)}>{copied === 'relay' ? 'Copied' : session.session.relayUrl}</button>
              </div>
              <div className="seeker-link-box">
                <span>Deep link</span>
                <button type="button" onClick={() => copyText('link', session.session.deepLink)}>{copied === 'link' ? 'Copied' : session.session.deepLink}</button>
              </div>
              <p className="seeker-muted">
                Open the Seeker app, paste the pairing code and relay URL, or use the deep link on the device. This session expires in {formatCountdown(expiresIn)}.
              </p>
            </>
          ) : (
            <p className="seeker-muted">
              Start a pairing session to generate a temporary code, local relay URL, and Daemon Seeker deep link for the mobile app.
            </p>
          )}
        </article>
      </section>

      <section className="seeker-grid seeker-grid-wide">
        <article className="seeker-card">
          <div className="seeker-card-head">
            <div>
              <div className="seeker-card-label">Live approval queue</div>
              <h3>Review before Daemon executes</h3>
            </div>
            <StatusPill tone={pendingApprovals > 0 ? 'warning' : session ? 'live' : 'locked'}>{session ? `${pendingApprovals} pending` : 'No session'}</StatusPill>
          </div>
          <div className="seeker-approval-list">
            {session ? approvals.map((approval) => (
              <div key={approval.id} className={`seeker-approval-row ${approval.status}`}>
                <div className="seeker-approval-main">
                  <div className="seeker-approval-title-row">
                    <strong>{approval.title}</strong>
                    <span className={`seeker-risk ${approval.risk}`}>{approval.risk} risk</span>
                  </div>
                  <p>{approval.description}</p>
                  {approval.command ? <code className="seeker-command-preview">{approval.command}</code> : null}
                  {approval.diffSummary ? <code className="seeker-command-preview">{approval.diffSummary}</code> : null}
                </div>
                <div className="seeker-approval-actions">
                  {approval.status === 'pending' ? (
                    <>
                      <button type="button" className="sol-btn secondary" onClick={() => { void sendApprovalEvent(approval.id, 'rejected') }}>Reject</button>
                      <button type="button" className="sol-btn primary" onClick={() => { void sendApprovalEvent(approval.id, 'approved') }}>Approve</button>
                    </>
                  ) : (
                    <button type="button" className="sol-btn secondary" onClick={() => { void resetApproval(approval) }}>Reset demo</button>
                  )}
                </div>
              </div>
            )) : (
              <div className="seeker-empty-state">Create a pairing session to seed live approval cards for Seeker.</div>
            )}
          </div>
        </article>

        <article className="seeker-card">
          <div className="seeker-card-head">
            <div>
              <div className="seeker-card-label">Pocket toolbox</div>
              <h3>Seeker-first Solana utilities</h3>
            </div>
            <StatusPill tone="pending">Next</StatusPill>
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
            <div className="seeker-card-label">Relay events</div>
            <h3>What the phone has sent back</h3>
          </div>
          <StatusPill tone={session?.events.length ? 'live' : 'locked'}>{session?.events.length ?? 0} events</StatusPill>
        </div>
        {session?.events.length ? (
          <div className="seeker-event-list">
            {session.events.slice(0, 6).map((event, index) => (
              <div key={`${event.type}-${event.receivedAt ?? index}`}>
                <strong>{event.type}</strong>
                <span>{event.receivedAt ? new Date(event.receivedAt).toLocaleTimeString() : 'pending'}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="seeker-muted">Pair the mobile app or approve/reject an action from Seeker to see relay events here.</p>
        )}
      </section>
    </div>
  )
}

export default SeekerCompanionPanel
