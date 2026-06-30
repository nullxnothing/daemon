import { describe, expect, it } from 'vitest'
import {
  commissionForEvent,
  BASE_REFERRAL_BPS,
  MAX_REFERRAL_BPS,
  FEE_FLOOR_HEADROOM_BPS,
} from '../../electron/services/garrison/GarrisonReferralService'

// §4.4 of GARRISON_BACKEND_SPEC.md — the hard fee-floor cap. These reproduce the spec's
// worked examples and assert the protocol ALWAYS keeps at least FEE_FLOOR_HEADROOM_BPS of
// its net fee, no matter how the multiplier is set. This is the solvency floor.

const NET_FEE = 250_000_000 // 0.25 SOL net fee (100 SOL notional @ 25 bps)
const floorKept = (netFee: number) => Math.floor((netFee * FEE_FLOOR_HEADROOM_BPS) / 10_000)

describe('commissionForEvent — §4 fee-floor cap', () => {
  it('unstaked 1.0x pays the 10% base and keeps 90%', () => {
    const { base, bonus, total } = commissionForEvent(NET_FEE, 10_000)
    expect(total).toBe(25_000_000) // 10% of 0.25 SOL
    expect(base).toBe(25_000_000)
    expect(bonus).toBe(0)
    expect(NET_FEE - total).toBeGreaterThanOrEqual(floorKept(NET_FEE))
  })

  it('staked 1.5x matured pays 15% and still keeps the floor', () => {
    const { total } = commissionForEvent(NET_FEE, 15_000)
    expect(total).toBe(37_500_000) // 15%
    expect(NET_FEE - total).toBeGreaterThanOrEqual(floorKept(NET_FEE))
  })

  it('caps the referral line at MAX_REFERRAL_BPS even at an absurd multiplier', () => {
    // 10x multiplier would be 100% of fee, but the line caps at MAX_REFERRAL_BPS (30%).
    const { total } = commissionForEvent(NET_FEE, 100_000)
    const cap = Math.floor((NET_FEE * MAX_REFERRAL_BPS) / 10_000)
    expect(total).toBeLessThanOrEqual(cap)
    expect(NET_FEE - total).toBeGreaterThanOrEqual(floorKept(NET_FEE))
  })

  it('never breaches the floor for any multiplier (fuzz)', () => {
    for (let mult = 10_000; mult <= 1_000_000; mult += 7_777) {
      const { total } = commissionForEvent(NET_FEE, mult)
      expect(NET_FEE - total).toBeGreaterThanOrEqual(floorKept(NET_FEE))
      expect(total).toBeGreaterThanOrEqual(0)
    }
  })

  it('base never exceeds the floor-capped total', () => {
    const { base, total } = commissionForEvent(NET_FEE, 100_000)
    expect(base).toBeLessThanOrEqual(total)
  })

  it('handles a tiny fee without going negative', () => {
    const { total } = commissionForEvent(5_000, 15_000)
    expect(total).toBeGreaterThanOrEqual(0)
    expect(5_000 - total).toBeGreaterThanOrEqual(floorKept(5_000))
  })

  it('exposes the documented constant values', () => {
    expect(BASE_REFERRAL_BPS).toBe(1000)
    expect(MAX_REFERRAL_BPS).toBe(3000)
    expect(FEE_FLOOR_HEADROOM_BPS).toBe(5000)
  })
})
