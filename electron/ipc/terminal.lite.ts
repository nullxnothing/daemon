import { clipboard, ipcMain } from 'electron'
import { execFileSync } from 'node:child_process'
import * as pty from 'node-pty'
import { isTrustedSender } from '../security/ipcSender'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { validateCwd } from '../shared/pathValidation'
import type { TerminalCreateInput, TerminalCreateOutput } from '../shared/types'

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 30
const MAX_BUFFERED_CHUNKS = 200
const MAX_INPUT_LENGTH = 64 * 1024
const MIN_COLS = 2
const MAX_COLS = 500
const MIN_ROWS = 1
const MAX_ROWS = 300

interface LiteTerminalSession {
  pty: pty.IPty
  senderId: number
  send: (channel: string, payload: unknown) => void
  isRendererReady: boolean
  bufferedData: string[]
  pendingStartupCommand: string | null
}

const sessions = new Map<string, LiteTerminalSession>()

function ownsSession(senderId: number, session: LiteTerminalSession | undefined): session is LiteTerminalSession {
  return Boolean(session && session.senderId === senderId)
}

function getShell(): { executable: string; args: string[] } {
  if (process.platform === 'win32') return { executable: 'powershell.exe', args: ['-NoLogo'] }
  return { executable: process.env.SHELL || '/bin/bash', args: [] }
}

function killProcessTree(session: LiteTerminalSession): void {
  if (process.platform === 'win32' && session.pty.pid) {
    try {
      execFileSync('taskkill.exe', ['/pid', String(session.pty.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 5_000,
      })
    } catch {
      try { session.pty.kill() } catch { /* process already exited */ }
    }
    try { (session.pty as pty.IPty & { _close?: () => void })._close?.() } catch { /* already closed */ }
    return
  }

  try { session.pty.kill() } catch { /* process already exited */ }
}

function removeSession(id: string): LiteTerminalSession | null {
  const session = sessions.get(id)
  if (!session) return null
  sessions.delete(id)
  return session
}

function validateDimensions(cols: number, rows: number): boolean {
  return Number.isInteger(cols)
    && Number.isInteger(rows)
    && cols >= MIN_COLS
    && cols <= MAX_COLS
    && rows >= MIN_ROWS
    && rows <= MAX_ROWS
}

function createSession(
  id: string,
  event: Electron.IpcMainInvokeEvent,
  cwd: string,
  startupCommand: string | null,
): LiteTerminalSession {
  const shell = getShell()
  const terminal = pty.spawn(shell.executable, shell.args, {
    name: 'xterm-256color',
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    cwd,
    env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
  })
  const session: LiteTerminalSession = {
    pty: terminal,
    senderId: event.sender.id,
    send: (channel, payload) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, payload)
    },
    isRendererReady: false,
    bufferedData: [],
    pendingStartupCommand: startupCommand,
  }
  sessions.set(id, session)

  terminal.onData((data) => {
    if (session.isRendererReady) {
      session.send('terminal:data', { id, data })
      return
    }
    session.bufferedData.push(data)
    if (session.bufferedData.length > MAX_BUFFERED_CHUNKS) {
      session.bufferedData = session.bufferedData.slice(-MAX_BUFFERED_CHUNKS)
    }
  })

  terminal.onExit(({ exitCode }) => {
    if (sessions.get(id) !== session) return
    sessions.delete(id)
    session.send('terminal:exit', { id, exitCode })
  })

  return session
}

export function registerLiteTerminalHandlers(): void {
  ipcMain.handle('terminal:create', ipcHandler(async (event, opts: TerminalCreateInput) => {
    const cwd = opts?.cwd?.trim()
    if (!cwd) throw new Error('Terminal cwd is required')
    validateCwd(cwd)

    const startupCommand = opts?.startupCommand?.trim() || null
    if (startupCommand && startupCommand.length > MAX_INPUT_LENGTH) {
      throw new Error('Terminal startup command is too large')
    }

    const id = crypto.randomUUID()
    const session = createSession(id, event, cwd, startupCommand)
    const response: TerminalCreateOutput = { id, pid: session.pty.pid, agentId: null }
    return response
  }))

  ipcMain.on('terminal:write', (event, id: string, data: string) => {
    if (!isTrustedSender(event) || typeof data !== 'string' || data.length > MAX_INPUT_LENGTH) return
    const session = sessions.get(id)
    if (!ownsSession(event.sender.id, session)) return
    session.pty.write(data)
  })

  ipcMain.on('terminal:resize', (event, id: string, cols: number, rows: number) => {
    if (!isTrustedSender(event) || !validateDimensions(cols, rows)) return
    const session = sessions.get(id)
    if (!ownsSession(event.sender.id, session)) return
    try { session.pty.resize(cols, rows) } catch { /* process may have exited */ }
  })

  ipcMain.on('terminal:ready', (event, id: string, cols?: number, rows?: number) => {
    if (!isTrustedSender(event)) return
    const session = sessions.get(id)
    if (!ownsSession(event.sender.id, session)) return

    if (cols !== undefined && rows !== undefined && validateDimensions(cols, rows)) {
      try { session.pty.resize(cols, rows) } catch { /* process may have exited */ }
    }
    session.isRendererReady = true
    const bufferedData = session.bufferedData
    session.bufferedData = []
    for (const data of bufferedData) session.send('terminal:data', { id, data })
    if (session.pendingStartupCommand) {
      session.pty.write(`${session.pendingStartupCommand}\r`)
      session.pendingStartupCommand = null
    }
  })

  ipcMain.handle('terminal:kill', ipcHandler(async (event, id: string) => {
    const session = sessions.get(id)
    if (!ownsSession(event.sender.id, session)) throw new Error('Terminal session not found')
    removeSession(id)
    killProcessTree(session)
    return { killed: true }
  }))

  ipcMain.handle('terminal:paste-from-clipboard', ipcHandler(async (event, id: string) => {
    const session = sessions.get(id)
    if (!ownsSession(event.sender.id, session)) throw new Error('Terminal session not found')
    const text = clipboard.readText()
    if (!text) return { pasted: false }
    if (text.length > MAX_INPUT_LENGTH) throw new Error('Clipboard text is too large')
    session.pty.write(text)
    return { pasted: true }
  }))
}

export function killAllLiteTerminalSessions(): void {
  for (const [id, session] of sessions) {
    sessions.delete(id)
    killProcessTree(session)
  }
}

export function getLiteTerminalSessionCount(): number {
  return sessions.size
}
