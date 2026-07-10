import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  formatUnits,
  getBalance,
  getChainStatus,
  getErc20Info,
  getTransaction,
  isEvmAddress,
  isTxHash,
} from '../../electron/services/RobinhoodChainService'
import {
  getRhNetwork,
  ROBINHOOD_CHAIN_NETWORKS,
  ROBINHOOD_CHAIN_TOKENS,
} from '../../electron/services/aria/knowledge/robinhoodChain'
import {
  getKnowledgeSection,
  ROBINHOOD_CHAIN_KNOWLEDGE,
  searchKnowledge,
} from '../../electron/services/aria/knowledge/robinhoodChainDocs'
import { robinhoodChainTools } from '../../electron/services/aria/tools/robinhoodChain'

const NVDA = '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC'
const HOLDER = '0x1111111111111111111111111111111111111111'
const TX_HASH = `0x${'ab'.repeat(32)}`

const fetchMock = vi.fn()

function rpcResult(result: unknown) {
  return { ok: true, json: async () => ({ result }) } as Response
}

/** ABI-encode a string return value (offset + length + padded utf8). */
function abiString(value: string): string {
  const bytes = Buffer.from(value, 'utf8').toString('hex')
  const padded = bytes.padEnd(Math.ceil(bytes.length / 64) * 64, '0')
  const length = value.length.toString(16).padStart(64, '0')
  return `0x${'20'.padStart(64, '0')}${length}${padded}`
}

function toolByName(name: string) {
  const tool = robinhoodChainTools.find((t) => t.name === name)
  if (!tool) throw new Error(`Tool ${name} not registered`)
  return tool
}

const context = {
  sessionId: 'session-1',
  snapshot: {} as never,
  runUiEffect: vi.fn(),
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('robinhoodChain knowledge', () => {
  it('bundles all 17 docs sections with source URLs', () => {
    expect(ROBINHOOD_CHAIN_KNOWLEDGE).toHaveLength(17)
    for (const section of ROBINHOOD_CHAIN_KNOWLEDGE) {
      expect(section.sourceUrl).toMatch(/^https:\/\/docs\.robinhood\.com\/chain/)
      expect(section.details.length).toBeGreaterThan(50)
    }
  })

  it('exposes the network constants from the docs', () => {
    expect(getRhNetwork('mainnet')).toMatchObject({ chainId: 4663, gasToken: 'ETH' })
    expect(getRhNetwork('testnet')).toMatchObject({ chainId: 46630 })
    expect(ROBINHOOD_CHAIN_NETWORKS.map((n) => n.id)).toEqual(['mainnet', 'testnet'])
  })

  it('looks up sections by topic and by keyword', () => {
    expect(getKnowledgeSection('stock-tokens')?.details).toContain('ERC-8056')
    expect(getKnowledgeSection('nope')).toBeUndefined()
    const hits = searchKnowledge('uiMultiplier')
    expect(hits.map((s) => s.topic)).toContain('building-with-stock-tokens')
    expect(searchKnowledge('')).toEqual([])
  })

  it('keeps the canonical token registry well-formed', () => {
    for (const token of ROBINHOOD_CHAIN_TOKENS) {
      expect(isEvmAddress(token.address)).toBe(true)
      expect(['core', 'stock', 'etf']).toContain(token.kind)
    }
    expect(ROBINHOOD_CHAIN_TOKENS.find((t) => t.symbol === 'NVDA')?.address).toBe(NVDA)
  })
})

describe('robinhoodChain tools', () => {
  it('registers four read-only tools', () => {
    expect(robinhoodChainTools.map((t) => t.name)).toEqual([
      'rh_chain_info',
      'rh_chain_knowledge',
      'rh_stock_tokens',
      'rh_chain_rpc',
    ])
    for (const tool of robinhoodChainTools) {
      expect(tool.risk).toBe('read')
      expect(tool.kind).toBe('read')
    }
  })

  it('rh_chain_info returns the bundled network reference', async () => {
    const result = await toolByName('rh_chain_info').handler({}, context)
    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ networks: ROBINHOOD_CHAIN_NETWORKS })
  })

  it('rh_chain_knowledge serves topic, query, and index modes', async () => {
    const tool = toolByName('rh_chain_knowledge')
    const byTopic = await tool.handler({ topic: 'bridging' }, context)
    expect(byTopic.ok).toBe(true)
    expect((byTopic.data as { details: string }).details).toContain('7-day challenge period')

    const byQuery = await tool.handler({ query: 'sequencer uptime' }, context)
    expect(byQuery.ok).toBe(true)

    const index = await tool.handler({}, context)
    expect(index.ok).toBe(true)
    expect(index.data).toHaveLength(ROBINHOOD_CHAIN_KNOWLEDGE.length)

    const miss = await tool.handler({ query: 'zzz-no-such-thing' }, context)
    expect(miss.ok).toBe(false)
  })

  it('rh_stock_tokens filters by symbol and kind', async () => {
    const tool = toolByName('rh_stock_tokens')
    const nvda = await tool.handler({ symbol: 'nvda' }, context)
    expect(nvda.ok).toBe(true)
    expect(nvda.data).toEqual([{ symbol: 'NVDA', kind: 'stock', address: NVDA }])

    const etfs = await tool.handler({ kind: 'etf' }, context)
    expect(etfs.ok).toBe(true)
    expect((etfs.data as unknown[]).length).toBe(5)

    const miss = await tool.handler({ symbol: 'DOGE' }, context)
    expect(miss.ok).toBe(false)
  })

  it('rh_chain_rpc validates inputs before any network call', async () => {
    const tool = toolByName('rh_chain_rpc')
    expect((await tool.handler({ action: 'balance' }, context)).ok).toBe(false)
    expect((await tool.handler({ action: 'token' }, context)).ok).toBe(false)
    expect((await tool.handler({ action: 'tx' }, context)).ok).toBe(false)
    expect((await tool.handler({ action: 'nope' }, context)).ok).toBe(false)
    await expect(tool.handler({ action: 'status', network: 'devnet' }, context)).rejects.toThrow(
      'network must be "mainnet" or "testnet"',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rh_chain_rpc status reads chain id, block, and gas price', async () => {
    fetchMock
      .mockResolvedValueOnce(rpcResult('0x1237')) // eth_chainId → 4663
      .mockResolvedValueOnce(rpcResult('0x10'))
      .mockResolvedValueOnce(rpcResult('0x3b9aca00')) // 1 gwei
    const result = await toolByName('rh_chain_rpc').handler({ action: 'status' }, context)
    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ chainId: 4663, blockNumber: 16, gasPriceGwei: '1' })
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(firstCall[0]).toBe('https://rpc.mainnet.chain.robinhood.com')
  })
})

describe('RobinhoodChainService', () => {
  it('validates addresses and hashes', () => {
    expect(isEvmAddress(NVDA)).toBe(true)
    expect(isEvmAddress('0x123')).toBe(false)
    expect(isTxHash(TX_HASH)).toBe(true)
    expect(isTxHash(NVDA)).toBe(false)
  })

  it('formats units without float precision loss', () => {
    expect(formatUnits(10n ** 18n, 18)).toBe('1')
    expect(formatUnits(1500000000000000000n, 18)).toBe('1.5')
    expect(formatUnits(1n, 18)).toBe('0.000000000000000001')
    expect(formatUnits(0n, 18)).toBe('0')
  })

  it('getBalance rejects bad addresses and decodes wei', async () => {
    await expect(getBalance('mainnet', 'bogus')).rejects.toThrow('not a valid 0x address')
    fetchMock.mockResolvedValueOnce(rpcResult('0xde0b6b3a7640000')) // 1 ETH
    const balance = await getBalance('mainnet', HOLDER)
    expect(balance).toMatchObject({ eth: '1', wei: '1000000000000000000' })
  })

  it('getErc20Info decodes metadata and holder balance', async () => {
    fetchMock
      .mockResolvedValueOnce(rpcResult(abiString('NVIDIA Stock Token')))
      .mockResolvedValueOnce(rpcResult(abiString('NVDA')))
      .mockResolvedValueOnce(rpcResult(`0x${(18).toString(16).padStart(64, '0')}`))
      .mockResolvedValueOnce(rpcResult(`0x${(10n ** 18n * 5n).toString(16).padStart(64, '0')}`))
      .mockResolvedValueOnce(rpcResult(`0x${(10n ** 18n * 2n).toString(16).padStart(64, '0')}`))
    const info = await getErc20Info('mainnet', NVDA, HOLDER)
    expect(info).toMatchObject({
      name: 'NVIDIA Stock Token',
      symbol: 'NVDA',
      decimals: 18,
      totalSupply: '5',
      holder: { address: HOLDER, balance: '2' },
    })
    const balanceCall = JSON.parse((fetchMock.mock.calls[4] as [string, RequestInit])[1].body as string)
    expect(balanceCall.params[0].data).toBe(`0x70a08231${HOLDER.slice(2).padStart(64, '0')}`)
  })

  it('surfaces RPC errors and missing transactions', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ error: { code: -32000, message: 'rate limited' } }),
    } as Response)
    await expect(getChainStatus('testnet')).rejects.toThrow('rate limited')

    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce(rpcResult(null)).mockResolvedValueOnce(rpcResult(null))
    await expect(getTransaction('mainnet', TX_HASH)).rejects.toThrow('not found')
  })
})
