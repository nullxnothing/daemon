import { ipcMain } from 'electron'
import simpleGit from 'simple-git'
import { validateCwd } from '../shared/pathValidation'
import { ipcHandler } from '../services/IpcHandlerFactory'

const GIT_TIMEOUT = { block: 30_000 }

function gitClient(cwd: string) {
  return simpleGit({ baseDir: cwd, timeout: GIT_TIMEOUT })
}

function getErrorMessage(err: unknown): string {
  return (err as Error).message ?? String(err)
}

function isNotGitRepositoryError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase()
  return msg.includes('not a git repository')
}

async function ensureGitRepository(cwd: string): Promise<{ initialized: boolean }> {
  const g = gitClient(cwd)
  try {
    await g.revparse(['--is-inside-work-tree'])
    return { initialized: false }
  } catch (err) {
    if (!isNotGitRepositoryError(err)) throw err
    await g.init()
    return { initialized: true }
  }
}

// Per-repo mutex to prevent concurrent git operations
const repoLocks = new Map<string, Promise<void>>()

async function withRepoLock<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
  const prev = repoLocks.get(cwd) ?? Promise.resolve()
  let resolve: () => void
  const next = new Promise<void>((r) => { resolve = r })
  repoLocks.set(cwd, next)
  try {
    await prev
    return await fn()
  } finally {
    resolve!()
    if (repoLocks.get(cwd) === next) repoLocks.delete(cwd)
  }
}

export function registerGitHandlers() {
  ipcMain.handle('git:branch', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    return withRepoLock(cwd, async () => {
      const g = gitClient(cwd)
      const branch = await g.revparse(['--abbrev-ref', 'HEAD'])
      return branch.trim()
    })
  }, () => null))

  ipcMain.handle('git:branches', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    return withRepoLock(cwd, async () => {
      const g = gitClient(cwd)
      const summary = await g.branch(['-a', '--no-color'])
      return { branches: summary.all, current: summary.current }
    })
  }))

  ipcMain.handle('git:status', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    return withRepoLock(cwd, async () => {
      const g = gitClient(cwd)
      const status = await g.status()

      return [
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
    })
  }))

  ipcMain.handle('git:stage', ipcHandler(async (_event, cwd: string, files: string[]) => {
    validateCwd(cwd)
    if (files.some((f) => f.startsWith('-'))) throw new Error('Invalid file path')
    return withRepoLock(cwd, async () => {
      const g = gitClient(cwd)
      await g.add(files)
    })
  }))

  ipcMain.handle('git:unstage', ipcHandler(async (_event, cwd: string, files: string[]) => {
    validateCwd(cwd)
    if (files.some((f) => f.startsWith('-'))) throw new Error('Invalid file path')
    return withRepoLock(cwd, async () => {
      const g = gitClient(cwd)
      await g.reset(['HEAD', '--', ...files])
    })
  }))

  ipcMain.handle('git:commit', ipcHandler(async (_event, cwd: string, message: string) => {
    if (!message.trim()) throw new Error('Commit message required')
    validateCwd(cwd)
    return withRepoLock(cwd, async () => {
      const g = gitClient(cwd)
      await g.commit(message)
    })
  }))

  ipcMain.handle('git:push', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    return withRepoLock(cwd, async () => {
      const ensured = await ensureGitRepository(cwd)
      if (ensured.initialized) {
        throw new Error('[CONNECT_GITHUB] Git initialized for this project. Connect to GitHub before pushing.')
      }
      const g = gitClient(cwd)
      return g.push()
    })
  }, (err) => {
    if (isNotGitRepositoryError(err)) {
      return '[CONNECT_GITHUB] Git initialized for this project. Connect to GitHub before pushing.'
    }
    return getErrorMessage(err)
  }))

  ipcMain.handle('git:log', ipcHandler(async (_event, cwd: string, count = 20) => {
    validateCwd(cwd)
    return withRepoLock(cwd, async () => {
      const g = gitClient(cwd)
      const log = await g.log({ maxCount: count })
      return log.all.map((c) => ({
        hash: c.hash,
        short: c.hash.slice(0, 7),
        message: c.message,
        author: c.author_name,
        time: c.date,
      }))
    })
  }))

  ipcMain.handle('git:diff', ipcHandler(async (_event, cwd: string, filePath?: string) => {
    validateCwd(cwd)
    return withRepoLock(cwd, async () => {
      const g = gitClient(cwd)
      return filePath ? g.diff([filePath]) : g.diff()
    })
  }))

  ipcMain.handle('git:diff-staged', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    return withRepoLock(cwd, async () => {
      const g = gitClient(cwd)
      return g.diff(['--cached'])
    })
  }))

  ipcMain.handle('git:checkout', ipcHandler(async (_event, cwd: string, branch: string) => {
    validateCwd(cwd)
    if (branch.startsWith('-')) throw new Error('Invalid branch name')
    return withRepoLock(cwd, async () => {
      const g = gitClient(cwd)
      await g.checkout(branch)
    })
  }))

  ipcMain.handle('git:create-branch', ipcHandler(async (_event, cwd: string, branchName: string) => {
    validateCwd(cwd)
    const trimmedBranchName = branchName.trim()
    if (!trimmedBranchName) throw new Error('Branch name is required')
    if (trimmedBranchName.startsWith('-')) throw new Error('Invalid branch name')

    return withRepoLock(cwd, async () => {
      const g = gitClient(cwd)
      await g.checkoutLocalBranch(trimmedBranchName)
      return { branch: trimmedBranchName }
    })
  }))

  ipcMain.handle('git:fetch', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    return withRepoLock(cwd, async () => {
      const ensured = await ensureGitRepository(cwd)
      if (ensured.initialized) {
        throw new Error('[CONNECT_GITHUB] Git initialized for this project. Connect to GitHub before syncing.')
      }
      const g = gitClient(cwd)
      await g.fetch()
    })
  }))

  ipcMain.handle('git:pull', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    return withRepoLock(cwd, async () => {
      const ensured = await ensureGitRepository(cwd)
      if (ensured.initialized) {
        throw new Error('[CONNECT_GITHUB] Git initialized for this project. Connect to GitHub before syncing.')
      }
      const g = gitClient(cwd)
      await g.pull()
    })
  }))

  ipcMain.handle('git:create-tag', ipcHandler(async (_event, cwd: string, tagName: string) => {
    validateCwd(cwd)
    const trimmedTagName = tagName.trim()
    if (!trimmedTagName) throw new Error('Tag name is required')
    if (trimmedTagName.startsWith('-')) throw new Error('Invalid tag name')

    return withRepoLock(cwd, async () => {
      const g = gitClient(cwd)
      await g.addTag(trimmedTagName)
      return { tag: trimmedTagName }
    })
  }))

  ipcMain.handle('git:stash-save', ipcHandler(async (_event, cwd: string, message?: string) => {
    validateCwd(cwd)
    return withRepoLock(cwd, async () => {
      const g = gitClient(cwd)
      const stashMessage = message?.trim() ? message.trim() : `WIP ${new Date().toISOString()}`
      await g.stash(['push', '-u', '-m', stashMessage])
      return { message: stashMessage }
    })
  }))

  ipcMain.handle('git:stash-pop', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    return withRepoLock(cwd, async () => {
      const g = gitClient(cwd)
      await g.stash(['pop'])
    })
  }))

  ipcMain.handle('git:stash-list', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    return withRepoLock(cwd, async () => {
      const g = gitClient(cwd)
      const summary = await g.stashList()
      return summary.all.map((entry) => ({
        hash: entry.hash,
        message: entry.message,
      }))
    })
  }))
}
