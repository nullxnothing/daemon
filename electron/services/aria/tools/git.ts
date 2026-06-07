/**
 * Git tools: stage + commit in the active project. No push (DAEMON never
 * pushes autonomously — the human pushes from the Git panel).
 */
import simpleGit from 'simple-git'
import { isPathSafe } from '../../../shared/pathValidation'
import type { AriaTool } from '../AriaTool'

function requireProjectCwd(projectPath: string | null): string {
  if (!projectPath || !isPathSafe(projectPath)) {
    throw new Error('No registered project to commit in.')
  }
  return projectPath
}

export const gitTools: AriaTool[] = [
  {
    name: 'git_commit',
    description: 'Stage and commit changes in the active project. Pass a commit message; optionally pass files (paths relative to the repo) to stage only those, otherwise all changes are staged. Never pushes.',
    kind: 'run',
    risk: 'write',
    input: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
      },
      required: ['message'],
    },
    async handler(input, ctx) {
      const message = String(input.message ?? '').trim()
      if (!message) return { ok: false, summary: 'A commit message is required.' }
      const cwd = requireProjectCwd(ctx.snapshot.activeProjectPath)
      const git = simpleGit(cwd)
      const files = Array.isArray(input.files) ? (input.files as string[]).map(String) : null
      await git.add(files && files.length > 0 ? files : ['-A'])
      const result = await git.commit(message)
      return {
        ok: true,
        summary: `Committed ${result.summary.changes} change(s) (${result.commit || 'HEAD'}).`,
        data: { commit: result.commit, changes: result.summary.changes },
      }
    },
  },
]
