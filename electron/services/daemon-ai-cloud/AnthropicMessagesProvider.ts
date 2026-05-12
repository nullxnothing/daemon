import Anthropic from '@anthropic-ai/sdk'
import type { DaemonAiModelLane } from '../../shared/types'
import { creditsForTokens } from './creditMath'
import type {
  DaemonAiModelProvider,
  DaemonAiProviderRequest,
  DaemonAiProviderResult,
} from './types'

export interface AnthropicMessagesProviderOptions {
  apiKey: string
}

function anthropicModelForLane(lane: DaemonAiModelLane): string {
  switch (lane) {
    case 'fast':
      return process.env.DAEMON_AI_ANTHROPIC_FAST_MODEL || 'claude-haiku-4-5-20251001'
    case 'reasoning':
    case 'premium':
      return process.env.DAEMON_AI_ANTHROPIC_REASONING_MODEL || 'claude-opus-4-20250514'
    default:
      return process.env.DAEMON_AI_ANTHROPIC_STANDARD_MODEL || 'claude-sonnet-4-20250514'
  }
}

export class AnthropicMessagesProvider implements DaemonAiModelProvider {
  readonly id = 'anthropic' as const
  private client: Anthropic

  constructor(options: AnthropicMessagesProviderOptions) {
    if (!options.apiKey?.trim()) throw new Error('Anthropic API key is required')
    this.client = new Anthropic({ apiKey: options.apiKey })
  }

  supports(): boolean {
    return true
  }

  async generate(input: DaemonAiProviderRequest): Promise<DaemonAiProviderResult> {
    const model = anthropicModelForLane(input.modelLane)
    const response = await this.client.messages.create({
      model,
      max_tokens: 4_000,
      system: [
        'You are DAEMON AI, the hosted AI layer for the DAEMON workbench.',
        'Be direct, implementation-focused, and safety-aware.',
        'Never request or reveal private keys, seed phrases, secure keychain values, or raw secrets.',
      ].join('\n'),
      messages: [{
        role: 'user',
        content: [
          `Mode: ${input.mode}`,
          `Request ID: ${input.requestId ?? 'none'}`,
          input.usedContext.length ? `Used context:\n${input.usedContext.join('\n')}` : 'Used context: none',
          input.prompt,
        ].join('\n\n'),
      }],
    })
    const block = response.content.find((item) => item.type === 'text')
    if (!block || block.type !== 'text') throw new Error('Anthropic returned an empty text response')
    const inputTokens = response.usage.input_tokens
    const outputTokens = response.usage.output_tokens
    return {
      text: block.text,
      provider: 'anthropic',
      model,
      usage: {
        inputTokens,
        outputTokens,
        providerCostUsd: 0,
        daemonCreditsCharged: creditsForTokens(inputTokens, outputTokens, input.modelLane),
      },
    }
  }
}
