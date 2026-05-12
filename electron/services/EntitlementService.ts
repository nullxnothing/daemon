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
