import type { DaemonAiModelLane } from '../../shared/types'

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

export function creditsForTokens(inputTokens: number, outputTokens: number, lane: DaemonAiModelLane): number {
  const multiplier = lane === 'premium' ? 4 : lane === 'reasoning' ? 2 : lane === 'fast' ? 0.5 : 1
  return Math.max(1, Math.ceil(((inputTokens + outputTokens) / 100) * multiplier))
}

export function estimateRequestCredits(prompt: string, lane: DaemonAiModelLane): number {
  return creditsForTokens(estimateTokens(prompt), 0, lane)
}
