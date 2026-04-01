import { ipcMain } from 'electron'
import simpleGit from 'simple-git'
import { validateCwd } from '../shared/pathValidation'
import { ipcHandler } from '../services/IpcHandlerFactory'

function getErrorMessage(err: unknown): string {
  return (err as Error).message ?? String(err)
}

function isNotGitRepositoryError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase()
  return msg.includes('not a git repository')
}

async function ensureGitRepository(cwd: string): Promise<{ initialized: boolean }> {
  const git = simpleGit(cwd)
  try {
    await git.revparse(['--is-inside-work-tree'])
    return { initialized: false }
  } catch (err) {
    if (!isNotGitRepositoryError(err)) throw err
    await git.init()
    return { initialized: true }
  }
}

export function registerGitHandlers() {
  ipcMain.handle('git:branch', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    const git = simpleGit(cwd)
    const branch = await git.revparse(['--abbrev-ref', 'HEAD'])
    return branch.trim()
  }, () => null))

  ipcMain.handle('git:branches', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    const git = simpleGit(cwd)
    const summary = await git.branch(['-a', '--no-color'])
    return { branches: summary.all, current: summary.current }
  }))

  ipcMain.handle('git:status', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    const ensured = await ensureGitRepository(cwd)
    const git = simpleGit(cwd)
    const status = await git.status()
    
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
  }))

  ipcMain.handle('git:stage', ipcHandler(async (_event, cwd: string, files: string[]) => {
    validateCwd(cwd)
    const git = simpleGit(cwd)
    await git.add(files)
  }))

  ipcMain.handle('git:unstage', ipcHandler(async (_event, cwd: string, files: string[]) => {
    validateCwd(cwd)
    const git = simpleGit(cwd)
    await git.reset(['HEAD', '--', ...files])
  }))

  ipcMain.handle('git:commit', ipcHandler(async (_event, cwd: string, message: string) => {
    if (!message.trim()) throw new Error('Commit message required')
    validateCwd(cwd)
    const git = simpleGit(cwd)
    await git.commit(message)
  }))

  ipcMain.handle('git:push', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    const ensured = await ensureGitRepository(cwd)
    if (ensured.initialized) {
      throw new Error('[CONNECT_GITHUB] Git initialized for this project. Connect to GitHub before pushing.')
    }
    const git = simpleGit(cwd)
    return git.push()
  }, (err) => {
    if (isNotGitRepositoryError(err)) {
      return '[CONNECT_GITHUB] Git initialized for this project. Connect to GitHub before pushing.'
    }
    return getErrorMessage(err)
  }))

  ipcMain.handle('git:log', ipcHandler(async (_event, cwd: string, count = 20) => {
    validateCwd(cwd)
    const git = simpleGit(cwd)
    const log = await git.log({ maxCount: count })
    return log.all.map((c) => ({
      hash: c.hash,
      short: c.hash.slice(0, 7),
      message: c.message,
      author: c.author_name,
      time: c.date,
    }))
  }))

  ipcMain.handle('git:diff', ipcHandler(async (_event, cwd: string, filePath?: string) => {
    validateCwd(cwd)
    const git = simpleGit(cwd)
    return filePath ? git.diff([filePath]) : git.diff()
  }))

  ipcMain.handle('git:diff-staged', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    const git = simpleGit(cwd)
    return git.diff(['--cached'])
  }))

  ipcMain.handle('git:checkout', ipcHandler(async (_event, cwd: string, branch: string) => {
    validateCwd(cwd)
    const git = simpleGit(cwd)
    await git.checkout(branch)
  }))

  ipcMain.handle('git:create-branch', ipcHandler(async (_event, cwd: string, branchName: string) => {
    validateCwd(cwd)
    const trimmedBranchName = branchName.trim()
    if (!trimmedBranchName) throw new Error('Branch name is required')
    
    const git = simpleGit(cwd)
    await git.checkoutLocalBranch(trimmedBranchName)
    return { branch: trimmedBranchName }
  }))

  ipcMain.handle('git:fetch', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    const ensured = await ensureGitRepository(cwd)
    if (ensured.initialized) {
      throw new Error('[CONNECT_GITHUB] Git initialized for this project. Connect to GitHub before syncing.')
    }
    const git = simpleGit(cwd)
    await git.fetch()
  }))

  ipcMain.handle('git:pull', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    const ensured = await ensureGitRepository(cwd)
    if (ensured.initialized) {
      throw new Error('[CONNECT_GITHUB] Git initialized for this project. Connect to GitHub before syncing.')
    }
    const git = simpleGit(cwd)
    await git.pull()
  }))

  ipcMain.handle('git:create-tag', ipcHandler(async (_event, cwd: string, tagName: string) => {
    validateCwd(cwd)
    const trimmedTagName = tagName.trim()
    if (!trimmedTagName) throw new Error('Tag name is required')
    
    const git = simpleGit(cwd)
    await git.addTag(trimmedTagName)
    return { tag: trimmedTagName }
  }))

  ipcMain.handle('git:stash-save', ipcHandler(async (_event, cwd: string, message?: string) => {
    validateCwd(cwd)
    const git = simpleGit(cwd)
    const stashMessage = message?.trim() ? message.trim() : `WIP ${new Date().toISOString()}`
    await git.stash(['push', '-u', '-m', stashMessage])
    return { message: stashMessage }
  }))

  ipcMain.handle('git:stash-pop', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    const git = simpleGit(cwd)
    await git.stash(['pop'])
  }))

  ipcMain.handle('git:stash-list', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    const git = simpleGit(cwd)
    const summary = await git.stashList()
    return summary.all.map((entry) => ({
      hash: entry.hash,
      message: entry.message,
    }))
  }))
}
