import { execFile as execFileCb } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { buildUntrustedContext, redactText } from '../security/PrivacyGuard'
import { isPathSafe, isPathWithinBase } from '../shared/pathValidation'
import type { DaemonAiChatRequest } from '../shared/types'

const execFile = promisify(execFileCb)
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'build', 'target', 'test-results'])
const MAX_CONTEXT_CHARS = 80_000

export interface AiContextBundle {
  sections: string[]
  usedContext: string[]
}

function listProjectTree(projectPath: string, depth = 2): string {
  const lines: string[] = []

  function walk(dir: string, currentDepth: number) {
    if (currentDepth > depth || lines.length >= 180) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (lines.length >= 180) return
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
      const absolutePath = path.join(dir, entry.name)
      const relativePath = path.relative(projectPath, absolutePath)
      lines.push(`${'  '.repeat(currentDepth)}${entry.isDirectory() ? '/' : ''}${relativePath}`)
      if (entry.isDirectory()) walk(absolutePath, currentDepth + 1)
    }
  }

  walk(projectPath, 0)
  return lines.join('\n')
}

async function getGitDiff(projectPath: string): Promise<string> {
  try {
    const { stdout } = await execFile('git', ['diff', '--', '.'], {
      cwd: projectPath,
      timeout: 5_000,
      encoding: 'utf8',
      maxBuffer: 512_000,
    })
    return stdout.split('\n').slice(0, 400).join('\n')
  } catch {
    return ''
  }
}

export async function collectAiContext(input: DaemonAiChatRequest): Promise<AiContextBundle> {
  const context = input.context ?? {}
  const sections: string[] = []
  const usedContext: string[] = []
  const projectPath = input.projectPath ? path.resolve(input.projectPath) : null
  let remainingContextChars = MAX_CONTEXT_CHARS

  function pushSection(section: string): boolean {
    if (remainingContextChars <= 0) return false
    const clipped = section.slice(0, remainingContextChars)
    sections.push(clipped)
    remainingContextChars -= clipped.length
    return clipped.length === section.length
  }

  if (projectPath && isPathSafe(projectPath)) {
    pushSection(`<project path="${projectPath}">\nProject path: ${projectPath}\n</project>`)
    usedContext.push('project:path')
  }

  if (context.projectTree !== false && projectPath && isPathSafe(projectPath)) {
    const tree = listProjectTree(projectPath)
    if (tree) {
      pushSection(buildUntrustedContext('project_code', `Project tree:\n${tree}`))
      usedContext.push('project:tree')
    }
  }

  if (context.activeFile !== false && input.activeFilePath) {
    const activeFilePath = path.resolve(input.activeFilePath)
    const withinProject = projectPath ? isPathWithinBase(activeFilePath, projectPath) : isPathSafe(activeFilePath)
    if (withinProject) {
      const rawContent = input.activeFileContent ?? (fs.existsSync(activeFilePath) ? fs.readFileSync(activeFilePath, 'utf8') : '')
      const content = redactText(rawContent).value
      pushSection(buildUntrustedContext('project_code', `Active file: ${activeFilePath}\n\n${content.slice(0, 30_000)}`))
      usedContext.push(`file:${path.basename(activeFilePath)}`)
    }
  }

  if (context.gitDiff && projectPath && isPathSafe(projectPath)) {
    const diff = await getGitDiff(projectPath)
    if (diff) {
      pushSection(buildUntrustedContext('project_code', `Git diff:\n${redactText(diff).value}`))
      usedContext.push('git:diff')
    }
  }

  if (context.terminalLogs) {
    pushSection('Terminal logs were requested, but v4 MVP does not collect terminal output automatically. Paste the relevant log into the chat instead.')
    usedContext.push('terminal:manual-required')
  }

  if (context.walletContext) {
    pushSection('Wallet context was requested, but v4 MVP only allows explicit public wallet data in follow-up Solana workflows.')
    usedContext.push('wallet:blocked-by-default')
  }

  return { sections, usedContext }
}
