/**
 * Deterministic file set for the Trading Bot template. Unlike the generic
 * node scaffold (config + hold-only strategy stub), this emits a runnable
 * Jupiter swap bot: quote polling, price history, a swappable strategy,
 * wallet loading, and live execution via @solana/kit — gated behind
 * DRY_RUN=true so a fresh scaffold can never trade real funds by accident.
 */

interface ScaffoldFile {
  path: string
  content: string
}

const CONFIG_TS = `import 'dotenv/config'

export const config = {
  rpcUrl: process.env.RPC_URL ?? 'https://api.devnet.solana.com',
  walletPath: process.env.WALLET_PATH ?? '~/.config/solana/id.json',
  // Default pair: wSOL -> USDC
  inputMint: process.env.TOKEN_MINT_A ?? 'So11111111111111111111111111111111111111112',
  outputMint: process.env.TOKEN_MINT_B ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // Raw units of the input mint (lamports for wSOL)
  tradeAmount: BigInt(process.env.TRADE_AMOUNT ?? '10000000'),
  slippageBps: Number(process.env.SLIPPAGE_BPS ?? '50'),
  checkIntervalMs: Number(process.env.CHECK_INTERVAL_MS ?? '10000'),
  // Anything except the literal string "false" stays in dry-run.
  dryRun: (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false',
  jupiterBaseUrl: process.env.JUPITER_API_URL ?? 'https://lite-api.jup.ag/swap/v1',
}
`

const LOGGER_TS = `import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
})
`

const JUPITER_TS = `import { z } from 'zod'
import { config } from './config.js'

const quoteSchema = z
  .object({
    inputMint: z.string(),
    outputMint: z.string(),
    inAmount: z.string(),
    outAmount: z.string(),
    priceImpactPct: z.string(),
  })
  .passthrough()

export type JupiterQuote = z.infer<typeof quoteSchema>

export async function fetchQuote(inputMint: string, outputMint: string, amount: bigint): Promise<JupiterQuote> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amount.toString(),
    slippageBps: String(config.slippageBps),
  })
  const res = await fetch(config.jupiterBaseUrl + '/quote?' + params.toString())
  if (!res.ok) throw new Error('Jupiter quote failed: HTTP ' + res.status)
  return quoteSchema.parse(await res.json())
}

export async function fetchSwapTransaction(quote: JupiterQuote, userPublicKey: string): Promise<string> {
  const res = await fetch(config.jupiterBaseUrl + '/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
    }),
  })
  if (!res.ok) throw new Error('Jupiter swap build failed: HTTP ' + res.status)
  const body = z.object({ swapTransaction: z.string() }).parse(await res.json())
  return body.swapTransaction
}
`

const WALLET_TS = `import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createKeyPairFromBytes, getAddressFromPublicKey, type Address } from '@solana/kit'
import { config } from './config.js'

export interface BotWallet {
  keyPair: CryptoKeyPair
  address: Address
}

export async function loadWallet(): Promise<BotWallet> {
  const resolved = config.walletPath.startsWith('~')
    ? path.join(os.homedir(), config.walletPath.slice(1))
    : config.walletPath
  const secret = new Uint8Array(JSON.parse(fs.readFileSync(resolved, 'utf8')))
  const keyPair = await createKeyPairFromBytes(secret)
  const address = await getAddressFromPublicKey(keyPair.publicKey)
  return { keyPair, address }
}
`

const EXECUTOR_TS = `import {
  createSolanaRpc,
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  signTransaction,
} from '@solana/kit'
import { config } from './config.js'
import { fetchSwapTransaction, type JupiterQuote } from './jupiter.js'
import type { BotWallet } from './wallet.js'

const rpc = createSolanaRpc(config.rpcUrl)

export async function executeSwap(quote: JupiterQuote, wallet: BotWallet): Promise<string> {
  const swapTransactionB64 = await fetchSwapTransaction(quote, wallet.address)
  const txBytes = getBase64Encoder().encode(swapTransactionB64)
  const tx = getTransactionDecoder().decode(txBytes)
  const signed = await signTransaction([wallet.keyPair], tx)
  const wire = getBase64EncodedWireTransaction(signed)
  return await rpc.sendTransaction(wire, { encoding: 'base64' }).send()
}
`

const POSITIONS_TS = `import fs from 'node:fs'

export interface PositionRecord {
  timestamp: number
  side: 'buy' | 'sell'
  inAmount: string
  outAmount: string
  price: number
  signature: string | null
}

const POSITIONS_FILE = 'positions.json'

export function loadPositions(): PositionRecord[] {
  try {
    return JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8')) as PositionRecord[]
  } catch {
    return []
  }
}

export function recordPosition(position: PositionRecord): void {
  const all = loadPositions()
  all.push(position)
  fs.writeFileSync(POSITIONS_FILE, JSON.stringify(all, null, 2))
}

/**
 * Raw-unit accounting: buys accumulate output-token units against input-token
 * cost; sells unwind them. Values are in raw mint units (no decimal scaling),
 * so PnL is directional rather than display-ready.
 */
export function portfolioSummary(positions: PositionRecord[], currentPrice: number) {
  let heldOutputUnits = 0
  let spentInputUnits = 0
  for (const position of positions) {
    if (position.side === 'buy') {
      heldOutputUnits += Number(position.outAmount)
      spentInputUnits += Number(position.inAmount)
    } else {
      heldOutputUnits -= Number(position.inAmount)
      spentInputUnits -= Number(position.outAmount)
    }
  }
  const markValueInputUnits = currentPrice > 0 ? heldOutputUnits / currentPrice : 0
  return {
    trades: positions.length,
    heldOutputUnits,
    spentInputUnits,
    unrealizedPnlInputUnits: markValueInputUnits - spentInputUnits,
  }
}
`

const STRATEGY_TS = `export interface StrategyContext {
  /** Latest output-per-input price from the Jupiter quote. */
  price: number
  /** Rolling price history, oldest first. */
  history: number[]
}

export interface StrategySignal {
  action: 'hold' | 'buy' | 'sell'
  reason: string
}

const WINDOW = 10
const BAND = Number(process.env.DIP_THRESHOLD ?? '0.02')

/**
 * Example mean-reversion band: buy when price drops BAND below the rolling
 * average, sell when it rises BAND above. Replace this with your own signal
 * logic — the rest of the bot only depends on the StrategySignal shape.
 */
export function evaluateStrategy({ price, history }: StrategyContext): StrategySignal {
  if (history.length < WINDOW) {
    return { action: 'hold', reason: 'warming up: ' + history.length + '/' + WINDOW + ' samples' }
  }
  const window = history.slice(-WINDOW)
  const average = window.reduce((sum, value) => sum + value, 0) / window.length
  const deviation = (price - average) / average
  if (deviation <= -BAND) {
    return { action: 'buy', reason: 'price ' + (deviation * 100).toFixed(2) + '% below rolling average' }
  }
  if (deviation >= BAND) {
    return { action: 'sell', reason: 'price ' + (deviation * 100).toFixed(2) + '% above rolling average' }
  }
  return { action: 'hold', reason: 'price within ±' + BAND * 100 + '% band' }
}
`

const INDEX_TS = `import { config } from './config.js'
import { logger } from './logger.js'
import { executeSwap } from './executor.js'
import { fetchQuote } from './jupiter.js'
import { loadPositions, portfolioSummary, recordPosition } from './positions.js'
import { evaluateStrategy, type StrategySignal } from './strategy.js'
import { loadWallet, type BotWallet } from './wallet.js'

const history: number[] = []
const MAX_HISTORY = 120
let stopping = false

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function quoteForSignal(signal: StrategySignal, price: number) {
  if (signal.action === 'buy') {
    return fetchQuote(config.inputMint, config.outputMint, config.tradeAmount)
  }
  // Sell unwinds roughly the same notional, converted at the current price.
  const sellAmount = BigInt(Math.max(1, Math.floor(Number(config.tradeAmount) * price)))
  return fetchQuote(config.outputMint, config.inputMint, sellAmount)
}

async function tick(wallet: BotWallet | null): Promise<void> {
  const monitorQuote = await fetchQuote(config.inputMint, config.outputMint, config.tradeAmount)
  const price = Number(monitorQuote.outAmount) / Number(monitorQuote.inAmount)
  history.push(price)
  if (history.length > MAX_HISTORY) history.shift()

  const signal = evaluateStrategy({ price, history })
  logger.info({ price, action: signal.action, reason: signal.reason }, 'tick')
  if (signal.action === 'hold') return

  const quote = signal.action === 'buy' ? monitorQuote : await quoteForSignal(signal, price)

  if (config.dryRun) {
    logger.warn({ action: signal.action, inAmount: quote.inAmount, outAmount: quote.outAmount }, 'DRY_RUN active — trade logged, not sent. Set DRY_RUN=false to trade for real.')
    recordPosition({ timestamp: Date.now(), side: signal.action, inAmount: quote.inAmount, outAmount: quote.outAmount, price, signature: null })
    return
  }

  if (!wallet) throw new Error('Wallet not loaded — cannot execute live trade')
  const signature = await executeSwap(quote, wallet)
  logger.info({ signature, action: signal.action }, 'swap sent')
  recordPosition({ timestamp: Date.now(), side: signal.action, inAmount: quote.inAmount, outAmount: quote.outAmount, price, signature })
  logger.info(portfolioSummary(loadPositions(), price), 'portfolio')
}

async function main(): Promise<void> {
  const wallet = config.dryRun ? null : await loadWallet()
  logger.info(
    {
      dryRun: config.dryRun,
      pair: config.inputMint + ' -> ' + config.outputMint,
      tradeAmount: config.tradeAmount.toString(),
      intervalMs: config.checkIntervalMs,
      wallet: wallet?.address ?? 'not loaded (dry run)',
    },
    'trading bot started',
  )
  while (!stopping) {
    try {
      await tick(wallet)
    } catch (err) {
      logger.error({ err }, 'tick failed')
    }
    await sleep(config.checkIntervalMs)
  }
}

process.on('SIGINT', () => { stopping = true; logger.warn('shutdown requested') })
process.on('SIGTERM', () => { stopping = true; logger.warn('shutdown requested') })

main().catch((err) => {
  logger.error({ err }, 'fatal startup error')
  process.exit(1)
})
`

export function tradingBotFiles(): ScaffoldFile[] {
  return [
    { path: 'src/config.ts', content: CONFIG_TS },
    { path: 'src/logger.ts', content: LOGGER_TS },
    { path: 'src/jupiter.ts', content: JUPITER_TS },
    { path: 'src/wallet.ts', content: WALLET_TS },
    { path: 'src/executor.ts', content: EXECUTOR_TS },
    { path: 'src/positions.ts', content: POSITIONS_TS },
    { path: 'src/strategy.ts', content: STRATEGY_TS },
    { path: 'src/index.ts', content: INDEX_TS },
  ]
}
