/**
 * Wallet / on-chain tools (read + sensitive).
 */
import * as WalletService from '../../WalletService'
import type { AriaTool } from '../AriaTool'

export const walletTools: AriaTool[] = [
  {
    name: 'read_wallet',
    description: 'Read wallet balances/holdings for the active project (read-only).',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: {} },
    async handler(_input, ctx) {
      const dashboard = await WalletService.getDashboard(ctx.snapshot.activeProjectId)
      return {
        ok: true,
        summary: 'Read wallet.',
        data: {
          activeWallet: dashboard.activeWallet?.name ?? null,
          address: dashboard.activeWallet?.address ?? null,
          totalUsd: dashboard.portfolio.totalUsd,
          walletCount: dashboard.portfolio.walletCount,
        },
      }
    },
  },
  {
    name: 'generate_wallet',
    description: 'Generate a new signing wallet with a name.',
    kind: 'run',
    risk: 'sensitive',
    input: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    async handler(input) {
      const name = String(input.name ?? '').trim()
      if (!name) return { ok: false, summary: 'A wallet name is required.' }
      const wallet = WalletService.generateWallet(name) as { id: string; address: string }
      return { ok: true, summary: `Generated wallet "${name}".`, data: { id: wallet.id, address: wallet.address } }
    },
  },
  {
    name: 'set_default_wallet',
    description: 'Set the default DAEMON wallet by id.',
    kind: 'edit',
    risk: 'sensitive',
    input: { type: 'object', properties: { walletId: { type: 'string' } }, required: ['walletId'] },
    async handler(input) {
      WalletService.setDefaultWallet(String(input.walletId ?? ''))
      return { ok: true, summary: 'Set default wallet.' }
    },
  },
  {
    name: 'assign_project_wallet',
    description: 'Assign a wallet to a project by ids.',
    kind: 'edit',
    risk: 'sensitive',
    input: {
      type: 'object',
      properties: { projectId: { type: 'string' }, walletId: { type: 'string' } },
      required: ['projectId', 'walletId'],
    },
    async handler(input) {
      WalletService.assignWalletToProject(String(input.projectId ?? ''), String(input.walletId ?? ''))
      return { ok: true, summary: 'Assigned wallet to project.' }
    },
  },
  {
    name: 'store_helius_key',
    description: 'Store a Helius API key for RPC/data.',
    kind: 'edit',
    risk: 'sensitive',
    input: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
    async handler(input) {
      await WalletService.storeHeliusKey(String(input.value ?? ''))
      return { ok: true, summary: 'Stored Helius key.' }
    },
  },
]
