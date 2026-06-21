/**
 * Autopilot tools: turn a natural-language mandate into a structured, validated trading
 * strategy (create_mandate), then arm it for unattended mainnet execution (autopilot_arm —
 * sensitive, [MAINNET]). ARIA, as the LLM, fills the structured fields from the user's
 * sentence; the tool validates guardrails and persists. Arming is the single human
 * authorization for all subsequent autonomous trades.
 */
import * as Autopilot from '../../AutopilotService'
import type { MandateRule, MandateStrategy } from '../../../shared/types'
import type { AriaTool } from '../AriaTool'
import { clusterMark } from './shared'

const LAMPORTS_PER_SOL = 1e9

function toLamports(sol: unknown): number {
  const n = Number(sol)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Expected a positive SOL amount')
  return Math.round(n * LAMPORTS_PER_SOL)
}

function toRules(raw: unknown): MandateRule[] {
  if (!Array.isArray(raw)) return []
  return raw.map((r) => {
    const rule = r as Record<string, unknown>
    const kind = String(rule.kind ?? '')
    if (kind !== 'take_profit' && kind !== 'stop_loss' && kind !== 'liquidity_floor') {
      throw new Error(`Unknown rule kind: ${kind}`)
    }
    return { kind, threshold: Number(rule.threshold) }
  })
}

const STRATEGY_PROPS = {
  label: { type: 'string', description: 'Short human label for the mandate, e.g. "DCA into BONK".' },
  walletId: { type: 'string', description: 'Wallet id that funds and signs the autonomous trades.' },
  mandateText: { type: 'string', description: 'The original natural-language mandate verbatim.' },
  targetMint: { type: 'string', description: 'Mint the mandate accumulates (buys into).' },
  targetSymbol: { type: 'string' },
  clipSol: { type: 'number', description: 'SOL spent per DCA buy (per tick).' },
  slippageBps: { type: 'number', description: 'Swap slippage tolerance in bps (e.g. 300 = 3%).' },
  maxExposureSol: { type: 'number', description: 'Hard ceiling on total SOL the mandate may ever spend.' },
  intervalSeconds: { type: 'number', description: 'Seconds between ticks (min 30).' },
  rules: {
    type: 'array',
    description: 'Exit rules: take_profit / stop_loss (threshold = percent), liquidity_floor (threshold = SOL).',
    items: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['take_profit', 'stop_loss', 'liquidity_floor'] },
        threshold: { type: 'number' },
      },
      required: ['kind', 'threshold'],
    },
  },
} as const

export const autopilotTools: AriaTool[] = [
  {
    name: 'create_mandate',
    description:
      'Create an Autopilot trading mandate from a natural-language instruction. Parse the user\'s sentence into the structured fields (target token, clip size, exposure cap, interval, exit rules). This only SAVES a draft — it does NOT start trading. The user must then arm it.',
    kind: 'run',
    risk: 'write',
    input: {
      type: 'object',
      properties: STRATEGY_PROPS,
      required: ['label', 'walletId', 'mandateText', 'targetMint', 'clipSol', 'maxExposureSol', 'intervalSeconds'],
    },
    async handler(input) {
      const strategy: MandateStrategy = {
        targetMint: String(input.targetMint ?? '').trim(),
        targetSymbol: input.targetSymbol ? String(input.targetSymbol) : undefined,
        clipLamports: toLamports(input.clipSol),
        slippageBps: input.slippageBps != null ? Number(input.slippageBps) : 300,
        rules: toRules(input.rules),
      }
      const mandate = Autopilot.createMandate({
        label: String(input.label ?? '').trim(),
        walletId: String(input.walletId ?? ''),
        mandateText: String(input.mandateText ?? '').trim(),
        strategy,
        maxExposureLamports: toLamports(input.maxExposureSol),
        intervalSeconds: Number(input.intervalSeconds),
      })
      return {
        ok: true,
        summary: `Saved draft mandate "${mandate.label}" (cap ${input.maxExposureSol} SOL). Arm it to go live.`,
        data: { id: mandate.id },
      }
    },
  },
  {
    name: 'autopilot_arm',
    description:
      'Arm an Autopilot mandate so it begins executing trades UNATTENDED on mainnet on its schedule. Spends real SOL up to the mandate exposure cap. The user must approve. This is the authorization for all subsequent autonomous trades.',
    kind: 'run',
    risk: 'sensitive',
    input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    async handler(input) {
      const mandate = Autopilot.armMandate(String(input.id ?? ''))
      return {
        ok: true,
        summary: clusterMark(`Armed mandate "${mandate.label}" — trading unattended every ${mandate.intervalSeconds}s.`),
        data: { id: mandate.id, status: mandate.status },
      }
    },
  },
  {
    name: 'autopilot_disarm',
    description: 'Disarm an Autopilot mandate (or pass nothing to disarm ALL mandates — the kill switch). Stops further autonomous trades immediately.',
    kind: 'run',
    risk: 'write',
    input: { type: 'object', properties: { id: { type: 'string' } } },
    async handler(input) {
      const id = input.id ? String(input.id) : ''
      if (!id) {
        const n = Autopilot.disarmAll()
        return { ok: true, summary: `Kill switch: disarmed ${n} mandate(s).`, data: { disarmed: n } }
      }
      const mandate = Autopilot.disarmMandate(id)
      return { ok: true, summary: `Disarmed mandate "${mandate.label}".`, data: { id: mandate.id } }
    },
  },
  {
    name: 'autopilot_list',
    description: 'List all Autopilot mandates with their status, spend, and P&L.',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: {} },
    async handler() {
      const mandates = Autopilot.listMandates()
      return {
        ok: true,
        summary: `${mandates.length} mandate(s).`,
        data: mandates.map((m) => ({
          id: m.id,
          label: m.label,
          status: m.status,
          armed: m.armed,
          spentSol: m.spentLamports / LAMPORTS_PER_SOL,
          capSol: m.maxExposureLamports / LAMPORTS_PER_SOL,
        })),
      }
    },
  },
]
