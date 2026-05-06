import { Keypair, PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { dialog } from 'electron'
import * as SecureKey from './SecureKeyService'
import { getDb } from '../db/db'
import BN from 'bn.js'
import bs58 from 'bs58'
import fs from 'node:fs'
import { executeInstructions, getConnectionStrict, withKeypair, loadKeypair } from './SolanaService'

// Lazy-load the SDK to avoid startup cost
// The package's ESM exports map points to index.js but the file is index.mjs — use CJS instead
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const PUMPFUN_METADATA_ENDPOINT = 'https://pump.fun/api/ipfs'
const METADATA_UPLOAD_TIMEOUT_MS = 30_000
const METADATA_UPLOAD_MAX_ATTEMPTS = 3
const METADATA_UPLOAD_RETRY_BASE_MS = 250
const PUMPFUN_CREATE_BUY_COMPUTE_UNITS = 500_000

let _sdk: typeof import('@nirholas/pump-sdk') | null = null
function getSdk() {
  if (!_sdk) _sdk = require('@nirholas/pump-sdk') as typeof import('@nirholas/pump-sdk')
  return _sdk
}

export interface TokenCreateInput {
  name: string
  symbol: string
  description: string
  imagePath: string | null
  initialBuyAmountSol: number
  mayhemMode: boolean
  walletId: string
}

export interface TradeInput {
  mint: string
  action: 'buy' | 'sell'
  amountSol?: number
  amountTokens?: number
  slippageBps: number
  walletId: string
}

export interface BondingCurveInfo {
  mint: string
  currentPriceLamports: string
  marketCapLamports: string
  graduationBps: number
  virtualSolReserves: string
  virtualTokenReserves: string
  realTokenReserves: string
  realSolReserves: string
  isGraduated: boolean
}

export interface TxResult {
  signature: string
  success: boolean
}

export interface TokenCreateResult extends TxResult {
  mint: string
  metadataUri: string
  bondingCurveAddress: string
  associatedBondingCurveAddress: string | null
}

function buildMetadataFormData(input: TokenCreateInput): FormData {
  const formData = new FormData()
  formData.append('name', input.name)
  formData.append('symbol', input.symbol)
  formData.append('description', input.description)
  formData.append('showName', 'true')

  if (input.imagePath) {
    const imageBuffer = fs.readFileSync(input.imagePath)
    const ext = input.imagePath.split('.').pop()?.toLowerCase() ?? 'png'
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : 'image/png'
    const blob = new Blob([imageBuffer], { type: mimeType })
    formData.append('file', blob, `token.${ext}`)
  }

  return formData
}

function isRetryableMetadataStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function uploadPumpFunMetadata(input: TokenCreateInput): Promise<{ metadataUri: string }> {
  let lastError: unknown

  for (let attempt = 1; attempt <= METADATA_UPLOAD_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), METADATA_UPLOAD_TIMEOUT_MS)
    try {
      const metaRes = await fetch(PUMPFUN_METADATA_ENDPOINT, {
        method: 'POST',
        body: buildMetadataFormData(input),
        signal: controller.signal,
      })
      if (metaRes.ok) {
        const json = await metaRes.json() as { metadataUri?: string }
        if (!json.metadataUri) throw new Error('Token metadata upload did not return a metadataUri')
        return { metadataUri: json.metadataUri }
      }

      const body = await metaRes.text().catch(() => '')
      const message = `Failed to upload token metadata (${metaRes.status})${body ? `: ${body}` : ''}`
      lastError = new Error(message)
      if (!isRetryableMetadataStatus(metaRes.status) || attempt === METADATA_UPLOAD_MAX_ATTEMPTS) {
        throw lastError
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error('Token metadata upload timed out after 30s')
      }
      lastError = e
      if (attempt === METADATA_UPLOAD_MAX_ATTEMPTS) throw e
    } finally {
      clearTimeout(timeoutId)
    }

    await sleep(METADATA_UPLOAD_RETRY_BASE_MS * Math.pow(2, attempt - 1))
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to upload token metadata')
}

export async function getBondingCurveState(mint: string): Promise<BondingCurveInfo> {
  const sdk = getSdk()
  const connection = getConnectionStrict()
  const onlineSdk = new sdk.OnlinePumpSdk(connection)

  const [global, curve, feeConfig] = await Promise.all([
    onlineSdk.fetchGlobal(),
    onlineSdk.fetchBondingCurve(mint),
    onlineSdk.fetchFeeConfig(),
  ])

  const graduation = sdk.getGraduationProgress(global, curve)

  // Price/summary calculations divide by virtualTokenReserves — guard graduated curves
  let currentPriceLamports = '0'
  let marketCapLamports = '0'

  const hasReserves = !curve.virtualTokenReserves.isZero()
  if (hasReserves && !curve.complete) {
    try {
      const price = sdk.getTokenPrice({ global, feeConfig, mintSupply: global.tokenTotalSupply, bondingCurve: curve })
      const summary = sdk.getBondingCurveSummary({ global, feeConfig, mintSupply: global.tokenTotalSupply, bondingCurve: curve })
      currentPriceLamports = price.buyPricePerToken.toString()
      marketCapLamports = summary.marketCap.toString()
    } catch {
      // Curve in transitional state — reserves drained but not yet flagged complete
    }
  }

  return {
    mint,
    currentPriceLamports,
    marketCapLamports,
    graduationBps: graduation.progressBps,
    virtualSolReserves: curve.virtualSolReserves.toString(),
    virtualTokenReserves: curve.virtualTokenReserves.toString(),
    realTokenReserves: curve.realTokenReserves.toString(),
    realSolReserves: curve.realSolReserves.toString(),
    isGraduated: graduation.isGraduated,
  }
}

export async function createToken(input: TokenCreateInput): Promise<TokenCreateResult> {
  return withKeypair(input.walletId, async (keypair) => {
  const sdk = getSdk()
  const connection = getConnectionStrict()
  const onlineSdk = new sdk.OnlinePumpSdk(connection)
  const pumpSdk = new sdk.PumpSdk()

  const metaJson = await uploadPumpFunMetadata(input)

  const mintKeypair = Keypair.generate()
  const bondingCurve = sdk.bondingCurvePda(mintKeypair.publicKey)
  const global = await onlineSdk.fetchGlobal()
  const solLamports = new BN(Math.floor(input.initialBuyAmountSol * 1e9))

  const tokenAmount = sdk.getBuyTokenAmountFromSolAmount({
    global,
    feeConfig: null,
    mintSupply: null,
    bondingCurve: null,
    amount: solLamports,
  })

  const instructions = await pumpSdk.createV2AndBuyInstructions({
    global,
    mint: mintKeypair.publicKey,
    name: input.name,
    symbol: input.symbol,
    uri: metaJson.metadataUri,
    creator: keypair.publicKey,
    user: keypair.publicKey,
    amount: tokenAmount,
    solAmount: solLamports,
    mayhemMode: input.mayhemMode,
  })

  let signature: string
  try {
    const result = await executeInstructions(connection, instructions, [keypair, mintKeypair], {
      payer: keypair.publicKey,
      computeUnitLimit: PUMPFUN_CREATE_BUY_COMPUTE_UNITS,
    })
    signature = result.signature
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Pump.fun create+buy failed for mint ${mintKeypair.publicKey.toBase58()}: ${reason}. ` +
      'The create and initial buy are submitted together; if this failed after broadcast or confirmation timed out, verify the mint on-chain before retrying.'
    )
  }

  return {
    signature,
    success: true,
    mint: mintKeypair.publicKey.toBase58(),
    metadataUri: metaJson.metadataUri,
    bondingCurveAddress: bondingCurve.toBase58(),
    associatedBondingCurveAddress: null,
  }
  })
}

export async function buyToken(input: TradeInput): Promise<TxResult> {
  return withKeypair(input.walletId, async (keypair) => {
  const sdk = getSdk()
  const connection = getConnectionStrict()
  const onlineSdk = new sdk.OnlinePumpSdk(connection)
  const mintPk = new PublicKey(input.mint)

  const [global, curve, feeConfig] = await Promise.all([
    onlineSdk.fetchGlobal(),
    onlineSdk.fetchBondingCurve(mintPk),
    onlineSdk.fetchFeeConfig(),
  ])

  if (curve.complete) throw new Error('Bonding curve graduated. Use AMM trading.')

  if (!input.amountSol || input.amountSol <= 0) throw new Error('Buy amount must be greater than 0')
  const solLamports = new BN(Math.floor(input.amountSol * 1e9))
  const tokenAmount = sdk.getBuyTokenAmountFromSolAmount({
    global,
    feeConfig,
    mintSupply: global.tokenTotalSupply,
    bondingCurve: curve,
    amount: solLamports,
  })

  const bcPda = sdk.bondingCurvePda(mintPk)
  const bcInfo = await connection.getAccountInfo(bcPda)
  if (!bcInfo) throw new Error('Bonding curve account not found')

  const { getAssociatedTokenAddressSync } = await import('@solana/spl-token')
  const userAtaAddress = getAssociatedTokenAddressSync(mintPk, keypair.publicKey)
  const userAtaInfo = await connection.getAccountInfo(userAtaAddress)

  const instructions = await onlineSdk.buyInstructions({
    bondingCurveAccountInfo: bcInfo,
    bondingCurve: curve,
    associatedUserAccountInfo: userAtaInfo,
    mint: mintPk,
    user: keypair.publicKey,
    amount: tokenAmount,
    solAmount: solLamports,
    slippage: input.slippageBps / 10_000,
    tokenProgram: TOKEN_PROGRAM_ID,
  })

  const { signature } = await executeInstructions(connection, instructions, [keypair], {
    payer: keypair.publicKey,
  })
  return { signature, success: true }
  })
}

export async function sellToken(input: TradeInput): Promise<TxResult> {
  return withKeypair(input.walletId, async (keypair) => {
  const sdk = getSdk()
  const connection = getConnectionStrict()
  const onlineSdk = new sdk.OnlinePumpSdk(connection)
  const mintPk = new PublicKey(input.mint)

  const [global, curve, feeConfig] = await Promise.all([
    onlineSdk.fetchGlobal(),
    onlineSdk.fetchBondingCurve(mintPk),
    onlineSdk.fetchFeeConfig(),
  ])

  if (curve.complete) throw new Error('Bonding curve graduated. Use AMM trading.')

  if (!input.amountTokens || input.amountTokens <= 0) throw new Error('Sell amount must be greater than 0')
  const tokenAmount = new BN(Math.floor(input.amountTokens * 1e6))
  const solAmount = sdk.getSellSolAmountFromTokenAmount({
    global,
    feeConfig,
    mintSupply: global.tokenTotalSupply,
    bondingCurve: curve,
    amount: tokenAmount,
  })

  const bcPda = sdk.bondingCurvePda(mintPk)
  const bcInfo = await connection.getAccountInfo(bcPda)
  if (!bcInfo) throw new Error('Bonding curve account not found')

  const instructions = await onlineSdk.sellInstructions({
    bondingCurveAccountInfo: bcInfo,
    bondingCurve: curve,
    mint: mintPk,
    user: keypair.publicKey,
    amount: tokenAmount,
    solAmount,
    slippage: input.slippageBps / 10_000,
    tokenProgram: TOKEN_PROGRAM_ID,
  })

  const { signature } = await executeInstructions(connection, instructions, [keypair], {
    payer: keypair.publicKey,
  })
  return { signature, success: true }
  })
}

export async function collectCreatorFees(walletId: string): Promise<TxResult> {
  return withKeypair(walletId, async (keypair) => {
  const sdk = getSdk()
  const connection = getConnectionStrict()
  const pumpSdk = new sdk.PumpSdk()

  const ix = await pumpSdk.ammCollectCoinCreatorFeeInstruction({ creator: keypair.publicKey })
  const { signature } = await executeInstructions(connection, [ix], [keypair], {
    payer: keypair.publicKey,
  })
  return { signature, success: true }
  })
}

export async function pickImage(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Select Token Image',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    properties: ['openFile'],
  })
  return result.canceled ? null : result.filePaths[0] ?? null
}

export function hasKeypair(walletId: string): boolean {
  const encrypted = SecureKey.getKey(`WALLET_KEYPAIR_${walletId}`)
  if (encrypted) return true

  const db = getDb()
  const row = db.prepare('SELECT keypair_path FROM wallets WHERE id = ?').get(walletId) as { keypair_path: string | null } | undefined
  return !!(row?.keypair_path && fs.existsSync(row.keypair_path))
}

export async function importKeypair(walletId: string): Promise<boolean> {
  const result = await dialog.showOpenDialog({
    title: 'Import Wallet Keypair',
    filters: [{ name: 'Keypair', extensions: ['json'] }],
    properties: ['openFile'],
  })

  if (result.canceled || !result.filePaths[0]) return false

  const raw = fs.readFileSync(result.filePaths[0], 'utf-8')
  const parsed = JSON.parse(raw)
  const kp = Keypair.fromSecretKey(Uint8Array.from(parsed))

  const db = getDb()
  const row = db.prepare('SELECT address FROM wallets WHERE id = ?').get(walletId) as { address: string } | undefined
  if (!row) throw new Error('Wallet not found')
  if (kp.publicKey.toBase58() !== row.address) {
    throw new Error(`Keypair address ${kp.publicKey.toBase58()} does not match wallet ${row.address}`)
  }

  SecureKey.storeKey(`WALLET_KEYPAIR_${walletId}`, bs58.encode(kp.secretKey))
  kp.secretKey.fill(0)
  return true
}
