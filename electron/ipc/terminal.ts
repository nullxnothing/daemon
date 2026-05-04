import { ipcMain, BrowserWindow, clipboard } from 'electron'
import * as pty from 'node-pty'
import { execFileSync } from 'node:child_process'
import { getDb } from '../db/db'
import { buildCommand, cleanupContextFile } from '../services/ClaudeRouter'
import { registerPort } from '../services/PortService'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { LogService } from '../services/LogService'
import * as SessionTracker from '../services/SessionTracker'
import { getEmbeddedProviderStartupCommand, type ProviderShellId } from '../shared/providerLaunch'
import { validateCwd } from '../shared/pathValidation'
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

function killPtySession(id: string, session: TerminalSession) {
  if (process.platform === 'win32' && session.pty.pid) {
    try {
      execFileSync('taskkill.exe', ['/pid', String(session.pty.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 5000,
      })
    } catch (err) {
      LogService.warn('Terminal', `Failed to taskkill PTY process tree ${id}`, { error: (err as Error).message })
    }

    try {
      ;(session.pty as unknown as { _close?: () => void })._close?.()
    } catch (err) {
      LogService.warn('Terminal', `Failed to mark PTY session ${id} as closed`, { error: (err as Error).message })
    }
    return
  }

  try { session.pty.kill() } catch (err) {
    LogService.warn('Terminal', `Failed to kill PTY session ${id}`, { error: (err as Error).message })
  }
}

function createPtySession(
  id: string,
  command: string,
  args: string[],
  cwd: string,
  agentId: string | null,
  contextFilePath: string | null,
  providerId: string | null = null,
  isAgentShell = false,
): TerminalSession {
  let shell: string
  let shellArgs: string[]

  if (!command) {
    // Default interactive shell
    shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
    shellArgs = args
  } else if (process.platform === 'win32' && command.endsWith('.cmd')) {
    // .cmd files must be spawned through cmd.exe on Windows
    shell = 'cmd.exe'
    shellArgs = ['/c', command, ...args]
  } else {
    shell = command
    shellArgs = args
  }

  // Strip API key for agent terminals so Claude CLI uses subscription OAuth
  const baseEnv = { ...process.env } as Record<string, string>
  if (agentId) {
    delete baseEnv.ANTHROPIC_API_KEY
    delete baseEnv.ANTHROPIC_AUTH_TOKEN
  }

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd,
    env: {
      ...baseEnv,
      TERM: 'xterm-256color',
    },
  })

  const session: TerminalSession = {
    pty: ptyProcess,
    agentId,
    contextFilePath,
    providerId,
    isAgentShell,
    dataBuffer: [],
    rendererReady: false,
    generatedLineCount: 0,
  }
  sessions.set(id, session)

  ptyProcess.onData((data) => {
    session.generatedLineCount = (session.generatedLineCount ?? 0) + (data.match(/\r\n|\r|\n/g)?.length ?? 0)

    if (session.rendererReady) {
      getWin()?.webContents.send('terminal:data', { id, data })
    } else {
      session.dataBuffer?.push(data)
      if ((session.dataBuffer?.length ?? 0) > 200) {
        session.dataBuffer = session.dataBuffer?.slice(-200)
      }
    }

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
              getWin()?.webContents.send('port:changed', { port, projectId: row.project_id, action: 'auto-registered' })
            }
          } catch (err) {
            LogService.warn('Terminal', `Failed to register auto-detected port ${port}`, { error: (err as Error).message })
          }
        }
        break
      }
    }
  })

  ptyProcess.onExit(({ exitCode }) => {
    if (contextFilePath) cleanupContextFile(contextFilePath)
    if (session.localSessionId) {
      SessionTracker.endSession({
        sessionId: session.localSessionId,
        linesGenerated: session.generatedLineCount ?? 0,
        toolsUsed: providerId ? [providerId] : agentId ? ['agent-cli'] : [],
        status: exitCode === 0 ? 'completed' : 'cancelled',
      })
    }
    sessions.delete(id)
    try { getDb().prepare('DELETE FROM active_sessions WHERE id = ?').run(id) } catch (err) {
      LogService.warn('Terminal', `Failed to clean up active_session ${id}`, { error: (err as Error).message })
    }
    getWin()?.webContents.send('terminal:exit', { id, exitCode })
  })

  return session
}

export function registerTerminalHandlers() {
  ipcMain.handle('terminal:create', ipcHandler(async (_event, opts: TerminalCreateInput) => {
    const id = crypto.randomUUID()
    const cwd = opts?.cwd
    if (!cwd) throw new Error('Terminal cwd is required')
    validateCwd(cwd)
    const session = createPtySession(id, '', [], cwd, null, null, null, opts?.isAgent ?? false)

    if (opts?.startupCommand?.trim()) {
      session.pty.write(`${opts.startupCommand.trim()}\r`)
    }

    const response: TerminalCreateOutput = { id, pid: session.pty.pid, agentId: null }
    return response
  }))

  ipcMain.handle('terminal:spawnProvider', ipcHandler(async (_event, opts: {
    providerId: ProviderShellId
    projectId?: string
    cwd?: string
  }) => {
    if (opts.providerId !== 'claude' && opts.providerId !== 'codex') {
      throw new Error('Unsupported provider')
    }

    let cwd = opts.cwd
    if (!cwd && opts.projectId) {
      const project = getDb().prepare('SELECT path FROM projects WHERE id = ?').get(opts.projectId) as { path: string } | undefined
      cwd = project?.path
    }
    if (!cwd) throw new Error('Project path is required to launch provider terminal')
    validateCwd(cwd)

    const id = crypto.randomUUID()
    const session = createPtySession(id, '', [], cwd, null, null, opts.providerId, true)
    session.pty.write(`${getEmbeddedProviderStartupCommand(opts.providerId)}\r`)

    if (opts.projectId) {
      getDb().prepare(
        'INSERT INTO active_sessions (id, project_id, agent_id, terminal_id, pid, started_at) VALUES (?,?,?,?,?,?)'
      ).run(id, opts.projectId, null, id, session.pty.pid, Date.now())
    }

    const response: TerminalCreateOutput = {
      id,
      pid: session.pty.pid,
      agentId: null,
      agentName: opts.providerId === 'claude' ? 'Claude' : 'Codex',
    }
    return response
  }))

  ipcMain.handle('terminal:spawnAgent', ipcHandler(async (_event, opts: TerminalSpawnAgentInput) => {
    const db = getDb()
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(opts.agentId) as Agent | undefined
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(opts.projectId) as Project | undefined

    if (!agent) throw new Error('Agent not found')
    if (!project) throw new Error('Project not found')

    const { command, args, contextFilePath } = buildCommand(agent, project)
    const id = crypto.randomUUID()
    const session = createPtySession(id, command, args, project.path, opts.agentId, contextFilePath)
    const localSessionId = SessionTracker.startSession({
      projectId: opts.projectId,
      agentId: opts.agentId,
      agentName: agent.name,
      model: agent.model,
      terminalId: id,
    })
    session.localSessionId = localSessionId

    if (opts.initialPrompt?.trim()) {
      session.pty.write(`${opts.initialPrompt.trim()}\r`)
    }

    db.prepare(
      'INSERT INTO active_sessions (id, project_id, agent_id, terminal_id, pid, started_at) VALUES (?,?,?,?,?,?)'
    ).run(id, opts.projectId, opts.agentId, id, session.pty.pid, Date.now())

    const response: TerminalCreateOutput = { id, pid: session.pty.pid, agentId: opts.agentId, agentName: agent.name, localSessionId }
    return response
  }))

  ipcMain.on('terminal:write', (_event, id: string, data: string) => {
    sessions.get(id)?.pty.write(data)
  })

  ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    try { sessions.get(id)?.pty.resize(cols, rows) } catch (err) {
      LogService.warn('Terminal', `Failed to resize terminal ${id}`, { error: (err as Error).message })
    }
  })

  ipcMain.on('terminal:ready', (_event, id: string) => {
    const session = sessions.get(id)
    if (!session) return
    session.rendererReady = true
    const buffered = session.dataBuffer ?? []
    session.dataBuffer = []
    for (const data of buffered) {
      getWin()?.webContents.send('terminal:data', { id, data })
    }
  })

  ipcMain.handle('terminal:kill', ipcHandler(async (_event, id: string) => {
    const session = sessions.get(id)
    if (session) {
      killPtySession(id, session)
      if (session.contextFilePath) cleanupContextFile(session.contextFilePath)
      sessions.delete(id)
      try { getDb().prepare('DELETE FROM active_sessions WHERE id = ?').run(id) } catch (err) {
        LogService.warn('Terminal', `Failed to delete active_session on kill ${id}`, { error: (err as Error).message })
      }
    }
  }))

  ipcMain.handle('terminal:paste-from-clipboard', ipcHandler(async (_event, id: string) => {
    const session = sessions.get(id)
    if (!session) throw new Error('Terminal session not found')

    const text = clipboard.readText()
    if (!text) return { pasted: false }

    session.pty.write(text)
    return { pasted: true }
  }))
}

export function killAllSessions() {
  for (const [id, session] of sessions) {
    killPtySession(id, session)
    if (session.contextFilePath) cleanupContextFile(session.contextFilePath)
    sessions.delete(id)
  }
}
