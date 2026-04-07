import { ipcMain, BrowserWindow, clipboard } from 'electron'
import os from 'node:os'
import fs from 'node:fs'
import * as pty from 'node-pty'
import { getDb } from '../db/db'
import { cleanupContextFile, getClaudePath } from '../services/ClaudeRouter'
import { ProviderRegistry } from '../services/providers'
import type { ProviderInterface } from '../services/providers'
import { registerPort } from '../services/PortService'
import { isPathSafe } from '../shared/pathValidation'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as SessionTracker from '../services/SessionTracker'
import type { Agent, Project, ActiveSession, TerminalSession, TerminalCreateInput, TerminalSpawnAgentInput, TerminalCreateOutput } from '../shared/types'

// Regex patterns to auto-detect "listening on port X" from terminal output
const PORT_PATTERNS = [
  /listening\s+on\s+(?:port\s+)?:?(\d{3,5})/i,           // "listening on port 3000"
  /server\s+(?:is\s+)?running\s+(?:on|at)\s+.*:(\d{3,5})/i, // "server running on http://localhost:3000"
  /started\s+(?:on|at)\s+.*:(\d{3,5})/i,                  // "started on port 3000"
  /localhost:(\d{3,5})/i,                                   // "http://localhost:3000"
  /127\.0\.0\.1:(\d{3,5})/i,                               // "http://127.0.0.1:3000"
  /0\.0\.0\.0:(\d{3,5})/i,                                 // "0.0.0.0:3000"
]

const sessions = new Map<string, TerminalSession>()

export function getSession(id: string) {
  return sessions.get(id)
}

export function getAllSessionIds(): string[] {
  return Array.from(sessions.keys())
}

function getWin() {
  return BrowserWindow.getAllWindows()[0]
}

function createPtySession(
  id: string,
  command: string,
  args: string[],
  cwd: string,
  agentId: string | null,
  contextFilePath: string | null,
  provider?: ProviderInterface | null,
  initialCols?: number,
  initialRows?: number,
): TerminalSession {
  let shell: string
  let shellArgs: string[]

  if (!command) {
    // Default interactive shell
    shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
    shellArgs = process.platform === 'win32' ? ['-NoLogo', ...args] : args
  } else if (process.platform === 'win32' && command.endsWith('.cmd')) {
    // .cmd files must be spawned through cmd.exe on Windows
    shell = 'cmd.exe'
    shellArgs = ['/c', command, ...args]
  } else {
    shell = command
    shellArgs = args
  }

  // Strip ALL provider API keys from agent terminal environment (defense-in-depth)
  const baseEnv = { ...process.env } as Record<string, string>
  if (agentId) {
    for (const p of ProviderRegistry.getAll()) {
      for (const key of p.getStrippedEnvKeys()) {
        delete baseEnv[key]
      }
    }
  }

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: initialCols && initialCols > 0 ? initialCols : 80,
    rows: initialRows && initialRows > 0 ? initialRows : 24,
    cwd,
    env: {
      ...baseEnv,
      TERM: 'xterm-256color',
    },
  })

  const session: TerminalSession = { pty: ptyProcess, agentId, contextFilePath, providerId: provider?.id ?? null, isAgentShell: false, dataBuffer: [], rendererReady: false }
  sessions.set(id, session)

  ptyProcess.onData((data) => {
    // Buffer data until the renderer signals it has attached the xterm listener
    if (!session.rendererReady) {
      session.dataBuffer!.push(data)
      return
    }
    getWin()?.webContents.send('terminal:data', { id, data })

    // Auto-detect port announcements and register them
    for (const pattern of PORT_PATTERNS) {
      const match = data.match(pattern)
      if (match) {
        const port = parseInt(match[1], 10)
        if (port >= 1024 && port <= 65535) {
          try {
            // Look up project from active_sessions
            const row = getDb().prepare('SELECT project_id FROM active_sessions WHERE id = ?').get(id) as ActiveSession | undefined
            if (row?.project_id) {
              registerPort(port, row.project_id, 'auto-detected')
              getWin()?.webContents.send('ports:auto-registered', { port, projectId: row.project_id })
            }
          } catch (err) {
            console.warn('[Terminal] port auto-registration failed:', (err as Error).message)
          }
        }
        break
      }
    }
  })

  ptyProcess.onExit(({ exitCode }) => {
    if (contextFilePath) cleanupContextFile(contextFilePath)
    const exiting = sessions.get(id)
    if (exiting?.localSessionId) {
      SessionTracker.endSession({
        sessionId: exiting.localSessionId,
        status: exitCode === 0 ? 'completed' : 'failed',
      })
    }
    sessions.delete(id)
    try { getDb().prepare('DELETE FROM active_sessions WHERE id = ?').run(id) } catch (err) {
      console.warn('[Terminal] failed to delete session on exit:', (err as Error).message)
    }
    getWin()?.webContents.send('terminal:exit', { id, exitCode })
  })

  return session
}

export function registerTerminalHandlers() {
  ipcMain.handle('terminal:create', ipcHandler(async (_event, opts: TerminalCreateInput) => {
    const id = crypto.randomUUID()
    const homeDir = os.homedir()
    const cwd = opts?.cwd || homeDir

    if (opts?.cwd && opts.cwd !== homeDir) {
      if (opts.userInitiated) {
        // User explicitly dropped a folder — validate it exists and is a directory
        try {
          const stat = fs.statSync(opts.cwd)
          if (!stat.isDirectory()) {
            throw new Error('Dropped path is not a directory')
          }
        } catch (e) {
          if ((e as Error).message === 'Dropped path is not a directory') throw e
          throw new Error('Dropped path does not exist')
        }
      } else if (!isPathSafe(opts.cwd)) {
        throw new Error('Invalid directory')
      }
    }

    const session = createPtySession(id, '', [], cwd, null, null, null, opts?.cols, opts?.rows)
    if (opts?.isAgent) {
      session.isAgentShell = true
    }

    if (opts?.startupCommand?.trim()) {
      const cmd = opts.startupCommand.trim()
      if (!/^[a-zA-Z0-9 _\-\.\/\\:=@]+$/.test(cmd)) {
        throw new Error('Startup command contains disallowed characters')
      }
      session.pty.write(`${cmd}\r`)
    }

    const response: TerminalCreateOutput = { id, pid: session.pty.pid, agentId: null }
    return response
  }))

  ipcMain.handle('terminal:spawnAgent', ipcHandler(async (_event, opts: TerminalSpawnAgentInput) => {
    const db = getDb()
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(opts.agentId) as Agent | undefined
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(opts.projectId) as Project | undefined

    if (!agent) throw new Error('Agent not found')
    if (!project) throw new Error('Project not found')

    const provider = await ProviderRegistry.resolveForAgent(agent)
    const { command, args, contextFilePath } = await provider.buildCommand(agent, project)
    const id = crypto.randomUUID()
    const session = createPtySession(id, command, args, project.path, opts.agentId, contextFilePath, provider)

    // Start a local session record — fire and forget, never blocks spawn
    const localSessionId = SessionTracker.startSession({
      projectId: opts.projectId,
      agentId: opts.agentId,
      agentName: agent.name,
      model: agent.model,
      terminalId: id,
    })
    session.localSessionId = localSessionId

    db.prepare(
      'INSERT INTO active_sessions (id, project_id, agent_id, terminal_id, pid, started_at) VALUES (?,?,?,?,?,?)'
    ).run(id, opts.projectId, opts.agentId, id, session.pty.pid, Date.now())

    // If an initial prompt was provided, write it to the pty after a brief delay
    // so the Claude CLI has time to initialize.
    // Strip control characters to prevent injection via pty input.
    if (opts.initialPrompt?.trim()) {
      const prompt = opts.initialPrompt.trim().replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
      setTimeout(() => {
        try { session.pty.write(`${prompt}\r`) } catch { /* pty may have exited */ }
      }, 3000)
    }

    const response: TerminalCreateOutput = { id, pid: session.pty.pid, agentId: opts.agentId, agentName: agent.name }
    return response
  }))

  ipcMain.handle('terminal:spawnProvider', ipcHandler(async (_event, opts: { providerId: 'claude' | 'codex'; projectId?: string; cwd?: string }) => {
    if (opts.providerId !== 'claude' && opts.providerId !== 'codex') {
      throw new Error(`PROVIDER_UNKNOWN: Unknown provider '${opts.providerId}'`)
    }
    const provider = ProviderRegistry.get(opts.providerId)
    const conn = await provider.verifyConnection()
    if (!conn.isAuthenticated && conn.authMode === 'none') {
      throw new Error(`NOT_AUTHENTICATED: Sign in to ${opts.providerId} first.`)
    }
    const cliPath = provider.resolvePath()
    const isAbsolute = cliPath.includes('/') || cliPath.includes('\\')
    if (isAbsolute && !fs.existsSync(cliPath)) {
      throw new Error(`CLI_NOT_INSTALLED: ${opts.providerId} CLI not found at ${cliPath}`)
    }

    const id = crypto.randomUUID()
    const cwd = opts.cwd || os.homedir()
    const session = createPtySession(id, cliPath, [], cwd, null, null, provider)
    session.isAgentShell = true

    const response: TerminalCreateOutput = { id, pid: session.pty.pid, agentId: null }
    return response
  }))

  // Renderer signals that xterm onData listener is attached — flush buffered data
  ipcMain.on('terminal:ready', (_event, id: string) => {
    const session = sessions.get(id)
    if (!session) return
    session.rendererReady = true
    const win = getWin()
    if (win && session.dataBuffer) {
      for (const chunk of session.dataBuffer) {
        win.webContents.send('terminal:data', { id, data: chunk })
      }
    }
    session.dataBuffer = undefined
  })

  ipcMain.on('terminal:write', (_event, id: string, data: string) => {
    const session = sessions.get(id)
    if (!session) return
    if (typeof data !== 'string' || data.length >= 65536) return
    session.pty.write(data)
  })

  ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    try { sessions.get(id)?.pty.resize(cols, rows) } catch (err) {
      console.warn('[Terminal] resize failed:', (err as Error).message)
    }
  })

  ipcMain.handle('terminal:check-claude', ipcHandler(async () => {
    const claudePath = getClaudePath()
    const isAbsolute = claudePath.includes('/') || claudePath.includes('\\')
    const installed = isAbsolute ? fs.existsSync(claudePath) : true
    return { installed, claudePath }
  }))

  ipcMain.handle('terminal:check-codex', ipcHandler(async () => {
    try {
      const codexProvider = ProviderRegistry.get('codex')
      const codexPath = codexProvider.resolvePath()
      const isAbsolute = codexPath.includes('/') || codexPath.includes('\\')
      const installed = isAbsolute ? fs.existsSync(codexPath) : true
      return { installed, codexPath }
    } catch {
      return { installed: false, codexPath: null }
    }
  }))

  ipcMain.handle('terminal:kill', ipcHandler(async (_event, id: string) => {
    const session = sessions.get(id)
    if (session) {
      if (session.localSessionId) {
        SessionTracker.endSession({ sessionId: session.localSessionId, status: 'cancelled' })
      }
      session.pty.kill()
      if (session.contextFilePath) cleanupContextFile(session.contextFilePath)
      sessions.delete(id)
      try { getDb().prepare('DELETE FROM active_sessions WHERE id = ?').run(id) } catch (err) {
        console.warn('[Terminal] failed to delete session on kill:', (err as Error).message)
      }
    }
  }))

  ipcMain.handle('terminal:paste-from-clipboard', ipcHandler(async (_event, id: string) => {
    const session = sessions.get(id)
    if (!session) throw new Error('Terminal session not found')

    const PASTE_MAX_BYTES = 1024 * 1024
    let text = clipboard.readText()
    if (!text) return { pasted: false }
    if (text.length > PASTE_MAX_BYTES) text = text.slice(0, PASTE_MAX_BYTES)
    // Strip dangerous control characters (keep tab, newline, carriage return)
    text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')

    session.pty.write(text)
    return { pasted: true }
  }))
}

export function killAllSessions() {
  for (const [id, session] of sessions) {
    try { session.pty.kill() } catch (err) {
      console.warn('[Terminal] failed to kill session:', (err as Error).message)
    }
    if (session.contextFilePath) cleanupContextFile(session.contextFilePath)
    sessions.delete(id)
  }
}
