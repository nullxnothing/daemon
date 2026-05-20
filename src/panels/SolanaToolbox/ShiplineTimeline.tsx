import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNotificationsStore, type ActivityArtifact, type ToastKind } from '../../store/notifications'
import type { ShiplineRun, ShiplineStepStatus, ShiplineTimelineStep } from '../../../electron/shared/types'
import './SolanaIdeWorkflow.css'

interface ShiplineTimelineProps {
  projectId: string | null
  projectPath: string | null
  onRunCommand: (command: string, label: string) => Promise<string | null>
}

function projectNameFromPath(projectPath: string | null): string | null {
  if (!projectPath) return null
  const clean = projectPath.replace(/[\\/]+$/, '')
  return clean.split(/[\\/]/).pop() || clean
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function timelineStatusClass(status: ShiplineTimelineStep['status'] | ShiplineRun['status']): 'live' | 'partial' | 'setup' {
  if (status === 'ready' || status === 'complete') return 'live'
  if (status === 'warning' || status === 'pending' || status === 'running') return 'partial'
  return 'setup'
}

function stepLabel(step: ShiplineTimelineStep): string {
  if (step.status === 'ready') return 'Ready'
  if (step.status === 'pending') return 'Pending'
  if (step.status === 'warning') return 'Review'
  if (step.status === 'blocked') return 'Blocked'
  if (step.status === 'complete') return 'Done'
  if (step.status === 'running') return 'Running'
  return 'Failed'
}

function canOpenStep(step: ShiplineTimelineStep): boolean {
  return Boolean(step.command) && (step.status === 'ready' || step.status === 'warning')
}

function canCompleteStep(step: ShiplineTimelineStep): boolean {
  return step.status === 'ready' || step.status === 'warning' || step.status === 'running'
}

function artifactsForRun(run: ShiplineRun): ActivityArtifact[] {
  return run.programs.flatMap((program) => {
    if (!program.preferredProgramId) return []
    return [{
      type: 'program' as const,
      label: program.name,
      value: program.preferredProgramId,
      href: program.explorerUrl,
    }]
  }).slice(0, 8)
}

function proofChecklistForRun(run: ShiplineRun): string {
  const programs = run.programs
    .filter((program) => program.preferredProgramId)
    .map((program) => `- ${program.name}: ${program.preferredProgramId}${program.explorerUrl ? ` (${program.explorerUrl})` : ''}`)
  const steps = run.steps.map((step, index) => `- ${index + 1}. ${step.label}: ${step.status}`)

  return [
    `DAEMON Shipline proof for ${run.projectName}`,
    `Cluster: ${run.cluster}`,
    `Status: ${run.status}`,
    '',
    'Programs:',
    ...(programs.length > 0 ? programs : ['- No program ID detected yet']),
    '',
    'Timeline:',
    ...steps,
    '',
    'Video beats:',
    '- Open project readiness',
    '- Create or refresh Shipline timeline',
    '- Run build/test step',
    '- Run deploy/confirm/verify step',
    '- Show terminal output, program/explorer artifact, and activity timeline',
  ].join('\n')
}

function activityKindForStatus(status: ShiplineStepStatus): ToastKind {
  if (status === 'complete') return 'success'
  if (status === 'failed' || status === 'blocked') return 'error'
  if (status === 'warning') return 'warning'
  return 'info'
}

function sessionStatusForRun(status: ShiplineRun['status']) {
  if (status === 'complete') return 'complete'
  if (status === 'failed') return 'failed'
  if (status === 'blocked') return 'blocked'
  if (status === 'running') return 'running'
  return 'created'
}

function latestFinishedStep(run: ShiplineRun): ShiplineTimelineStep | null {
  return run.steps
    .filter((step) => step.completedAt)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0] ?? null
}

export function ShiplineTimeline({ projectId, projectPath, onRunCommand }: ShiplineTimelineProps) {
  const addActivity = useNotificationsStore((s) => s.addActivity)
  const [runs, setRuns] = useState<ShiplineRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const projectName = projectNameFromPath(projectPath)
  const activeRun = useMemo(() => {
    if (selectedRunId) return runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null
    return runs[0] ?? null
  }, [runs, selectedRunId])

  const replaceRun = useCallback((run: ShiplineRun) => {
    setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)])
    setSelectedRunId(run.id)
  }, [])

  const loadRuns = useCallback(async () => {
    if (!projectId) return
    const res = await window.daemon.shipline.listTimelines(projectId, 8)
    if (res.ok && res.data) {
      const data = res.data
      setRuns(data)
      setSelectedRunId((current) => current ?? data[0]?.id ?? null)
    }
  }, [projectId])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  useEffect(() => {
    const subscribe = window.daemon.shipline?.onTimelineUpdated
    if (typeof subscribe !== 'function') return undefined

    return subscribe((run) => {
      const belongsToProject = projectId
        ? run.projectId === projectId
        : projectPath
          ? run.projectPath === projectPath
          : false
      if (!belongsToProject) return

      replaceRun(run)
      const step = latestFinishedStep(run)
      if (!step) return
      addActivity({
        kind: step.status === 'complete' ? 'success' : 'error',
        context: 'Shipline',
        message: `${step.label} terminal exited ${step.status === 'complete' ? 'successfully' : 'with failure'}.`,
        sessionId: run.id,
        sessionStatus: sessionStatusForRun(run.status),
        projectId,
        projectName: projectName ?? run.projectName,
        artifacts: [
          { type: 'deploy', label: 'Step', value: step.label },
          ...step.artifacts.map((artifact) => ({
            type: artifact.href ? 'explorer' as const : 'other' as const,
            label: artifact.label,
            value: artifact.value,
            href: artifact.href ?? null,
          })),
        ],
      })
    })
  }, [addActivity, projectId, projectName, projectPath, replaceRun])

  const createTimeline = async () => {
    if (!projectPath) return
    setLoading(true)
    setError(null)
    const res = await window.daemon.shipline.createTimeline({
      projectId,
      projectPath,
      projectName,
      cluster: 'devnet',
    })
    if (res.ok && res.data) {
      const run = res.data
      replaceRun(run)
      addActivity({
        kind: run.status === 'ready' ? 'success' : 'warning',
        context: 'Shipline',
        message: run.summary,
        sessionId: run.id,
        sessionStatus: run.status === 'ready' ? 'created' : 'blocked',
        projectId,
        projectName,
        artifacts: artifactsForRun(run),
      })
    } else {
      setError(res.error ?? 'Could not create Shipline timeline')
      addActivity({
        kind: 'error',
        context: 'Shipline',
        message: res.error ?? 'Could not create Shipline timeline',
        projectId,
        projectName,
      })
    }
    setLoading(false)
  }

  const updateStepStatus = async (step: ShiplineTimelineStep, status: ShiplineStepStatus, terminalId?: string | null) => {
    if (!activeRun) return
    setError(null)
    const res = await window.daemon.shipline.updateStep({
      runId: activeRun.id,
      stepId: step.id,
      status,
      terminalId: terminalId ?? step.terminalId ?? null,
    })
    if (res.ok && res.data) {
      const run = res.data
      replaceRun(run)
      addActivity({
        kind: activityKindForStatus(status),
        context: 'Shipline',
        message: `${step.label} marked ${status}.`,
        sessionId: run.id,
        sessionStatus: sessionStatusForRun(run.status),
        projectId,
        projectName,
        artifacts: [
          { type: 'deploy', label: 'Step', value: step.label },
          ...step.artifacts.map((artifact) => ({
            type: 'program' as const,
            label: artifact.label,
            value: artifact.value,
            href: artifact.href ?? null,
          })),
        ],
      })
    } else {
      setError(res.error ?? `Could not update ${step.label}`)
      addActivity({
        kind: 'error',
        context: 'Shipline',
        message: res.error ?? `Could not update ${step.label}`,
        sessionId: activeRun.id,
        sessionStatus: sessionStatusForRun(activeRun.status),
        projectId,
        projectName,
      })
    }
  }

  const runStepCommand = async (step: ShiplineTimelineStep) => {
    if (!step.command || !activeRun) return
    const terminalId = await onRunCommand(step.command, `Shipline ${step.label}`)
    if (!terminalId) {
      setError(`Could not open terminal for ${step.label}`)
      return
    }
    await updateStepStatus(step, 'running', terminalId)
    addActivity({
      kind: 'info',
      context: 'Shipline',
      message: `${step.label} command opened for ${activeRun.cluster}.`,
      sessionId: activeRun.id,
      sessionStatus: 'running',
      projectId,
      projectName,
      artifacts: [
        { type: 'deploy', label: 'Step', value: step.label },
        ...step.artifacts.map((artifact) => ({
          type: 'program' as const,
          label: artifact.label,
          value: artifact.value,
          href: artifact.href ?? null,
        })),
      ],
    })
  }

  const openArtifact = (href?: string | null) => {
    if (href) void window.daemon.shell.openExternal(href)
  }

  const copyProofChecklist = async () => {
    if (!activeRun) return
    const text = proofChecklistForRun(activeRun)
    const res = await window.daemon.env.copyValue(text)
    if (res.ok) {
      useNotificationsStore.getState().pushSuccess('Copied Shipline proof checklist', 'Shipline')
    } else {
      useNotificationsStore.getState().pushToast({
        kind: 'warning',
        context: 'Shipline',
        message: res.error ?? 'Could not copy proof checklist.',
      })
    }
  }

  return (
    <section className="solana-ide-panel shipline-timeline">
      <div className="shipline-timeline-header">
        <div>
          <div className="solana-ide-panel-title">Shipline Devnet Timeline</div>
          <p className="solana-ide-panel-copy">
            {activeRun ? activeRun.summary : 'Create a deploy proof record from current project diagnostics.'}
          </p>
        </div>
        <div className="solana-ide-hero-actions">
          {activeRun && (
            <span className={`solana-runtime-status ${timelineStatusClass(activeRun.status)}`}>
              {activeRun.status === 'ready' ? 'Ready' : activeRun.status}
            </span>
          )}
          <button type="button" className="sol-btn" disabled={!activeRun} onClick={() => void copyProofChecklist()}>
            Copy Proof Checklist
          </button>
          <button type="button" className="sol-btn green" disabled={!projectPath || loading} onClick={() => void createTimeline()}>
            {loading ? 'Creating...' : activeRun ? 'Refresh Timeline' : 'Create Timeline'}
          </button>
        </div>
      </div>

      <div className="shipline-proof-strip" aria-label="Shipline video proof path">
        <span>Demo path</span>
        <strong>Detect</strong>
        <strong>Preflight</strong>
        <strong>Build</strong>
        <strong>Test</strong>
        <strong>Deploy</strong>
        <strong>Confirm</strong>
        <strong>Verify</strong>
        <strong>Export IDL</strong>
      </div>

      {error && <div className="solana-ide-check warning"><span className="solana-ide-check-dot" /><div className="solana-ide-check-detail">{error}</div></div>}

      {activeRun ? (
        <>
          <div className="shipline-run-meta">
            <span>{activeRun.cluster}</span>
            <span>{relativeTime(activeRun.updatedAt)}</span>
            <span>{activeRun.programs.length} program{activeRun.programs.length === 1 ? '' : 's'}</span>
          </div>

          {activeRun.programs.length > 0 && (
            <div className="shipline-program-grid">
              {activeRun.programs.map((program) => (
                <div key={`${activeRun.id}-${program.name}`} className="shipline-program-card">
                  <div className="solana-ide-card-title">{program.name}</div>
                  <div className="solana-ide-card-copy">{program.preferredProgramId ?? 'No program ID yet'}</div>
                  {program.explorerUrl && (
                    <button type="button" className="shipline-link" onClick={() => openArtifact(program.explorerUrl)}>
                      Explorer
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="shipline-step-list">
            {activeRun.steps.map((step, index) => (
              <div key={`${activeRun.id}-${step.id}`} className={`shipline-step ${step.status}`}>
                <div className="shipline-step-index">{index + 1}</div>
                <div className="shipline-step-main">
                  <div className="shipline-step-title-row">
                    <span className="shipline-step-title">{step.label}</span>
                    <span className={`solana-runtime-status ${timelineStatusClass(step.status)}`}>{stepLabel(step)}</span>
                  </div>
                  <div className="solana-ide-check-detail">{step.detail}</div>
                  {step.command && <code className="solana-ide-command">{step.command}</code>}
                  {step.warnings.length > 0 && (
                    <div className="shipline-mini-list">
                      {step.warnings.map((warning) => <span key={warning}>{warning}</span>)}
                    </div>
                  )}
                  {step.artifacts.length > 0 && (
                    <div className="shipline-evidence">
                      {step.artifacts.map((artifact) => (
                        artifact.href ? (
                          <button
                            key={`${artifact.label}-${artifact.value}`}
                            type="button"
                            className="shipline-link"
                            onClick={() => openArtifact(artifact.href)}
                          >
                            {artifact.label}
                          </button>
                        ) : (
                          <span key={`${artifact.label}-${artifact.value}`}>
                            <strong>{artifact.label}</strong>
                            {artifact.value}
                          </span>
                        )
                      ))}
                    </div>
                  )}
                </div>
                <div className="shipline-step-actions">
                  <button type="button" className="sol-btn" disabled={!canOpenStep(step)} onClick={() => void runStepCommand(step)}>
                    Open
                  </button>
                  <button type="button" className="sol-btn" disabled={!canCompleteStep(step)} onClick={() => void updateStepStatus(step, 'complete')}>
                    Done
                  </button>
                  {step.status === 'running' && (
                    <button type="button" className="sol-btn" onClick={() => void updateStepStatus(step, 'failed')}>
                      Failed
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {(activeRun.warnings.length > 0 || activeRun.recovery.length > 0) && (
            <div className="solana-ide-grid">
              {activeRun.warnings.length > 0 && (
                <section className="solana-ide-card warning">
                  <div className="solana-ide-card-title">Warnings</div>
                  <div className="shipline-mini-list">
                    {activeRun.warnings.slice(0, 6).map((warning) => <span key={warning}>{warning}</span>)}
                  </div>
                </section>
              )}
              <section className="solana-ide-card">
                <div className="solana-ide-card-title">Recovery</div>
                <div className="shipline-mini-list">
                  {activeRun.recovery.slice(0, 6).map((item) => <span key={item}>{item}</span>)}
                </div>
              </section>
            </div>
          )}
        </>
      ) : (
        <div className="shipline-empty">No Shipline timeline for this project yet</div>
      )}
    </section>
  )
}
