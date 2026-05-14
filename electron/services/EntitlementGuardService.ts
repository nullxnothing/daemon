import {
  fetchHostedFeatures,
  getDaemonAICloudToken,
  isDaemonAICloudConfigured,
} from './DaemonAICloudClient'
import { getLocalSubscriptionState } from './ProService'
import {
  canUseHostedModelLane,
  getHostedLaneRequiredPlan,
  hasFeature,
} from './EntitlementService'
import type { DaemonAiModelLane, ProFeature, ProSubscriptionState } from '../shared/types'

export class EntitlementGuardError extends Error {
  status: number
  code: string

  constructor(message: string, status = 402, code = 'daemon_entitlement_required') {
    super(message)
    this.name = 'EntitlementGuardError'
    this.status = status
    this.code = code
  }
}

function inactiveState(state: ProSubscriptionState): ProSubscriptionState {
  return {
    ...state,
    active: false,
    plan: 'light',
    tier: null,
    features: [],
    accessSource: 'free',
  }
}

export async function getVerifiedEntitlementState(): Promise<ProSubscriptionState> {
  const local = getLocalSubscriptionState()
  if (!local.active || local.plan === 'light') return local
  if (local.accessSource === 'dev_bypass') return local

  const token = getDaemonAICloudToken()
  if (!token || !isDaemonAICloudConfigured()) return inactiveState(local)

  try {
    const hosted = await fetchHostedFeatures()
    const active = hosted.hostedAvailable && hosted.plan !== 'light'
    return {
      ...local,
      active,
      plan: active ? hosted.plan : 'light',
      tier: active && hosted.plan !== 'light' ? hosted.plan : null,
      accessSource: active ? hosted.accessSource : 'free',
      features: active ? hosted.features : [],
    }
  } catch {
    return inactiveState(local)
  }
}

export async function assertVerifiedFeature(feature: ProFeature): Promise<ProSubscriptionState> {
  const state = await getVerifiedEntitlementState()
  if (!hasFeature(state, feature)) {
    throw new EntitlementGuardError(`Active ${feature} entitlement required.`)
  }
  return state
}

export async function assertVerifiedHostedModelLane(lane: DaemonAiModelLane): Promise<ProSubscriptionState> {
  const state = await getVerifiedEntitlementState()
  if (!canUseHostedModelLane(state, lane)) {
    const required = getHostedLaneRequiredPlan(lane)
    throw new EntitlementGuardError(`Hosted ${lane} DAEMON AI requires the ${required} plan or higher.`)
  }
  return state
}
