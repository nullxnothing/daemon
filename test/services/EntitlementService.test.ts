import { describe, expect, it } from 'vitest'
import { getMonthlyAiCredits, getPlanFeatures, hasFeature, normalizePlan } from '../../electron/services/EntitlementService'

describe('EntitlementService', () => {
  it('keeps Light local-only and Pro AI-enabled', () => {
    expect(getPlanFeatures('light')).not.toContain('daemon-ai')
    expect(getPlanFeatures('pro')).toContain('daemon-ai')
    expect(getPlanFeatures('pro')).toContain('pro-skills')
  })

  it('normalizes unknown tiers to Light', () => {
    expect(normalizePlan('operator')).toBe('operator')
    expect(normalizePlan('unknown')).toBe('light')
    expect(normalizePlan(null)).toBe('light')
  })

  it('requires an active non-Light entitlement for premium features', () => {
    expect(hasFeature({ active: false, plan: 'pro', features: ['daemon-ai'] }, 'daemon-ai')).toBe(false)
    expect(hasFeature({ active: true, plan: 'light', features: ['daemon-ai'] }, 'daemon-ai')).toBe(false)
    expect(hasFeature({ active: true, plan: 'pro', features: [] }, 'daemon-ai')).toBe(true)
  })

  it('assigns AI credits by plan without giving Light hosted credits', () => {
    expect(getMonthlyAiCredits('light')).toBe(0)
    expect(getMonthlyAiCredits('operator')).toBeGreaterThan(getMonthlyAiCredits('pro'))
    expect(getMonthlyAiCredits('ultra')).toBeGreaterThan(getMonthlyAiCredits('operator'))
  })
})
