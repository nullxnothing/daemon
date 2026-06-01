import crypto from 'node:crypto'
import path from 'node:path'
import { getDb } from '../db/db'
import { isPathSafe } from '../shared/pathValidation'
import { detect, type SolanaDiagnosticCheck, type SolanaProjectInfo, type SolanaProgramDiagnostic } from './SolanaDetector'
import type {
  ShiplineCluster,
  ShiplineCreateRunInput,
  ShiplineProgramTarget,
  ShiplineRun,
  ShiplineRunStatus,
  ShiplineStepId,
  ShiplineStepStatus,
  ShiplineTimelineStep,
  ShiplineUpdateStepInput,
} from '../shared/types'

const STEP_ORDER: ShiplineStepId[] = [
  'preflight',
  'build',
  'tests',
  'priority-fees',
  'deploy',
  'confirm',
  'verify',
  'idl-export',
]

const STEP_STATUSES = new Set<ShiplineStepStatus>([
  'pending',
  'ready',
  'running',
  'complete',
  'warning',
  'blocked',
  'failed',
])

type ShiplineStepArtifact = ShiplineTimelineStep['artifacts'][number]

interface ShiplineRunRow {
  id: string
  project_id: string | null
  project_path: string
  project_name: string
  cluster: ShiplineCluster
  status: ShiplineRunStatus
  current_step: ShiplineStepId | null
  summary: string
  warnings_json: string
  recovery_json: string
  programs_json: string
  steps_json: string
  created_at: number
  updated_at: number
}

interface BuildShiplineRunInput {
  id: string
  projectId?: string | null
  projectPath: string
  projectName: string
  cluster: ShiplineCluster
  projectInfo: SolanaProjectInfo
  createdAt: number
  updatedAt: number
}

function parseArray<T>(raw: string | null): T[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

function projectNameFromPath(projectPath: string): string {
  const clean = projectPath.replace(/[\\/]+$/, '')
  return clean.split(/[\\/]/).pop() || clean
}

function clusterParam(cluster: ShiplineCluster): string {
  return cluster === 'devnet' ? 'devnet' : 'mainnet-beta'
}

function explorerAddressUrl(address: string, cluster: ShiplineCluster): string {
  const params = cluster === 'devnet' ? '?cluster=devnet' : ''
  return `https://explorer.solana.com/address/${address}${params}`
}

function statusFromChecks(checks: SolanaDiagnosticCheck[]): ShiplineStepStatus {
  if (checks.some((check) => check.status === 'missing')) return 'blocked'
  if (checks.some((check) => check.status === 'warning')) return 'warning'
  return 'ready'
}

function warningText(check: SolanaDiagnosticCheck): string {
  return `${check.label}: ${check.detail}`
}

function preferredProgramId(program: SolanaProgramDiagnostic): string | null {
  return program.anchorProgramId ?? program.declareId ?? program.idlAddress ?? program.keypairAddress ?? null
}

function toProgramTarget(program: SolanaProgramDiagnostic, cluster: ShiplineCluster): ShiplineProgramTarget {
  const targetId = preferredProgramId(program)
  const warnings = program.checks
    .filter((check) => check.status !== 'ready')
    .map(warningText)

  return {
    name: program.name,
    preferredProgramId: targetId,
    anchorProgramId: program.anchorProgramId,
    declareId: program.declareId,
    idlAddress: program.idlAddress,
    keypairAddress: program.keypairAddress,
    explorerUrl: targetId ? explorerAddressUrl(targetId, cluster) : null,
    warnings,
  }
}

function commandForBuild(projectInfo: SolanaProjectInfo): string | null {
  if (projectInfo.framework === 'anchor') return 'anchor build'
  if (projectInfo.framework === 'native') return 'cargo build-sbf'
  return null
}

function commandForTests(projectInfo: SolanaProjectInfo): string | null {
  if (projectInfo.framework === 'anchor') return 'anchor test'
  if (projectInfo.framework === 'native') return 'cargo test'
  if (projectInfo.framework === 'client-only') return 'pnpm test'
  return null
}

function commandForDeploy(projectInfo: SolanaProjectInfo, cluster: ShiplineCluster, programs: ShiplineProgramTarget[]): string | null {
  if (cluster === 'mainnet-beta') return null
  if (projectInfo.framework === 'anchor') return `anchor deploy --provider.cluster ${clusterParam(cluster)}`
  if (projectInfo.framework === 'native') {
    const programName = programs[0]?.name ?? '<program>'
    return `solana program deploy ./target/deploy/${programName}.so --url ${clusterParam(cluster)}`
  }
  return null
}

function commandForProgramShow(programId: string | null, cluster: ShiplineCluster): string | null {
  return programId ? `solana program show ${programId} --url ${clusterParam(cluster)}` : null
}

function commandForIdlExport(projectInfo: SolanaProjectInfo, program: ShiplineProgramTarget | null, cluster: ShiplineCluster): string | null {
  if (projectInfo.framework !== 'anchor' || !program?.preferredProgramId) return null
  return `anchor idl fetch ${program.preferredProgramId} --provider.cluster ${clusterParam(cluster)} > target/idl/${program.name}.deployed.json`
}

function makeStep(input: {
  id: ShiplineStepId
  label: string
  detail: string
  status: ShiplineStepStatus
  command?: string | null
  artifacts?: ShiplineTimelineStep['artifacts']
  warnings?: string[]
  recovery?: string[]
}): ShiplineTimelineStep {
  return {
    id: input.id,
    label: input.label,
    detail: input.detail,
    status: input.status,
    command: input.command ?? null,
    artifacts: input.artifacts ?? [],
    warnings: input.warnings ?? [],
    recovery: input.recovery ?? [],
    startedAt: null,
    completedAt: null,
    terminalId: null,
  }
}

function artifactKey(artifact: ShiplineStepArtifact): string {
  return `${artifact.label}:${artifact.value}:${artifact.href ?? ''}`
}

function mergeArtifacts(current: ShiplineStepArtifact[], additions: ShiplineStepArtifact[] = []): ShiplineStepArtifact[] {
  const merged = [...current]
  const keys = new Set(merged.map(artifactKey))
  for (const artifact of additions) {
    const key = artifactKey(artifact)
    if (keys.has(key)) continue
    keys.add(key)
    merged.push(artifact)
  }
  return merged.slice(0, 18)
}

function stripTerminalControl(raw: string): string {
  return raw
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B[()][A-Z0-9]/g, '')
}

function normalizeOutputKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseKeyValueOutput(raw: string): Record<string, string> {
  const cleaned = stripTerminalControl(raw).replace(/\r/g, '\n')
  const values: Record<string, string> = {}

  for (const line of cleaned.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^([A-Za-z][A-Za-z0-9\s/_-]{1,48}):\s*(.+)$/)
    if (!match) continue
    const key = normalizeOutputKey(match[1])
    if (!key || values[key]) continue
    values[key] = match[2].trim()
  }

  return values
}

function outputValue(values: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const value = values[normalizeOutputKey(key)]
    if (value) return value
  }
  return null
}

function evidenceFromProgramShow(step: ShiplineTimelineStep, exitCode: number, output?: string): ShiplineStepArtifact[] {
  if (!output?.trim()) return []
  if (step.id !== 'confirm' && step.id !== 'verify') return []
  if (!step.command || !/\bsolana\s+program\s+show\b/i.test(step.command)) return []

  const values = parseKeyValueOutput(output)
  const artifacts: ShiplineStepArtifact[] = []
  const programId = outputValue(values, ['Program Id', 'Program ID', 'Address'])
  const owner = outputValue(values, ['Owner'])
  const executable = outputValue(values, ['Executable'])
  const programDataAddress = outputValue(values, ['ProgramData Address', 'Program Data Address', 'ProgramData'])
  const upgradeAuthority = outputValue(values, ['Authority', 'Upgrade Authority'])
  const deployedSlot = outputValue(values, ['Last Deployed In Slot', 'Slot'])
  const dataLength = outputValue(values, ['Data Length'])
  const balance = outputValue(values, ['Balance'])

  if (programId) artifacts.push({ label: 'Program ID', value: programId })
  if (owner) artifacts.push({ label: 'Owner', value: owner })
  if (executable) {
    artifacts.push({ label: 'Executable', value: executable })
  } else if (exitCode === 0) {
    artifacts.push({ label: 'Executable', value: 'true (program show succeeded)' })
  }
  if (programDataAddress) artifacts.push({ label: 'Program data', value: programDataAddress })
  if (upgradeAuthority) artifacts.push({ label: 'Upgrade authority', value: upgradeAuthority })
  if (deployedSlot) artifacts.push({ label: 'Last deployed slot', value: deployedSlot })
  if (dataLength) artifacts.push({ label: 'Data length', value: dataLength })
  if (balance) artifacts.push({ label: 'Balance', value: balance })

  return artifacts
}

function buildWarnings(projectInfo: SolanaProjectInfo, programs: ShiplineProgramTarget[], cluster: ShiplineCluster): string[] {
  const diagnostics = projectInfo.diagnostics
  const warnings: string[] = []

  if (!projectInfo.isSolanaProject) {
    warnings.push('No Solana project indicators were detected for this workspace.')
  }

  for (const check of diagnostics?.checks ?? []) {
    if (check.status !== 'ready') warnings.push(warningText(check))
  }

  for (const program of programs) {
    warnings.push(...program.warnings)
  }

  if (programs.length === 0 && (projectInfo.framework === 'anchor' || projectInfo.framework === 'native')) {
    warnings.push('No deployable program target was discovered from Anchor.toml, programs/, target/idl, or target/deploy.')
  }

  if (programs.length > 0 && programs.every((program) => !program.preferredProgramId)) {
    warnings.push('Program targets were found, but no stable program ID source was available yet.')
  }

  if (cluster === 'mainnet-beta') {
    warnings.push('Mainnet-beta Shipline execution is blocked in this first timeline slice. Use devnet until policy and signing approvals are wired.')
  }

  return [...new Set(warnings)].slice(0, 20)
}

function buildRecovery(projectInfo: SolanaProjectInfo, programs: ShiplineProgramTarget[]): string[] {
  const recovery = [
    'Run the build step again after resolving diagnostics so target/idl and target/deploy artifacts are fresh.',
    'Confirm the Solana CLI cluster before running any deploy command.',
    'Use the program monitor to compare Anchor.toml, declare_id!, generated IDL, and deploy keypair IDs.',
  ]

  if (projectInfo.framework === 'anchor') {
    recovery.push('If IDL export fails, rerun anchor build and check that the deployed program exposes an Anchor IDL account.')
  }

  if (programs.some((program) => !program.preferredProgramId)) {
    recovery.push('If a program ID is missing, rebuild the project or add the program to Anchor.toml before deploying.')
  }

  return recovery
}

function buildSteps(projectInfo: SolanaProjectInfo, programs: ShiplineProgramTarget[], cluster: ShiplineCluster): ShiplineTimelineStep[] {
  const diagnostics = projectInfo.diagnostics
  const projectStatus = !projectInfo.isSolanaProject
    ? 'blocked'
    : statusFromChecks([...(diagnostics?.checks ?? []), ...(diagnostics?.programs.flatMap((program) => program.checks) ?? [])])
  const isProgram = projectInfo.framework === 'anchor' || projectInfo.framework === 'native'
  const preferredProgram = programs.find((program) => program.preferredProgramId) ?? programs[0] ?? null
  const deployCommand = commandForDeploy(projectInfo, cluster, programs)
  const deployBlocked = cluster === 'mainnet-beta' || !isProgram || !deployCommand
  const programArtifacts = preferredProgram?.preferredProgramId
    ? [{ label: 'Explorer', value: preferredProgram.preferredProgramId, href: preferredProgram.explorerUrl }]
    : []

  return [
    makeStep({
      id: 'preflight',
      label: 'Preflight',
      detail: projectInfo.isSolanaProject
        ? `${diagnostics?.issueCount ?? 0} diagnostic issue${diagnostics?.issueCount === 1 ? '' : 's'} before deploy.`
        : 'Open an Anchor or native Solana program workspace before creating a deploy run.',
      status: projectStatus,
      warnings: projectInfo.isSolanaProject ? [] : ['No Solana project indicators were detected.'],
      recovery: ['Open the Diagnose view and resolve missing project artifacts before deploy.'],
    }),
    makeStep({
      id: 'build',
      label: 'Build',
      detail: isProgram
        ? 'Compile the program and regenerate local IDL/keypair artifacts.'
        : 'Client-only projects do not expose a program deploy target.',
      status: isProgram ? 'ready' : 'blocked',
      command: commandForBuild(projectInfo),
      recovery: ['Fix compiler errors before continuing to deploy.'],
    }),
    makeStep({
      id: 'tests',
      label: 'Tests',
      detail: 'Run the project test loop before devnet deploy.',
      status: commandForTests(projectInfo) ? 'ready' : 'warning',
      command: commandForTests(projectInfo),
      warnings: commandForTests(projectInfo) ? [] : ['No canonical test command was inferred for this workspace.'],
      recovery: ['Add an explicit project test script if this inference is wrong.'],
    }),
    makeStep({
      id: 'priority-fees',
      label: 'Priority Fees',
      detail: cluster === 'devnet'
        ? 'Devnet deploys can use standard fees; mainnet should estimate priority fees from the configured RPC path.'
        : 'Estimate priority fees before mainnet deploy and record the chosen fee policy.',
      status: cluster === 'devnet' ? 'ready' : 'blocked',
      warnings: cluster === 'devnet' ? [] : ['Mainnet priority fee policy is not wired into Shipline execution yet.'],
      recovery: ['Use Helius or another configured RPC provider for fee estimation before mainnet execution.'],
    }),
    makeStep({
      id: 'deploy',
      label: 'Deploy',
      detail: deployBlocked
        ? 'Deploy execution is blocked until a devnet program target is ready.'
        : `Deploy the program to ${clusterParam(cluster)} from the active project path.`,
      status: deployBlocked ? 'blocked' : 'ready',
      command: deployCommand,
      artifacts: programArtifacts,
      warnings: cluster === 'mainnet-beta' ? ['Mainnet-beta deploy remains manual in this slice.'] : [],
      recovery: ['If deploy fails, inspect the terminal error, confirm the payer wallet, and rerun preflight checks.'],
    }),
    makeStep({
      id: 'confirm',
      label: 'Confirm',
      detail: preferredProgram?.preferredProgramId
        ? 'Confirm deployed program account state through Solana CLI.'
        : 'Program ID is required before confirmation can be automated.',
      status: preferredProgram?.preferredProgramId ? 'pending' : 'blocked',
      command: commandForProgramShow(preferredProgram?.preferredProgramId ?? null, cluster),
      artifacts: programArtifacts,
      recovery: ['Use the explorer link and solana program show output to verify the landed program.'],
    }),
    makeStep({
      id: 'verify',
      label: 'Verify',
      detail: preferredProgram?.preferredProgramId
        ? 'Review authority, executable state, and deployed account metadata.'
        : 'Program ID is required before verification can run.',
      status: preferredProgram?.preferredProgramId ? 'pending' : 'blocked',
      command: commandForProgramShow(preferredProgram?.preferredProgramId ?? null, cluster),
      artifacts: programArtifacts,
      recovery: ['If authority is unexpected, stop and review deploy keypair and Anchor.toml before any upgrade.'],
    }),
    makeStep({
      id: 'idl-export',
      label: 'IDL Export',
      detail: projectInfo.framework === 'anchor'
        ? 'Fetch the deployed IDL into target/idl for local comparison.'
        : 'IDL export only applies to Anchor program workspaces.',
      status: projectInfo.framework === 'anchor' && preferredProgram?.preferredProgramId ? 'pending' : 'blocked',
      command: commandForIdlExport(projectInfo, preferredProgram, cluster),
      artifacts: projectInfo.framework === 'anchor' && preferredProgram?.preferredProgramId
        ? [{ label: 'IDL path', value: `target/idl/${preferredProgram.name}.deployed.json` }]
        : [],
      recovery: ['If fetch fails, verify the Anchor IDL account exists and the provider cluster matches the deploy cluster.'],
    }),
  ]
}

function runStatusFromSteps(steps: ShiplineTimelineStep[]): ShiplineRunStatus {
  if (steps.some((step) => step.status === 'failed')) return 'failed'
  if (steps.some((step) => step.status === 'running')) return 'running'

  const required = steps.filter((step) => ['preflight', 'build', 'deploy'].includes(step.id))
  if (required.some((step) => step.status === 'blocked')) return 'blocked'

  const actionable = steps.filter((step) => step.status !== 'blocked')
  if (actionable.length > 0 && actionable.every((step) => step.status === 'complete')) return 'complete'

  return 'ready'
}

function currentStepFromSteps(steps: ShiplineTimelineStep[]): ShiplineStepId | null {
  return steps.find((step) => step.status === 'running')?.id
    ?? steps.find((step) => step.status === 'failed')?.id
    ?? steps.find((step) => step.status === 'ready' || step.status === 'warning')?.id
    ?? steps.find((step) => step.status === 'pending')?.id
    ?? steps.find((step) => step.status === 'blocked')?.id
    ?? null
}

function summaryForStatus(projectName: string, status: ShiplineRunStatus): string {
  if (status === 'complete') return `Shipline timeline is complete for ${projectName}.`
  if (status === 'running') return `Shipline timeline is running for ${projectName}.`
  if (status === 'failed') return `Shipline timeline failed for ${projectName}. Review the failed step before continuing.`
  if (status === 'ready') return `Devnet Shipline timeline is ready for ${projectName}.`
  return `Shipline timeline is blocked for ${projectName}. Review preflight warnings first.`
}

function updateStepTimestamp(
  step: ShiplineTimelineStep,
  status: ShiplineStepStatus,
  terminalId: string | null | undefined,
  now: number,
  artifacts: ShiplineStepArtifact[] = [],
): ShiplineTimelineStep {
  const nextTerminalId = terminalId !== undefined ? terminalId : step.terminalId ?? null
  const terminalArtifacts: ShiplineStepArtifact[] = []
  if (nextTerminalId) {
    terminalArtifacts.push({ label: 'Terminal', value: nextTerminalId })
  }
  if (status === 'running' && step.command) {
    terminalArtifacts.push({ label: 'Command', value: step.command })
  }
  const mergedArtifacts = mergeArtifacts(step.artifacts, [...terminalArtifacts, ...artifacts])

  if (status === 'running') {
    return {
      ...step,
      status,
      artifacts: mergedArtifacts,
      terminalId: nextTerminalId,
      startedAt: step.startedAt ?? now,
      completedAt: null,
    }
  }

  if (status === 'complete' || status === 'failed') {
    return {
      ...step,
      status,
      artifacts: mergedArtifacts,
      terminalId: nextTerminalId,
      startedAt: step.startedAt ?? now,
      completedAt: now,
    }
  }

  return {
    ...step,
    status,
    artifacts: mergedArtifacts,
    terminalId: null,
    startedAt: null,
    completedAt: null,
  }
}

function releaseNextPendingStep(steps: ShiplineTimelineStep[], completedStepId: ShiplineStepId): ShiplineTimelineStep[] {
  const completedIndex = STEP_ORDER.indexOf(completedStepId)
  if (completedIndex < 0) return steps

  const nextStepId = STEP_ORDER[completedIndex + 1]
  if (!nextStepId) return steps

  return steps.map((step) => (
    step.id === nextStepId && step.status === 'pending'
      ? { ...step, status: 'ready' }
      : step
  ))
}

export function applyShiplineStepUpdate(
  run: ShiplineRun,
  input: Omit<ShiplineUpdateStepInput, 'runId'> & { now?: number; artifacts?: ShiplineStepArtifact[] },
): ShiplineRun {
  if (!STEP_STATUSES.has(input.status)) throw new Error(`Unsupported Shipline step status: ${input.status}`)

  const step = run.steps.find((item) => item.id === input.stepId)
  if (!step) throw new Error(`Shipline step not found: ${input.stepId}`)
  if (step.status === 'blocked' && input.status !== 'blocked' && input.status !== 'failed') {
    throw new Error('Blocked Shipline steps cannot be advanced')
  }

  const now = input.now ?? Date.now()
  let steps = run.steps.map((item) => (
    item.id === input.stepId
      ? updateStepTimestamp(item, input.status, input.terminalId, now, input.artifacts)
      : item
  ))

  if (input.status === 'complete') {
    steps = releaseNextPendingStep(steps, input.stepId)
  }

  const status = runStatusFromSteps(steps)
  return {
    ...run,
    status,
    currentStep: currentStepFromSteps(steps),
    summary: summaryForStatus(run.projectName, status),
    steps,
    updatedAt: now,
  }
}

export function buildShiplineRun(input: BuildShiplineRunInput): ShiplineRun {
  const diagnostics = input.projectInfo.diagnostics
  const programs = (diagnostics?.programs ?? []).map((program) => toProgramTarget(program, input.cluster))
  const steps = buildSteps(input.projectInfo, programs, input.cluster)
  const warnings = buildWarnings(input.projectInfo, programs, input.cluster)
  const recovery = buildRecovery(input.projectInfo, programs)
  const status = runStatusFromSteps(steps)

  return {
    id: input.id,
    projectId: input.projectId ?? null,
    projectPath: input.projectPath,
    projectName: input.projectName,
    cluster: input.cluster,
    status,
    currentStep: currentStepFromSteps(steps),
    summary: summaryForStatus(input.projectName, status),
    warnings,
    recovery,
    programs,
    steps,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}

function insertRun(run: ShiplineRun): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO shipline_runs (
      id, project_id, project_path, project_name, cluster, status, current_step, summary,
      warnings_json, recovery_json, programs_json, steps_json, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    run.id,
    run.projectId,
    run.projectPath,
    run.projectName,
    run.cluster,
    run.status,
    run.currentStep,
    run.summary,
    JSON.stringify(run.warnings),
    JSON.stringify(run.recovery),
    JSON.stringify(run.programs),
    JSON.stringify(run.steps),
    run.createdAt,
    run.updatedAt,
  )
}

function updateRun(run: ShiplineRun): void {
  const db = getDb()
  db.prepare(
    `UPDATE shipline_runs
     SET status = ?,
         current_step = ?,
         summary = ?,
         warnings_json = ?,
         recovery_json = ?,
         programs_json = ?,
         steps_json = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(
    run.status,
    run.currentStep,
    run.summary,
    JSON.stringify(run.warnings),
    JSON.stringify(run.recovery),
    JSON.stringify(run.programs),
    JSON.stringify(run.steps),
    run.updatedAt,
    run.id,
  )
}

function rowToRun(row: ShiplineRunRow): ShiplineRun {
  return {
    id: row.id,
    projectId: row.project_id,
    projectPath: row.project_path,
    projectName: row.project_name,
    cluster: row.cluster,
    status: row.status,
    currentStep: row.current_step,
    summary: row.summary,
    warnings: parseArray<string>(row.warnings_json),
    recovery: parseArray<string>(row.recovery_json),
    programs: parseArray<ShiplineProgramTarget>(row.programs_json),
    steps: parseArray<ShiplineTimelineStep>(row.steps_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createTimelineRun(input: ShiplineCreateRunInput): Promise<ShiplineRun> {
  const projectPath = path.resolve(input.projectPath)
  if (!isPathSafe(projectPath)) throw new Error('Project path is outside the allowed workspace paths')

  const projectInfo = detect(projectPath)
  const now = Date.now()
  const run = buildShiplineRun({
    id: crypto.randomUUID(),
    projectId: input.projectId ?? null,
    projectPath,
    projectName: input.projectName?.trim() || projectNameFromPath(projectPath),
    cluster: input.cluster ?? 'devnet',
    projectInfo,
    createdAt: now,
    updatedAt: now,
  })

  insertRun(run)
  return run
}

export function listTimelineRuns(projectId?: string | null, limit = 10): ShiplineRun[] {
  const db = getDb()
  const safeLimit = Math.min(Math.max(1, limit), 50)
  const rows = projectId
    ? db.prepare('SELECT * FROM shipline_runs WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?').all(projectId, safeLimit) as ShiplineRunRow[]
    : db.prepare('SELECT * FROM shipline_runs ORDER BY updated_at DESC LIMIT ?').all(safeLimit) as ShiplineRunRow[]
  return rows.map(rowToRun)
}

export function getTimelineRun(id: string): ShiplineRun | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM shipline_runs WHERE id = ?').get(id) as ShiplineRunRow | undefined
  return row ? rowToRun(row) : null
}

export function completeRunningStepForTerminal(terminalId: string, exitCode: number, output = ''): ShiplineRun | null {
  if (!terminalId?.trim()) return null

  const db = getDb()
  const rows = db.prepare(
    'SELECT * FROM shipline_runs WHERE status = ? ORDER BY updated_at DESC LIMIT 25'
  ).all('running') as ShiplineRunRow[]

  const run = rows
    .map(rowToRun)
    .find((item) => item.steps.some((step) => step.status === 'running' && step.terminalId === terminalId))
  if (!run) return null

  const step = run.steps.find((item) => item.status === 'running' && item.terminalId === terminalId)
  if (!step) return null

  const now = Date.now()
  const artifacts: ShiplineStepArtifact[] = [
    { label: 'Exit code', value: String(exitCode) },
    { label: 'Finished', value: new Date(now).toISOString() },
    ...evidenceFromProgramShow(step, exitCode, output),
  ]
  const updated = applyShiplineStepUpdate(run, {
    stepId: step.id,
    status: exitCode === 0 ? 'complete' : 'failed',
    terminalId,
    now,
    artifacts,
  })
  updateRun(updated)
  return updated
}

export function updateTimelineStep(input: ShiplineUpdateStepInput): ShiplineRun {
  if (!input.runId?.trim()) throw new Error('Shipline run ID is required')
  const run = getTimelineRun(input.runId)
  if (!run) throw new Error('Shipline timeline was not found')

  const updated = applyShiplineStepUpdate(run, {
    stepId: input.stepId,
    status: input.status,
    terminalId: input.terminalId ?? null,
  })
  updateRun(updated)
  return updated
}
