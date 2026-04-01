import { ipcMain, BrowserWindow, clipboard } from 'electron'
import os from 'node:os'
import * as pty from 'node-pty'
import { getDb } from '../db/db'
import { buildCommand, cleanupContextFile } from '../services/ClaudeRouter'
import { registerPort } from '../services/PortService'
import { isPathSafe } from '../shared/pathValidation'
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

  const session: TerminalSession = { pty: ptyProcess, agentId, contextFilePath }
  sessions.set(id, session)

  ptyProcess.onData((data) => {
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
          } catch {}
        }
        break
      }
    }
  })

  ptyProcess.onExit(({ exitCode }) => {
    if (contextFilePath) cleanupContextFile(contextFilePath)
    sessions.delete(id)
    try { getDb().prepare('DELETE FROM active_sessions WHERE id = ?').run(id) } catch {}
    getWin()?.webContents.send('terminal:exit', { id, exitCode })
  })

  return session
}

export function registerTerminalHandlers() {
  ipcMain.handle('terminal:create', async (_event, opts: TerminalCreateInput) => {
    try {
      const id = crypto.randomUUID()
      const homeDir = os.homedir()
      const cwd = opts?.cwd || homeDir

      if (opts?.cwd && opts.cwd !== homeDir && !isPathSafe(opts.cwd)) {
        return { ok: false, error: 'Invalid directory' }
      }

      const session = createPtySession(id, '', [], cwd, null, null)

      if (opts?.startupCommand?.trim()) {
        session.pty.write(`${opts.startupCommand.trim()}\r`)
      }

      const response: TerminalCreateOutput = { id, pid: session.pty.pid, agentId: null }
      return { ok: true, data: response }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('terminal:spawnAgent', async (_event, opts: TerminalSpawnAgentInput) => {
    try {
      const db = getDb()
      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(opts.agentId) as Agent | undefined
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(opts.projectId) as Project | undefined

      if (!agent) return { ok: false, error: 'Agent not found' }
      if (!project) return { ok: false, error: 'Project not found' }

      const { command, args, contextFilePath } = buildCommand(agent, project)
      const id = crypto.randomUUID()
      const session = createPtySession(id, command, args, project.path, opts.agentId, contextFilePath)

      db.prepare(
        'INSERT INTO active_sessions (id, project_id, agent_id, terminal_id, pid, started_at) VALUES (?,?,?,?,?,?)'
      ).run(id, opts.projectId, opts.agentId, id, session.pty.pid, Date.now())

      const response: TerminalCreateOutput = { id, pid: session.pty.pid, agentId: opts.agentId, agentName: agent.name }
      return { ok: true, data: response }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.on('terminal:write', (_event, id: string, data: string) => {
    sessions.get(id)?.pty.write(data)
  })

  ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    try { sessions.get(id)?.pty.resize(cols, rows) } catch {}
  })

  ipcMain.handle('terminal:kill', async (_event, id: string) => {
    try {
      const session = sessions.get(id)
      if (session) {
        session.pty.kill()
        if (session.contextFilePath) cleanupContextFile(session.contextFilePath)
        sessions.delete(id)
        try { getDb().prepare('DELETE FROM active_sessions WHERE id = ?').run(id) } catch {}
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('terminal:paste-from-clipboard', async (_event, id: string) => {
    try {
      const session = sessions.get(id)
      if (!session) {
        return { ok: false, error: 'Terminal session not found' }
      }

      const text = clipboard.readText()
      if (!text) {
        return { ok: true, data: { pasted: false } }
      }

      session.pty.write(text)
      return { ok: true, data: { pasted: true } }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}

export function killAllSessions() {
  for (const [id, session] of sessions) {
    try { session.pty.kill() } catch {}
    if (session.contextFilePath) cleanupContextFile(session.contextFilePath)
    sessions.delete(id)
  }
}
