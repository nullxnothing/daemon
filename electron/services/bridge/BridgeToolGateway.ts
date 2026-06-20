/**
 * Bridge gateway — the single path from an external MCP agent to an ARIA tool.
 *
 * Electron-free on purpose (DB + settings only) so Vitest can drive it directly.
 * Risk gating is NOT re-implemented here: every call goes through
 * AriaAgentService.executeToolCall with planApproved pinned false, so write and
 * sensitive tools always pause on the injected requestApproval. The approval
 * itself can only be resolved from DAEMON's renderer — never by the caller.
 */
import crypto from 'node:crypto'
import { getDb } from '../../db/db'
import * as SettingsService from '../SettingsService'
import { executeToolCall, type AriaTransport } from '../AriaAgentService'
import { getTool } from '../aria/toolCatalog'
import type { AriaTool } from '../aria/AriaTool'
import { BRIDGE_TOOL_ALLOWLIST } from './bridgeManifest'
import type { BridgeCallResult, BridgeToolDescriptor, BridgeToolEvent } from '../../shared/types'

const DEFAULT_APPROVAL_TIMEOUT_MS = 120_000

/** Tools that cannot run without a resolved DAEMON project. */
const PROJECT_REQUIRED_TOOLS = new Set([
  'remember_fact', 'recall_memories', 'forget_memory', 'update_memory',
  'assign_project_wallet',
])

export interface BridgeCallRequest {
  toolName: string
  input: Record<string, unknown>
  cwd?: string
}

export interface BridgeGatewayDeps {
  requestApproval: AriaTransport['requestApproval']
  cancelApproval: (callId: string) => void
  emit?: (event: BridgeToolEvent) => void
  approvalTimeoutMs?: number
}

export function getApprovalTimeoutMs(): number {
  const raw = Number(process.env.DAEMON_BRIDGE_APPROVAL_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_APPROVAL_TIMEOUT_MS
}

/** Allowlist ∩ enabled packs, resolved against the live catalog. */
export function listBridgeTools(): BridgeToolDescriptor[] {
  const packs = SettingsService.getEnabledPacks()
  const tools: BridgeToolDescriptor[] = []
  for (const entry of BRIDGE_TOOL_ALLOWLIST) {
    if (entry.packId && packs[entry.packId] === false) continue
    const tool = getTool(entry.name)
    if (!tool) continue
    tools.push({
      name: tool.name,
      description: tool.description,
      risk: tool.risk,
      inputSchema: tool.input as Record<string, unknown>,
    })
  }
  return tools
}

/** Resolve a tool name through the allowlist + pack filter, with a caller-safe reason. */
export function findBridgeTool(name: string): { ok: true; tool: AriaTool } | { ok: false; error: string } {
  const entry = BRIDGE_TOOL_ALLOWLIST.find((t) => t.name === name)
  if (!entry) return { ok: false, error: `Unknown tool "${name}" — not exposed over the DAEMON Bridge.` }
  if (entry.packId && SettingsService.getEnabledPacks()[entry.packId] === false) {
    return { ok: false, error: `Tool unavailable: the ${entry.packId} pack is disabled in DAEMON.` }
  }
  const tool = getTool(name)
  if (!tool) return { ok: false, error: `Unknown tool "${name}".` }
  return { ok: true, tool }
}

interface ProjectMatch { id: string; path: string }

/** Longest-prefix match of the caller's cwd against registered project paths. */
export function resolveProjectForCwd(cwd: string | undefined): ProjectMatch | null {
  if (!cwd) return null
  const rows = getDb().prepare('SELECT id, path FROM projects').all() as ProjectMatch[]
  const target = normalizeFsPath(cwd)
  let best: ProjectMatch | null = null
  let bestLen = -1
  for (const row of rows) {
    const root = normalizeFsPath(row.path)
    const isMatch = target === root || target.startsWith(root + '/')
    if (isMatch && root.length > bestLen) {
      best = row
      bestLen = root.length
    }
  }
  return best
}

/**
 * Normalize a caller-supplied path for prefix comparison. DAEMON runs on
 * Windows, so cwds are Windows paths — but this also executes on Linux CI, where
 * `path.resolve` would mangle `C:\...`. So we normalize separators ourselves
 * instead of leaning on the host's `path` semantics: backslashes → `/`, collapse
 * repeats, strip a trailing slash, and lowercase (Windows paths are
 * case-insensitive). Keeps comparison stable regardless of the runtime OS.
 */
function normalizeFsPath(value: string): string {
  const unified = value
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
  return unified.toLowerCase()
}

/** Execute one external tool call through the standard ARIA risk gate. */
export async function executeBridgeCall(req: BridgeCallRequest, deps: BridgeGatewayDeps): Promise<BridgeCallResult> {
  const found = findBridgeTool(req.toolName)
  if (!found.ok) return { status: 'error', summary: found.error }
  if (!req.input || typeof req.input !== 'object' || Array.isArray(req.input)) {
    return { status: 'error', summary: 'Tool input must be a JSON object.' }
  }

  const project = resolveProjectForCwd(req.cwd)
  if (!project && PROJECT_REQUIRED_TOOLS.has(req.toolName)) {
    return {
      status: 'error',
      summary: `No DAEMON project matches "${req.cwd ?? '(no cwd)'}" — add this folder as a project in DAEMON first.`,
    }
  }

  const callId = crypto.randomUUID()
  const timeoutMs = deps.approvalTimeoutMs ?? getApprovalTimeoutMs()
  let approvalTimedOut = false

  const transport: AriaTransport = {
    emit: () => {},
    requestApproval: (approval) =>
      new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          approvalTimedOut = true
          deps.cancelApproval(approval.callId)
          resolve(false)
        }, timeoutMs)
        deps.requestApproval(approval).then((approved) => {
          clearTimeout(timer)
          resolve(approved)
        })
      }),
    requestPatchDecision: async () => 'discard',
    runUiEffect: async () => {
      // Tripwire: no allowlisted tool uses UI effects. If one ever does, fail loudly
      // instead of silently no-oping a renderer round-trip.
      throw new Error('UI effects are not available over the bridge.')
    },
  }

  const record = await executeToolCall(
    { id: callId, name: req.toolName, input: req.input },
    {
      sessionId: `bridge:${crypto.randomUUID()}`,
      snapshot: {
        activeProjectId: project?.id ?? null,
        activeProjectPath: project?.path ?? null,
        currentPanelId: null,
        openFilePath: null,
        chips: { activeFile: false, projectTree: false, gitDiff: false, terminalLogs: false, walletContext: false },
        planMode: false,
      },
      runUiEffect: transport.runUiEffect,
    },
    transport,
  )

  const status: BridgeCallResult['status'] =
    record.status === 'rejected' && approvalTimedOut ? 'timeout'
    : record.status === 'rejected' ? 'rejected'
    : record.status === 'error' ? 'error'
    : 'done'
  const summary =
    status === 'timeout'
      ? `Approval timed out — no response in DAEMON within ${Math.round(timeoutMs / 1000)}s.`
      : record.summary
  deps.emit?.({ kind: 'call', callId, name: req.toolName, risk: found.tool.risk, status, summary })
  return { status, summary, result: record.result }
}
