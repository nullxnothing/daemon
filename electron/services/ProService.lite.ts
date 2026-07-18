/**
 * DAEMON Lite stub for ProService (swapped in by vite.lite.config.ts).
 * Lite is the free tier — there is no subscription, x402 payment, or holder
 * gating, so this severs the @x402 / @solana/kit / SolanaService import chain
 * from the Lite bundle. Only getLocalSubscriptionState is imported by the
 * Lite graph (DaemonAIService, EntitlementGuardService).
 */
import type { ProSubscriptionState } from '../shared/types'

export function getLocalSubscriptionState(): ProSubscriptionState {
  return {
    active: false,
    plan: 'light',
    walletId: null,
    walletAddress: null,
    expiresAt: null,
    features: [],
    tier: null,
    accessSource: 'free',
    holderStatus: {
      enabled: false,
      eligible: false,
      mint: null,
      minAmount: null,
      currentAmount: null,
      symbol: 'DAEMON',
    },
    priceUsdc: null,
    durationDays: null,
  }
}
