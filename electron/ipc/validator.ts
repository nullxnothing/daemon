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

    const { command, args } = ValidatorManager.getValidatorCommand(type)
    const id = crypto.randomUUID()
    const shell = process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/bash')

    validatorPty = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: os.homedir(),
      env: { ...process.env } as Record<string, string>,
    })

    // Write the command to start the validator
    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command
    validatorPty.write(`${fullCommand}\r`)

    validatorTerminalId = id
    ValidatorManager.setState({
      type,
      status: 'running',
      terminalId: id,
      port: 8899,
    })

    validatorPty.onExit(() => {
      ValidatorManager.setState({ type: null, status: 'stopped', terminalId: null, port: null })
      validatorPty = null
      validatorTerminalId = null
    })

    return { terminalId: id, port: 8899 }
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

  ipcMain.handle('validator:detect-project', ipcHandler(async (_event, projectPath: string) => {
    return SolanaDetector.detect(projectPath)
  }))
}
