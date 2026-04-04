import Anthropic from '@anthropic-ai/sdk'
import { resolveModelName, DEFAULT_MAX_TOKENS } from '@daemon/shared'
import type { PromptOptions, PromptResult } from './types'

export class AnthropicClient {
  private client: Anthropic

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Anthropic API key is required')
    this.client = new Anthropic({ apiKey })
  }

  async prompt(opts: PromptOptions): Promise<PromptResult> {
    const resolvedModel = resolveModelName(opts.model ?? 'haiku')
    const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS

    const response = await this.client.messages.create({
      model: resolvedModel,
      max_tokens: maxTokens,
      ...(opts.systemPrompt
        ? { system: [{ type: 'text' as const, text: opts.systemPrompt, cache_control: { type: 'ephemeral' as const } }] }
        : {}),
      messages: [{ role: 'user' as const, content: opts.prompt }],
    })

    const block = response.content[0]
    if (block.type !== 'text') throw new Error('Unexpected response type from API')

    return {
      text: block.text,
      model: resolvedModel,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }
  }

  async promptText(opts: PromptOptions): Promise<string> {
    const result = await this.prompt(opts)
    return result.text
  }
}
