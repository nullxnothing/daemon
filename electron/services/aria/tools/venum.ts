/**
 * Venum execution-layer tools: live DEX prices and swap quotes (read-only).
 * Backed by the external Venum API via VenumService.
 */
import * as VenumService from '../../VenumService'
import type { AriaTool } from '../AriaTool'

function requireConfigured(): void {
  if (!VenumService.isConfigured()) {
    throw new Error('Venum API key not configured. Grab a free key at app.venum.dev and store it as VENUM_API_KEY in Settings.')
  }
}

export const venumTools: AriaTool[] = [
  {
    name: 'venum_get_price',
    description: 'Get the live DEX price for a tracked token symbol (e.g. SOL, USDC) via Venum. Returns best bid/ask, pool count, and 24h change.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: { token: { type: 'string' } },
      required: ['token'],
    },
    async handler(input) {
      requireConfigured()
      const price = await VenumService.getPrice(String(input.token ?? ''))
      return {
        ok: true,
        summary: `${price.token} is $${price.priceUsd} across ${price.poolCount ?? '?'} pool(s).`,
        data: price,
      }
    },
  },
  {
    name: 'venum_get_prices',
    description: 'Get live DEX prices for several tracked token symbols at once via Venum.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: { tokens: { type: 'array', items: { type: 'string' } } },
      required: ['tokens'],
    },
    async handler(input) {
      requireConfigured()
      const tokens = Array.isArray(input.tokens) ? (input.tokens as string[]).map(String) : []
      const batch = await VenumService.getPrices(tokens)
      const count = Object.keys(batch.prices ?? {}).length
      return { ok: true, summary: `Fetched prices for ${count} token(s).`, data: batch }
    },
  },
  {
    name: 'venum_get_quote',
    description: 'Get ranked swap routes across Solana DEXes via Venum. Provide inputMint and outputMint (base58 mint or tracked symbol), amount in smallest units, and optional slippageBps (default 100). Read-only: no transaction is built or sent.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        inputMint: { type: 'string' },
        outputMint: { type: 'string' },
        amount: { type: 'string' },
        slippageBps: { type: 'number' },
      },
      required: ['inputMint', 'outputMint', 'amount'],
    },
    async handler(input) {
      requireConfigured()
      const quote = await VenumService.getQuote({
        inputMint: String(input.inputMint ?? ''),
        outputMint: String(input.outputMint ?? ''),
        amount: String(input.amount ?? ''),
        slippageBps: typeof input.slippageBps === 'number' ? input.slippageBps : undefined,
      })
      const best = quote.bestRoute
      return {
        ok: true,
        summary: best
          ? `Best route via ${best.dex}: ${best.outputAmount} out (${best.priceImpactBps} bps impact, ${quote.routes.length} route(s) scanned).`
          : 'No route found for this pair.',
        data: quote,
      }
    },
  },
]
