import { describe, expect, it } from 'vitest'
import {
  validateStrategy,
  validateRules,
  evaluateExits,
  evaluateMandate,
  type PositionValue,
} from '../../electron/services/AutopilotService'
import type { Mandate, MandateStrategy } from '../../electron/shared/types'

// Money-path safety for unattended trading. These pin the guardrails a prior review found
// missing: exit-rule validation (a NaN/negative stop-loss must be rejected, not silently
// dead), the tighter unattended slippage cap, and that exit checks compare against the
// mandate's position rather than firing on garbage thresholds.

const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

function strategy(over: Partial<MandateStrategy> = {}): MandateStrategy {
  return {
    targetMint: MINT,
    clipLamports: 100_000_000,
    slippageBps: 100,
    rules: [],
    ...over,
  } as MandateStrategy
}

describe('validateStrategy — unattended guardrails', () => {
  it('rejects slippage above the unattended cap (1000 bps)', () => {
    expect(() => validateStrategy(strategy({ slippageBps: 5_000 }), 1_000_000_000)).toThrow(/slippageBps/i)
    expect(() => validateStrategy(strategy({ slippageBps: 1_001 }), 1_000_000_000)).toThrow(/unattended/i)
  })

  it('accepts a sane strategy at the cap boundary', () => {
    expect(() => validateStrategy(strategy({ slippageBps: 1_000 }), 1_000_000_000)).not.toThrow()
  })

  it('rejects a clip larger than the exposure cap', () => {
    expect(() => validateStrategy(strategy({ clipLamports: 2_000_000_000 }), 1_000_000_000)).toThrow(/exposure cap/i)
  })
})

describe('validateRules — exit rules can never be silently dead', () => {
  it('rejects a NaN threshold', () => {
    expect(() => validateRules([{ kind: 'stop_loss', threshold: Number.NaN } as never])).toThrow(/positive, finite/i)
  })

  it('rejects zero and negative thresholds', () => {
    expect(() => validateRules([{ kind: 'take_profit', threshold: 0 } as never])).toThrow(/positive, finite/i)
    expect(() => validateRules([{ kind: 'stop_loss', threshold: -10 } as never])).toThrow(/positive, finite/i)
  })

  it('rejects an out-of-range percent threshold', () => {
    expect(() => validateRules([{ kind: 'take_profit', threshold: 50_000 } as never])).toThrow(/out of range/i)
  })

  it('accepts realistic thresholds', () => {
    expect(() => validateRules([
      { kind: 'take_profit', threshold: 50 } as never,
      { kind: 'stop_loss', threshold: 20 } as never,
      { kind: 'liquidity_floor', threshold: 0.5 } as never,
    ])).not.toThrow()
  })
})

describe('evaluateExits — fires only on a priceable position', () => {
  const mandate = {
    id: 'm1',
    spentLamports: 1_000_000_000,
    strategy: strategy({
      rules: [
        { kind: 'take_profit', threshold: 50 },
        { kind: 'stop_loss', threshold: 20 },
      ] as never,
    }),
  } as unknown as Mandate

  const pos = (over: Partial<PositionValue>): PositionValue => ({
    rawTokens: 1n, tokenAmount: 1, valueLamports: 1_000_000_000, unrealizedLamports: 0, pnlPct: 0, ...over,
  })

  it('does not trigger on an unpriceable position (transient route failure)', () => {
    expect(evaluateExits(mandate, pos({ valueLamports: 0 })).triggered).toBe(false)
  })

  it('fires take-profit at or above the threshold', () => {
    const r = evaluateExits(mandate, pos({ pnlPct: 55 }))
    expect(r.triggered).toBe(true)
    expect(r.rule).toBe('take_profit')
  })

  it('fires stop-loss at or below the negative threshold', () => {
    const r = evaluateExits(mandate, pos({ pnlPct: -25 }))
    expect(r.triggered).toBe(true)
    expect(r.rule).toBe('stop_loss')
  })

  it('holds inside the band', () => {
    expect(evaluateExits(mandate, pos({ pnlPct: 10 })).triggered).toBe(false)
  })
})

describe('evaluateMandate — DCA + exposure cap', () => {
  const mandate = {
    maxExposureLamports: 1_000_000_000,
    spentLamports: 0,
    strategy: strategy({ clipLamports: 100_000_000 }),
  } as unknown as Mandate

  it('buys when the wallet has enough SOL', () => {
    const d = evaluateMandate(mandate, 1_000_000_000)
    expect(d.decision).toBe('buy')
    expect(d.clipLamports).toBe(100_000_000)
  })

  it('holds when the wallet SOL is too low for a clip', () => {
    expect(evaluateMandate(mandate, 5_000_000).decision).toBe('hold')
  })

  it('skips once the exposure cap is spent', () => {
    const spent = { ...mandate, spentLamports: 1_000_000_000 } as unknown as Mandate
    expect(evaluateMandate(spent, 1_000_000_000).decision).toBe('skip')
  })
})
