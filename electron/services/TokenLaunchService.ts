import { randomUUID } from 'node:crypto'
import { getDb } from '../db/db'
import * as PumpFun from './PumpFunService'
import * as Settings from './SettingsService'
import * as WalletService from './WalletService'
import { pumpFunLaunchAdapter } from './token-launch/adapters/PumpFunLaunchAdapter'
import { createRaydiumLaunchLabAdapter } from './token-launch/adapters/RaydiumLaunchLabAdapter'
import { createMeteoraDbcLaunchAdapter } from './token-launch/adapters/MeteoraDbcLaunchAdapter'
import { createPrintrLaunchAdapter } from './token-launch/adapters/PrintrLaunchAdapter'
import type {
  AdapterLaunchResult,
  LaunchpadDefinition,
  LaunchpadId,
  LaunchpadStatus,
  TokenLaunchCheck as AdapterTokenLaunchCheck,
  TokenLaunchAdapter,
  TokenLaunchSettings,
  TokenLaunchInput,
} from './token-launch/types'

export type { LaunchpadDefinition, LaunchpadId, LaunchpadStatus, TokenLaunchInput, TokenLaunchSettings } from './token-launch/types'

export interface LaunchWalletOption {
  id: string
  name: string
  address: string
  isDefault: boolean
  walletType: string
  ecosystemRole: 'daemon-deployer' | null
  hasKeypair: boolean
  isAssignedToActiveProject: boolean
  assignedProjectIds: string[]
}

export interface SaveTokenInput {
  walletId: string
  projectId?: string
  mint: string
  name: string
  symbol: string
  imagePath?: string
  metadataUri?: string
  launchpad?: string
  createSignature?: string
  initialBuySol?: number
  poolAddress?: string
  bondingCurveAddress?: string
  launchpadConfigJson?: string
  protocolReceiptsJson?: string
  status?: string
  errorMessage?: string
  confirmedAt?: number
}

export interface LaunchedTokenRow {
  id: string
  project_id: string | null
  wallet_id: string
  mint: string
  name: string
  symbol: string
  image_uri: string | null
  metadata_uri: string | null
  launchpad: string
  pool_address: string | null
  bonding_curve_address: string | null
  create_signature: string | null
  initial_buy_sol: number | null
  launchpad_config_json: string
  protocol_receipts_json: string
  status: string
  error_message: string | null
  confirmed_at: number | null
  updated_at: number | null
  created_at: number
}

export interface TokenLaunchResult {
  launch: LaunchedTokenRow
  signature: string
  mint: string
  metadataUri: string | null
  poolAddress: string | null
  bondingCurveAddress: string | null
}

export type TokenLaunchCheck = AdapterTokenLaunchCheck

export interface TokenLaunchPreflight {
  ready: boolean
  estimatedTotalSol: number
  walletBalanceSol: number | null
  checks: TokenLaunchCheck[]
}

const DAEMON_DEPLOYER_NAME = 'DAEMON Deployer'
const DAEMON_DEPLOYER_ADDRESS = 'yk8R9ivCGdtQeyo71JYyB6CjfSsMnWcYthisPwT'
const DAEMON_DEPLOYER_WALLET_TYPE = 'daemon-deployer'

const bonkDefinition: LaunchpadDefinition = {
  id: 'bonk',
  name: 'Bonk',
  description: 'LetsBonk platform launch on top of LaunchLab partner configuration',
  status: 'planned',
  enabled: false,
  reason: 'Bonk is being treated as a LaunchLab platform variant until the exact official partner config is confirmed.',
}

const bagsDefinition: LaunchpadDefinition = {
  id: 'bags',
  name: 'Bags Launchpad',
  description: 'Bags token launch workflow placeholder for launch prep and partner integration status.',
  status: 'planned',
  enabled: false,
  reason: 'Bags Launchpad is visible for planning, but execution is disabled until the official integration path is wired.',
}

function getAdapters(settings: TokenLaunchSettings): Record<LaunchpadId, TokenLaunchAdapter | null> {
  return {
    pumpfun: pumpFunLaunchAdapter,
    raydium: createRaydiumLaunchLabAdapter({ settings: settings.raydium }),
    meteora: createMeteoraDbcLaunchAdapter({ settings: settings.meteora }),
    printr: createPrintrLaunchAdapter({ settings: settings.printr }),
    bags: null,
    bonk: null,
  }
}

export function listLaunchpads(): LaunchpadDefinition[] {
  const adapters = getAdapters(Settings.getTokenLaunchSettings())
  return [
    adapters.pumpfun!.definition,
    adapters.raydium!.definition,
    adapters.meteora!.definition,
    adapters.printr!.definition,
    bagsDefinition,
    bonkDefinition,
  ]
}

export function listLaunchWallets(projectId?: string | null): LaunchWalletOption[] {
  const projectWalletId = WalletService.getProjectWalletId(projectId ?? null)
  return WalletService.listWallets().map((wallet) => ({
    id: wallet.id,
    name: wallet.name,
    address: wallet.address,
    isDefault: wallet.is_default === 1,
    walletType: wallet.wallet_type ?? 'user',
    ecosystemRole: wallet.address === DAEMON_DEPLOYER_ADDRESS ? 'daemon-deployer' : null,
    hasKeypair: WalletService.hasKeypair(wallet.id),
    isAssignedToActiveProject: wallet.id === projectWalletId,
    assignedProjectIds: wallet.assigned_project_ids ?? [],
  }))
}

export function ensureDaemonDeployerWallet(projectId?: string | null): LaunchWalletOption {
  const wallet = WalletService.ensureWatchWallet(
    DAEMON_DEPLOYER_NAME,
    DAEMON_DEPLOYER_ADDRESS,
    DAEMON_DEPLOYER_WALLET_TYPE,
  )
  const option = listLaunchWallets(projectId).find((entry) => entry.id === wallet.id)
  if (!option) throw new Error('Could not resolve DAEMON deployer wallet')
  return option
}

export async function pickImage(): Promise<string | null> {
  return PumpFun.pickImage()
}

export async function preflightLaunch(input: TokenLaunchInput): Promise<TokenLaunchPreflight> {
  const estimatedTotalSol = input.initialBuySol + input.priorityFeeSol + 0.02
  const checks: TokenLaunchCheck[] = []
  const adapter = getAdapters(Settings.getTokenLaunchSettings())[input.launchpad]

  const launchpad = listLaunchpads().find((entry) => entry.id === input.launchpad)
  if (!launchpad) {
    checks.push({
      id: 'launchpad',
      label: 'Launchpad',
      status: 'fail',
      detail: `Unsupported launchpad: ${input.launchpad}`,
    })
  } else if (!launchpad.enabled) {
    checks.push({
      id: 'launchpad',
      label: 'Launchpad',
      status: 'fail',
      detail: launchpad.reason ?? `${launchpad.name} is not available yet.`,
    })
  } else {
    checks.push({
      id: 'launchpad',
      label: 'Launchpad',
      status: 'pass',
      detail: `${launchpad.name} is configured and available.`,
    })
  }

  const hasKeypair = WalletService.hasKeypair(input.walletId)
  const selectedWallet = listLaunchWallets(input.projectId ?? null).find((wallet) => wallet.id === input.walletId)
  checks.push({
    id: 'wallet-keypair',
    label: 'Signing Wallet',
    status: hasKeypair ? 'pass' : 'fail',
    detail: hasKeypair
      ? selectedWallet?.ecosystemRole === 'daemon-deployer'
        ? `DAEMON Deployer is selected. Launch creator/deployer will be ${DAEMON_DEPLOYER_ADDRESS}.`
        : 'Selected wallet has an imported keypair.'
      : 'Selected wallet is watch-only. Import or generate a signing wallet first.',
  })

  if (selectedWallet?.ecosystemRole === 'daemon-deployer') {
    checks.push({
      id: 'daemon-deployer',
      label: 'DAEMON Deployer',
      status: hasKeypair ? 'pass' : 'fail',
      detail: hasKeypair
        ? 'The matching DAEMON Deployer keypair is available locally for signing.'
        : `Import the keypair for ${DAEMON_DEPLOYER_ADDRESS} before launching if you want this address to appear as deployer.`,
    })
  }

  const projectWalletId = WalletService.getProjectWalletId(input.projectId ?? null)
  if (projectWalletId && projectWalletId !== input.walletId) {
    checks.push({
      id: 'project-wallet-link',
      label: 'Project Wallet Link',
      status: 'warn',
      detail: 'Selected wallet is different from the wallet assigned to the active project.',
    })
  } else {
    checks.push({
      id: 'project-wallet-link',
      label: 'Project Wallet Link',
      status: 'pass',
      detail: input.projectId
        ? 'Selected wallet matches the active project context.'
        : 'No active project wallet override is required.',
    })
  }

  const heliusConfigured = WalletService.hasHeliusKey()
  checks.push({
    id: 'helius',
    label: 'RPC Access',
    status: heliusConfigured ? 'pass' : 'warn',
    detail: heliusConfigured
      ? 'Helius RPC key is configured via wallet settings or environment.'
      : 'Helius RPC key is not configured. Launch preflight will use the public Solana RPC fallback.',
  })

  let walletBalanceSol: number | null = null
  try {
    const balance = await WalletService.getBalance(input.walletId)
    walletBalanceSol = balance.sol
    checks.push({
      id: 'wallet-balance',
      label: 'Wallet Balance',
      status: balance.sol >= estimatedTotalSol ? 'pass' : 'fail',
      detail: balance.sol >= estimatedTotalSol
        ? `Wallet has ${balance.sol.toFixed(4)} SOL available.`
        : `Wallet has ${balance.sol.toFixed(4)} SOL but the estimated requirement is ${estimatedTotalSol.toFixed(4)} SOL.`,
    })
  } catch (error) {
    checks.push({
      id: 'wallet-balance',
      label: 'Wallet Balance',
      status: 'fail',
      detail: error instanceof Error ? error.message : 'Could not load wallet balance.',
    })
  }

  checks.push({
    id: 'launch-params',
    label: 'Launch Parameters',
    status: input.initialBuySol > 0 && input.slippageBps > 0 && input.priorityFeeSol >= 0 ? 'pass' : 'fail',
    detail: `Initial buy ${input.initialBuySol.toFixed(4)} SOL, slippage ${(input.slippageBps / 100).toFixed(2)}%, priority fee ${input.priorityFeeSol.toFixed(4)} SOL.`,
  })

  if (adapter?.preflight) {
    try {
      checks.push(...await adapter.preflight(input))
    } catch (error) {
      checks.push({
        id: `${input.launchpad}-adapter`,
        label: 'Launchpad Adapter',
        status: 'fail',
        detail: error instanceof Error ? error.message : 'Launchpad preflight failed.',
      })
    }
  }

  return {
    ready: checks.every((check) => check.status !== 'fail'),
    estimatedTotalSol,
    walletBalanceSol,
    checks,
  }
}

export async function createLaunch(input: TokenLaunchInput): Promise<TokenLaunchResult> {
  validateLaunchInput(input)

  const adapter = getAdapters(Settings.getTokenLaunchSettings())[input.launchpad]
  if (!adapter) {
    const definition = input.launchpad === 'bonk' ? bonkDefinition
      : input.launchpad === 'bags' ? bagsDefinition
        : null
    throw new Error(definition?.reason ?? `Unsupported launchpad: ${input.launchpad}`)
  }
  if (!adapter.definition.enabled) {
    throw new Error(adapter.definition.reason ?? `${adapter.definition.name} is not available yet`)
  }

  const result = await adapter.createLaunch(input)
  return persistLaunchResult(input, result)
}

function persistLaunchResult(input: TokenLaunchInput, result: AdapterLaunchResult): TokenLaunchResult {
  const launch = saveToken({
    walletId: input.walletId,
    projectId: input.projectId,
    mint: result.mint,
    name: input.name,
    symbol: input.symbol,
    imagePath: input.imagePath ?? undefined,
    metadataUri: result.metadataUri ?? undefined,
    launchpad: input.launchpad,
    createSignature: result.signature,
    initialBuySol: input.initialBuySol,
    poolAddress: result.poolAddress ?? undefined,
    bondingCurveAddress: result.bondingCurveAddress ?? undefined,
    launchpadConfigJson: JSON.stringify({
      initialBuySol: input.initialBuySol,
      slippageBps: input.slippageBps,
      priorityFeeSol: input.priorityFeeSol,
      mayhemMode: input.mayhemMode ?? false,
    }),
    protocolReceiptsJson: JSON.stringify({
      socials: {
        twitter: input.twitter ?? '',
        telegram: input.telegram ?? '',
        website: input.website ?? '',
      },
      ...result.protocolReceipts,
    }),
    status: 'active',
    confirmedAt: Date.now(),
  })

  return {
    launch,
    signature: result.signature,
    mint: result.mint,
    metadataUri: result.metadataUri,
    poolAddress: result.poolAddress,
    bondingCurveAddress: result.bondingCurveAddress,
  }
}

export function saveToken(input: SaveTokenInput): LaunchedTokenRow {
  if (!input.walletId) throw new Error('walletId is required')
  if (!input.name) throw new Error('name is required')
  if (!input.symbol) throw new Error('symbol is required')
  if (!input.mint) throw new Error('mint is required')

  const db = getDb()
  const id = randomUUID()
  const now = Date.now()

  db.prepare(`
    INSERT INTO launched_tokens (
      id,
      wallet_id,
      project_id,
      mint,
      name,
      symbol,
      image_uri,
      metadata_uri,
      launchpad,
      pool_address,
      bonding_curve_address,
      create_signature,
      initial_buy_sol,
      launchpad_config_json,
      protocol_receipts_json,
      status,
      error_message,
      confirmed_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.walletId,
    input.projectId ?? null,
    input.mint,
    input.name,
    input.symbol,
    input.imagePath ?? null,
    input.metadataUri ?? null,
    input.launchpad ?? 'pumpfun',
    input.poolAddress ?? null,
    input.bondingCurveAddress ?? null,
    input.createSignature ?? null,
    input.initialBuySol ?? null,
    input.launchpadConfigJson ?? '{}',
    input.protocolReceiptsJson ?? '{}',
    input.status ?? 'active',
    input.errorMessage ?? null,
    input.confirmedAt ?? null,
    now,
  )

  return getLaunch(id) as LaunchedTokenRow
}

export function listTokens(walletId?: string): LaunchedTokenRow[] {
  const db = getDb()
  const rows = walletId
    ? db.prepare('SELECT * FROM launched_tokens WHERE wallet_id = ? ORDER BY created_at DESC').all(walletId)
    : db.prepare('SELECT * FROM launched_tokens ORDER BY created_at DESC').all()
  return rows as LaunchedTokenRow[]
}

export function getLaunch(idOrMint: string): LaunchedTokenRow | null {
  const db = getDb()
  const row = db.prepare(
    'SELECT * FROM launched_tokens WHERE id = ? OR mint = ? LIMIT 1'
  ).get(idOrMint, idOrMint) as LaunchedTokenRow | undefined
  return row ?? null
}

function validateLaunchInput(input: TokenLaunchInput) {
  if (!input.walletId) throw new Error('walletId is required')
  if (!WalletService.hasKeypair(input.walletId)) throw new Error('Selected wallet does not have a keypair imported')
  if (!input.name.trim()) throw new Error('name is required')
  if (!input.symbol.trim()) throw new Error('symbol is required')
  if (!input.description.trim()) throw new Error('description is required')
  if (!(input.initialBuySol > 0)) throw new Error('initialBuySol must be greater than zero')
  if (!(input.slippageBps > 0)) throw new Error('slippageBps must be greater than zero')
  if (input.priorityFeeSol < 0) throw new Error('priorityFeeSol cannot be negative')
}
