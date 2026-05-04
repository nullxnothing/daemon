import { ipcMain } from 'electron'
import os from 'node:os'
import * as pty from 'node-pty'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as ValidatorManager from '../services/ValidatorManager'
import * as SolanaDetector from '../services/SolanaDetector'
import { isProjectPathSafe } from '../shared/pathValidation'

let validatorPty: pty.IPty | null = null
let validatorTerminalId: string | null = null

interface ValidatorStartInput {
  type: 'surfpool' | 'test-validator'
  projectPath?: string
  reset?: boolean
}

function normalizeStartInput(input: 'surfpool' | 'test-validator' | ValidatorStartInput): ValidatorStartInput {
  return typeof input === 'string' ? { type: input } : input
}

export function registerValidatorHandlers() {
  ipcMain.handle('validator:start', ipcHandler(async (_event, input: 'surfpool' | 'test-validator' | ValidatorStartInput) => {
    const { type, projectPath, reset } = normalizeStartInput(input)
    // Stop existing validator first
    if (validatorPty) {
      try { validatorPty.kill() } catch { /* ignore */ }
      validatorPty = null
    }

    const available = ValidatorManager.detectAvailable()
    if (type === 'surfpool' && !available.surfpool) {
      throw new Error('surfpool is not installed. Install with: cargo install surfpool')
    }
    if (type === 'test-validator' && !available.testValidator) {
      throw new Error('solana-test-validator is not installed. Install Solana CLI tools first.')
    }

    const cwd = projectPath
      ? isProjectPathSafe(projectPath)
        ? projectPath
        : (() => { throw new Error('Validator project path is not registered in DAEMON.') })()
      : os.homedir()
    const { command, args } = ValidatorManager.getValidatorCommand(type, { reset })
    const id = crypto.randomUUID()
    const shell = process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/bash')
    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command

    validatorPty = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: { ...process.env } as Record<string, string>,
    })

    // Write the command to start the validator
    validatorPty.write(`${fullCommand}\r`)

    validatorTerminalId = id
    ValidatorManager.setState({
      type,
      status: 'running',
      terminalId: id,
      port: 8899,
      projectPath: projectPath ?? null,
      command: fullCommand,
      studioPort: type === 'surfpool' ? 18488 : null,
      startedAt: Date.now(),
    })

    validatorPty.onExit(() => {
      ValidatorManager.reset()
      validatorPty = null
      validatorTerminalId = null
    })

    return { terminalId: id, port: 8899, projectPath: projectPath ?? null, command: fullCommand, studioPort: type === 'surfpool' ? 18488 : null }
  }))

  ipcMain.handle('validator:stop', ipcHandler(async () => {
    if (validatorPty) {
      try { validatorPty.kill() } catch { /* ignore */ }
      validatorPty = null
      validatorTerminalId = null
      ValidatorManager.reset()
    }
    return { stopped: true }
  }))

  ipcMain.handle('validator:status', ipcHandler(async () => {
    return ValidatorManager.getState()
  }))

  ipcMain.handle('validator:detect', ipcHandler(async () => {
    return ValidatorManager.detectAvailable()
  }))

  ipcMain.handle('validator:toolchain-status', ipcHandler(async (_event, projectPath?: string) => {
    return ValidatorManager.detectToolchain(projectPath)
  }))

  ipcMain.handle('validator:detect-project', ipcHandler(async (_event, projectPath: string) => {
    return SolanaDetector.detect(projectPath)
  }))
}
