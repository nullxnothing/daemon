/**
 * Wallet / on-chain tools (read + sensitive).
 */
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import * as WalletService from '../../WalletService'
import { quoteExecutionFee } from '../../FeeService'
import { clusterMark } from './shared'
import type { AriaTool } from '../AriaTool'

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address
}

export const walletTools: AriaTool[] = [
  {
    name: 'transfer_sol',
    description: 'Send SOL from the active project wallet to a recipient address. Requires explicit user approval. On mainnet this moves real money and the DAEMON execution fee applies (shown on the approval card).',
    kind: 'run',
    risk: 'sensitive',
    input: {
      type: 'object',
      properties: {
        toAddress: { type: 'string', description: 'Recipient Solana address (base58).' },
        amountSol: { type: 'number', description: 'Amount in SOL.' },
      },
      required: ['toAddress', 'amountSol'],
    },
    feePreview(input) {
      const amountSol = Number(input.amountSol ?? 0)
      if (!Number.isFinite(amountSol) || amountSol <= 0) return null
      return quoteExecutionFee(Math.round(amountSol * LAMPORTS_PER_SOL))
    },
    async handler(input, ctx) {
      const toAddress = String(input.toAddress ?? '').trim()
      const amountSol = Number(input.amountSol ?? 0)
      if (!toAddress) return { ok: false, summary: 'A destination address is required.' }
      if (!Number.isFinite(amountSol) || amountSol <= 0) return { ok: false, summary: 'Amount must be greater than 0.' }
      const dashboard = await WalletService.getDashboard(ctx.snapshot.activeProjectId)
      const wallet = dashboard.activeWallet
      if (!wallet) return { ok: false, summary: 'No active wallet — generate or assign one first.' }
      const result = await WalletService.transferSOL(wallet.id, toAddress, amountSol, false, 'agent')
      return {
        ok: true,
        summary: clusterMark(`Sent ${amountSol} SOL → ${shortAddress(toAddress)}.`),
        data: { signature: result.signature, transactionId: result.id, from: wallet.address, to: toAddress, amountSol },
      }
    },
  },
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
