import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProSubscriptionState } from '../../electron/shared/types'

const {
  mockGetLocalSubscriptionState,
  mockFetchHostedFeatures,
  mockGetDaemonAICloudToken,
  mockIsDaemonAICloudConfigured,
} = vi.hoisted(() => ({
  mockGetLocalSubscriptionState: vi.fn(),
  mockFetchHostedFeatures: vi.fn(),
  mockGetDaemonAICloudToken: vi.fn(),
  mockIsDaemonAICloudConfigured: vi.fn(),
}))

vi.mock('../../electron/services/ProService', () => ({
  getLocalSubscriptionState: mockGetLocalSubscriptionState,
}))

vi.mock('../../electron/services/DaemonAICloudClient', () => ({
  fetchHostedFeatures: mockFetchHostedFeatures,
  getDaemonAICloudToken: mockGetDaemonAICloudToken,
  isDaemonAICloudConfigured: mockIsDaemonAICloudConfigured,
}))

import {
  assertVerifiedFeature,
  assertVerifiedHostedModelLane,
  getVerifiedEntitlementState,
} from '../../electron/services/EntitlementGuardService'

function subscription(overrides: Partial<ProSubscriptionState> = {}): ProSubscriptionState {
  return {
    active: true,
    plan: 'pro',
    walletId: 'w1',
    walletAddress: 'wallet-1',
    expiresAt: Date.now() + 60_000,
    features: ['daemon-ai', 'pro-skills'],
    tier: 'pro',
    accessSource: 'payment',
    holderStatus: {
      enabled: false,
      eligible: false,
      mint: null,
      minAmount: null,
      currentAmount: null,
      symbol: 'DAEMON',
    },
    priceUsdc: 20,
    durationDays: 30,
    ...overrides,
  }
}

describe('EntitlementGuardService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLocalSubscriptionState.mockReturnValue(subscription())
    mockGetDaemonAICloudToken.mockReturnValue('jwt')
    mockIsDaemonAICloudConfigured.mockReturnValue(true)
    mockFetchHostedFeatures.mockResolvedValue({
      hostedAvailable: true,
      plan: 'pro',
      accessSource: 'payment',
      features: ['daemon-ai', 'pro-skills'],
    })
  })

  it('downgrades locally-tampered paid state when no server token is present', async () => {
    mockGetDaemonAICloudToken.mockReturnValue(null)

    await expect(getVerifiedEntitlementState()).resolves.toMatchObject({
      active: false,
      plan: 'light',
      features: [],
      accessSource: 'free',
    })
    await expect(assertVerifiedFeature('daemon-ai')).rejects.toMatchObject({
      code: 'daemon_entitlement_required',
    })
  })

  it('uses hosted entitlement claims as the verified paid state', async () => {
    mockFetchHostedFeatures.mockResolvedValue({
      hostedAvailable: true,
      plan: 'operator',
      accessSource: 'holder',
      features: ['daemon-ai', 'cloud-agents'],
    })

    await expect(getVerifiedEntitlementState()).resolves.toMatchObject({
      active: true,
      plan: 'operator',
      accessSource: 'holder',
      features: ['daemon-ai', 'cloud-agents'],
    })
    await expect(assertVerifiedFeature('cloud-agents')).resolves.toMatchObject({
      plan: 'operator',
    })
    await expect(assertVerifiedHostedModelLane('reasoning')).resolves.toMatchObject({
      plan: 'operator',
    })
  })

  it('does not allow a lower verified plan to use a higher hosted model lane', async () => {
    await expect(assertVerifiedHostedModelLane('premium')).rejects.toThrow(/ultra plan/i)
  })
})
