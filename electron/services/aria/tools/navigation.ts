/**
 * Navigation / read-only tools: open panels, run commands, open files,
 * read project + wallet status.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import * as SettingsService from '../../SettingsService'
import * as WalletService from '../../WalletService'
import { PACK_IPC_DOMAINS, type PackId } from '../../../shared/packManifest'
import { getDb } from '../../../db/db'
import type { AriaTool } from '../AriaTool'
import { resolveScopedPath } from './shared'
import type { Project } from '../../../shared/types'

const MAX_TREE_ENTRIES = 300
const MAX_SEARCH_RESULTS = 50
const MAX_READ_BYTES = 120_000
const MAX_SEARCH_FILE_BYTES = 512_000
const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'dist-electron', 'dist-bridge', 'build',
  'target', 'release', 'test-results', '.next', '.turbo', '.cache',
])

function summarizeEnabledPacks(packs: Record<string, boolean>) {
  const packIds = Object.keys(PACK_IPC_DOMAINS) as PackId[]
  const enabledPacks = packIds.filter((id) => packs[id] !== false)
  const disabledPacks = packIds.filter((id) => packs[id] === false)
  const enabledIpcDomains = Array.from(new Set(enabledPacks.flatMap((id) => PACK_IPC_DOMAINS[id]))).sort()
  return { enabledPacks, disabledPacks, enabledIpcDomains }
}

function toProjectRelative(abs: string, root: string): string {
  return path.relative(root, abs).replace(/\\/g, '/') || '.'
}

function normalizeFsPath(value: string): string {
  return path.resolve(value).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
}

function findRegisteredProject(input: string): Project | null {
  const needle = input.trim()
  if (!needle) return null
  const normalized = normalizeFsPath(needle)
  const rows = getDb().prepare('SELECT * FROM projects').all() as Project[]
  return rows.find((project) =>
    project.id === needle ||
    project.name.toLowerCase() === needle.toLowerCase() ||
    normalizeFsPath(project.path) === normalized
  ) ?? null
}

async function walkProject(root: string, start: string, limit: number): Promise<Array<{ path: string; type: 'file' | 'dir'; size?: number }>> {
  const entries: Array<{ path: string; type: 'file' | 'dir'; size?: number }> = []
  const pending = [start]
  while (pending.length > 0 && entries.length < limit) {
    const current = pending.shift()!
    const dirents = await fs.readdir(current, { withFileTypes: true })
    for (const dirent of dirents.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entries.length >= limit) break
      if (dirent.isDirectory() && IGNORED_DIRS.has(dirent.name)) continue
      const abs = path.join(current, dirent.name)
      if (dirent.isDirectory()) {
        entries.push({ path: toProjectRelative(abs, root), type: 'dir' })
        pending.push(abs)
      } else if (dirent.isFile()) {
        const stat = await fs.stat(abs)
        entries.push({ path: toProjectRelative(abs, root), type: 'file', size: stat.size })
      }
    }
  }
  return entries
}

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
    name: 'activate_project',
    description: 'Set a registered DAEMON project as active by exact id, name, or path. Use when the user provides a project path or asks to switch projects.',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] },
    async handler(input, ctx) {
      const query = String(input.project ?? '').trim()
      const project = findRegisteredProject(query)
      if (!project) return { ok: false, summary: `No registered project matches "${query}".` }
      ctx.snapshot.activeProjectId = project.id
      ctx.snapshot.activeProjectPath = project.path
      await ctx.runUiEffect({ type: 'set_active_project', projectId: project.id, projectPath: project.path }, false)
      return {
        ok: true,
        summary: `Activated ${project.name}.`,
        data: { id: project.id, name: project.name, path: project.path },
        uiEffect: { type: 'set_active_project', projectId: project.id, projectPath: project.path },
      }
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
    name: 'list_project_tree',
    description: 'List files and folders under the active project. Use before asking the user for filenames. Optional path is relative to the active project.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        limit: { type: 'number' },
      },
    },
    async handler(input, ctx) {
      const root = path.resolve(ctx.snapshot.activeProjectPath ?? '')
      const rel = typeof input.path === 'string' && input.path.trim() ? input.path.trim() : '.'
      const start = resolveScopedPath(rel, ctx.snapshot.activeProjectPath)
      const stat = await fs.stat(start)
      const limit = Math.min(Math.max(Number(input.limit) || MAX_TREE_ENTRIES, 1), MAX_TREE_ENTRIES)
      const entries = stat.isDirectory()
        ? await walkProject(root, start, limit)
        : [{ path: toProjectRelative(start, root), type: 'file' as const, size: stat.size }]
      return {
        ok: true,
        summary: `Listed ${entries.length} item${entries.length === 1 ? '' : 's'}${entries.length >= limit ? ' (truncated)' : ''}.`,
        data: { entries, truncated: entries.length >= limit },
      }
    },
  },
  {
    name: 'read_file',
    description: 'Read UTF-8 text from a file in the active project. Use this before answering questions about file contents.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        maxBytes: { type: 'number' },
      },
      required: ['path'],
    },
    async handler(input, ctx) {
      const rel = String(input.path ?? '').trim()
      if (!rel) return { ok: false, summary: 'A file path is required.' }
      const abs = resolveScopedPath(rel, ctx.snapshot.activeProjectPath)
      const stat = await fs.stat(abs)
      if (!stat.isFile()) return { ok: false, summary: `${rel} is not a file.` }
      const maxBytes = Math.min(Math.max(Number(input.maxBytes) || MAX_READ_BYTES, 1), MAX_READ_BYTES)
      const handle = await fs.open(abs, 'r')
      try {
        const buffer = Buffer.alloc(Math.min(stat.size, maxBytes))
        await handle.read(buffer, 0, buffer.length, 0)
        return {
          ok: true,
          summary: `Read ${rel}${stat.size > maxBytes ? ' (truncated)' : ''}.`,
          data: { path: rel, content: buffer.toString('utf8'), truncated: stat.size > maxBytes, size: stat.size },
        }
      } finally {
        await handle.close()
      }
    },
  },
  {
    name: 'search_files',
    description: 'Search text files in the active project for a literal query. Skips dependency and build directories.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        path: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
    async handler(input, ctx) {
      const query = String(input.query ?? '').trim()
      if (!query) return { ok: false, summary: 'A search query is required.' }
      const root = path.resolve(ctx.snapshot.activeProjectPath ?? '')
      const rel = typeof input.path === 'string' && input.path.trim() ? input.path.trim() : '.'
      const start = resolveScopedPath(rel, ctx.snapshot.activeProjectPath)
      const limit = Math.min(Math.max(Number(input.limit) || MAX_SEARCH_RESULTS, 1), MAX_SEARCH_RESULTS)
      const startStat = await fs.stat(start)
      const files = startStat.isFile()
        ? [{ path: toProjectRelative(start, root), type: 'file' as const, size: startStat.size }]
        : (await walkProject(root, start, 2_000)).filter((entry) => entry.type === 'file')
      const needle = query.toLowerCase()
      const results: Array<{ path: string; line: number; text: string }> = []
      for (const file of files) {
        if (results.length >= limit) break
        if ((file.size ?? 0) > MAX_SEARCH_FILE_BYTES) continue
        const content = await fs.readFile(resolveScopedPath(file.path, ctx.snapshot.activeProjectPath), 'utf8').catch(() => '')
        if (!content) continue
        const lines = content.split(/\r?\n/)
        for (let index = 0; index < lines.length && results.length < limit; index++) {
          if (lines[index].toLowerCase().includes(needle)) {
            results.push({ path: file.path, line: index + 1, text: lines[index].slice(0, 240) })
          }
        }
      }
      return {
        ok: true,
        summary: `Found ${results.length} match${results.length === 1 ? '' : 'es'}${results.length >= limit ? ' (truncated)' : ''}.`,
        data: { results, truncated: results.length >= limit },
      }
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
      const packs = summarizeEnabledPacks(SettingsService.getEnabledPacks())
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
          enabledPacks: packs.enabledPacks,
          disabledPacks: packs.disabledPacks,
          enabledIpcDomains: packs.enabledIpcDomains,
        },
      }
    },
  },
]
