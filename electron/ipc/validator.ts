import { ipcMain } from 'electron'
import os from 'node:os'
import * as pty from 'node-pty'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as ValidatorManager from '../services/ValidatorManager'
import * as SolanaDetector from '../services/SolanaDetector'
import { appendSolanaActivity } from '../services/SolanaActivityService'

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
      appendSolanaActivity({
        kind: 'validator-error',
        status: 'failed',
        title: 'Validator start blocked',
        detail: 'surfpool is not installed. Install with: cargo install surfpool',
        fromAddress: type,
        metadata: { validatorType: type, reason: 'missing-binary' },
      })
      throw new Error('surfpool is not installed. Install with: cargo install surfpool')
    }
    if (type === 'test-validator' && !available.testValidator) {
      appendSolanaActivity({
        kind: 'validator-error',
        status: 'failed',
        title: 'Validator start blocked',
        detail: 'solana-test-validator is not installed. Install Solana CLI tools first.',
        fromAddress: type,
        metadata: { validatorType: type, reason: 'missing-binary' },
      })
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

  ipcMain.handle('validator:toolchain-status', ipcHandler(async (_event, projectPath?: string) => {
    const toolchain = ValidatorManager.detectToolchain(projectPath)
    const warnings: Array<{ id: string; title: string; detail: string }> = []

    if (!toolchain.solanaCli.installed) {
      warnings.push({
        id: 'runtime-warning:missing-solana-cli',
        title: 'Solana CLI missing',
        detail: 'Local validator, keygen, and CLI-driven Solana flows are blocked until the Solana CLI is installed.',
      })
    }
    if (!toolchain.surfpool.installed && !toolchain.testValidator.installed) {
      warnings.push({
        id: 'runtime-warning:missing-validator',
        title: 'Local validator missing',
        detail: 'Neither Surfpool nor solana-test-validator is installed, so DAEMON cannot run a local validator flow yet.',
      })
    }
    if (!toolchain.avm.installed && toolchain.anchor.installed) {
      warnings.push({
        id: 'runtime-warning:missing-avm',
        title: 'AVM missing',
        detail: 'Anchor is installed directly, but AVM is missing so DAEMON cannot rely on pinned Anchor toolchains.',
      })
    }

    for (const warning of warnings) {
      appendSolanaActivity({
        id: warning.id,
        kind: 'runtime-warning',
        status: 'failed',
        title: warning.title,
        detail: warning.detail,
        fromAddress: 'daemon-runtime',
        metadata: { projectPath: projectPath ?? null },
      })
    }

    return toolchain
  }))

  ipcMain.handle('validator:detect-project', ipcHandler(async (_event, projectPath: string) => {
    return SolanaDetector.detect(projectPath)
  }))
}
