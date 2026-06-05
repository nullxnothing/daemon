/**
 * AgentStation tools: list / create local agent configs, create an agent
 * wallet (sensitive), and scaffold an agent project into the workspace.
 */
import path from 'node:path'
import * as AgentStationService from '../../AgentStationService'
import * as WalletService from '../../WalletService'
import type { AriaTool, AriaToolContext } from '../AriaTool'
import { resolveScopedPath } from './shared'

const TEMPLATES = new Set([
  'basic', 'defi-trader', 'portfolio-monitor', 'nft-minter', 'metaplex-meterflow-operator',
])

/** Friendly agent name derived from the active project folder, for "an agent for this codebase". */
function projectAgentName(ctx: AriaToolContext): string {
  const root = ctx.snapshot.activeProjectPath
  const base = root ? path.basename(root) : 'agent'
  return `${base} Agent`
}

export const agentStationTools: AriaTool[] = [
  {
    name: 'agentstation_list_configs',
    description: 'List local AgentStation agent configs (read-only).',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: {} },
    async handler() {
      const configs = AgentStationService.listConfigs()
      return {
        ok: true,
        summary: `Found ${configs.length} agent config(s).`,
        data: configs.map((c) => ({ id: c.id, name: c.name, template: c.template, status: c.status, walletId: c.wallet_id })),
      }
    },
  },
  {
    name: 'agentstation_create_config',
    description: 'Create a local AgentStation agent config. template is one of: basic, defi-trader, portfolio-monitor, nft-minter, metaplex-meterflow-operator. Optionally pass plugins (Solana Agent Kit plugin slugs), model, rpc_url.',
    kind: 'run',
    risk: 'write',
    input: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        template: { type: 'string' },
        description: { type: 'string' },
        plugins: { type: 'array', items: { type: 'string' } },
        model: { type: 'string' },
        rpc_url: { type: 'string' },
      },
      required: ['name', 'template'],
    },
    async handler(input) {
      const name = String(input.name ?? '').trim()
      const template = String(input.template ?? '')
      if (!name) return { ok: false, summary: 'An agent name is required.' }
      if (!TEMPLATES.has(template)) return { ok: false, summary: `Unknown template "${template}".` }
      const config = AgentStationService.createConfig({
        name,
        template: template as AgentStationService.AgentTemplate,
        description: input.description ? String(input.description) : undefined,
        plugins: Array.isArray(input.plugins) ? (input.plugins as string[]).map(String) : undefined,
        model: input.model ? String(input.model) : undefined,
        rpc_url: input.rpc_url ? String(input.rpc_url) : undefined,
      })
      return { ok: true, summary: `Created agent config "${name}" (${template}).`, data: { id: config.id } }
    },
  },
  {
    name: 'agentstation_create_agent_wallet',
    description: 'Create a new signing wallet for an AgentStation agent. If agentId/name are omitted, a wallet is created for the active project ("an agent wallet for this codebase").',
    kind: 'run',
    risk: 'sensitive',
    input: {
      type: 'object',
      properties: { agentId: { type: 'string' }, name: { type: 'string' } },
    },
    async handler(input, ctx) {
      const agentId = String(input.agentId ?? '').trim() || `project:${ctx.snapshot.activeProjectId ?? 'none'}`
      const name = String(input.name ?? '').trim() || projectAgentName(ctx)
      const wallet = WalletService.createAgentWallet(agentId, name) as { id: string; address: string }
      return {
        ok: true,
        summary: `Created agent wallet "${name}".`,
        data: { id: wallet.id, address: wallet.address },
      }
    },
  },
  {
    name: 'agentstation_scaffold',
    description: 'Scaffold an AgentStation agent project into a directory relative to the active project root. Provide the config id and an output directory.',
    kind: 'edit',
    risk: 'write',
    input: {
      type: 'object',
      properties: { configId: { type: 'string' }, outputDir: { type: 'string' } },
      required: ['configId', 'outputDir'],
    },
    async handler(input, ctx) {
      const configId = String(input.configId ?? '')
      const rel = String(input.outputDir ?? '')
      const abs = resolveScopedPath(rel, ctx.snapshot.activeProjectPath)
      const result = await AgentStationService.scaffoldProject(configId, abs)
      return { ok: true, summary: `Scaffolded agent project to ${rel}.`, data: result }
    },
  },
]
