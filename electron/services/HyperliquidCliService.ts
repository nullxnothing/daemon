/**
 * HyperliquidCliService — thin, safe wrapper around the `hyperliquid` agent CLI
 * (HypurrClaw, github.com/hypurrclaw/hyperliquid-cli).
 *
 * The CLI is an agent-first binary: every command speaks JSON (`--format json`),
 * supports `--dry-run`, and uses stable exit codes. We never build a shell string
 * — every call is `execFile(binary, argv[])` with a fixed argument vector, the
 * sanctioned pattern from CheckRunnerService. The CLI owns its own encrypted OWS
 * wallet vault and network selection; DAEMON holds no Hyperliquid private key.
 *
 * Binary discovery mirrors ClaudeProvider.resolvePath(): probe well-known install
 * locations, then fall back to bare `hyperliquid` on PATH.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as SettingsService from './SettingsService'

const execFileAsync = promisify(execFile)

const RUN_TIMEOUT_MS = 30_000
const VERSION_TIMEOUT_MS = 5_000
const MAX_BUFFER = 8 * 1024 * 1024

// --- Binary discovery -------------------------------------------------------

let cachedPath: string | null = null
let cachedAvailable: boolean | null = null

/** Locate the `hyperliquid` binary; cache the first hit. Falls back to PATH. */
export function resolvePath(): string {
  if (cachedPath) return cachedPath

  const home = os.homedir()
  const isWin = process.platform === 'win32'
  const exe = isWin ? 'hyperliquid.exe' : 'hyperliquid'

  const candidates: string[] = isWin
    ? [
        path.join(home, '.local', 'bin', 'hyperliquid.exe'),
        path.join(home, '.local', 'bin', 'hyperliquid'),
        path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'hyperliquid.exe'),
      ]
    : [
        path.join(home, '.local', 'bin', 'hyperliquid'),
        '/usr/local/bin/hyperliquid',
        '/opt/homebrew/bin/hyperliquid',
      ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      cachedPath = candidate
      return candidate
    }
  }

  // Bare name → resolved against PATH by execFile. shell:false keeps it literal.
  cachedPath = isWin ? exe : 'hyperliquid'
  return cachedPath
}

/** True when the CLI is installed and responds to `--version`. Cached. */
export async function isAvailable(): Promise<boolean> {
  if (cachedAvailable !== null) return cachedAvailable
  try {
    await execFileAsync(resolvePath(), ['--version'], {
      timeout: VERSION_TIMEOUT_MS,
      windowsHide: true,
      shell: false,
    })
    cachedAvailable = true
  } catch {
    cachedAvailable = false
  }
  return cachedAvailable
}

/** Returns the CLI version string, or null when unavailable. */
export async function version(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(resolvePath(), ['--version'], {
      timeout: VERSION_TIMEOUT_MS,
      windowsHide: true,
      shell: false,
    })
    return stdout.trim() || null
  } catch {
    return null
  }
}

/** Reset caches (tests / after an install). */
export function resetCache(): void {
  cachedPath = null
  cachedAvailable = null
}

// --- Network selection ------------------------------------------------------

export function isTestnet(): boolean {
  return SettingsService.getHyperliquidSettings().network !== 'mainnet'
}

// --- Exit-code → message mapping --------------------------------------------

// Documented CLI exit codes (README "Exit Codes" table).
const EXIT_MESSAGES: Record<number, string> = {
  2: 'Hyperliquid CLI usage/validation error.',
  10: 'Hyperliquid wallet not set up. Run `hyperliquid setup` to configure a signer.',
  11: 'Hyperliquid rate limited — try again shortly.',
  12: 'Hyperliquid API or network unavailable.',
  13: 'Unsupported input, invalid asset, or unknown DEX.',
  14: 'Hyperliquid returned stale data.',
  15: 'Hyperliquid returned partial results.',
}

function messageForExit(code: number | null, stderr: string, errObj?: string): string {
  if (errObj) return errObj
  if (typeof code === 'number' && EXIT_MESSAGES[code]) return EXIT_MESSAGES[code]
  const trimmed = stderr.trim()
  if (trimmed) return trimmed.split('\n')[0]
  return `Hyperliquid CLI failed (exit ${code ?? 'unknown'}).`
}

// --- Core runner ------------------------------------------------------------

export interface RunOptions {
  /** Append `--dry-run` to preview a mutation without sending it. */
  dryRun?: boolean
  timeoutMs?: number
}

/**
 * Run a hyperliquid subcommand. Always forces JSON output and the agent profile.
 * `argv` is the subcommand + its flags (e.g. `['book', 'BTC']`); global flags
 * (`--format json`, `--testnet`, `--dry-run`) are injected here. Returns parsed
 * JSON on success; throws a clean Error mapped from the CLI exit code otherwise.
 */
export async function run(argv: string[], opts: RunOptions = {}): Promise<unknown> {
  const globals = ['--format', 'json']
  if (isTestnet()) globals.push('--testnet')
  if (opts.dryRun) globals.push('--dry-run')

  const fullArgs = [...globals, ...argv]
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HYPERLIQUID_AGENT: '1',
    HYPERLIQUID_NO_UPDATE_CHECK: '1',
  }

  try {
    const { stdout } = await execFileAsync(resolvePath(), fullArgs, {
      timeout: opts.timeoutMs ?? RUN_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
      shell: false,
      env,
    })
    return parseJsonOrThrow(stdout)
  } catch (err) {
    // execFile rejects with { code, stdout, stderr } on non-zero exit.
    const e = err as { code?: number; stdout?: string; stderr?: string; message?: string }
    const errObj = extractErrorObject(e.stdout)
    if (typeof e.code === 'number' || errObj || e.stderr) {
      throw new Error(messageForExit(e.code ?? null, e.stderr ?? '', errObj))
    }
    throw new Error(e.message ?? 'Hyperliquid CLI invocation failed.')
  }
}

function parseJsonOrThrow(stdout: string): unknown {
  const text = stdout.trim()
  if (!text) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Hyperliquid CLI returned non-JSON output.')
  }
  const errObj = (parsed as { error?: unknown })?.error
  if (typeof errObj === 'string' && errObj) throw new Error(errObj)
  return parsed
}

/** Pull a `{ "error": "..." }` message out of CLI stdout when present. */
function extractErrorObject(stdout?: string): string | undefined {
  if (!stdout?.trim()) return undefined
  try {
    const parsed = JSON.parse(stdout) as { error?: unknown }
    return typeof parsed.error === 'string' ? parsed.error : undefined
  } catch {
    return undefined
  }
}

// --- Typed read wrappers ----------------------------------------------------

export const perpsList = () => run(['perps', 'list'])
export const spotList = () => run(['spot', 'list'])
export const book = (coin: string) => run(['book', coin])
export const mids = () => run(['mids'])
export const funding = (coin: string) => run(['funding', coin])
export const spread = (coin: string) => run(['spread', coin])
export const status = () => run(['status'])
export const positionsList = () => run(['positions', 'list'])
export const ordersOpen = () => run(['orders', 'open'])
export const ordersHistory = () => run(['orders', 'history'])
export const walletAddress = () => run(['wallet', 'address'])

export const candles = (coin: string, interval?: string, limit?: number) => {
  const argv = ['candles', coin]
  if (interval) argv.push('--interval', interval)
  if (typeof limit === 'number') argv.push('--limit', String(limit))
  return run(argv)
}

export const accountPortfolio = (address?: string) =>
  run(address ? ['account', 'portfolio', address] : ['account', 'portfolio'])

export const accountFees = (address?: string) =>
  run(address ? ['account', 'fees', address] : ['account', 'fees'])

export const accountFills = (address?: string) =>
  run(address ? ['account', 'fills', address] : ['account', 'fills'])

export const vaultList = (limit?: number, sort?: string) => {
  const argv = ['vault', 'list']
  if (typeof limit === 'number') argv.push('--limit', String(limit))
  if (sort) argv.push('--sort', sort)
  return run(argv)
}

export const vaultSearch = (query: string, limit?: number) => {
  const argv = ['vault', 'search', query]
  if (typeof limit === 'number') argv.push('--limit', String(limit))
  return run(argv)
}

export const vaultGet = (address: string) => run(['vault', 'get', address])

// --- Typed write wrappers (every one supports dry-run) ----------------------

export type OrderSide = 'buy' | 'sell'
export type OrderType = 'limit' | 'market' | 'stop-loss' | 'take-profit' | 'stop-limit' | 'take-limit'

export interface CreateOrderInput {
  coin: string
  side: OrderSide
  type: OrderType
  /** Size in coin units. Mutually exclusive with `amount`. */
  size?: number
  /** Notional in USDC. Mutually exclusive with `size`. */
  amount?: number
  price?: number
  triggerPrice?: number
  reduceOnly?: boolean
}

function orderArgv(input: CreateOrderInput): string[] {
  const argv = ['orders', 'create', '--coin', input.coin, '--side', input.side, '--type', input.type]
  if (typeof input.size === 'number') argv.push('--size', String(input.size))
  if (typeof input.amount === 'number') argv.push('--amount', String(input.amount))
  if (typeof input.price === 'number') argv.push('--price', String(input.price))
  if (typeof input.triggerPrice === 'number') argv.push('--trigger-price', String(input.triggerPrice))
  if (input.reduceOnly) argv.push('--reduce-only')
  return argv
}

/** Preview an order (always dry-run). Returns the signed-action preview. */
export const previewOrder = (input: CreateOrderInput) => run(orderArgv(input), { dryRun: true })

/**
 * Place a live order. `-y` is appended because ARIA has already obtained the
 * user's typed confirmation via the central risk gate before this runs.
 */
export const createOrder = (input: CreateOrderInput) => run([...orderArgv(input), '-y'])

export const cancelOrder = (opts: { orderId?: string; cloid?: string; coin?: string; all?: boolean }) => {
  if (opts.all) {
    const argv = ['orders', 'cancel-all']
    if (opts.coin) argv.push('--coin', opts.coin)
    argv.push('-y')
    return run(argv)
  }
  const argv = ['orders', 'cancel']
  if (opts.cloid) argv.push('--cloid', opts.cloid)
  else if (opts.orderId) argv.push(opts.orderId)
  return run(argv)
}

export const modifyOrder = (opts: { orderId?: string; cloid?: string; price?: number; size?: number }) => {
  const argv = ['orders', 'modify']
  if (opts.cloid) argv.push('--cloid', opts.cloid)
  else if (opts.orderId) argv.push(opts.orderId)
  if (typeof opts.price === 'number') argv.push('--price', String(opts.price))
  if (typeof opts.size === 'number') argv.push('--size', String(opts.size))
  return run(argv)
}

export const updateLeverage = (coin: string, leverage: number, isolated?: boolean) => {
  const argv = ['positions', 'update-leverage', '--coin', coin, '--leverage', String(leverage)]
  if (isolated) argv.push('--isolated')
  return run(argv)
}

export type TransferDirection = 'spot-to-perp' | 'perp-to-spot'

export const transferInternal = (direction: TransferDirection, amount: number) =>
  run(['transfer', direction, '--amount', String(amount), '-y'])
