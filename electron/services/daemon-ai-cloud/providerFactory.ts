import { AnthropicMessagesProvider } from './AnthropicMessagesProvider'
import { OpenAIResponsesProvider } from './OpenAIResponsesProvider'
import type { DaemonAiModelProvider } from './types'

export function createConfiguredDaemonAiProviders(env: NodeJS.ProcessEnv = process.env): DaemonAiModelProvider[] {
  const providers: DaemonAiModelProvider[] = []
  if (env.OPENAI_API_KEY?.trim()) {
    providers.push(new OpenAIResponsesProvider({
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
    }))
  }
  if (env.ANTHROPIC_API_KEY?.trim()) {
    providers.push(new AnthropicMessagesProvider({
      apiKey: env.ANTHROPIC_API_KEY,
    }))
  }
  return providers
}
