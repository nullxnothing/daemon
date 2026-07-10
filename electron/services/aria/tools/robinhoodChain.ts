/**
 * Robinhood Chain ARIA tools — bundled docs knowledge, canonical network/token
 * constants, and live read-only JSON-RPC reads via RobinhoodChainService.
 *
 * Awareness only: every tool is risk 'read'. There is deliberately no signing,
 * transaction, or bridging tool here — Robinhood Chain money paths are out of
 * scope until they get the same guardrails as the Solana surfaces.
 */
import * as Rh from '../../RobinhoodChainService'
import {
  CHAINLINK_FEEDS_URL,
  ROBINHOOD_CHAIN_BRIDGE_URL,
  ROBINHOOD_CHAIN_DOCS_URL,
  ROBINHOOD_CHAIN_NETWORKS,
  ROBINHOOD_CHAIN_STATUS_URL,
  ROBINHOOD_CHAIN_TOKENS,
  type RhNetworkId,
} from '../knowledge/robinhoodChain'
import {
  getKnowledgeSection,
  ROBINHOOD_CHAIN_KNOWLEDGE,
  searchKnowledge,
} from '../knowledge/robinhoodChainDocs'
import type { AriaTool } from '../AriaTool'

const KNOWLEDGE_TOPICS = ROBINHOOD_CHAIN_KNOWLEDGE.map((s) => s.topic)

function parseNetwork(input: Record<string, unknown>): RhNetworkId {
  const value = String(input.network ?? 'mainnet')
  if (value !== 'mainnet' && value !== 'testnet') {
    throw new Error('network must be "mainnet" or "testnet".')
  }
  return value
}

export const robinhoodChainTools: AriaTool[] = [
  {
    name: 'rh_chain_info',
    description:
      'Robinhood Chain network constants: chain IDs, RPC/sequencer-feed/explorer URLs for mainnet and testnet, bridge and status links. Bundled reference, no network call. Read-only.',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: {} },
    async handler() {
      return {
        ok: true,
        summary: 'Robinhood Chain network reference.',
        data: {
          networks: ROBINHOOD_CHAIN_NETWORKS,
          docsUrl: ROBINHOOD_CHAIN_DOCS_URL,
          statusUrl: ROBINHOOD_CHAIN_STATUS_URL,
          canonicalBridgeUrl: ROBINHOOD_CHAIN_BRIDGE_URL,
          chainlinkFeedsUrl: CHAINLINK_FEEDS_URL,
        },
      }
    },
  },
  {
    name: 'rh_chain_knowledge',
    description:
      `Look up bundled Robinhood Chain documentation (synced from docs.robinhood.com/chain). Pass topic for one section (${KNOWLEDGE_TOPICS.join(', ')}), query for a keyword search, or neither to list all topics. Read-only.`,
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        topic: { type: 'string', enum: KNOWLEDGE_TOPICS, description: 'Exact section to fetch.' },
        query: { type: 'string', description: 'Keyword search across all sections.' },
      },
    },
    async handler(input) {
      const topic = input.topic ? String(input.topic) : ''
      if (topic) {
        const section = getKnowledgeSection(topic)
        if (!section) return { ok: false, summary: `Unknown topic "${topic}".` }
        return { ok: true, summary: `Robinhood Chain docs: ${section.title}.`, data: section }
      }
      const query = input.query ? String(input.query) : ''
      if (query) {
        const sections = searchKnowledge(query)
        if (sections.length === 0) return { ok: false, summary: `No Robinhood Chain docs match "${query}".` }
        return { ok: true, summary: `${sections.length} Robinhood Chain docs section(s) match "${query}".`, data: sections }
      }
      const index = ROBINHOOD_CHAIN_KNOWLEDGE.map(({ topic: t, title, summary }) => ({ topic: t, title, summary }))
      return { ok: true, summary: 'Robinhood Chain docs topics.', data: index }
    },
  },
  {
    name: 'rh_stock_tokens',
    description:
      'Canonical Robinhood Chain token registry (mainnet): WETH, USDG, stock tokens, and tokenized ETFs with contract addresses. Optionally filter by symbol or kind (core|stock|etf). A same-ticker token at a different address is NOT canonical. Read-only.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker filter, e.g. NVDA.' },
        kind: { type: 'string', enum: ['core', 'stock', 'etf'] },
      },
    },
    async handler(input) {
      const symbol = String(input.symbol ?? '').trim().toUpperCase()
      const kind = String(input.kind ?? '').trim()
      let tokens = ROBINHOOD_CHAIN_TOKENS
      if (symbol) tokens = tokens.filter((t) => t.symbol === symbol)
      if (kind) tokens = tokens.filter((t) => t.kind === kind)
      if (tokens.length === 0) {
        return { ok: false, summary: `No canonical Robinhood Chain token matches ${symbol || kind}.` }
      }
      return {
        ok: true,
        summary: `${tokens.length} canonical Robinhood Chain token(s). Registry synced 2026-07-10 — verify new listings against docs.robinhood.com/chain/contracts.`,
        data: tokens,
      }
    },
  },
  {
    name: 'rh_chain_rpc',
    description:
      'Live read-only Robinhood Chain RPC query via the public endpoint. action: status (chain id, block, gas price) | balance (ETH of address) | token (ERC-20 name/symbol/decimals/supply, plus holder balance when holder is set) | tx (transaction + receipt by txHash). Defaults to mainnet. Read-only, never signs or sends.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'balance', 'token', 'tx'] },
        network: { type: 'string', enum: ['mainnet', 'testnet'] },
        address: { type: 'string', description: '0x account address (balance action).' },
        token: { type: 'string', description: '0x token contract address (token action).' },
        holder: { type: 'string', description: 'Optional 0x holder for a token balance (token action).' },
        txHash: { type: 'string', description: '0x transaction hash (tx action).' },
      },
      required: ['action'],
    },
    async handler(input) {
      const network = parseNetwork(input)
      const action = String(input.action ?? '')
      switch (action) {
        case 'status': {
          const data = await Rh.getChainStatus(network)
          return { ok: true, summary: `${data.network} at block ${data.blockNumber}, gas ${data.gasPriceGwei} gwei.`, data }
        }
        case 'balance': {
          const address = String(input.address ?? '').trim()
          if (!address) return { ok: false, summary: 'An address is required for the balance action.' }
          const data = await Rh.getBalance(network, address)
          return { ok: true, summary: `${data.eth} ETH at ${address} (${network}).`, data }
        }
        case 'token': {
          const token = String(input.token ?? '').trim()
          if (!token) return { ok: false, summary: 'A token address is required for the token action.' }
          const holder = input.holder ? String(input.holder).trim() : undefined
          const data = await Rh.getErc20Info(network, token, holder)
          return { ok: true, summary: `${data.symbol || 'ERC-20'} (${data.name || token}) on ${network}.`, data }
        }
        case 'tx': {
          const txHash = String(input.txHash ?? '').trim()
          if (!txHash) return { ok: false, summary: 'A txHash is required for the tx action.' }
          const data = await Rh.getTransaction(network, txHash)
          return { ok: true, summary: `Transaction ${txHash} on ${network}.`, data }
        }
        default:
          return { ok: false, summary: `Unknown action "${action}".` }
      }
    },
  },
]
