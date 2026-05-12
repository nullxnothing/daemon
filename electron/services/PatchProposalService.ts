import crypto from 'node:crypto'
import { execFile as execFileCb } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { getDb } from '../db/db'
import { isPathWithinBase } from '../shared/pathValidation'
import type {
  DaemonAiPatchApplyInput,
  DaemonAiPatchApplyResult,
  DaemonAiPatchDecisionInput,
  DaemonAiPatchProposal,
  DaemonAiPatchProposalInput,
  DaemonAiPatchRiskLevel,
  DaemonAiPatchSafetyFinding,
} from '../shared/types'

const execFile = promisify(execFileCb)
const MAX_PATCH_CHARS = 500_000
const DIFF_PATH_RE = /^diff --git a\/(.+) b\/(.+)$/
const FILE_MARKER_RE = /^(?:---|\+\+\+) (?:a|b)\/(.+)$/
const GIT_APPLY_TIMEOUT_MS = 10_000
const GIT_APPLY_MAX_BUFFER = 1_000_000

function normalizeDiffPath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^["']|["']$/g, '').trim()
}

function isUnsafePath(input: string): boolean {
  const normalized = normalizeDiffPath(input)
  return (
    !normalized ||
    normalized.includes('\0') ||
    path.isAbsolute(normalized) ||
    normalized.split('/').includes('..') ||
    normalized.startsWith('~')
  )
}

function isSensitivePatchPath(input: string): boolean {
  const normalized = normalizeDiffPath(input).toLowerCase()
  const basename = normalized.split('/').pop() ?? normalized
  if ((basename === '.env' || basename.startsWith('.env.')) && basename !== '.env.example') return true
  return (
    basename === '.npmrc' ||
    basename === '.pypirc' ||
    basename === 'id_rsa' ||
    basename === 'id_ed25519' ||
    basename.endsWith('.pem') ||
    basename.endsWith('.key') ||
    basename.endsWith('keypair.json') ||
    normalized.includes('/target/deploy/')
  )
}

function highestRisk(findings: DaemonAiPatchSafetyFinding[]): DaemonAiPatchRiskLevel {
  if (findings.some((finding) => finding.severity === 'blocked')) return 'blocked'
  if (findings.some((finding) => finding.severity === 'high')) return 'high'
  if (findings.some((finding) => finding.severity === 'medium')) return 'medium'
  return 'low'
}

export function extractPatchFilePaths(unifiedDiff: string): string[] {
  const files = new Set<string>()
  for (const line of unifiedDiff.split(/\r?\n/)) {
    const diffMatch = line.match(DIFF_PATH_RE)
    if (diffMatch) {
      for (const raw of [diffMatch[1], diffMatch[2]]) {
        const filePath = normalizeDiffPath(raw)
        if (filePath !== '/dev/null') files.add(filePath)
      }
      continue
    }

    const markerMatch = line.match(FILE_MARKER_RE)
    if (markerMatch) {
      const filePath = normalizeDiffPath(markerMatch[1])
      if (filePath !== '/dev/null') files.add(filePath)
    }
  }
  return Array.from(files)
}

export function validatePatchProposal(input: {
  unifiedDiff: string
  projectPath?: string | null
}): { files: string[]; riskLevel: DaemonAiPatchRiskLevel; safetyFindings: DaemonAiPatchSafetyFinding[] } {
  if (typeof input.unifiedDiff !== 'string' || !input.unifiedDiff.trim()) {
    throw new Error('unifiedDiff required')
  }
  if (input.unifiedDiff.length > MAX_PATCH_CHARS) {
    throw new Error(`unifiedDiff is too large; limit is ${MAX_PATCH_CHARS} characters`)
  }
  if (input.unifiedDiff.includes('GIT binary patch')) {
    throw new Error('Binary patches are not supported')
  }

  const files = extractPatchFilePaths(input.unifiedDiff)
  if (files.length === 0) throw new Error('No files found in unifiedDiff')
  if (files.length > 100) throw new Error('Patch proposals are limited to 100 files')

  const findings: DaemonAiPatchSafetyFinding[] = []
  for (const filePath of files) {
    if (isUnsafePath(filePath)) {
      findings.push({
        severity: 'blocked',
        code: 'unsafe_path',
        message: 'Patch contains an absolute, empty, or parent-traversal path.',
        filePath,
      })
      continue
    }

    if (isSensitivePatchPath(filePath)) {
      findings.push({
        severity: 'blocked',
        code: 'sensitive_path',
        message: 'Patch touches a sensitive credential, key, or deploy artifact path.',
        filePath,
      })
    }

    if (input.projectPath) {
      const absoluteTarget = path.resolve(input.projectPath, filePath)
      if (!isPathWithinBase(absoluteTarget, input.projectPath)) {
        findings.push({
          severity: 'blocked',
          code: 'outside_project',
          message: 'Patch target resolves outside the agent run project.',
          filePath,
        })
      }
    }
  }

  if (input.unifiedDiff.split(/\r?\n/).some((line) => line.length > 20_000)) {
    findings.push({
      severity: 'medium',
      code: 'long_line',
      message: 'Patch contains unusually long lines and should be reviewed carefully.',
    })
  }

  return {
    files,
    riskLevel: highestRisk(findings),
    safetyFindings: findings,
  }
}

function mapProposal(row: Record<string, unknown>): DaemonAiPatchProposal {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    title: String(row.title),
    summary: row.summary == null ? null : String(row.summary),
    unifiedDiff: String(row.unified_diff),
    files: JSON.parse(String(row.files_json ?? '[]')),
    status: row.status as DaemonAiPatchProposal['status'],
    riskLevel: row.risk_level as DaemonAiPatchRiskLevel,
    safetyFindings: JSON.parse(String(row.safety_findings_json ?? '[]')),
    createdAt: Number(row.created_at),
    decidedAt: row.decided_at == null ? null : Number(row.decided_at),
    decisionReason: row.decision_reason == null ? null : String(row.decision_reason),
  }
}

export function createPatchProposal(input: DaemonAiPatchProposalInput): DaemonAiPatchProposal {
  if (!input || typeof input.runId !== 'string' || !input.runId.trim()) throw new Error('runId required')
  const db = getDb()
  const run = db.prepare('SELECT id, project_path FROM ai_agent_runs WHERE id = ?').get(input.runId) as { id: string; project_path: string | null } | undefined
  if (!run) throw new Error('Agent run not found')

  const validation = validatePatchProposal({
    unifiedDiff: input.unifiedDiff,
    projectPath: run.project_path,
  })
  const id = crypto.randomUUID()
  const now = Date.now()

  db.prepare(`
    INSERT INTO ai_patch_proposals (
      id, run_id, title, summary, unified_diff, files_json, status, risk_level,
      safety_findings_json, decision_reason, created_at, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.runId,
    input.title?.trim() || 'Patch proposal',
    input.summary?.trim() || null,
    input.unifiedDiff,
    JSON.stringify(validation.files),
    'proposed',
    validation.riskLevel,
    JSON.stringify(validation.safetyFindings),
    null,
    now,
    null,
  )

  return getPatchProposal(id)
}

export function getPatchProposal(id: string): DaemonAiPatchProposal {
  if (!id?.trim()) throw new Error('proposal id required')
  const row = getDb().prepare('SELECT * FROM ai_patch_proposals WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) throw new Error('Patch proposal not found')
  return mapProposal(row)
}

export function listPatchProposals(runId: string): DaemonAiPatchProposal[] {
  if (!runId?.trim()) throw new Error('runId required')
  return getDb().prepare(`
    SELECT * FROM ai_patch_proposals
    WHERE run_id = ?
    ORDER BY created_at DESC
  `).all(runId).map((row) => mapProposal(row as Record<string, unknown>))
}

export function decidePatchProposal(input: DaemonAiPatchDecisionInput): DaemonAiPatchProposal {
  if (!input || typeof input.proposalId !== 'string' || !input.proposalId.trim()) throw new Error('proposalId required')
  if (input.decision !== 'accept' && input.decision !== 'reject') throw new Error('decision must be accept or reject')
  const current = getPatchProposal(input.proposalId)
  if (current.status !== 'proposed') return current
  if (input.decision === 'accept' && current.riskLevel === 'blocked') {
    throw new Error('Blocked patch proposals cannot be accepted')
  }

  getDb().prepare(`
    UPDATE ai_patch_proposals
    SET status = ?, decision_reason = ?, decided_at = ?
    WHERE id = ?
  `).run(
    input.decision === 'accept' ? 'accepted' : 'rejected',
    input.reason?.trim() || null,
    Date.now(),
    input.proposalId,
  )
  return getPatchProposal(input.proposalId)
}

function formatExecError(error: unknown): string {
  if (error && typeof error === 'object') {
    const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr.trim() : ''
    const stdout = 'stdout' in error && typeof error.stdout === 'string' ? error.stdout.trim() : ''
    const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
    return stderr || stdout || message
  }
  return String(error)
}

async function runGitApply(projectPath: string, args: string[]): Promise<void> {
  try {
    await execFile('git', args, {
      cwd: projectPath,
      timeout: GIT_APPLY_TIMEOUT_MS,
      maxBuffer: GIT_APPLY_MAX_BUFFER,
      windowsHide: true,
    })
  } catch (error) {
    throw new Error(`Patch no longer applies cleanly: ${formatExecError(error)}`)
  }
}

export async function applyUnifiedDiff(projectPath: string, unifiedDiff: string): Promise<{ files: string[]; appliedAt: number }> {
  if (typeof projectPath !== 'string' || !projectPath.trim()) throw new Error('projectPath required')
  const resolvedProjectPath = path.resolve(projectPath)
  const projectStat = fs.statSync(resolvedProjectPath)
  if (!projectStat.isDirectory()) throw new Error('projectPath must be a directory')

  const validation = validatePatchProposal({
    unifiedDiff,
    projectPath: resolvedProjectPath,
  })
  if (validation.riskLevel === 'blocked') {
    throw new Error('Patch has blocked safety findings and cannot be applied')
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-patch-'))
  const patchPath = path.join(tempDir, 'proposal.patch')
  try {
    fs.writeFileSync(patchPath, unifiedDiff, { encoding: 'utf8', mode: 0o600 })
    await runGitApply(resolvedProjectPath, ['apply', '--check', '--whitespace=nowarn', patchPath])
    await runGitApply(resolvedProjectPath, ['apply', '--whitespace=nowarn', patchPath])
    return {
      files: validation.files,
      appliedAt: Date.now(),
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

export async function applyPatchProposal(input: DaemonAiPatchApplyInput): Promise<DaemonAiPatchApplyResult> {
  if (!input || typeof input.proposalId !== 'string' || !input.proposalId.trim()) throw new Error('proposalId required')

  const row = getDb().prepare(`
    SELECT p.*, r.project_path
    FROM ai_patch_proposals p
    INNER JOIN ai_agent_runs r ON r.id = p.run_id
    WHERE p.id = ?
  `).get(input.proposalId) as (Record<string, unknown> & { project_path?: string | null }) | undefined
  if (!row) throw new Error('Patch proposal not found')

  const proposal = mapProposal(row)
  if (proposal.status !== 'accepted') throw new Error('Patch proposal must be accepted before it can be applied')
  if (proposal.riskLevel === 'blocked') throw new Error('Blocked patch proposals cannot be applied')
  if (typeof row.project_path !== 'string' || !row.project_path.trim()) {
    throw new Error('Patch proposal does not have an agent run project path')
  }

  const result = await applyUnifiedDiff(row.project_path, proposal.unifiedDiff)
  getDb().prepare(`
    UPDATE ai_patch_proposals
    SET status = 'applied', decision_reason = ?, decided_at = ?
    WHERE id = ?
  `).run(
    input.reason?.trim() || proposal.decisionReason,
    result.appliedAt,
    input.proposalId,
  )

  return {
    proposal: getPatchProposal(input.proposalId),
    files: result.files,
    appliedAt: result.appliedAt,
  }
}
