/**
 * Flywheel tools: preview a fee split (read-only), configure a split
 * (sensitive — LOCKS on first create), and run the flywheel (sensitive).
 */
import * as FlywheelService from '../../FlywheelService'
import type { FlywheelConfigureInput } from '../../../shared/types'
import type { AriaTool } from '../AriaTool'
import { clusterMark } from './shared'

function toConfigureInput(input: Record<string, unknown>): FlywheelConfigureInput {
  return {
    tokenMint: String(input.tokenMint ?? '').trim(),
    label: input.label ? String(input.label) : undefined,
    creatorWalletId: String(input.creatorWalletId ?? ''),
    payoutWallet: String(input.payoutWallet ?? ''),
    buybackWalletId: String(input.buybackWalletId ?? ''),
    payoutBps: input.payoutBps != null ? Number(input.payoutBps) : undefined,
    buybackBps: input.buybackBps != null ? Number(input.buybackBps) : undefined,
    buybackTargetMint: input.buybackTargetMint ? String(input.buybackTargetMint) : undefined,
    burn: input.burn != null ? Boolean(input.burn) : undefined,
  }
}

const CONFIGURE_SCHEMA: AriaTool['input'] = {
  type: 'object',
  properties: {
    tokenMint: { type: 'string' },
    label: { type: 'string' },
    creatorWalletId: { type: 'string' },
    payoutWallet: { type: 'string' },
    buybackWalletId: { type: 'string' },
    payoutBps: { type: 'number' },
    buybackBps: { type: 'number' },
    buybackTargetMint: { type: 'string' },
    burn: { type: 'boolean' },
  },
  required: ['tokenMint', 'creatorWalletId', 'payoutWallet', 'buybackWalletId'],
}

export const flywheelTools: AriaTool[] = [
  {
    name: 'flywheel_preview_split',
    description: 'Preview a Flywheel fee split (payout/buyback/burn) without writing anything on-chain.',
    kind: 'read',
    risk: 'read',
    input: CONFIGURE_SCHEMA,
    async handler(input) {
      const preview = await FlywheelService.previewSplit(toConfigureInput(input))
      return { ok: true, summary: 'Previewed flywheel split.', data: preview }
    },
  },
  {
    name: 'flywheel_configure_split',
    description: 'Configure a Flywheel split on-chain. WARNING: the config LOCKS on first create and cannot be changed. The user must approve.',
    kind: 'run',
    risk: 'sensitive',
    input: CONFIGURE_SCHEMA,
    async handler(input) {
      const config = await FlywheelService.configureSplit({ ...toConfigureInput(input), confirmed: true })
      return { ok: true, summary: clusterMark('Configured flywheel split (locked).'), data: { id: config.id } }
    },
  },
  {
    name: 'flywheel_run',
    description: 'Run a configured Flywheel once: claim fees, split, distribute, and buyback/burn. Spends on-chain. The user must approve.',
    kind: 'run',
    risk: 'sensitive',
    input: { type: 'object', properties: { configId: { type: 'string' } }, required: ['configId'] },
    async handler(input) {
      const res = await FlywheelService.runFlywheel(String(input.configId ?? ''))
      return {
        ok: true,
        summary: clusterMark(`Ran flywheel (${res.status}), claimed ${res.claimedSol} SOL.`),
        data: res,
      }
    },
  },
]
