/**
 * ARIA operator tool catalog (v1). Four domains: navigation/read-only,
 * settings/integrations, scaffolding/terminal, wallet/on-chain.
 *
 * Execution lanes:
 *  - main-side direct: settings, wallet, fs, engine (real side effects).
 *  - renderer uiEffect: navigation, open_file, run_command, terminal spawn,
 *    integration check/toggle (state the renderer owns).
 *
 * Risk gating (enforced by AriaAgentService, not here):
 *  read = auto-run · write = inline approve · sensitive = typed confirm.
 */
import path from 'node:path'
import fs from 'node:fs/promises'
import * as SettingsService from '../SettingsService'
import * as WalletService from '../WalletService'
import * as EngineService from '../EngineService'
import type { AriaTool } from './AriaTool'

/** Workspace tool ids the model may open (mirror of src/constants/toolRegistry). */
const OPEN_TOOL_IDS = new Set([
  'starter', 'git', 'deploy', 'env', 'wallet', 'email', 'ports', 'processes', 'settings',
  'image-editor', 'token-launch', 'proof-pool', 'project-readiness', 'solana-toolbox',
  'integrations', 'agentops', 'metaplex-demo', 'zauth', 'block-scanner', 'replay-engine',
  'docs', 'dashboard', 'agent-work', 'sessions', 'hackathon', 'daemon-ai', 'pro', 'plugins',
  'recovery', 'activity', 'agent-station', 'clawpump', 'degentools', 'signalhouse',
  'ricomaps', 'browser',
])

/** Boolean UI settings the model may flip via change_setting. */
const BOOL_SETTING_KEYS = new Set(['showMarketTape', 'showTitlebarWallet', 'lowPowerMode'])

/** Engine orchestration actions exposed to the model. */
const ENGINE_ACTIONS = new Set([
  'fix-claude-md', 'generate-claude-md', 'debug-setup', 'health-check',
  'explain-error', 'suggest-fix', 'safety-scan', 'ask',
])

function resolveScopedPath(rel: string, projectRoot: string | null): string {
  if (!projectRoot) throw new Error('No active project — open a project before scaffolding files.')
  const abs = path.resolve(projectRoot, rel)
  const root = path.resolve(projectRoot)
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error('Path escapes the active project root.')
  }
  return abs
}

export const ARIA_TOOLS: AriaTool[] = [
  // ---------------- planning / patch proposal (intercepted by AriaAgentService) ----------------
  {
    name: 'present_plan',
    description: 'Present an ordered plan for the task BEFORE acting, as a short list of steps (3–6). Call this first whenever a request needs more than one action so the user can see the approach.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
        },
      },
      required: ['steps'],
    },
    // Intercepted in AriaAgentService.executeTool; this is a defensive fallback.
    async handler() {
      return { ok: true, summary: 'Plan presented.' }
    },
  },
  {
    name: 'propose_patch',
    description: 'Propose a code change as a unified diff for the user to keep or discard. Provide a short title, a one-paragraph summary, and the unified diff (git format, paths relative to the project root). The change is NOT applied until the user approves.',
    kind: 'edit',
    risk: 'write',
    input: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        unifiedDiff: { type: 'string' },
      },
      required: ['title', 'unifiedDiff'],
    },
    // Intercepted in AriaAgentService.executeTool; this is a defensive fallback.
    async handler() {
      return { ok: true, summary: 'Patch proposed.' }
    },
  },

  // ---------------- navigation / read-only ----------------
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

  // ---------------- settings / integrations ----------------
  {
    name: 'change_setting',
    description: 'Change a DAEMON setting. Boolean keys: showMarketTape, showTitlebarWallet, lowPowerMode. Or set wallet infrastructure (cluster: devnet|testnet|mainnet-beta, rpcProvider: helius|quicknode|custom|public).',
    kind: 'edit',
    risk: 'write',
    input: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: {},
        cluster: { type: 'string' },
        rpcProvider: { type: 'string' },
      },
    },
    async handler(input) {
      const key = String(input.key ?? '')
      if (BOOL_SETTING_KEYS.has(key)) {
        SettingsService.setBooleanSetting(key, Boolean(input.value))
        return { ok: true, summary: `Set ${key} = ${Boolean(input.value)}.` }
      }
      if (key === 'walletInfrastructure' || input.cluster || input.rpcProvider) {
        const current = SettingsService.getWalletInfrastructureSettings()
        const next = {
          ...current,
          ...(input.cluster ? { cluster: input.cluster as typeof current.cluster } : {}),
          ...(input.rpcProvider ? { rpcProvider: input.rpcProvider as typeof current.rpcProvider } : {}),
        }
        SettingsService.setWalletInfrastructureSettings(next)
        return { ok: true, summary: `Updated wallet infrastructure (${next.cluster} · ${next.rpcProvider}).` }
      }
      return { ok: false, summary: `Setting "${key}" is not changeable from ARIA.` }
    },
  },
  {
    name: 'run_integration_check',
    description: 'Run a read-only safe-check for an integration action id (e.g. check-helius-key). Read-only only.',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: { actionId: { type: 'string' } }, required: ['actionId'] },
    async handler(input, ctx) {
      const actionId = String(input.actionId ?? '')
      const data = await ctx.runUiEffect({ type: 'run_integration', actionId }, true)
      return { ok: true, summary: `Ran integration check ${actionId}.`, data }
    },
  },
  {
    name: 'enable_integration',
    description: 'Enable a DAEMON integration by id (e.g. helius, jupiter, sendai-agent-kit).',
    kind: 'edit',
    risk: 'write',
    input: { type: 'object', properties: { integrationId: { type: 'string' } }, required: ['integrationId'] },
    async handler(input, ctx) {
      const integrationId = String(input.integrationId ?? '')
      await ctx.runUiEffect({ type: 'set_integration_enabled', integrationId, enabled: true }, false)
      return { ok: true, summary: `Enabled ${integrationId}.`, uiEffect: { type: 'set_integration_enabled', integrationId, enabled: true } }
    },
  },
  {
    name: 'disable_integration',
    description: 'Disable a DAEMON integration by id.',
    kind: 'edit',
    risk: 'write',
    input: { type: 'object', properties: { integrationId: { type: 'string' } }, required: ['integrationId'] },
    async handler(input, ctx) {
      const integrationId = String(input.integrationId ?? '')
      await ctx.runUiEffect({ type: 'set_integration_enabled', integrationId, enabled: false }, false)
      return { ok: true, summary: `Disabled ${integrationId}.`, uiEffect: { type: 'set_integration_enabled', integrationId, enabled: false } }
    },
  },

  // ---------------- scaffolding / terminal ----------------
  {
    name: 'scaffold_file',
    description: 'Create or overwrite a file with content, relative to the active project root.',
    kind: 'edit',
    risk: 'write',
    input: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
    async handler(input, ctx) {
      const rel = String(input.path ?? '')
      const abs = resolveScopedPath(rel, ctx.snapshot.activeProjectPath)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, String(input.content ?? ''), 'utf8')
      return { ok: true, summary: `Wrote ${rel}.` }
    },
  },
  {
    name: 'create_dir',
    description: 'Create a directory (recursive) relative to the active project root.',
    kind: 'edit',
    risk: 'write',
    input: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    async handler(input, ctx) {
      const rel = String(input.path ?? '')
      const abs = resolveScopedPath(rel, ctx.snapshot.activeProjectPath)
      await fs.mkdir(abs, { recursive: true })
      return { ok: true, summary: `Created ${rel}/.` }
    },
  },
  {
    name: 'run_engine_action',
    description: 'Run a DAEMON engine orchestration action. Valid: fix-claude-md, generate-claude-md, debug-setup, health-check, explain-error, suggest-fix, safety-scan, ask.',
    kind: 'run',
    risk: 'write',
    input: {
      type: 'object',
      properties: { action: { type: 'string' }, question: { type: 'string' }, error: { type: 'string' } },
      required: ['action'],
    },
    async handler(input, ctx) {
      const action = String(input.action ?? '')
      if (!ENGINE_ACTIONS.has(action)) return { ok: false, summary: `Unknown engine action "${action}".` }
      const payload: Record<string, unknown> = {}
      if (input.question) payload.question = input.question
      if (input.error) payload.error = input.error
      const res = await EngineService.runAction({
        type: action as Parameters<typeof EngineService.runAction>[0]['type'],
        projectId: ctx.snapshot.activeProjectId ?? undefined,
        payload,
      })
      return { ok: res.ok, summary: res.ok ? `Ran ${action}.` : (res.error ?? `Engine action ${action} failed.`), data: res.output }
    },
  },

  // ---------------- wallet / on-chain (sensitive) ----------------
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

export function getTool(name: string): AriaTool | undefined {
  return ARIA_TOOLS.find((t) => t.name === name)
}
