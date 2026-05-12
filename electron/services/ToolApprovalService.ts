import crypto from 'node:crypto'
import { getDb } from '../db/db'
import type {
  DaemonAiToolApprovalDecisionInput,
  DaemonAiToolApprovalRequest,
  DaemonAiToolCallInput,
  DaemonAiToolRiskLevel,
} from '../shared/types'

const LOW_RISK_TOOLS = new Set([
  'read_file',
  'search_files',
  'list_project_tree',
  'get_active_file',
  'get_git_status',
  'get_git_diff',
  'inspect_package_json',
])

const MEDIUM_RISK_TOOLS = new Set([
  'write_patch',
  'create_file',
  'rename_file',
  'run_tests',
  'format_files',
])

const HIGH_RISK_TOOLS = new Set([
  'run_terminal_command',
  'install_package',
  'git_stage',
  'git_commit_draft',
  'open_external_url',
  'prepare_devnet_deploy',
])

const BLOCKED_TOOLS = new Set([
  'delete_file_safe',
  'git_push',
  'deploy',
  'export_private_key',
  'sign_transaction',
  'send_transaction',
  'transfer_sol',
  'transfer_token',
])

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bRemove-Item\b[\s\S]*\b-Recurse\b/i,
  /\bdel\s+\/[sq]\b/i,
  /\bformat\b\s+[a-z]:/i,
  /\bgit\s+push\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-fd\b/i,
  /\bshutdown\b/i,
  /\breg\s+delete\b/i,
  /\bwallet.*(private|secret|seed)\b/i,
]

function previewArgs(input: unknown): unknown {
  if (input == null) return {}
  const json = JSON.stringify(input)
  if (json.length <= 2_000) return input
  return { truncated: true, preview: json.slice(0, 2_000) }
}

function argsText(input: unknown): string {
  if (typeof input === 'string') return input
  try {
    return JSON.stringify(input)
  } catch {
    return String(input)
  }
}

export function classifyToolRisk(toolName: string, args?: unknown): DaemonAiToolRiskLevel {
  const normalized = toolName.trim().toLowerCase()
  if (!normalized) return 'blocked'
  if (BLOCKED_TOOLS.has(normalized)) return 'blocked'

  const text = argsText(args)
  if (normalized === 'run_terminal_command' && DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'blocked'
  }

  if (HIGH_RISK_TOOLS.has(normalized)) return 'high'
  if (MEDIUM_RISK_TOOLS.has(normalized)) return 'medium'
  if (LOW_RISK_TOOLS.has(normalized)) return 'low'
  return 'high'
}

export function requiresApproval(riskLevel: DaemonAiToolRiskLevel): boolean {
  return riskLevel !== 'low'
}

function mapApproval(row: Record<string, unknown>): DaemonAiToolApprovalRequest {
  const riskLevel = row.risk_level as DaemonAiToolRiskLevel
  const status = row.status as DaemonAiToolApprovalRequest['status']
  return {
    id: String(row.id),
    runId: String(row.run_id),
    toolCallId: String(row.tool_call_id),
    toolName: String(row.tool_name),
    riskLevel,
    summary: String(row.summary),
    argumentsPreview: JSON.parse(String(row.arguments_json ?? '{}')),
    status,
    requiresApproval: requiresApproval(riskLevel),
    createdAt: Number(row.created_at),
    decidedAt: row.decided_at == null ? null : Number(row.decided_at),
    decisionReason: row.decision_reason == null ? null : String(row.decision_reason),
  }
}

export function requestToolApproval(input: DaemonAiToolCallInput): DaemonAiToolApprovalRequest {
  if (!input || typeof input.runId !== 'string' || !input.runId.trim()) throw new Error('runId required')
  if (typeof input.toolName !== 'string' || !input.toolName.trim()) throw new Error('toolName required')

  const db = getDb()
  const run = db.prepare('SELECT id FROM ai_agent_runs WHERE id = ?').get(input.runId)
  if (!run) throw new Error('Agent run not found')

  const toolName = input.toolName.trim()
  const toolCallId = input.toolCallId?.trim() || crypto.randomUUID()
  const riskLevel = classifyToolRisk(toolName, input.arguments)
  const status = riskLevel === 'blocked' ? 'blocked' : 'pending'
  const now = Date.now()

  db.prepare(`
    INSERT INTO ai_tool_approval_events (
      id, run_id, tool_call_id, tool_name, risk_level, summary, arguments_json,
      status, decision_reason, created_at, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id, tool_call_id) DO UPDATE SET
      tool_name = excluded.tool_name,
      risk_level = excluded.risk_level,
      summary = excluded.summary,
      arguments_json = excluded.arguments_json,
      status = excluded.status,
      decision_reason = excluded.decision_reason,
      decided_at = excluded.decided_at
  `).run(
    crypto.randomUUID(),
    input.runId,
    toolCallId,
    toolName,
    riskLevel,
    input.summary?.trim() || `Run ${toolName}`,
    JSON.stringify(previewArgs(input.arguments)),
    status,
    riskLevel === 'blocked' ? 'Blocked by DAEMON tool safety policy' : null,
    now,
    riskLevel === 'blocked' ? now : null,
  )

  return getToolApproval(input.runId, toolCallId)
}

export function decideToolApproval(input: DaemonAiToolApprovalDecisionInput): DaemonAiToolApprovalRequest {
  if (!input || typeof input.runId !== 'string' || !input.runId.trim()) throw new Error('runId required')
  if (typeof input.toolCallId !== 'string' || !input.toolCallId.trim()) throw new Error('toolCallId required')
  if (input.decision !== 'approve' && input.decision !== 'reject') throw new Error('decision must be approve or reject')

  const current = getToolApproval(input.runId, input.toolCallId)
  if (current.status === 'blocked') throw new Error('Blocked tool calls cannot be approved')
  if (current.status !== 'pending') return current

  getDb().prepare(`
    UPDATE ai_tool_approval_events
    SET status = ?, decision_reason = ?, decided_at = ?
    WHERE run_id = ? AND tool_call_id = ?
  `).run(
    input.decision === 'approve' ? 'approved' : 'rejected',
    input.reason?.trim() || null,
    Date.now(),
    input.runId,
    input.toolCallId,
  )

  return getToolApproval(input.runId, input.toolCallId)
}

export function getToolApproval(runId: string, toolCallId: string): DaemonAiToolApprovalRequest {
  const row = getDb().prepare(`
    SELECT * FROM ai_tool_approval_events
    WHERE run_id = ? AND tool_call_id = ?
  `).get(runId, toolCallId) as Record<string, unknown> | undefined
  if (!row) throw new Error('Tool approval not found')
  return mapApproval(row)
}

export function listToolApprovals(runId: string): DaemonAiToolApprovalRequest[] {
  if (!runId?.trim()) throw new Error('runId required')
  return getDb().prepare(`
    SELECT * FROM ai_tool_approval_events
    WHERE run_id = ?
    ORDER BY created_at ASC
  `).all(runId).map((row) => mapApproval(row as Record<string, unknown>))
}
