export interface PromptOptions {
  prompt: string
  systemPrompt?: string
  model?: string
  maxTokens?: number
}

export interface PromptResult {
  text: string
  model: string
  inputTokens: number
  outputTokens: number
}
