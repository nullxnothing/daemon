/**
 * Shared types for Anthropic tool-calling ("agent turn") used by ARIA's
 * agentic operator loop. Kept provider-agnostic so the agent service and the
 * tool catalog can import them without depending on the SDK.
 */

/** A tool definition handed to the model (Anthropic `tools[]` entry). */
export interface AgentToolDef {
  name: string
  description: string
  /** JSON Schema object for the tool input (becomes `input_schema`). */
  input_schema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

/** A model-requested tool invocation parsed from a `tool_use` block. */
export interface AgentToolUse {
  id: string
  name: string
  input: Record<string, unknown>
}

/** The result of a single agent turn (one model call). */
export interface AgentTurnResult {
  /** Concatenated text blocks from the response. */
  text: string
  /** Tool calls the model wants to make this turn (empty when it stops). */
  toolUses: AgentToolUse[]
  /** Anthropic stop_reason: 'tool_use' | 'end_turn' | 'max_tokens' | ... */
  stopReason: string
}

/** One prior turn in the running conversation, in Anthropic message shape. */
export interface AgentMessage {
  role: 'user' | 'assistant'
  content: unknown
}

export interface RunAgentTurnOpts {
  messages: AgentMessage[]
  system: string
  model: string
  tools: AgentToolDef[]
  maxTokens?: number
}
