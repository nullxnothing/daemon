import type { DaemonPlanId, ProFeature, ProSubscriptionState } from '../shared/types'

export const PLAN_FEATURES: Record<DaemonPlanId, ProFeature[]> = {
  light: [],
  pro: ['daemon-ai', 'arena', 'pro-skills', 'mcp-sync', 'priority-api', 'app-factory', 'shipline'],
  operator: ['daemon-ai', 'arena', 'pro-skills', 'mcp-sync', 'priority-api', 'app-factory', 'shipline', 'cloud-agents'],
  ultra: ['daemon-ai', 'arena', 'pro-skills', 'mcp-sync', 'priority-api', 'app-factory', 'shipline', 'cloud-agents'],
  team: ['daemon-ai', 'arena', 'pro-skills', 'mcp-sync', 'priority-api', 'app-factory', 'shipline', 'cloud-agents', 'team-admin'],
  enterprise: ['daemon-ai', 'arena', 'pro-skills', 'mcp-sync', 'priority-api', 'app-factory', 'shipline', 'cloud-agents', 'team-admin'],
}

export const AI_MONTHLY_CREDITS: Record<DaemonPlanId, number> = {
  light: 0,
  pro: 2_000,
  operator: 7_500,
  ultra: 30_000,
  team: 10_000,
  enterprise: 50_000,
}

const PLAN_RANK: Record<DaemonPlanId, number> = {
  light: 0,
  pro: 1,
  operator: 2,
  team: 2,
  ultra: 3,
  enterprise: 4,
}

export function getPlanFeatures(plan: DaemonPlanId): ProFeature[] {
  return PLAN_FEATURES[plan] ?? PLAN_FEATURES.light
}

export function hasFeature(state: Pick<ProSubscriptionState, 'active' | 'features' | 'plan'>, feature: ProFeature): boolean {
  if (state.plan === 'light' || !state.active) return false
  return state.features.includes(feature) || getPlanFeatures(state.plan).includes(feature)
}

export function getMonthlyAiCredits(plan: DaemonPlanId): number {
  return AI_MONTHLY_CREDITS[plan] ?? 0
}

export function isPlanAtLeast(plan: DaemonPlanId, minimum: DaemonPlanId): boolean {
  return (PLAN_RANK[plan] ?? 0) >= (PLAN_RANK[minimum] ?? 0)
}

export function getHostedLaneRequiredPlan(lane: 'auto' | 'fast' | 'standard' | 'reasoning' | 'premium'): DaemonPlanId {
  if (lane === 'premium') return 'ultra'
  if (lane === 'reasoning') return 'operator'
  return 'pro'
}

export function canUseHostedModelLane(
  state: Pick<ProSubscriptionState, 'active' | 'features' | 'plan'>,
  lane: 'auto' | 'fast' | 'standard' | 'reasoning' | 'premium',
): boolean {
  return hasFeature(state, 'daemon-ai') && isPlanAtLeast(state.plan, getHostedLaneRequiredPlan(lane))
}

export function normalizePlan(input: unknown): DaemonPlanId {
  switch (input) {
    case 'pro':
    case 'operator':
    case 'ultra':
    case 'team':
    case 'enterprise':
      return input
    default:
      return 'light'
  }
}
