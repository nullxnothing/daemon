import { ipcMain } from 'electron'
import os from 'node:os'
import * as pty from 'node-pty'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as ValidatorManager from '../services/ValidatorManager'
import * as SolanaDetector from '../services/SolanaDetector'

let validatorPty: pty.IPty | null = null
let validatorTerminalId: string | null = null

export function registerValidatorHandlers() {
  ipcMain.handle('validator:start', ipcHandler(async (_event, type: 'surfpool' | 'test-validator') => {
    if (validatorPty) {
      ValidatorManager.setState({ status: 'stopping' })
      try { validatorPty.kill() } catch { /* ignore */ }
      validatorPty = null
    }

    const available = ValidatorManager.detectAvailable()
    if (type === 'surfpool' && !available.surfpool) {
      const error = 'surfpool is not installed. Install with: cargo install surfpool'
      ValidatorManager.setState({ type, status: 'error', terminalId: null, port: null, error })
      throw new Error(error)
    }
    if (type === 'test-validator' && !available.testValidator) {
      const error = 'solana-test-validator is not installed. Install Solana CLI tools first.'
      ValidatorManager.setState({ type, status: 'error', terminalId: null, port: null, error })
      throw new Error(error)
    }

    const { command, args } = ValidatorManager.getValidatorCommand(type)
    const id = crypto.randomUUID()
    const shell = process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/bash')
    const port = 8899

    ValidatorManager.setState({
      type,
      status: 'starting',
      terminalId: id,
      port,
      pid: null,
      startedAt: Date.now(),
      lastHealthCheckAt: null,
      error: null,
      outputExcerpt: null,
    })

    validatorPty = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: os.homedir(),
      env: { ...process.env } as Record<string, string>,
    })

    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command
    validatorPty.write(`${fullCommand}\r`)
    ValidatorManager.setState({ pid: validatorPty.pid ?? null })

    validatorTerminalId = id
    validatorPty.onData((data) => ValidatorManager.appendOutput(data))

    validatorPty.onExit(() => {
      const current = ValidatorManager.getState()
      if (current.status !== 'error') {
        ValidatorManager.setState({ type: null, status: 'stopped', terminalId: null, port: null })
      }
      validatorPty = null
      validatorTerminalId = null
    })

    try {
      await ValidatorManager.waitForValidatorHealth(port)
      ValidatorManager.setState({ type, status: 'running', terminalId: id, port, error: null })
      return { terminalId: id, port }
    } catch (err) {
      const error = err instanceof Error ? err.message : `${type} validator failed health probe`
      ValidatorManager.setState({ type, status: 'error', terminalId: id, port, error })
      try { validatorPty?.kill() } catch { /* ignore */ }
      throw new Error(error)
    }
  }))

  ipcMain.handle('validator:stop', ipcHandler(async () => {
    if (validatorPty) {
      ValidatorManager.setState({ status: 'stopping' })
      try { validatorPty.kill() } catch { /* ignore */ }
      validatorPty = null
      validatorTerminalId = null
    }
    ValidatorManager.reset()
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
