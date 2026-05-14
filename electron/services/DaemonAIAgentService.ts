import crypto from 'node:crypto'
import path from 'node:path'
import { getDb } from '../db/db'
import { assertVerifiedFeature, assertVerifiedHostedModelLane } from './EntitlementGuardService'
import { isPathSafe } from '../shared/pathValidation'
import type {
  DaemonAiAccessMode,
  DaemonAiAgentMode,
  DaemonAiAgentRun,
  DaemonAiAgentRunInput,
  DaemonAiAgentRunStatus,
  DaemonAiApprovalPolicy,
  DaemonAiModelLane,
} from '../shared/types'

const VALID_AGENT_MODES = new Set<DaemonAiAgentMode>(['patch', 'agent', 'background'])
const VALID_ACCESS_MODES = new Set<DaemonAiAccessMode>(['hosted', 'byok'])
const VALID_MODEL_LANES = new Set<DaemonAiModelLane>(['auto', 'fast', 'standard', 'reasoning', 'premium'])
const VALID_APPROVAL_POLICIES = new Set<DaemonAiApprovalPolicy>([
  'require_for_write_and_terminal',
  'require_for_all_tools',
  'read_only',
])

const DEFAULT_ALLOWED_TOOLS = [
  'read_file',
  'search_files',
  'list_project_tree',
  'get_git_status',
  'get_git_diff',
  'write_patch',
  'run_tests',
]

function normalizeMode(input: unknown): DaemonAiAgentMode {
  return VALID_AGENT_MODES.has(input as DaemonAiAgentMode) ? input as DaemonAiAgentMode : 'patch'
}

function normalizeAccessMode(input: unknown): DaemonAiAccessMode {
  return VALID_ACCESS_MODES.has(input as DaemonAiAccessMode) ? input as DaemonAiAccessMode : 'byok'
}

function normalizeModelLane(input: unknown): DaemonAiModelLane {
  return VALID_MODEL_LANES.has(input as DaemonAiModelLane) ? input as DaemonAiModelLane : 'auto'
}

function normalizeApprovalPolicy(input: unknown): DaemonAiApprovalPolicy {
  return VALID_APPROVAL_POLICIES.has(input as DaemonAiApprovalPolicy)
    ? input as DaemonAiApprovalPolicy
    : 'require_for_write_and_terminal'
}

function normalizeTools(input: unknown, policy: DaemonAiApprovalPolicy): string[] {
  if (policy === 'read_only') {
    return ['read_file', 'search_files', 'list_project_tree', 'get_git_status', 'get_git_diff']
  }

  if (!Array.isArray(input)) return DEFAULT_ALLOWED_TOOLS
  const tools = input
    .filter((tool): tool is string => typeof tool === 'string')
    .map((tool) => tool.trim().toLowerCase())
    .filter(Boolean)
  return Array.from(new Set(tools)).slice(0, 40)
}

export function normalizeAgentRunInput(input: DaemonAiAgentRunInput): Required<Pick<
  DaemonAiAgentRunInput,
  'task' | 'mode' | 'accessMode' | 'modelPreference' | 'allowedTools' | 'approvalPolicy'
>> & Pick<DaemonAiAgentRunInput, 'projectId' | 'projectPath' | 'context'> {
  if (!input || typeof input.task !== 'string' || !input.task.trim()) throw new Error('task required')
  const task = input.task.trim()
  if (task.length > 24_000) throw new Error('task is too large; limit is 24000 characters')
  const mode = normalizeMode(input.mode)
  const accessMode = normalizeAccessMode(input.accessMode)
  const modelPreference = normalizeModelLane(input.modelPreference)
  const approvalPolicy = normalizeApprovalPolicy(input.approvalPolicy)

  return {
    task,
    mode,
    accessMode,
    modelPreference,
    approvalPolicy,
    allowedTools: normalizeTools(input.allowedTools, approvalPolicy),
    projectId: typeof input.projectId === 'string' && input.projectId.trim() ? input.projectId.trim() : null,
    projectPath: typeof input.projectPath === 'string' && input.projectPath.trim() ? path.resolve(input.projectPath) : null,
    context: input.context,
  }
}

function mapRun(row: Record<string, unknown>): DaemonAiAgentRun {
  return {
    id: String(row.id),
    task: String(row.task),
    projectId: row.project_id == null ? null : String(row.project_id),
    projectPath: row.project_path == null ? null : String(row.project_path),
    mode: row.mode as DaemonAiAgentMode,
    accessMode: row.access_mode as DaemonAiAccessMode,
    modelLane: row.model_lane as DaemonAiModelLane,
    status: row.status as DaemonAiAgentRunStatus,
    allowedTools: JSON.parse(String(row.allowed_tools_json ?? '[]')),
    approvalPolicy: row.approval_policy as DaemonAiApprovalPolicy,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    cancelledAt: row.cancelled_at == null ? null : Number(row.cancelled_at),
    result: row.result_json ? JSON.parse(String(row.result_json)) : null,
    error: row.error == null ? null : String(row.error),
  }
}

async function assertEntitlement(input: ReturnType<typeof normalizeAgentRunInput>) {
  if (input.accessMode === 'hosted') {
    await assertVerifiedHostedModelLane(input.modelPreference)
  }
  if (input.mode === 'background') {
    await assertVerifiedFeature('cloud-agents')
  }
}

export async function createAgentRun(input: DaemonAiAgentRunInput): Promise<DaemonAiAgentRun> {
  const normalized = normalizeAgentRunInput(input)
  await assertEntitlement(normalized)
  if (normalized.projectPath && !isPathSafe(normalized.projectPath)) {
    throw new Error('projectPath is not allowed')
  }

  const id = crypto.randomUUID()
  const now = Date.now()
  getDb().prepare(`
    INSERT INTO ai_agent_runs (
      id, task, project_id, project_path, mode, access_mode, model_lane, status,
      allowed_tools_json, approval_policy, result_json, error, cancelled_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalized.task,
    normalized.projectId,
    normalized.projectPath,
    normalized.mode,
    normalized.accessMode,
    normalized.modelPreference,
    'queued',
    JSON.stringify(normalized.allowedTools),
    normalized.approvalPolicy,
    null,
    null,
    null,
    now,
    now,
  )

  return getAgentRun(id)
}

export function getAgentRun(id: string): DaemonAiAgentRun {
  if (!id?.trim()) throw new Error('run id required')
  const row = getDb().prepare('SELECT * FROM ai_agent_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) throw new Error('Agent run not found')
  return mapRun(row)
}

export function listAgentRuns(limit = 50): DaemonAiAgentRun[] {
  const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
  return getDb().prepare(`
    SELECT * FROM ai_agent_runs
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(boundedLimit).map((row) => mapRun(row as Record<string, unknown>))
}

export function cancelAgentRun(id: string): DaemonAiAgentRun {
  const run = getAgentRun(id)
  if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') return run
  const now = Date.now()
  getDb().prepare(`
    UPDATE ai_agent_runs
    SET status = 'cancelled', cancelled_at = ?, updated_at = ?
    WHERE id = ?
  `).run(now, now, id)
  return getAgentRun(id)
}
