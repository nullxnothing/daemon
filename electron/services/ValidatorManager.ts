import { execSync } from 'node:child_process'
import { BrowserWindow } from 'electron'

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
  state = { type: null, status: 'stopped', terminalId: null, port: null }
}
