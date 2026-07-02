/**
 * ARIA agentic operator loop (main process). Replaces the old single-shot
 * AriaService.sendMessage with a tool-calling loop: the model picks tools,
 * read-only tools auto-run, write/sensitive tools pause for renderer approval,
 * and the transcript streams to the renderer via the injected transport.
 *
 * Transport (emit / requestApproval / runUiEffect) is injected by the IPC layer
 * (electron/ipc/aria.ts) so this service stays testable and process-agnostic.
 */
import crypto from 'node:crypto'
import { getDb } from '../db/db'
import { runClaudeAgentTurn } from './providers/ClaudeProvider'
import * as ProviderRegistry from './providers/ProviderRegistry'
import { resolveOperatorBackend, getGlmEndpoint, type OperatorBackend, type OperatorEndpoint } from './providers/glmConfig'
import { recordLocalAiUsage } from './DaemonAIService'
import { ARIA_TOOLS, getTool } from './aria/toolCatalog'
import * as MemoryService from './MemoryService'
import { assembleSystemPrompt } from './aria/contextAssembler'
import { clusterMark } from './aria/tools/shared'
import { toAnthropicTools, type AriaTool, type AriaContextSnapshot, type AriaUiEffect } from './aria/AriaTool'
import { laneToClaudeModel, buildPlanSteps, buildPatchProposal } from './aria/patchUtils'
import type { AgentMessage, AgentToolUse } from './providers/agentTurn'
import type { ProviderId } from './providers/ProviderInterface'
import type {
  AriaMessage, AriaSession, AriaResponse, AriaToolCallRecord, AriaToolEvent,
  AriaPatchProposalLite, AriaPatchAction, AriaPlanStep, DaemonAiModelLane, MemoryKind,
} from '../shared/types'

const MAX_ITERATIONS = 8
const AGENT_DEADLINE_MS = 120_000
const MAX_HISTORY = 40
const DEFAULT_LANE: DaemonAiModelLane = 'auto'

/** An emit-time event: messageId may be omitted at the call site because the
 *  transport stamps it with the session id before it reaches the renderer (which
 *  requires it for session isolation). The wire type AriaToolEvent still requires
 *  messageId, so the guarantee holds at the boundary. */
export type AriaEmitEvent =
  | AriaToolEvent
  | Omit<Extract<AriaToolEvent, { kind: 'tool-call' }>, 'messageId'>
  | Omit<Extract<AriaToolEvent, { kind: 'approval-request' }>, 'messageId'>

export interface AriaTransport {
  /** Stream a transcript event to the renderer. */
  emit: (event: AriaEmitEvent) => void
  /** Pause for a write/sensitive tool; resolves true on approval. */
  requestApproval: (req: {
    callId: string
    name: string
    risk: AriaTool['risk']
    summary: string
    input: unknown
    /** Execution-fee quote for this call, shown on the approval card. */
    fee?: { bps: number; lamports: number; treasury: string }
  }) => Promise<boolean>
  /** Pause for a proposed patch; resolves with the user's keep/run-tests/discard decision. */
  requestPatchDecision: (proposal: AriaPatchProposalLite) => Promise<AriaPatchAction>
  /** Run a renderer-only effect; resolves with posted-back data when awaitData. */
  runUiEffect: (effect: AriaUiEffect, awaitData: boolean) => Promise<unknown>
}

type ConversationEntry = { role: 'user' | 'assistant'; content: string }
const conversations = new Map<string, AgentMessage[]>()
const textHistory = new Map<string, ConversationEntry[]>()

function isProviderAuthed(conn: { isAuthenticated: boolean; authMode: string } | null): boolean {
  return Boolean(conn && (conn.isAuthenticated || conn.authMode !== 'none'))
}

async function verifyPreferredProvider(id: ProviderId): Promise<boolean> {
  try {
    const provider = ProviderRegistry.get(id)
    // Fast path: a cached connection (in-memory or a <24h app_settings row) avoids
    // re-spawning `claude --version` on every turn. Only do the full async verify
    // on a cold cache.
    const cached = provider.getConnection()
    if (cached) return isProviderAuthed(cached)
    return isProviderAuthed(await provider.verifyConnection())
  } catch {
    return false
  }
}

/**
 * Warm the backend-resolution caches off the critical path so the first turn
 * doesn't pay for a `claude --version` verify. Safe to call fire-and-forget at
 * startup; errors are swallowed (resolution re-runs lazily on the first turn).
 */
export async function prewarmBackend(): Promise<void> {
  try {
    await resolveAriaBackend()
  } catch { /* lazy re-resolve on first turn */ }
}

async function resolveAriaBackend(): Promise<OperatorBackend | null> {
  const preferred = ProviderRegistry.getPreferences().aria.provider
  const backend = resolveOperatorBackend()
  if (backend === 'glm') return backend
  if (backend === 'claude' && await verifyPreferredProvider('claude')) return backend
  if (preferred === 'codex') return null
  if (backend === 'codex') return null
  return null
}

/**
 * Trim old turns without orphaning a tool_use/tool_result pair: drop from the
 * front, then ensure the first remaining message isn't a tool_result-only user
 * turn (which the Anthropic API rejects as a dangling result).
 */
function trimHistory(messages: AgentMessage[]): void {
  if (messages.length <= MAX_HISTORY) return
  messages.splice(0, messages.length - MAX_HISTORY)
  while (messages.length > 0 && isToolResultTurn(messages[0])) {
    messages.shift()
  }
}

function isToolResultTurn(msg: AgentMessage): boolean {
  return (
    msg.role === 'user' &&
    Array.isArray(msg.content) &&
    msg.content.some((b) => (b as { type?: string }).type === 'tool_result')
  )
}

function isStaleNoToolResponse(text: string): boolean {
  const lower = text.toLowerCase()
  return [
    "don't have a list",
    "do not have a list",
    "don't have directory",
    "can't browse",
    "can't enumerate",
    'cannot enumerate',
    'directory-listing',
    'list directory',
    'tell me a filename',
    'name a file',
    'give me the path',
    'specific file if you give me',
  ].some((pattern) => lower.includes(pattern))
}

/**
 * Fast path for a handful of read-only tools when the message is an UNAMBIGUOUS command, not a
 * natural-language question. Prior behavior matched bare keyword containment ('status',
 * 'directory', any Windows path), which hijacked ordinary questions ('why does C:\\...\\x.ts
 * throw?', 'check the swap status') away from the model and silently switched projects. Now this
 * only fires on an exact tool name or a short imperative at the START of the message; anything
 * conversational falls through to the LLM. Returns [] to mean "let the model handle it".
 */
function directToolUsesForMessage(message: string): AgentToolUse[] {
  const text = message.trim()
  // Guard: never intercept a longer, sentence-like message — those are questions for the model.
  if (text.length > 64 || /[?]/.test(text)) return []

  const uses: AgentToolUse[] = []
  const add = (name: string, input: Record<string, unknown> = {}) => {
    uses.push({ id: `direct_${crypto.randomUUID()}`, name, input })
  }

  // Bare project-status command only (exact, not the word 'status' inside a sentence).
  if (/^(read_project_status|project status|status)$/i.test(text)) {
    add('read_project_status')
  } else if (/^(recall_memories|recall memories|stored facts|what do you know)$/i.test(text)) {
    add('recall_memories')
  } else if (/^(list_project_tree|list files|show files|list directory|ls)$/i.test(text)) {
    add('list_project_tree', { path: '.', limit: 80 })
  } else {
    // Imperative tool invocations: an explicit verb followed by an argument.
    const open = text.match(/^(?:open_file|open file|open)\s+(.+)$/i)?.[1]?.trim()
    if (open) add('open_file', { path: open })
    const read = text.match(/^(?:read_file|read file|read)\s+(.+)$/i)?.[1]?.trim()
    if (read) add('read_file', { path: read })
    // Explicit project switch only ('open/switch to <path>'), never a bare path in prose.
    const activate = text.match(/^(?:activate_project|activate|switch to|open project)\s+([A-Za-z]:\\[^\r\n"'`]+)$/i)?.[1]?.trim()
    if (activate) add('activate_project', { project: activate.replace(/[)\],;]+$/, '') })
  }

  const readOnly = new Set(['activate_project', 'read_project_status', 'recall_memories', 'list_project_tree', 'open_file', 'read_file'])
  return uses.filter((use) => readOnly.has(use.name))
}

function summarizeDirectToolCalls(calls: AriaToolCallRecord[]): string {
  const sections: string[] = []
  for (const call of calls) {
    if (call.status !== 'done') {
      sections.push(`${call.name}: ${call.summary}`)
      continue
    }
    if (call.name === 'list_project_tree') {
      const entries = ((call.result as { entries?: Array<{ path: string }> })?.entries ?? []).slice(0, 80)
      sections.push(entries.length > 0
        ? `Files:\n${entries.map((entry) => `- ${entry.path}`).join('\n')}`
        : 'Files: none found.')
      continue
    }
    if (call.name === 'recall_memories') {
      const memories = (call.result as { memories?: Array<{ kind: string; title: string; value: string }> })?.memories ?? []
      sections.push(memories.length > 0
        ? `Stored facts:\n${memories.map((m) => `- ${m.kind}: ${m.title} - ${m.value}`).join('\n')}`
        : 'Stored facts: none.')
      continue
    }
    if (call.name === 'read_project_status' && typeof call.result === 'object') {
      sections.push(`Project status:\n\`\`\`json\n${JSON.stringify(call.result, null, 2)}\n\`\`\``)
      continue
    }
    if (call.name === 'read_file' && typeof call.result === 'object') {
      const result = call.result as { path?: string; content?: string; truncated?: boolean }
      sections.push(`${result.path ?? 'file'}${result.truncated ? ' (truncated)' : ''}:\n\`\`\`\n${result.content ?? ''}\n\`\`\``)
      continue
    }
    sections.push(call.summary)
  }
  return sections.join('\n\n')
}

function persistMessage(msg: Omit<AriaMessage, 'id' | 'created_at'>): string {
  const db = getDb()
  const id = crypto.randomUUID()
  db.prepare(
    'INSERT INTO aria_messages (id, role, content, metadata, session_id) VALUES (?,?,?,?,?)'
  ).run(id, msg.role, msg.content, msg.metadata, msg.session_id)
  return id
}

/**
 * Run a full agentic turn for a user message. Returns the final assistant
 * response (text + the tool calls that ran) once the loop settles.
 */
export async function sendMessage(
  sessionId: string,
  userMessage: string,
  snapshot: AriaContextSnapshot,
  transport: AriaTransport,
  modelLane: DaemonAiModelLane = DEFAULT_LANE,
): Promise<AriaResponse> {
  const model = laneToClaudeModel(modelLane)
  ensureSession(sessionId)
  // Rehydrate from DB on a cold session so the model regains conversational
  // memory after an app restart or a session switch (the in-memory maps are
  // process-local and lost on restart).
  const messages = conversations.get(sessionId) ?? rehydrateConversation(sessionId)
  conversations.set(sessionId, messages)
  const text = textHistory.get(sessionId) ?? rehydrateText(sessionId)
  textHistory.set(sessionId, text)

  messages.push({ role: 'user', content: userMessage })
  text.push({ role: 'user', content: userMessage })
  trimHistory(messages)
  persistMessage({ role: 'user', content: userMessage, metadata: '{}', session_id: sessionId })
  touchSession(sessionId, userMessage)

  const tools = toAnthropicTools(ARIA_TOOLS)
  const { system, recalled } = await assembleSystemPrompt(snapshot)
  if (recalled.length > 0) {
    transport.emit({ kind: 'memory-recall', messageId: sessionId, recalled })
  }
  // Mutable plan/patch state the special-cased tools fill in as the loop runs.
  const turnState: TurnState = { plan: [], patch: null, planApproved: false }
  const ctx = { sessionId, snapshot, runUiEffect: transport.runUiEffect }

  const toolCalls: AriaToolCallRecord[] = []
  const directUses = directToolUsesForMessage(userMessage)
  if (directUses.length > 0) {
    for (const use of directUses) {
      toolCalls.push(await executeTool(use, ctx, transport, turnState))
    }
    const finalText = summarizeDirectToolCalls(toolCalls)
    messages.push({ role: 'assistant', content: finalText })
    trimHistory(messages)
    text.push({ role: 'assistant', content: finalText })
    persistMessage({
      role: 'assistant',
      content: finalText,
      metadata: JSON.stringify({ toolCalls }),
      session_id: sessionId,
    })
    touchSession(sessionId)
    transport.emit({ kind: 'done', messageId: sessionId, text: finalText })
    return { text: finalText, actions: [], toolCalls }
  }

  // Pick the operator backend by what's actually usable (GLM preferred — cheapest).
  // GLM and Claude both run the full Anthropic tool-loop; Codex is chat-only; none -> error.
  const backend = await resolveAriaBackend()
  if (!backend) {
    const preferred = ProviderRegistry.getPreferences().aria.provider
    const message = preferred === 'codex'
      ? 'ARIA needs a tool-capable backend for operator actions. Codex is text-only here; add a ZAI_API_KEY or sign in to Claude in Settings.'
      : `ARIA is set to ${preferred}, but that provider is not ready. Update AI Providers in Settings or sign in to Claude.`
    transport.emit({ kind: 'done', messageId: sessionId, text: message })
    text.push({ role: 'assistant', content: message })
    persistMessage({ role: 'assistant', content: message, metadata: '{}', session_id: sessionId })
    return { text: message, actions: [], toolCalls: [] }
  }
  if (backend === 'codex') {
    const provider = ProviderRegistry.getFeatureProvider('aria')
    return legacyAnswer(sessionId, userMessage, provider, text, transport)
  }
  // backend is 'glm' or 'claude' — both drive the tool-loop below.
  const endpoint = backend === 'glm' ? getGlmEndpoint() ?? undefined : undefined

  let finalText = ''
  const deadline = Date.now() + AGENT_DEADLINE_MS
  let promptForUsage = userMessage
  let retriedStaleNoToolResponse = false

  try {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      if (Date.now() > deadline) {
        finalText ||= 'Stopped: hit the time limit before finishing.'
        break
      }

      const turn = await runClaudeAgentTurn({ messages, system, model, tools, maxTokens: 2048 }, endpoint)
      promptForUsage = system

      if (turn.toolUses.length === 0) {
        if (!retriedStaleNoToolResponse && isStaleNoToolResponse(turn.text)) {
          retriedStaleNoToolResponse = true
          messages.push({
            role: 'user',
            content: 'You answered without using tools. Use the available ARIA tools now: activate_project for project paths, list_project_tree for directory contents, read_file/open_file for files, and read_project_status plus recall_memories for project knowledge. Do not ask for a filename unless the user specifically requests opening one.',
          })
          continue
        }
        if (turn.text) {
          finalText = turn.text
          transport.emit({ kind: 'assistant-text', messageId: sessionId, text: turn.text })
        }
        break
      }

      if (turn.text) {
        finalText = turn.text
        transport.emit({ kind: 'assistant-text', messageId: sessionId, text: turn.text })
      }

      // Record the assistant turn (with its tool_use blocks) verbatim.
      messages.push({
        role: 'assistant',
        content: [
          ...(turn.text ? [{ type: 'text', text: turn.text }] : []),
          ...turn.toolUses.map((u) => ({ type: 'tool_use', id: u.id, name: u.name, input: u.input })),
        ],
      })

      const toolResults: unknown[] = []
      for (const use of turn.toolUses) {
        const record = await executeTool(use, ctx, transport, turnState)
        toolCalls.push(record)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: typeof record.result === 'string' ? record.result : JSON.stringify(record.result ?? record.summary),
          is_error: record.status === 'error' || record.status === 'rejected',
        })
      }
      messages.push({ role: 'user', content: toolResults })
    }
  } catch (err) {
    const fallback = ProviderRegistry.getFeatureProvider('aria')
    if (fallback.id === 'claude' && await verifyPreferredProvider('claude')) {
      return legacyAnswer(sessionId, userMessage, fallback, text, transport)
    }
    finalText = `Error: ${(err as Error).message}`
  }

  // Any plan steps left un-flipped are done once the loop settles.
  markRemainingPlanDone(turnState, transport, sessionId)

  // Auto-capture: if this turn did real work, offer to remember a durable fact.
  // Best-effort and non-blocking — never let capture failure affect the turn.
  await maybeCaptureMemory({
    sessionId, snapshot, model, endpoint, userMessage, finalText, toolCalls, transport,
  }).catch(() => { /* capture is advisory */ })

  trimHistory(messages)
  text.push({ role: 'assistant', content: finalText })

  recordLocalAiUsage({
    feature: 'aria-operator',
    provider: 'anthropic',
    model,
    inputText: promptForUsage,
    outputText: finalText,
  })

  persistMessage({
    role: 'assistant',
    content: finalText,
    metadata: JSON.stringify({
      toolCalls,
      ...(turnState.plan.length ? { plan: turnState.plan } : {}),
      ...(turnState.patch ? { patch: turnState.patch } : {}),
    }),
    session_id: sessionId,
  })
  touchSession(sessionId)

  transport.emit({ kind: 'done', messageId: sessionId, text: finalText })
  return { text: finalText, actions: [], toolCalls }
}

/** Per-turn plan/patch state mutated by the special-cased tools. */
interface TurnState {
  plan: AriaPlanStep[]
  patch: AriaPatchProposalLite | null
  /** Plan mode: set once the user approves the presented plan. While true, the
   *  risk gate auto-runs `write` tools (sensitive money/key tools still gate). */
  planApproved: boolean
}

/** Mark the next pending plan step active, the previous active one done, and re-emit. */
function advancePlan(state: TurnState, transport: AriaTransport, sessionId: string): void {
  if (state.plan.length === 0) return
  let changed = false
  const active = state.plan.find((s) => s.status === 'active')
  if (active) { active.status = 'done'; changed = true }
  const next = state.plan.find((s) => s.status === 'pending')
  if (next) { next.status = 'active'; changed = true }
  if (changed) transport.emit({ kind: 'plan', messageId: sessionId, steps: state.plan.map((s) => ({ ...s })) })
}

function markRemainingPlanDone(state: TurnState, transport: AriaTransport, sessionId: string): void {
  if (state.plan.length === 0) return
  let changed = false
  for (const step of state.plan) {
    if (step.status !== 'done') { step.status = 'done'; changed = true }
  }
  if (changed) transport.emit({ kind: 'plan', messageId: sessionId, steps: state.plan.map((s) => ({ ...s })) })
}

const MEMORY_CAPTURE_KINDS: readonly MemoryKind[] = [
  'decision', 'constraint', 'do_not_touch', 'prior_fix', 'prior_failure',
  'command', 'style_preference', 'deployment_target', 'security_note',
]

interface CaptureArgs {
  sessionId: string
  snapshot: AriaContextSnapshot
  model: string
  endpoint: OperatorEndpoint | undefined
  userMessage: string
  finalText: string
  toolCalls: AriaToolCallRecord[]
  transport: AriaTransport
}

/**
 * After a turn that changed something, ask the model (one cheap call, no tools) whether
 * a single durable project fact was established. If so, store it as a *suggested* memory
 * (never auto-approved) and surface it inline for the user to keep or dismiss. The privacy
 * guard in MemoryService still gates the value. Skipped for read-only turns and when no
 * project is active.
 */
async function maybeCaptureMemory(args: CaptureArgs): Promise<void> {
  const { snapshot, toolCalls } = args
  if (!snapshot.activeProjectId) return
  const didWork = toolCalls.some(
    (c) => (c.toolKind === 'edit' || c.toolKind === 'run') && c.status === 'done',
  )
  if (!didWork) return

  const actions = toolCalls
    .filter((c) => c.status === 'done')
    .map((c) => `- ${c.name}: ${c.summary}`)
    .join('\n')
  const capturePrompt = `You review a completed operator turn and decide if it established ONE durable, reusable fact about THIS project — a decision made, a constraint to honor, a fix that should not be repeated, or a command/convention. Ignore one-off actions and anything secret (keys, seeds, credentials).

User asked: ${args.userMessage}
Actions taken:
${actions || '(none)'}
Result: ${args.finalText}

Respond with a single line of JSON and nothing else.
If there is a durable fact: {"kind":"<one of: ${MEMORY_CAPTURE_KINDS.join(', ')}>","title":"<short>","value":"<the fact>"}
Otherwise: {"none":true}`

  const turn = await runClaudeAgentTurn(
    { messages: [{ role: 'user', content: capturePrompt }], system: '', model: args.model, tools: [], maxTokens: 256 },
    args.endpoint,
  )
  const parsed = parseCaptureJson(turn.text)
  if (!parsed) return

  try {
    const mem = MemoryService.createSuggestion({
      projectId: snapshot.activeProjectId,
      kind: parsed.kind,
      title: parsed.title,
      value: parsed.value,
      sourceType: 'operator_capture',
      sourceRef: args.sessionId,
      confidence: 0.7,
      createdBy: 'agent',
    })
    // Stays 'suggested' — the user keeps or dismisses via the inline card.
    if (mem.status === 'suggested') {
      args.transport.emit({
        kind: 'memory-suggestion',
        messageId: args.sessionId,
        suggestion: { id: mem.id, kind: mem.kind, title: mem.title, value: mem.value },
      })
    }
  } catch { /* privacy guard rejected, or duplicate — drop silently */ }
}

function parseCaptureJson(text: string): { kind: MemoryKind; title: string; value: string } | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>
    if (obj.none) return null
    const title = typeof obj.title === 'string' ? obj.title.trim() : ''
    const value = typeof obj.value === 'string' ? obj.value.trim() : ''
    if (!title || !value) return null
    const kind = MEMORY_CAPTURE_KINDS.includes(obj.kind as MemoryKind) ? (obj.kind as MemoryKind) : 'decision'
    return { kind, title, value }
  } catch {
    return null
  }
}

/** Execute one tool through the standard risk gate, outside the chat loop.
 *  Used by the Bridge: `planApproved` is pinned false so every write/sensitive
 *  call pauses on `transport.requestApproval` — external agents never get the
 *  plan-mode auto-run path. */
export async function executeToolCall(
  use: { id: string; name: string; input: Record<string, unknown> },
  ctx: { sessionId: string; snapshot: AriaContextSnapshot; runUiEffect: AriaTransport['runUiEffect'] },
  transport: AriaTransport,
): Promise<AriaToolCallRecord> {
  return executeTool(use, ctx, transport, { plan: [], patch: null, planApproved: false })
}

async function executeTool(
  use: { id: string; name: string; input: Record<string, unknown> },
  ctx: { sessionId: string; snapshot: AriaContextSnapshot; runUiEffect: AriaTransport['runUiEffect'] },
  transport: AriaTransport,
  turnState: TurnState,
): Promise<AriaToolCallRecord> {
  // Intercept the planning + patch tools: they drive transcript UI, not side effects.
  if (use.name === 'present_plan') return handlePresentPlan(use, ctx, transport, turnState)
  if (use.name === 'propose_patch') return handleProposePatch(use, ctx, transport, turnState)
  // (ctx carries snapshot.activeProjectPath for Guard scanning inside handleProposePatch)

  const tool = getTool(use.name)
  const base: AriaToolCallRecord = {
    callId: use.id,
    name: use.name,
    toolKind: tool?.kind ?? 'run',
    risk: tool?.risk ?? 'write',
    status: 'done',
    summary: '',
    input: use.input,
  }

  if (!tool) {
    transport.emit({ kind: 'tool-call', callId: use.id, name: use.name, label: use.name, toolKind: 'run', risk: 'write', status: 'error' })
    return { ...base, status: 'error', summary: `Unknown tool "${use.name}".` }
  }

  transport.emit({ kind: 'tool-call', callId: use.id, name: tool.name, label: tool.name, toolKind: tool.kind, risk: tool.risk, status: 'pending' })

  // Each real tool that runs advances the plan one step.
  advancePlan(turnState, transport, ctx.sessionId)

  // Risk gate: write/sensitive pause for approval. In Plan mode, an approved
  // plan auto-runs `write` tools — but `sensitive` money/key tools always gate.
  const needsApproval = tool.risk === 'sensitive' || (tool.risk !== 'read' && !turnState.planApproved)
  if (needsApproval) {
    let fee: { bps: number; lamports: number; treasury: string } | undefined
    try {
      fee = tool.feePreview?.(use.input) ?? undefined
    } catch {
      fee = undefined
    }
    const approved = await transport.requestApproval({
      callId: use.id,
      name: tool.name,
      risk: tool.risk,
      summary: describeIntent(tool, use.input),
      input: use.input,
      fee,
    })
    if (!approved) {
      transport.emit({ kind: 'tool-call', callId: use.id, name: tool.name, label: tool.name, toolKind: tool.kind, risk: tool.risk, status: 'error', meta: 'rejected' })
      return { ...base, status: 'rejected', summary: 'User rejected this action.' }
    }
  }

  transport.emit({ kind: 'tool-call', callId: use.id, name: tool.name, label: tool.name, toolKind: tool.kind, risk: tool.risk, status: 'running' })
  try {
    const result = await tool.handler(use.input, ctx)
    transport.emit({
      kind: 'tool-call', callId: use.id, name: tool.name, label: tool.name, toolKind: tool.kind, risk: tool.risk,
      status: result.ok ? 'done' : 'error', meta: result.summary,
    })
    return { ...base, status: result.ok ? 'done' : 'error', summary: result.summary, result: result.data ?? result.summary }
  } catch (err) {
    const message = (err as Error).message
    transport.emit({ kind: 'tool-call', callId: use.id, name: tool.name, label: tool.name, toolKind: tool.kind, risk: tool.risk, status: 'error', meta: message })
    return { ...base, status: 'error', summary: message }
  }
}

/** present_plan: register the plan, emit it, mark the first step active. In Plan
 *  mode, block on a single approval before the loop runs any write action. */
async function handlePresentPlan(
  use: { id: string; name: string; input: Record<string, unknown> },
  ctx: { sessionId: string; snapshot: AriaContextSnapshot },
  transport: AriaTransport,
  turnState: TurnState,
): Promise<AriaToolCallRecord> {
  const rawSteps = Array.isArray(use.input.steps) ? (use.input.steps as Array<{ title?: unknown }>) : []
  turnState.plan = buildPlanSteps(rawSteps.map((s) => String(s?.title ?? '')))
  if (turnState.plan.length > 0) {
    turnState.plan[0].status = 'active'
    // messageId is the session id on every other emit; the renderer drops events
    // whose messageId != the active session, so this must be ctx.sessionId (not
    // the tool-call id) or plan events would be discarded after a session switch.
    transport.emit({ kind: 'plan', messageId: ctx.sessionId, steps: turnState.plan.map((s) => ({ ...s })) })
  }

  // Plan mode: pause for one approval. Reuses the approval transport with a
  // `__plan__` sentinel name (ApprovalCard renders the plan variant off it).
  if (ctx.snapshot.planMode && turnState.plan.length > 0) {
    const approved = await transport.requestApproval({
      callId: use.id,
      name: '__plan__',
      risk: 'write',
      summary: `${turnState.plan.length} steps — approve to run the plan.`,
      input: use.input,
    })
    if (!approved) {
      return {
        callId: use.id, name: use.name, toolKind: 'read', risk: 'read',
        status: 'rejected', summary: 'User declined the plan.', input: use.input,
        result: 'User declined the plan. Do not execute any steps; stop and ask how to adjust.',
      }
    }
    turnState.planApproved = true
  }

  return {
    callId: use.id, name: use.name, toolKind: 'read', risk: 'read',
    status: 'done', summary: `Planned ${turnState.plan.length} steps.`, input: use.input,
    result: `Plan registered with ${turnState.plan.length} steps.`,
  }
}

/** propose_patch: build the proposal, pause for the user's decision, gate the write. */
async function handleProposePatch(
  use: { id: string; name: string; input: Record<string, unknown> },
  ctx: { sessionId: string; snapshot?: AriaContextSnapshot },
  transport: AriaTransport,
  turnState: TurnState,
): Promise<AriaToolCallRecord> {
  const proposal = buildPatchProposal(use.input, ctx.snapshot?.activeProjectPath ?? null)
  turnState.patch = proposal
  advancePlan(turnState, transport, ctx.sessionId)

  // Surface Guard findings before the keep/discard decision so the user sees them on the card.
  if (proposal.guardFindings.length > 0) {
    const worst = proposal.guardFindings[0]
    transport.emit({
      kind: 'tool-call', callId: use.id, name: use.name, label: 'guard', toolKind: 'read', risk: 'read',
      status: 'done',
      meta: `Guard: ${proposal.guardFindings.length} finding(s) · ${worst.severity} · ${worst.message}`,
    })
  }

  const action = await transport.requestPatchDecision(proposal)
  const applied = action === 'keep'
  proposal.status = applied ? 'applied' : action === 'discard' ? 'rejected' : 'proposed'

  transport.emit({
    kind: 'action-result',
    proposalId: proposal.id,
    action,
    status: applied ? 'applied' : 'rejected',
    meta: applied ? `${proposal.additions} additions, ${proposal.deletions} deletions` : undefined,
  })

  const summary = applied
    ? `User kept the patch "${proposal.title}".`
    : action === 'run-tests'
      ? `User asked to run tests on "${proposal.title}" (patch not yet applied).`
      : `User discarded the patch "${proposal.title}".`
  return {
    callId: use.id, name: use.name, toolKind: 'edit', risk: 'write',
    status: applied ? 'done' : 'rejected', summary, input: use.input, result: summary,
  }
}

function describeIntent(tool: AriaTool, input: Record<string, unknown>): string {
  // For read tools a short first-arg summary is fine. For write/sensitive tools the user is
  // typed-confirming a real action, so show EVERY material field (amount, side, size, leverage,
  // destination, cap) — not just the first value — so a money movement's amount is never hidden.
  if (tool.risk === 'read') {
    const arg = Object.values(input)[0]
    return `${tool.name}${arg !== undefined ? `: ${String(arg).slice(0, 80)}` : ''}`
  }
  const entries = Object.entries(input)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`)
  const detail = entries.length > 0 ? ` — ${entries.join(', ')}` : ''
  return clusterMark(`${tool.name}${detail}`)
}

/** Non-Claude providers: single-shot text answer, no tools. */
async function legacyAnswer(
  sessionId: string,
  userMessage: string,
  provider: ReturnType<typeof ProviderRegistry.getFeatureProvider>,
  text: ConversationEntry[],
  transport: AriaTransport,
): Promise<AriaResponse> {
  const prompt = [
    'ARIA side-panel conversation:',
    ...text.slice(-MAX_HISTORY).map((e) => `${e.role.toUpperCase()}: ${e.content}`),
    '',
    'Respond as ARIA, concise and direct.',
  ].join('\n')
  const out = await provider.runPrompt({ prompt, model: 'sonnet', effort: 'low', maxTokens: 1024, timeoutMs: 60_000 })
  text.push({ role: 'assistant', content: out })
  persistMessage({ role: 'assistant', content: out, metadata: '{}', session_id: sessionId })
  transport.emit({ kind: 'done', messageId: sessionId, text: out })
  return { text: out, actions: [], toolCalls: [] }
}

export function getHistory(sessionId: string, limit = 50): AriaMessage[] {
  const db = getDb()
  return db.prepare(
    'SELECT * FROM aria_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?'
  ).all(sessionId, limit) as AriaMessage[]
}

/** Clear a session's messages only (in-memory + DB). The session row stays. */
export function clearSession(sessionId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM aria_messages WHERE session_id = ?').run(sessionId)
  conversations.delete(sessionId)
  textHistory.delete(sessionId)
}

// ---------------- session CRUD ----------------

/** Make sure a session row exists; lazily adopt ad-hoc ids (e.g. legacy 'global'). */
function ensureSession(sessionId: string, projectId: string | null = null): void {
  const db = getDb()
  db.prepare(
    'INSERT OR IGNORE INTO aria_sessions (id, project_id) VALUES (?, ?)'
  ).run(sessionId, projectId)
}

/** Bump updated_at and, if the session is still untitled, auto-title from the first message. */
function touchSession(sessionId: string, firstUserMessage?: string): void {
  const db = getDb()
  const now = Date.now()
  db.prepare('UPDATE aria_sessions SET updated_at = ? WHERE id = ?').run(now, sessionId)
  if (firstUserMessage) {
    const row = db.prepare('SELECT title FROM aria_sessions WHERE id = ?').get(sessionId) as
      | { title: string | null }
      | undefined
    if (row && !row.title) {
      const title = firstUserMessage.trim().replace(/\s+/g, ' ').slice(0, 60)
      db.prepare('UPDATE aria_sessions SET title = ? WHERE id = ?').run(title, sessionId)
    }
  }
}

export function createSession(projectId: string | null = null, title: string | null = null): AriaSession {
  const db = getDb()
  const id = crypto.randomUUID()
  db.prepare('INSERT INTO aria_sessions (id, title, project_id) VALUES (?,?,?)').run(id, title, projectId)
  return db.prepare('SELECT * FROM aria_sessions WHERE id = ?').get(id) as AriaSession
}

export function listSessions(projectId: string | null = null): AriaSession[] {
  const db = getDb()
  if (projectId) {
    return db.prepare(
      'SELECT * FROM aria_sessions WHERE archived = 0 AND project_id IS ? ORDER BY updated_at DESC'
    ).all(projectId) as AriaSession[]
  }
  return db.prepare(
    'SELECT * FROM aria_sessions WHERE archived = 0 ORDER BY updated_at DESC'
  ).all() as AriaSession[]
}

export function renameSession(sessionId: string, title: string): void {
  getDb().prepare('UPDATE aria_sessions SET title = ?, updated_at = ? WHERE id = ?')
    .run(title.trim().slice(0, 120), Date.now(), sessionId)
}

export function archiveSession(sessionId: string): void {
  getDb().prepare('UPDATE aria_sessions SET archived = 1, updated_at = ? WHERE id = ?')
    .run(Date.now(), sessionId)
}

/** Permanently delete a session: its messages, its row, and any in-memory state. */
export function deleteSession(sessionId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM aria_messages WHERE session_id = ?').run(sessionId)
  db.prepare('DELETE FROM aria_sessions WHERE id = ?').run(sessionId)
  conversations.delete(sessionId)
  textHistory.delete(sessionId)
}

// ---------------- rehydration ----------------

/**
 * Rebuild an in-memory conversation from DB as plain alternating text turns.
 * We deliberately do NOT reconstruct tool_use/tool_result pairs from metadata:
 * partial/dangling pairs are rejected by the Anthropic API (the reason
 * trimHistory/isToolResultTurn exist). Plain text restores conversational
 * memory without the pairing hazard.
 */
function rehydrateConversation(sessionId: string): AgentMessage[] {
  const rows = getHistory(sessionId, MAX_HISTORY)
  const messages: AgentMessage[] = rows.map((m) => ({ role: m.role, content: m.content }))
  trimHistory(messages)
  return messages
}

function rehydrateText(sessionId: string): ConversationEntry[] {
  return getHistory(sessionId, MAX_HISTORY).map((m) => ({ role: m.role, content: m.content }))
}
