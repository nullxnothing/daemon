import { ipcMain } from 'electron'
import path from 'node:path'
import simpleGit from 'simple-git'
import { isPathSafe, isPathWithinBase } from '../shared/pathValidation'
import { ipcHandler } from '../services/IpcHandlerFactory'

function validateCwd(cwd: string): void {
  if (!cwd || !isPathSafe(cwd)) throw new Error('Path not within a registered project')
}

function validateRepoFilePath(cwd: string, filePath: string): void {
  if (!filePath || path.isAbsolute(filePath)) throw new Error('Invalid repository file path')
  if (!isPathWithinBase(path.resolve(cwd, filePath), cwd)) throw new Error('Path not within repository')
}

/** DAEMON-managed worktree root for a project, a sibling dir outside the repo. */
export function swarmRootFor(cwd: string): string {
  return path.resolve(cwd, '..', '.daemon-worktrees')
}

/** A worktree path is only allowed inside the managed root for its project. */
function validateWorktreePath(cwd: string, worktreePath: string): void {
  if (!isPathWithinBase(worktreePath, swarmRootFor(cwd))) {
    throw new Error('Worktree path escapes the managed swarm root')
  }
}

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
        deleted: false,
        status: 'staged',
      })),
      ...status.modified.filter((f) => !status.staged.includes(f)).map((f) => ({
        path: f,
        staged: false,
        unstaged: true,
        untracked: false,
        deleted: false,
        status: 'modified',
      })),
      ...status.deleted.filter((f) => !status.staged.includes(f)).map((f) => ({
        path: f,
        staged: false,
        unstaged: true,
        untracked: false,
        deleted: true,
        status: 'deleted',
      })),
      ...status.not_added.map((f) => ({
        path: f,
        staged: false,
        unstaged: false,
        untracked: true,
        deleted: false,
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
    if (filePath) validateRepoFilePath(cwd, filePath)
    const git = simpleGit(cwd)
    return filePath ? git.diff(['--', filePath]) : git.diff()
  }))

  ipcMain.handle('git:diff-staged', ipcHandler(async (_event, cwd: string, filePath?: string) => {
    validateCwd(cwd)
    if (filePath) validateRepoFilePath(cwd, filePath)
    const git = simpleGit(cwd)
    return filePath ? git.diff(['--cached', '--', filePath]) : git.diff(['--cached'])
  }))

  ipcMain.handle('git:discard', ipcHandler(async (_event, cwd: string, filePath: string) => {
    validateCwd(cwd)
    validateRepoFilePath(cwd, filePath)
    const git = simpleGit(cwd)
    const status = await git.status()
    const normalized = filePath.replace(/\\/g, '/')
    const isUntracked = status.not_added.includes(normalized)
    if (isUntracked) {
      await git.raw(['clean', '-fd', '--', filePath])
      return
    }
    await git.raw(['restore', '--worktree', '--', filePath])
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

  // --- worktrees (parallel agent swarms) ---

  ipcMain.handle('git:worktree-add', ipcHandler(async (_event, cwd: string, worktreePath: string, branch: string, base?: string) => {
    validateCwd(cwd)
    validateWorktreePath(cwd, worktreePath)
    if (!branch.trim()) throw new Error('Branch name is required')
    const git = simpleGit(cwd)
    const args = ['worktree', 'add', '-b', branch.trim(), worktreePath]
    if (base?.trim()) args.push(base.trim())
    await git.raw(args)
    return { worktreePath, branch: branch.trim() }
  }))

  ipcMain.handle('git:worktree-list', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    const git = simpleGit(cwd)
    const out = await git.raw(['worktree', 'list', '--porcelain'])
    return parseWorktreeList(out)
  }))

  ipcMain.handle('git:worktree-remove', ipcHandler(async (_event, cwd: string, worktreePath: string) => {
    validateCwd(cwd)
    validateWorktreePath(cwd, worktreePath)
    const git = simpleGit(cwd)
    await git.raw(['worktree', 'remove', worktreePath, '--force'])
  }))

  ipcMain.handle('git:worktree-prune', ipcHandler(async (_event, cwd: string) => {
    validateCwd(cwd)
    const git = simpleGit(cwd)
    await git.raw(['worktree', 'prune'])
  }))
}

/** Parse `git worktree list --porcelain` into {path, branch, head} records. */
function parseWorktreeList(porcelain: string): Array<{ path: string; branch: string | null; head: string | null }> {
  const entries: Array<{ path: string; branch: string | null; head: string | null }> = []
  let current: { path: string; branch: string | null; head: string | null } | null = null
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current)
      current = { path: line.slice('worktree '.length).trim(), branch: null, head: null }
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.slice('branch '.length).replace('refs/heads/', '').trim()
    } else if (line.startsWith('HEAD ') && current) {
      current.head = line.slice('HEAD '.length).trim()
    }
  }
  if (current) entries.push(current)
  return entries
}
