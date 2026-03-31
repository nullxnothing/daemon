import { ipcMain } from 'electron'
import simpleGit from 'simple-git'
import { isPathSafe } from '../shared/pathValidation'

function validateCwd(cwd: string): { ok: false; error: string } | null {
  if (!cwd || !isPathSafe(cwd)) return { ok: false, error: 'Path not within a registered project' }
  return null
}

export function registerGitHandlers() {
  ipcMain.handle('git:branch', async (_event, cwd: string) => {
    try {
      const reject = validateCwd(cwd); if (reject) return reject
      const git = simpleGit(cwd)
      const branch = await git.revparse(['--abbrev-ref', 'HEAD'])
      return { ok: true, data: branch.trim() }
    } catch {
      return { ok: true, data: null }
    }
  })

  ipcMain.handle('git:branches', async (_event, cwd: string) => {
    try {
      const reject = validateCwd(cwd); if (reject) return reject
      const git = simpleGit(cwd)
      const summary = await git.branch(['-a', '--no-color'])
      return { ok: true, data: { branches: summary.all, current: summary.current } }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('git:status', async (_event, cwd: string) => {
    try {
      const reject = validateCwd(cwd); if (reject) return reject
      const git = simpleGit(cwd)
      const status = await git.status()
      const files = [
        ...status.staged.map((f) => ({
          path: f,
          staged: true,
          unstaged: false,
          untracked: false,
          status: 'staged',
        })),
        ...status.modified.filter((f) => !status.staged.includes(f)).map((f) => ({
          path: f,
          staged: false,
          unstaged: true,
          untracked: false,
          status: 'modified',
        })),
        ...status.not_added.map((f) => ({
          path: f,
          staged: false,
          unstaged: false,
          untracked: true,
          status: 'untracked',
        })),
      ]
      return { ok: true, data: files }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('git:stage', async (_event, cwd: string, files: string[]) => {
    try {
      const reject = validateCwd(cwd); if (reject) return reject
      const git = simpleGit(cwd)
      await git.add(files)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('git:unstage', async (_event, cwd: string, files: string[]) => {
    try {
      const reject = validateCwd(cwd); if (reject) return reject
      const git = simpleGit(cwd)
      await git.reset(['HEAD', '--', ...files])
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('git:commit', async (_event, cwd: string, message: string) => {
    try {
      if (!message.trim()) return { ok: false, error: 'Commit message required' }
      const reject = validateCwd(cwd); if (reject) return reject
      const git = simpleGit(cwd)
      await git.commit(message)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('git:push', async (_event, cwd: string) => {
    try {
      const reject = validateCwd(cwd); if (reject) return reject
      const git = simpleGit(cwd)
      const result = await git.push()
      return { ok: true, data: result }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('git:log', async (_event, cwd: string, count = 20) => {
    try {
      const reject = validateCwd(cwd); if (reject) return reject
      const git = simpleGit(cwd)
      const log = await git.log({ maxCount: count })
      const commits = log.all.map((c) => ({
        hash: c.hash,
        short: c.hash.slice(0, 7),
        message: c.message,
        author: c.author_name,
        time: c.date,
      }))
      return { ok: true, data: commits }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('git:diff', async (_event, cwd: string, filePath?: string) => {
    try {
      const reject = validateCwd(cwd); if (reject) return reject
      const git = simpleGit(cwd)
      const diff = filePath ? await git.diff([filePath]) : await git.diff()
      return { ok: true, data: diff }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('git:checkout', async (_event, cwd: string, branch: string) => {
    try {
      const reject = validateCwd(cwd); if (reject) return reject
      const git = simpleGit(cwd)
      await git.checkout(branch)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
