import type { DaemonAiModelLane } from '../../shared/types'
import type { DaemonAiModelProvider } from './types'

const PROVIDER_ORDER_BY_LANE: Record<DaemonAiModelLane, Array<DaemonAiModelProvider['id']>> = {
  auto: ['openai', 'anthropic', 'google', 'other'],
  fast: ['openai', 'google', 'anthropic', 'other'],
  standard: ['openai', 'anthropic', 'google', 'other'],
  reasoning: ['openai', 'anthropic', 'google', 'other'],
  premium: ['openai', 'anthropic', 'google', 'other'],
}

export class ModelRouter {
  private providers: DaemonAiModelProvider[]

  constructor(providers: DaemonAiModelProvider[]) {
    this.providers = providers
  }

  resolve(lane: DaemonAiModelLane): DaemonAiModelProvider {
    const candidates = this.providers.filter((provider) => provider.supports(lane))
    if (candidates.length === 0) throw new Error(`No DAEMON AI provider supports the ${lane} lane`)

    const order = PROVIDER_ORDER_BY_LANE[lane]
    return candidates
      .slice()
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))[0]
  }
}
