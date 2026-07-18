/**
 * DAEMON Lite trading tools. Search + quote are read-only; swap_tokens is
 * `sensitive` so the typed-confirm ApprovalCard always gates it, even in an
 * approved plan. Execution reuses WalletService.executeSwap — the same
 * server-side price-impact and signer-guard path the IDE uses — so an
 * agent-initiated swap is gated identically to a UI-initiated one. A soft USD
 * ceiling caps a single Lite swap; larger trades belong in the full IDE.
 */
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import * as WalletService from '../../WalletService'
import { quoteExecutionFee } from '../../FeeService'
import { clusterMark } from './shared'
import type { AriaTool } from '../AriaTool'

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const MAX_SWAP_USD = 500

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address
}

async function defaultWalletId(): Promise<string | null> {
  const dashboard = await WalletService.getDashboard(null)
  return dashboard.activeWallet?.id ?? dashboard.wallets[0]?.id ?? null
}

export const liteTradeTools: AriaTool[] = [
  {
    name: 'token_search',
    description: 'Search Solana tokens by name, symbol, or mint. Read-only. Returns price, liquidity, holders, and safety flags.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
    async handler(input) {
      const query = String(input.query ?? '').trim()
      if (!query) return { ok: false, summary: 'A search query is required.' }
      const results = await WalletService.searchJupiterTokens(query)
      const top = results.slice(0, 8).map((t) => ({
        mint: t.mint, symbol: t.symbol, name: t.name, usdPrice: t.usdPrice,
        liquidity: t.liquidity, verified: t.verified, isSus: t.isSus,
      }))
      return { ok: true, summary: `${top.length} token${top.length === 1 ? '' : 's'} found.`, data: { tokens: top } }
    },
  },
  {
    name: 'token_quote',
    description: 'Get a Jupiter swap quote (read-only, no execution). Shows expected output, price impact, and route before the user decides to swap.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        inputMint: { type: 'string', description: 'Input token mint (use the SOL mint for SOL).' },
        outputMint: { type: 'string', description: 'Output token mint.' },
        amount: { type: 'number', description: 'Amount of the input token (UI units).' },
      },
      required: ['inputMint', 'outputMint', 'amount'],
    },
    async handler(input) {
      const inputMint = String(input.inputMint ?? '').trim()
      const outputMint = String(input.outputMint ?? '').trim()
      const amount = Number(input.amount ?? 0)
      if (!inputMint || !outputMint) return { ok: false, summary: 'Both input and output mints are required.' }
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, summary: 'Amount must be greater than 0.' }
      const walletId = await defaultWalletId()
      if (!walletId) return { ok: false, summary: 'No wallet available — add or create one first.' }
      const quote = await WalletService.getSwapQuote(walletId, inputMint, outputMint, amount, 50)
      return {
        ok: true,
        summary: `Quote: ${amount} → ${quote.outAmount} (impact ${quote.priceImpactPct}%).`,
        data: { outAmount: quote.outAmount, priceImpactPct: quote.priceImpactPct, route: quote.routePlan },
      }
    },
  },
  {
    name: 'swap_tokens',
    description: 'Swap one token for another via Jupiter from the default wallet. Requires explicit user approval. On mainnet this moves real money and the DAEMON execution fee applies. Single Lite swaps are capped at $500 — larger trades need the full DAEMON IDE.',
    kind: 'run',
    risk: 'sensitive',
    input: {
      type: 'object',
      properties: {
        inputMint: { type: 'string' },
        outputMint: { type: 'string' },
        amount: { type: 'number', description: 'Amount of the input token (UI units).' },
        slippageBps: { type: 'number', description: 'Slippage tolerance in basis points (default 50).' },
      },
      required: ['inputMint', 'outputMint', 'amount'],
    },
    feePreview(input) {
      // Only SOL-denominated legs carry the execution fee (SOL transfers).
      const inputMint = String(input.inputMint ?? '')
      const amount = Number(input.amount ?? 0)
      if (inputMint !== SOL_MINT || !Number.isFinite(amount) || amount <= 0) return null
      return quoteExecutionFee(Math.round(amount * LAMPORTS_PER_SOL))
    },
    async handler(input) {
      const inputMint = String(input.inputMint ?? '').trim()
      const outputMint = String(input.outputMint ?? '').trim()
      const amount = Number(input.amount ?? 0)
      const slippageBps = Number(input.slippageBps ?? 50)
      if (!inputMint || !outputMint) return { ok: false, summary: 'Both input and output mints are required.' }
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, summary: 'Amount must be greater than 0.' }

      const walletId = await defaultWalletId()
      if (!walletId) return { ok: false, summary: 'No signing wallet available — create one in the Wallet panel first.' }

      // Soft USD ceiling: price the input leg and refuse oversized Lite swaps.
      const quote = await WalletService.getSwapQuote(walletId, inputMint, outputMint, amount, slippageBps)
      const [priced] = await WalletService.searchJupiterTokens(inputMint)
      const inputUsd = priced?.usdPrice ? priced.usdPrice * amount : null
      if (inputUsd !== null && inputUsd > MAX_SWAP_USD) {
        return { ok: false, summary: `That swap is ~$${inputUsd.toFixed(0)}, over the $${MAX_SWAP_USD} Lite limit. Use the full DAEMON IDE for larger trades.` }
      }

      const result = await WalletService.executeSwap(walletId, inputMint, outputMint, amount, slippageBps, quote.rawQuoteResponse)
      return {
        ok: true,
        summary: clusterMark(`Swapped ${amount} ${shortAddress(inputMint)} → ${shortAddress(outputMint)}.`),
        data: { signature: result.signature, priceImpactPct: quote.priceImpactPct },
      }
    },
  },
]
