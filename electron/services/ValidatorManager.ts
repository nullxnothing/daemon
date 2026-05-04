import { execSync } from 'node:child_process'
import { BrowserWindow } from 'electron'
import * as SolanaDetector from './SolanaDetector'

interface ValidatorState {
  type: 'surfpool' | 'test-validator' | null
  status: 'stopped' | 'starting' | 'running' | 'error'
  terminalId: string | null
  port: number | null
  projectPath: string | null
  command: string | null
  studioPort: number | null
  startedAt: number | null
}

const STOPPED_VALIDATOR_STATE: ValidatorState = {
  type: null,
  status: 'stopped',
  terminalId: null,
  port: null,
  projectPath: null,
  command: null,
  studioPort: null,
  startedAt: null,
}

let state: ValidatorState = { ...STOPPED_VALIDATOR_STATE }

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

export function getValidatorCommand(type: 'surfpool' | 'test-validator', options: { reset?: boolean } = {}): { command: string; args: string[] } {
  if (type === 'surfpool') {
    return { command: 'surfpool', args: ['start', '--no-tui'] }
  }
  return { command: 'solana-test-validator', args: options.reset ? ['--reset'] : [] }
}

export function getState(): ValidatorState {
  return { ...state }
}

export function setState(newState: Partial<ValidatorState>): void {
  state = { ...state, ...newState }
  // Notify renderer of state change
  try {
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('validator:status-change', state)
    }
  } catch { /* ignore */ }
}

export function reset(): void {
  setState(STOPPED_VALIDATOR_STATE)
}
