/**
 * Read-only JSON-RPC client for Robinhood Chain (EVM / Arbitrum Orbit L2).
 * Talks to the public rate-limited endpoints — fine for ARIA's ad-hoc reads,
 * not for indexing. No signing, no key material, no writes.
 */
import { getRhNetwork, type RhNetworkId } from './aria/knowledge/robinhoodChain'

const RPC_TIMEOUT_MS = 10_000
const WEI_PER_ETH = 10n ** 18n

/** Well-known ERC-20 function selectors (stable ABI constants). */
const SELECTOR = {
  name: '0x06fdde03',
  symbol: '0x95d89b41',
  decimals: '0x313ce567',
  totalSupply: '0x18160ddd',
  balanceOf: '0x70a08231',
} as const

export function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value)
}

export function isTxHash(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value)
}

interface JsonRpcResponse {
  result?: unknown
  error?: { code: number; message: string }
}

async function rpcCall(network: RhNetworkId, method: string, params: unknown[]): Promise<unknown> {
  const { rpcUrl, name } = getRhNetwork(network)
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${name} RPC HTTP ${response.status} for ${method}.`)
  const payload = (await response.json()) as JsonRpcResponse
  if (payload.error) throw new Error(`${name} RPC error for ${method}: ${payload.error.message}`)
  return payload.result
}

function hexToBigInt(value: unknown): bigint {
  if (typeof value !== 'string' || !value.startsWith('0x')) {
    throw new Error(`Expected hex quantity, got ${JSON.stringify(value)}.`)
  }
  return BigInt(value)
}

/** Format a wei quantity as a decimal string without float precision loss. */
export function formatUnits(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

/** Decode an ABI-encoded string return (offset + length + utf8 bytes). */
function decodeAbiString(hex: unknown): string {
  if (typeof hex !== 'string' || hex === '0x' || !hex.startsWith('0x')) return ''
  const data = hex.slice(2)
  if (data.length < 128) return ''
  const length = Number(BigInt(`0x${data.slice(64, 128)}`))
  const bytes = data.slice(128, 128 + length * 2)
  return Buffer.from(bytes, 'hex').toString('utf8')
}

async function erc20Call(network: RhNetworkId, token: string, data: string): Promise<unknown> {
  return rpcCall(network, 'eth_call', [{ to: token, data }, 'latest'])
}

export interface RhChainStatus {
  network: string
  chainId: number
  blockNumber: number
  gasPriceGwei: string
}

export async function getChainStatus(network: RhNetworkId): Promise<RhChainStatus> {
  const [chainIdHex, blockHex, gasHex] = await Promise.all([
    rpcCall(network, 'eth_chainId', []),
    rpcCall(network, 'eth_blockNumber', []),
    rpcCall(network, 'eth_gasPrice', []),
  ])
  return {
    network: getRhNetwork(network).name,
    chainId: Number(hexToBigInt(chainIdHex)),
    blockNumber: Number(hexToBigInt(blockHex)),
    gasPriceGwei: formatUnits(hexToBigInt(gasHex), 9),
  }
}

export interface RhBalance {
  address: string
  wei: string
  eth: string
}

export async function getBalance(network: RhNetworkId, address: string): Promise<RhBalance> {
  if (!isEvmAddress(address)) throw new Error(`"${address}" is not a valid 0x address.`)
  const wei = hexToBigInt(await rpcCall(network, 'eth_getBalance', [address, 'latest']))
  return { address, wei: wei.toString(), eth: formatUnits(wei, 18) }
}

export interface RhErc20Info {
  address: string
  name: string
  symbol: string
  decimals: number
  totalSupply: string
  holder?: { address: string; balance: string }
}

export async function getErc20Info(network: RhNetworkId, token: string, holder?: string): Promise<RhErc20Info> {
  if (!isEvmAddress(token)) throw new Error(`"${token}" is not a valid token address.`)
  if (holder !== undefined && !isEvmAddress(holder)) throw new Error(`"${holder}" is not a valid holder address.`)
  const [name, symbol, decimalsHex, supplyHex] = await Promise.all([
    erc20Call(network, token, SELECTOR.name),
    erc20Call(network, token, SELECTOR.symbol),
    erc20Call(network, token, SELECTOR.decimals),
    erc20Call(network, token, SELECTOR.totalSupply),
  ])
  const decimals = Number(hexToBigInt(decimalsHex))
  const info: RhErc20Info = {
    address: token,
    name: decodeAbiString(name),
    symbol: decodeAbiString(symbol),
    decimals,
    totalSupply: formatUnits(hexToBigInt(supplyHex), decimals),
  }
  if (holder) {
    const data = SELECTOR.balanceOf + holder.slice(2).toLowerCase().padStart(64, '0')
    const balance = hexToBigInt(await erc20Call(network, token, data))
    info.holder = { address: holder, balance: formatUnits(balance, decimals) }
  }
  return info
}

export interface RhTransaction {
  transaction: unknown
  receipt: unknown
}

export async function getTransaction(network: RhNetworkId, hash: string): Promise<RhTransaction> {
  if (!isTxHash(hash)) throw new Error(`"${hash}" is not a valid transaction hash.`)
  const [transaction, receipt] = await Promise.all([
    rpcCall(network, 'eth_getTransactionByHash', [hash]),
    rpcCall(network, 'eth_getTransactionReceipt', [hash]),
  ])
  if (transaction === null) throw new Error(`Transaction ${hash} not found on ${getRhNetwork(network).name}.`)
  return { transaction, receipt }
}
