import * as AgentEconomyService from '../../AgentEconomyService'
import * as IdlePaidCallService from '../../IdlePaidCallService'
import {
  readAgentIdentity,
  registerAgentIdentity,
  type MetaplexReadAgentIdentityInput,
  type MetaplexRegisterAgentIdentityInput,
} from '../../MetaplexOperatorService'
import type { AriaTool } from '../AriaTool'

const DEFAULT_DEVNET_RPC = 'https://api.devnet.solana.com'

function stringValue(value: unknown): string {
  return String(value ?? '').trim()
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : []
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function limitValue(value: unknown, fallback: number): number {
  return Math.min(Math.max(1, Math.floor(numberValue(value, fallback))), 100)
}

function toAgentEconomyCheck(input: Record<string, unknown>, projectId: string | null) {
  return {
    profileId: stringValue(input.profileId),
    resourceId: stringValue(input.resourceId),
    projectId: stringValue(input.projectId) || projectId || undefined,
    taskId: stringValue(input.taskId) || null,
  }
}

const POLICY_SCHEMA: AriaTool['input'] = {
  type: 'object',
  properties: {
    profileId: { type: 'string' },
    resourceId: { type: 'string' },
    projectId: { type: 'string' },
    taskId: { type: 'string' },
  },
  required: ['profileId', 'resourceId'],
}

export const agentEconomyTools: AriaTool[] = [
  {
    name: 'agenteconomy_list_profiles',
    description: 'List Meterflow paid-agent profiles/sessions (read-only).',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: { projectId: { type: 'string' } } },
    async handler(input, ctx) {
      const profiles = AgentEconomyService.listProfiles(stringValue(input.projectId) || ctx.snapshot.activeProjectId)
      return {
        ok: true,
        summary: `Found ${profiles.length} paid-agent profile(s).`,
        data: profiles,
      }
    },
  },
  {
    name: 'agenteconomy_list_resources',
    description: 'List cached Agent Economy paid resources from the local IDLE/x402 registry cache (read-only).',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: { limit: { type: 'number' } } },
    async handler(input) {
      const resources = IdlePaidCallService.listResources(limitValue(input.limit, 50))
      return {
        ok: true,
        summary: `Found ${resources.length} paid resource(s).`,
        data: resources,
      }
    },
  },
  {
    name: 'agenteconomy_check_policy',
    description: 'Check whether a cached paid resource is allowed by the supplied budget, domain, network, asset, payee, and receipt policy (read-only).',
    kind: 'read',
    risk: 'read',
    input: POLICY_SCHEMA,
    async handler(input, ctx) {
      const result = AgentEconomyService.checkPolicy(toAgentEconomyCheck(input, ctx.snapshot.activeProjectId))
      return {
        ok: true,
        summary: result.allowed ? 'Policy allows this paid resource.' : `Policy blocks this paid resource: ${result.reasons.join(' ')}`,
        data: result,
      }
    },
  },
  {
    name: 'agenteconomy_list_receipts',
    description: 'List recent Agent Economy paid-call receipts (read-only).',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        profileId: { type: 'string' },
        projectId: { type: 'string' },
        limit: { type: 'number' },
      },
    },
    async handler(input, ctx) {
      const receipts = await AgentEconomyService.listReceipts({
        profileId: stringValue(input.profileId) || undefined,
        projectId: stringValue(input.projectId) || ctx.snapshot.activeProjectId || undefined,
        limit: limitValue(input.limit, 25),
      })
      return { ok: true, summary: `Found ${receipts.length} receipt(s).`, data: receipts }
    },
  },
  {
    name: 'agenteconomy_read_devnet_identity',
    description: 'Read a Metaplex Agent Identity for a devnet Core asset (read-only).',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        assetAddress: { type: 'string' },
        rpcUrl: { type: 'string' },
      },
      required: ['assetAddress'],
    },
    async handler(input) {
      const assetAddress = stringValue(input.assetAddress)
      if (!assetAddress) return { ok: false, summary: 'An agent asset address is required.' }
      const identityInput: MetaplexReadAgentIdentityInput = {
        network: 'devnet',
        rpcUrl: stringValue(input.rpcUrl) || DEFAULT_DEVNET_RPC,
        assetAddress,
      }
      const identity = await readAgentIdentity(identityInput)
      return {
        ok: true,
        summary: identity.registered ? 'Read registered devnet agent identity.' : 'No devnet agent identity found for this asset.',
        data: identity,
      }
    },
  },
  {
    name: 'agenteconomy_register_devnet_identity',
    description: 'Register a Metaplex Agent Identity for a devnet Core asset. Requires ARIA sensitive approval and the service confirmation acknowledgement REGISTER AGENT IDENTITY.',
    kind: 'run',
    risk: 'sensitive',
    input: {
      type: 'object',
      properties: {
        walletId: { type: 'string' },
        rpcUrl: { type: 'string' },
        assetAddress: { type: 'string' },
        agentRegistrationUri: { type: 'string' },
        confirmedAt: { type: 'number' },
        acknowledgement: { type: 'string' },
      },
      required: ['walletId', 'assetAddress', 'agentRegistrationUri', 'confirmedAt', 'acknowledgement'],
    },
    async handler(input) {
      const registerInput: MetaplexRegisterAgentIdentityInput = {
        walletId: stringValue(input.walletId),
        network: 'devnet',
        rpcUrl: stringValue(input.rpcUrl) || DEFAULT_DEVNET_RPC,
        assetAddress: stringValue(input.assetAddress),
        agentRegistrationUri: stringValue(input.agentRegistrationUri),
        confirmedAt: numberValue(input.confirmedAt, 0),
        acknowledgement: stringValue(input.acknowledgement),
      }
      const receipt = await registerAgentIdentity(registerInput)
      return {
        ok: true,
        summary: `Registered devnet agent identity for ${receipt.asset}.`,
        data: receipt,
      }
    },
  },
  {
    name: 'agenteconomy_execute_paid_call',
    description: 'Execute a paid IDLE/x402 resource call after ARIA sensitive approval. The handler rechecks policy, requires a payment signature, and stores a redacted receipt.',
    kind: 'run',
    risk: 'sensitive',
    input: {
      type: 'object',
      properties: {
        profileId: { type: 'string' },
        resourceId: { type: 'string' },
        projectId: { type: 'string' },
        taskId: { type: 'string' },
        agentId: { type: 'string' },
        requestBody: { type: 'object' },
        paymentSignature: { type: 'string' },
        approvedBy: { type: 'string' },
      },
      required: ['profileId', 'resourceId', 'paymentSignature'],
    },
    async handler(input, ctx) {
      const paymentSignature = stringValue(input.paymentSignature)
      if (!paymentSignature) return { ok: false, summary: 'A payment signature is required.' }
      const result = await AgentEconomyService.executePaidCall({
        ...toAgentEconomyCheck(input, ctx.snapshot.activeProjectId),
        requestBody: input.requestBody ?? {},
        paymentSignature,
        approvedBy: stringValue(input.approvedBy) || 'aria',
      })
      const execution = objectValue(result)
      const receipt = objectValue(execution.receipt)
      const reasons = stringArray(execution.reasons)
      const status = stringValue(receipt.status) || stringValue(execution.status)
      return {
        ok: status === 'settled' || status === 'executed',
        summary: status === 'settled' || status === 'executed'
          ? 'Paid call executed and receipt recorded.'
          : `Paid call ${status || 'blocked'}: ${reasons.join(' ') || stringValue(receipt.errorMessage) || 'receipt recorded.'}`,
        data: result,
      }
    },
  },
]
