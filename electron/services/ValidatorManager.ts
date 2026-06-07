import { execSync } from 'node:child_process'
import { BrowserWindow } from 'electron'
import * as SolanaDetector from './SolanaDetector'

export interface ValidatorState {
  type: 'surfpool' | 'test-validator' | null
  status: 'stopped' | 'starting' | 'running' | 'error' | 'stopping'
  terminalId: string | null
  port: number | null
  pid?: number | null
  startedAt?: number | null
  lastHealthCheckAt?: number | null
  error?: string | null
  outputExcerpt?: string | null
}

interface ValidatorHealthOptions {
  timeoutMs?: number
  intervalMs?: number
  fetchImpl?: typeof fetch
}

const VALIDATOR_DEFAULT_PORT = 8899
const VALIDATOR_HEALTH_TIMEOUT_MS = 15_000
const VALIDATOR_HEALTH_INTERVAL_MS = 400
const OUTPUT_EXCERPT_LIMIT = 2000

let state: ValidatorState = { type: null, status: 'stopped', terminalId: null, port: null, error: null, outputExcerpt: null }

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
  state = { type: null, status: 'stopped', terminalId: null, port: null, pid: null, startedAt: null, lastHealthCheckAt: null, error: null, outputExcerpt: null }
}

export function appendOutput(chunk: string): void {
  const output = `${state.outputExcerpt ?? ''}${chunk}`.replace(/\u001b\[[0-9;]*m/g, '')
  state = { ...state, outputExcerpt: output.slice(-OUTPUT_EXCERPT_LIMIT) }
}

export async function waitForValidatorHealth(port = VALIDATOR_DEFAULT_PORT, options: ValidatorHealthOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? VALIDATOR_HEALTH_TIMEOUT_MS
  const intervalMs = options.intervalMs ?? VALIDATOR_HEALTH_INTERVAL_MS
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  if (!fetchImpl) {
    throw new Error('Validator health probe requires fetch support')
  }

  const deadline = Date.now() + timeoutMs
  let lastError = 'Validator RPC did not become healthy'

  while (Date.now() <= deadline) {
    try {
      const res = await fetchImpl(`http://127.0.0.1:${port}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'daemon-validator-health', method: 'getHealth' }),
      })
      const body = await readJson(res)
      if (res.ok && body && typeof body === 'object' && 'result' in body && body.result === 'ok') {
        setState({ lastHealthCheckAt: Date.now(), error: null })
        return
      }
      lastError = getHealthFailure(body) ?? `Validator RPC returned HTTP ${res.status}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Validator RPC health probe failed'
    }

    await delay(intervalMs)
  }

  throw new Error(lastError)
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const body = await res.json()
    return body && typeof body === 'object' ? body as Record<string, unknown> : null
  } catch {
    return null
  }
}

function getHealthFailure(body: Record<string, unknown> | null): string | null {
  const error = body?.error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' ? message : null
  }
  return null
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}
