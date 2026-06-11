/**
 * ARIA operator tool abstraction. Tools are defined main-side and either call
 * an electron service directly (real side effects) or return a `uiEffect` for
 * the renderer to apply (navigation, terminal spawn, integration toggles).
 */
import type { AgentToolDef } from '../providers/agentTurn'
import type { AriaContextSnapshot, AriaUiEffect } from '../../shared/types'

export type { AriaContextSnapshot, AriaUiEffect } from '../../shared/types'

export type AriaToolRisk = 'read' | 'write' | 'sensitive'
/** Maps 1:1 to the renderer ToolCallRow `kind` (blue / amber / green). */
export type AriaToolKind = 'read' | 'edit' | 'run'

export interface AriaToolResult {
  ok: boolean
  /** Short line shown in the ToolCallRow meta / fed back to the model. */
  summary: string
  /** Structured payload serialised into the tool_result content. */
  data?: unknown
  /** Renderer-only follow-up effect. */
  uiEffect?: AriaUiEffect
  /**
   * When true, the renderer runs the uiEffect and posts a result back which
   * becomes the tool_result data (two-phase). Used by run_integration.
   */
  awaitEffectData?: boolean
}

export interface AriaToolContext {
  sessionId: string
  snapshot: AriaContextSnapshot
  /**
   * Run a uiEffect in the renderer and (when awaitData) resolve with the data
   * the renderer posts back. Provided by AriaAgentService via IPC.
   */
  runUiEffect: (effect: AriaUiEffect, awaitData: boolean) => Promise<unknown>
}

/** Execution-fee preview shown on the approval card before a tool runs. */
export interface AriaToolFeePreview {
  bps: number
  lamports: number
  treasury: string
}

export interface AriaTool {
  name: string
  description: string
  kind: AriaToolKind
  risk: AriaToolRisk
  /** JSON Schema object for the input (becomes Anthropic input_schema). */
  input: AgentToolDef['input_schema']
  handler: (input: Record<string, unknown>, ctx: AriaToolContext) => Promise<AriaToolResult>
  /**
   * Quote the execution fee this call would incur, from input alone — runs at
   * approval time, before the handler. Return null when no fee applies. The
   * meter never charges silently: any tool whose execution path carries an
   * `executionFee` must implement this.
   */
  feePreview?: (input: Record<string, unknown>) => AriaToolFeePreview | null
}

/** Build the Anthropic tools[] array from a catalog. */
export function toAnthropicTools(tools: AriaTool[]): AgentToolDef[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input,
  }))
}
