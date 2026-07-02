/**
 * Hyperliquid (HypurrClaw CLI) ARIA tools: market/account reads, dry-run order
 * preview, and risk-gated trading (place / cancel / modify / leverage / transfer).
 *
 * Backed by HyperliquidCliService, which execFile's the `hyperliquid` binary with
 * a fixed argv — never a shell string. Sensitive (signing) tools are gated by the
 * central approval flow in AriaAgentService.executeTool; here we only mark
 * mainnet so the approval card is unmistakable.
 */
import * as Hl from '../../HyperliquidCliService'
import type { AriaTool } from '../AriaTool'
import type { CreateOrderInput, OrderSide, OrderType } from '../../HyperliquidCliService'

const INSTALL_HINT =
  'Hyperliquid CLI not found. Install it: curl -fsSLO https://raw.githubusercontent.com/hypurrclaw/hyperliquid-cli/main/install.sh && sh install.sh'

async function requireAvailable(): Promise<void> {
  if (!(await Hl.isAvailable())) throw new Error(INSTALL_HINT)
}

/** Mark sensitive summaries with the live network so approval is unambiguous. */
function netMark(summary: string): string {
  return Hl.isTestnet() ? `[HL-TESTNET] ${summary}` : `[HL-MAINNET] ${summary}`
}

const VALID_SIDES: readonly OrderSide[] = ['buy', 'sell']
const VALID_TYPES: readonly OrderType[] = ['limit', 'market', 'stop-loss', 'take-profit', 'stop-limit', 'take-limit']

function num(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

/** Parse + validate the order fields shared by preview and place. Fails fast. */
function parseOrderInput(input: Record<string, unknown>): CreateOrderInput {
  const coin = String(input.coin ?? '').trim()
  if (!coin) throw new Error('A coin is required (e.g. BTC).')

  const side = String(input.side ?? '') as OrderSide
  if (!VALID_SIDES.includes(side)) throw new Error('side must be "buy" or "sell".')

  const type = (String(input.type ?? 'limit') || 'limit') as OrderType
  if (!VALID_TYPES.includes(type)) throw new Error(`type must be one of: ${VALID_TYPES.join(', ')}.`)

  const size = num(input.size)
  const amount = num(input.amount)
  if (size === undefined && amount === undefined) throw new Error('Provide either size (coin units) or amount (USDC).')
  if (size !== undefined && amount !== undefined) throw new Error('Provide size OR amount, not both.')

  const price = num(input.price)
  if ((type === 'limit' || type === 'stop-limit' || type === 'take-limit') && price === undefined) {
    throw new Error(`A price is required for a ${type} order.`)
  }
  const triggerPrice = num(input.triggerPrice)
  if ((type === 'stop-loss' || type === 'take-profit' || type === 'stop-limit' || type === 'take-limit') && triggerPrice === undefined) {
    throw new Error(`A triggerPrice is required for a ${type} order.`)
  }

  return { coin, side, type, size, amount, price, triggerPrice, reduceOnly: Boolean(input.reduceOnly) }
}

function describeOrder(o: CreateOrderInput): string {
  const qty = o.size !== undefined ? `${o.size} ${o.coin}` : `$${o.amount} of ${o.coin}`
  const at = o.price !== undefined ? ` @ ${o.price}` : ''
  return `${o.side} ${qty} (${o.type})${at}`
}

export const hyperliquidTools: AriaTool[] = [
  // --- Reads (auto-run) ------------------------------------------------------
  {
    name: 'hl_market',
    description: 'Read Hyperliquid market data for a coin: order book, funding, or spread. action one of book|funding|spread|candles. Read-only.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin symbol, e.g. BTC.' },
        action: { type: 'string', enum: ['book', 'funding', 'spread', 'candles'] },
        interval: { type: 'string', description: 'Candle interval (candles action only), e.g. 1h.' },
        limit: { type: 'number' },
      },
      required: ['coin', 'action'],
    },
    async handler(input) {
      await requireAvailable()
      const coin = String(input.coin ?? '').trim()
      if (!coin) return { ok: false, summary: 'A coin is required.' }
      const action = String(input.action ?? '')
      let data: unknown
      switch (action) {
        case 'book': data = await Hl.book(coin); break
        case 'funding': data = await Hl.funding(coin); break
        case 'spread': data = await Hl.spread(coin); break
        case 'candles': data = await Hl.candles(coin, input.interval ? String(input.interval) : undefined, num(input.limit)); break
        default: return { ok: false, summary: `Unknown action "${action}".` }
      }
      return { ok: true, summary: `Hyperliquid ${action} for ${coin}.`, data }
    },
  },
  {
    name: 'hl_markets_list',
    description: 'List Hyperliquid markets: perps or spot. Read-only.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: { market: { type: 'string', enum: ['perps', 'spot'] } },
      required: ['market'],
    },
    async handler(input) {
      await requireAvailable()
      const market = String(input.market ?? '')
      const data = market === 'spot' ? await Hl.spotList() : await Hl.perpsList()
      return { ok: true, summary: `Listed Hyperliquid ${market} markets.`, data }
    },
  },
  {
    name: 'hl_account',
    description: 'Read a Hyperliquid account: portfolio, fees, or fills. Omit address to use the configured wallet. Read-only.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['portfolio', 'fees', 'fills'] },
        address: { type: 'string', description: 'Optional 0x address; defaults to the configured wallet.' },
      },
      required: ['action'],
    },
    async handler(input) {
      await requireAvailable()
      const action = String(input.action ?? '')
      const address = input.address ? String(input.address).trim() : undefined
      let data: unknown
      switch (action) {
        case 'portfolio': data = await Hl.accountPortfolio(address); break
        case 'fees': data = await Hl.accountFees(address); break
        case 'fills': data = await Hl.accountFills(address); break
        default: return { ok: false, summary: `Unknown action "${action}".` }
      }
      return { ok: true, summary: `Hyperliquid account ${action}.`, data }
    },
  },
  {
    name: 'hl_positions',
    description: 'List open Hyperliquid positions for the configured wallet. Read-only.',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: {} },
    async handler() {
      await requireAvailable()
      const data = await Hl.positionsList()
      return { ok: true, summary: 'Listed open Hyperliquid positions.', data }
    },
  },
  {
    name: 'hl_orders_open',
    description: 'List open Hyperliquid orders and recent order history. Read-only.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: { history: { type: 'boolean', description: 'Return order history instead of open orders.' } },
    },
    async handler(input) {
      await requireAvailable()
      const data = input.history ? await Hl.ordersHistory() : await Hl.ordersOpen()
      return { ok: true, summary: input.history ? 'Hyperliquid order history.' : 'Open Hyperliquid orders.', data }
    },
  },
  {
    name: 'hl_vaults',
    description: 'Discover Hyperliquid vaults: list, search by query, or get one by address. Read-only.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'search', 'get'] },
        query: { type: 'string', description: 'Search query (search action).' },
        address: { type: 'string', description: '0x vault address (get action).' },
        limit: { type: 'number' },
      },
      required: ['action'],
    },
    async handler(input) {
      await requireAvailable()
      const action = String(input.action ?? '')
      let data: unknown
      switch (action) {
        case 'list': data = await Hl.vaultList(num(input.limit), 'tvl'); break
        case 'search': {
          const query = String(input.query ?? '').trim()
          if (!query) return { ok: false, summary: 'A search query is required.' }
          data = await Hl.vaultSearch(query, num(input.limit)); break
        }
        case 'get': {
          const address = String(input.address ?? '').trim()
          if (!address) return { ok: false, summary: 'A vault address is required.' }
          data = await Hl.vaultGet(address); break
        }
        default: return { ok: false, summary: `Unknown action "${action}".` }
      }
      return { ok: true, summary: `Hyperliquid vault ${action}.`, data }
    },
  },
  {
    name: 'hl_preview_order',
    description: 'Preview a Hyperliquid order as a dry-run without sending it. Returns the signed-action preview. Use this before hl_place_order to show the user the exact trade. Read-only.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        coin: { type: 'string' },
        side: { type: 'string', enum: ['buy', 'sell'] },
        type: { type: 'string', enum: ['limit', 'market', 'stop-loss', 'take-profit', 'stop-limit', 'take-limit'] },
        size: { type: 'number', description: 'Size in coin units. Provide size OR amount.' },
        amount: { type: 'number', description: 'Notional in USDC. Provide size OR amount.' },
        price: { type: 'number' },
        triggerPrice: { type: 'number' },
        reduceOnly: { type: 'boolean' },
      },
      required: ['coin', 'side', 'type'],
    },
    async handler(input) {
      await requireAvailable()
      const order = parseOrderInput(input)
      const data = await Hl.previewOrder(order)
      return { ok: true, summary: `Dry-run: ${describeOrder(order)}.`, data }
    },
  },

  // --- Writes (sensitive — always gated for typed confirm) -------------------
  {
    name: 'hl_place_order',
    description: 'Place a LIVE Hyperliquid order (signs and submits). Prefer calling hl_preview_order first. Requires user approval.',
    kind: 'run',
    risk: 'sensitive',
    input: {
      type: 'object',
      properties: {
        coin: { type: 'string' },
        side: { type: 'string', enum: ['buy', 'sell'] },
        type: { type: 'string', enum: ['limit', 'market', 'stop-loss', 'take-profit', 'stop-limit', 'take-limit'] },
        size: { type: 'number', description: 'Size in coin units. Provide size OR amount.' },
        amount: { type: 'number', description: 'Notional in USDC. Provide size OR amount.' },
        price: { type: 'number' },
        triggerPrice: { type: 'number' },
        reduceOnly: { type: 'boolean' },
      },
      required: ['coin', 'side', 'type'],
    },
    async handler(input) {
      await requireAvailable()
      const order = parseOrderInput(input)
      const data = await Hl.createOrder(order)
      return { ok: true, summary: netMark(`Placed order: ${describeOrder(order)}.`), data }
    },
  },
  {
    name: 'hl_cancel_order',
    description: 'Cancel a Hyperliquid order by id or client order id, or cancel all (optionally for one coin). Requires user approval.',
    kind: 'run',
    risk: 'sensitive',
    input: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        cloid: { type: 'string' },
        coin: { type: 'string', description: 'Coin filter for cancel-all.' },
        all: { type: 'boolean', description: 'Cancel all open orders.' },
      },
    },
    async handler(input) {
      await requireAvailable()
      const all = Boolean(input.all)
      const orderId = input.orderId ? String(input.orderId) : undefined
      const cloid = input.cloid ? String(input.cloid) : undefined
      const coin = input.coin ? String(input.coin) : undefined
      if (!all && !orderId && !cloid) return { ok: false, summary: 'Provide orderId, cloid, or all:true.' }
      const data = await Hl.cancelOrder({ orderId, cloid, coin, all })
      const what = all ? (coin ? `all ${coin} orders` : 'all orders') : `order ${orderId ?? cloid}`
      return { ok: true, summary: netMark(`Cancelled ${what}.`), data }
    },
  },
  {
    name: 'hl_modify_order',
    description: 'Modify an existing Hyperliquid order price and/or size. Requires user approval.',
    kind: 'run',
    risk: 'sensitive',
    input: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        cloid: { type: 'string' },
        price: { type: 'number' },
        size: { type: 'number' },
      },
    },
    async handler(input) {
      await requireAvailable()
      const orderId = input.orderId ? String(input.orderId) : undefined
      const cloid = input.cloid ? String(input.cloid) : undefined
      if (!orderId && !cloid) return { ok: false, summary: 'Provide orderId or cloid.' }
      const price = num(input.price)
      const size = num(input.size)
      if (price === undefined && size === undefined) return { ok: false, summary: 'Provide a new price and/or size.' }
      const data = await Hl.modifyOrder({ orderId, cloid, price, size })
      return { ok: true, summary: netMark(`Modified order ${orderId ?? cloid}.`), data }
    },
  },
  {
    name: 'hl_update_leverage',
    // Sensitive, not write: it signs a live exchange action that alters liquidation risk on open
    // positions. As 'write' it would auto-run after a single plan approval (plan steps are free
    // text, not bound to the tools executed), so an innocuous plan could license a leverage change
    // with no per-call gate. Sensitive forces a typed confirmation every time.
    description: 'Update leverage for a Hyperliquid coin. No funds move but it signs a live exchange action and changes liquidation risk. Requires typed confirmation.',
    kind: 'run',
    risk: 'sensitive',
    input: {
      type: 'object',
      properties: {
        coin: { type: 'string' },
        leverage: { type: 'number' },
        isolated: { type: 'boolean' },
      },
      required: ['coin', 'leverage'],
    },
    async handler(input) {
      await requireAvailable()
      const coin = String(input.coin ?? '').trim()
      const leverage = num(input.leverage)
      if (!coin) return { ok: false, summary: 'A coin is required.' }
      if (leverage === undefined || leverage <= 0) return { ok: false, summary: 'A positive leverage value is required.' }
      const data = await Hl.updateLeverage(coin, leverage, Boolean(input.isolated))
      return { ok: true, summary: netMark(`Set ${coin} leverage to ${leverage}x.`), data }
    },
  },
  {
    name: 'hl_transfer',
    description: 'Move USDC between Hyperliquid spot and perp balances. direction is spot-to-perp or perp-to-spot. On-platform only (no withdrawals). Requires user approval.',
    kind: 'run',
    risk: 'sensitive',
    input: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['spot-to-perp', 'perp-to-spot'] },
        amount: { type: 'number', description: 'USDC amount.' },
      },
      required: ['direction', 'amount'],
    },
    async handler(input) {
      await requireAvailable()
      const direction = String(input.direction ?? '') as Hl.TransferDirection
      if (direction !== 'spot-to-perp' && direction !== 'perp-to-spot') {
        return { ok: false, summary: 'direction must be spot-to-perp or perp-to-spot.' }
      }
      const amount = num(input.amount)
      if (amount === undefined || amount <= 0) return { ok: false, summary: 'A positive USDC amount is required.' }
      const data = await Hl.transferInternal(direction, amount)
      return { ok: true, summary: netMark(`Transferred ${amount} USDC ${direction}.`), data }
    },
  },
]
