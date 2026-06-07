/**
 * Workspace scaffolding + engine orchestration tools.
 */
import path from 'node:path'
import fs from 'node:fs/promises'
import * as EngineService from '../../EngineService'
import type { AriaTool } from '../AriaTool'
import { resolveScopedPath } from './shared'

/** Engine orchestration actions exposed to the model. */
const ENGINE_ACTIONS = new Set([
  'fix-claude-md', 'generate-claude-md', 'debug-setup', 'health-check',
  'explain-error', 'suggest-fix', 'safety-scan', 'ask',
])

export const workspaceTools: AriaTool[] = [
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
]
