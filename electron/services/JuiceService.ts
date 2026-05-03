import * as SecureKey from './SecureKeyService'

const JUICE_API_KEY_NAME = 'JUICE_API_KEY'
const JUICE_BASE_URL = 'https://api.juiceeverything.com'
const JUICE_MM_API_BASE = `${JUICE_BASE_URL}/api/mm-api`
const JUICE_KEY_RE = /^[a-f0-9]{96}$/i
const CONFIRMATION_TTL_MS = 60_000

export interface JuiceApiEnvelope<T> {
  success: boolean
  data?: T
  buy?: JuiceBuyExecution | false
  message?: string
}

export interface JuiceExecutionGuard {
  confirmedAt: number
  acknowledgedImpact: boolean
}

export interface JuiceWallet {
  id: string
  publicKey: string
  mint: string | null
  symbol?: string | null
  name?: string | null
  isActive: boolean
  deactivatedAt?: string | null
  deactivationReason?: string | null
  deactivationPrice?: number | null
  strategyId?: string | null
  stopLossPrice?: number | null
  takeProfitPrice?: number | null
  tpOnly?: boolean
  accumulation?: boolean
  lowSpeed?: boolean
  createdAt?: string
}

export interface JuiceCreatedWallet extends JuiceWallet {
  privateKey: string
  logoURI?: string | null
}

export interface JuiceBalance {
  mint: string
  balance: number
  decimals: number
}

export interface JuiceWalletBalances {
  mmTokenId: string
  publicKey: string
  mint: string | null
  solBalance: number
  tokenBalances: JuiceBalance[]
}

export interface JuicePnlSummary {
  totalUsd: number
  totalPercent: number
  realizedUsd: number
  realizedPercent: number
  unrealizedUsd: number
  unrealizedPercent: number
  avgProfitPerTradeUsd?: number
}

export interface JuiceWalletPnl {
  mmTokenId: string
  mint: string
  symbol?: string
  walletAddress: string
  pnl: JuicePnlSummary
  fetchedAt?: string
}

export interface JuiceMintDetails {
  mint: string
  wallets: number
  totalSolBalance: number
  totalSolValueUsd: number
  totalTokenBalance: number
  totalTokenValueUsd: number
  totalPositionUsd: number
  tokenPrice: number
  solPrice: number
  liquidity: number
  marketCap: number
  volume24h: number
  positionToLiquidity: number
  walletMultiplier: number
  overcrowdingLevel: number
}

export interface JuiceScoutToken {
  mint: string
  symbol: string
  name: string
  logoURI?: string | null
  decimals?: number
  price: number
  marketCap: number
  liquidity: number
  holder?: number
  volume1hUsd?: number
  volume1hChangePercent?: number
  volume24hUsd?: number
  volume24hChangePercent?: number
  priceChange1hPercent?: number
  priceChange24hPercent?: number
  trade1hCount?: number
  trade24hCount?: number
  score: number
  maxScore: number
  grade: string
  momentumSignal?: number
  priceAction?: Record<string, unknown>
  security?: Record<string, unknown>
  liquidityAnalysis?: Record<string, unknown>
}

export interface JuiceScoutingReport {
  tokens: JuiceScoutToken[]
  tokenCount: number
  scannedAt: string
}

export interface JuiceCreateWalletInput extends JuiceExecutionGuard {
  mint?: string
  strategyId?: string
  acknowledgedPrivateKey: boolean
}

export interface JuiceEditWalletInput extends JuiceExecutionGuard {
  walletId: string
  mint?: string
  isActive?: boolean
  stopLossPrice?: number
  takeProfitPrice?: number
  tpOnly?: boolean
  accumulation?: boolean
  lowSpeed?: boolean
  strategyId?: string
  placeBuy?: boolean
}

export interface JuiceBuyInput extends JuiceExecutionGuard {
  walletId: string
  solAmount: number
}

export interface JuiceSellAllInput extends JuiceExecutionGuard {
  walletId: string
  outputMint: 'SOL' | 'USDC'
}

export interface JuiceBuyExecution {
  executed: boolean
  solSpent?: number
  txSignature?: string
  solscanUrl?: string
  maxBuySOL?: number
  marketCap?: number
  reason?: string
}

export interface JuiceEditWalletResult {
  wallet: JuiceWallet
  buy?: JuiceBuyExecution | false
  message?: string
}

export interface JuiceBuyResult {
  wallet: JuiceWallet
  buy?: JuiceBuyExecution | false
  message?: string
}

export interface JuiceSellAllResult {
  mmTokenId: string
  inputMint: string
  outputMint: string
  outputChoice: 'SOL' | 'USDC'
  amountSold: number
  txSignature: string
  solscanUrl: string
}

export function validateJuiceApiKey(value: string) {
  const trimmed = value.trim()
  if (!JUICE_KEY_RE.test(trimmed)) {
    throw new Error('Juice API key must be a 96-character hex string')
  }
  return trimmed
}

export function hasJuiceKey() {
  return Boolean(SecureKey.getKey(JUICE_API_KEY_NAME))
}

export function deleteJuiceKey() {
  SecureKey.deleteKey(JUICE_API_KEY_NAME)
}

export async function storeJuiceKey(value: string) {
  const apiKey = validateJuiceApiKey(value)
  await juiceRequest<JuiceWallet[]>('/tokens', { apiKey })
  SecureKey.storeKey(JUICE_API_KEY_NAME, apiKey)
}

export function listWallets() {
  return juiceRequest<JuiceWallet[]>('/tokens')
}

export function getBalances(walletId: string) {
  return juiceRequest<JuiceWalletBalances>(`/tokens/${encodeURIComponent(walletId)}/balances`)
}

export function getPnl(walletId: string) {
  return juiceRequest<JuiceWalletPnl>(`/tokens/${encodeURIComponent(walletId)}/pnl`)
}

export function getMintDetails(mint: string) {
  return juiceRequest<JuiceMintDetails>(`/mints/${encodeURIComponent(mint)}`)
}

export function getScoutingReport() {
  return juiceRequest<JuiceScoutingReport>('/scouting-report')
}

export async function createWallet(input: JuiceCreateWalletInput) {
  assertExecutionGuard(input, 'Create Juice MM wallet')
  if (!input.acknowledgedPrivateKey) {
    throw new Error('Creating a Juice wallet returns a private key once. Acknowledge private-key handling before continuing.')
  }

  return juiceRequest<JuiceCreatedWallet>('/tokens', {
    method: 'POST',
    body: {
      mint: input.mint,
      strategyId: input.strategyId,
    },
  })
}

export async function editWallet(input: JuiceEditWalletInput): Promise<JuiceEditWalletResult> {
  assertExecutionGuard(input, input.placeBuy ? 'Edit Juice wallet and place buy' : 'Edit Juice MM wallet')
  const envelope = await juiceEnvelopeRequest<JuiceWallet>(`/tokens/${encodeURIComponent(input.walletId)}`, {
    method: 'PUT',
    body: omitUndefined({
      mint: input.mint,
      isActive: input.isActive,
      stopLossPrice: input.stopLossPrice,
      takeProfitPrice: input.takeProfitPrice,
      tpOnly: input.tpOnly,
      accumulation: input.accumulation,
      lowSpeed: input.lowSpeed,
      strategyId: input.strategyId,
      placeBuy: input.placeBuy,
    }),
  })

  if (!envelope.data) throw new Error('Juice edit response did not include wallet data')
  return { wallet: envelope.data, buy: envelope.buy, message: envelope.message }
}

export async function placeBuy(input: JuiceBuyInput): Promise<JuiceBuyResult> {
  assertExecutionGuard(input, 'Execute Juice buy')
  if (!Number.isFinite(input.solAmount) || input.solAmount <= 0) {
    throw new Error('solAmount must be a positive number')
  }

  const envelope = await juiceEnvelopeRequest<JuiceWallet>(`/tokens/${encodeURIComponent(input.walletId)}/buy`, {
    method: 'POST',
    body: { solAmount: input.solAmount },
  })

  if (!envelope.data) throw new Error('Juice buy response did not include wallet data')
  return { wallet: envelope.data, buy: envelope.buy, message: envelope.message }
}

export function sellAll(input: JuiceSellAllInput) {
  assertExecutionGuard(input, 'Execute Juice sell-all')
  if (input.outputMint !== 'SOL' && input.outputMint !== 'USDC') {
    throw new Error('outputMint must be SOL or USDC')
  }

  return juiceRequest<JuiceSellAllResult>(`/tokens/${encodeURIComponent(input.walletId)}/sell-all`, {
    method: 'POST',
    body: { outputMint: input.outputMint },
  })
}

function assertExecutionGuard(input: JuiceExecutionGuard, actionLabel: string) {
  if (!input.acknowledgedImpact) {
    throw new Error(`${actionLabel} requires explicit user acknowledgement.`)
  }
  if (!Number.isFinite(input.confirmedAt)) {
    throw new Error(`${actionLabel} requires a fresh confirmation timestamp.`)
  }
  if (Date.now() - input.confirmedAt > CONFIRMATION_TTL_MS) {
    throw new Error(`${actionLabel} confirmation expired. Review and confirm again.`)
  }
}

function omitUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => typeof value !== 'undefined'))
}

async function juiceRequest<T>(path: string, opts: { method?: 'GET' | 'POST' | 'PUT'; apiKey?: string; body?: Record<string, unknown> } = {}): Promise<T> {
  const envelope = await juiceEnvelopeRequest<T>(path, opts)
  if (typeof envelope.data === 'undefined') {
    throw new Error('Juice API response did not include a data payload')
  }
  return envelope.data
}

async function juiceEnvelopeRequest<T>(path: string, opts: { method?: 'GET' | 'POST' | 'PUT'; apiKey?: string; body?: Record<string, unknown> } = {}): Promise<JuiceApiEnvelope<T>> {
  const apiKey = opts.apiKey ?? SecureKey.getKey(JUICE_API_KEY_NAME)
  if (!apiKey) {
    throw new Error('JUICE_API_KEY is not configured')
  }

  const res = await fetch(`${JUICE_MM_API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })

  const json = await res.json().catch(() => null) as JuiceApiEnvelope<T> | null
  if (!res.ok || !json?.success) {
    throw new Error(json?.message ?? `Juice API request failed with status ${res.status}`)
  }

  return json
}
