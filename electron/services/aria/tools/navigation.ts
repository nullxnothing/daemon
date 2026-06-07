/**
 * Navigation / read-only tools: open panels, run commands, open files,
 * read project + wallet status.
 */
import * as SettingsService from '../../SettingsService'
import * as WalletService from '../../WalletService'
import type { AriaTool } from '../AriaTool'
import { resolveScopedPath } from './shared'

/** Workspace tool ids the model may open (mirror of src/constants/toolRegistry). */
const OPEN_TOOL_IDS = new Set([
  'starter', 'git', 'deploy', 'env', 'wallet', 'email', 'ports', 'processes', 'settings',
  'image-editor', 'token-launch', 'proof-pool', 'project-readiness', 'solana-toolbox',
  'integrations', 'agentops', 'metaplex-demo', 'zauth', 'block-scanner', 'replay-engine',
  'docs', 'dashboard', 'agent-work', 'sessions', 'hackathon', 'daemon-ai', 'pro', 'plugins',
  'recovery', 'activity', 'agent-station', 'clawpump', 'degentools', 'signalhouse',
  'meterflow', 'flywheel', 'ricomaps', 'browser',
])

export const navigationTools: AriaTool[] = [
  {
    name: 'open_tool',
    description: 'Open a DAEMON workspace tool or panel by id (e.g. wallet, integrations, git, settings, daemon-ai, token-launch).',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: { toolId: { type: 'string' } }, required: ['toolId'] },
    async handler(input, ctx) {
      const toolId = String(input.toolId ?? '')
      if (!OPEN_TOOL_IDS.has(toolId)) return { ok: false, summary: `Unknown tool "${toolId}".` }
      await ctx.runUiEffect({ type: 'open_tool', toolId }, false)
      return { ok: true, summary: `Opened ${toolId}.`, uiEffect: { type: 'open_tool', toolId } }
    },
  },
  {
    name: 'run_command',
    description: 'Run a DAEMON command-palette command by id (e.g. view:grind-mode, view:toggle-right-panel, agent:launch).',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: { commandId: { type: 'string' } }, required: ['commandId'] },
    async handler(input, ctx) {
      const commandId = String(input.commandId ?? '')
      await ctx.runUiEffect({ type: 'run_command', commandId }, false)
      return { ok: true, summary: `Ran ${commandId}.`, uiEffect: { type: 'run_command', commandId } }
    },
  },
  {
    name: 'open_file',
    description: 'Open a file in the editor by path (relative to the active project).',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    async handler(input, ctx) {
      const rel = String(input.path ?? '')
      const abs = resolveScopedPath(rel, ctx.snapshot.activeProjectPath)
      await ctx.runUiEffect({ type: 'open_file', path: abs }, false)
      return { ok: true, summary: `Opened ${rel}.`, uiEffect: { type: 'open_file', path: abs } }
    },
  },
  {
    name: 'read_project_status',
    description: 'Read a summary of the active project: wallet, enabled integrations, network. Use before acting.',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: {} },
    async handler(_input, ctx) {
      const dashboard = await WalletService.getDashboard(ctx.snapshot.activeProjectId).catch(() => null)
      const infra = SettingsService.getWalletInfrastructureSettings()
      return {
        ok: true,
        summary: 'Read project status.',
        data: {
          project: ctx.snapshot.activeProjectPath,
          cluster: infra.cluster,
          rpcProvider: infra.rpcProvider,
          defaultWallet: dashboard?.activeWallet?.name ?? null,
          walletCount: dashboard?.portfolio.walletCount ?? 0,
          heliusConfigured: dashboard?.heliusConfigured ?? false,
        },
      }
    },
  },
]
