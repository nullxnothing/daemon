import { execSync } from 'node:child_process'
import { BrowserWindow } from 'electron'
import * as SolanaDetector from './SolanaDetector'
import { appendSolanaActivity } from './SolanaActivityService'

interface ValidatorState {
  type: 'surfpool' | 'test-validator' | null
  status: 'stopped' | 'starting' | 'running' | 'error'
  terminalId: string | null
  port: number | null
}

let state: ValidatorState = { type: null, status: 'stopped', terminalId: null, port: null }

/** Check if a binary is available on PATH */
function hasBinary(name: string): boolean {
  try {
    const cmd = process.platform === 'win32' ? `where ${name}` : `which ${name}`
    execSync(cmd, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function detectAvailable(): { surfpool: boolean; testValidator: boolean } {
  return {
    surfpool: hasBinary('surfpool'),
    testValidator: hasBinary('solana-test-validator'),
  }
}

function getVersion(command: string): string | null {
  try {
    const output = execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return output.split(/\r?\n/)[0] || null
  } catch {
    return null
  }
}

export interface SolanaToolchainStatus {
  solanaCli: { installed: boolean; version: string | null }
  anchor: { installed: boolean; version: string | null }
  avm: { installed: boolean; version: string | null }
  surfpool: { installed: boolean; version: string | null }
  testValidator: { installed: boolean; version: string | null }
  litesvm: { installed: boolean; source: 'project' | 'none' }
}

export function detectToolchain(projectPath?: string): SolanaToolchainStatus {
  const litesvm = projectPath ? SolanaDetector.detectProjectToolchain(projectPath).litesvm : false

  return {
    solanaCli: {
      installed: hasBinary('solana'),
      version: getVersion('solana --version'),
    },
    anchor: {
      installed: hasBinary('anchor'),
      version: getVersion('anchor --version'),
    },
    avm: {
      installed: hasBinary('avm'),
      version: getVersion('avm --version'),
    },
    surfpool: {
      installed: hasBinary('surfpool'),
      version: getVersion('surfpool --version'),
    },
    testValidator: {
      installed: hasBinary('solana-test-validator'),
      version: getVersion('solana-test-validator --version'),
    },
    litesvm: {
      installed: litesvm,
      source: litesvm ? 'project' : 'none',
    },
  }
}

export function getValidatorCommand(type: 'surfpool' | 'test-validator'): { command: string; args: string[] } {
  if (type === 'surfpool') {
    return { command: 'surfpool', args: [] }
  }
  return { command: 'solana-test-validator', args: [] }
}

export function getState(): ValidatorState {
  return { ...state }
}

export function setState(newState: Partial<ValidatorState>): void {
  const previous = state
  state = { ...state, ...newState }

  if (previous.status !== state.status || previous.type !== state.type || previous.port !== state.port) {
    if (state.status === 'running' && state.type) {
      appendSolanaActivity({
        kind: 'validator-start',
        status: 'confirmed',
        title: 'Validator started',
        detail: `${state.type} is running${state.port ? ` on localhost:${state.port}` : '.'}`,
        fromAddress: state.type,
        metadata: { validatorType: state.type, port: state.port },
      })
    } else if (previous.status === 'running' && state.status === 'stopped') {
      appendSolanaActivity({
        kind: 'validator-stop',
        status: 'confirmed',
        title: 'Validator stopped',
        detail: `${previous.type ?? 'validator'} stopped.`,
        fromAddress: previous.type ?? 'validator',
        metadata: { validatorType: previous.type, port: previous.port },
      })
    } else if (state.status === 'error') {
      appendSolanaActivity({
        kind: 'validator-error',
        status: 'failed',
        title: 'Validator error',
        detail: `${state.type ?? 'validator'} entered an error state.`,
        fromAddress: state.type ?? 'validator',
        metadata: { validatorType: state.type, port: state.port },
      })
    }
  }
  // Notify renderer of state change
  try {
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('validator:status-change', state)
    }
  } catch { /* ignore */ }
}

export function reset(): void {
  state = { type: null, status: 'stopped', terminalId: null, port: null }
}
