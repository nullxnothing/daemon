import crypto from 'node:crypto'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { config } from '../config.js'
import type { HolderStatus } from '../types.js'

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

interface ParsedTokenAmount {
  uiAmount?: number | null
  uiAmountString?: string
}

interface ParsedTokenAccount {
  account: {
    data: {
      parsed?: {
        info?: {
          tokenAmount?: ParsedTokenAmount
        }
      }
    }
  }
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(config.holderRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method,
      params,
    }),
  })
  if (!res.ok) {
    throw new Error(`Holder RPC returned HTTP ${res.status}`)
  }
  const body = await res.json() as { error?: { message?: string }; result?: T }
  if (body.error) {
    throw new Error(body.error.message ?? `Holder RPC method failed: ${method}`)
  }
  if (body.result === undefined) {
    throw new Error(`Holder RPC returned no result for ${method}`)
  }
  return body.result
}

export async function getHolderStatus(wallet: string): Promise<HolderStatus> {
  if (!config.holderMint || config.holderMinAmount <= 0) {
    return {
      enabled: false,
      eligible: false,
      mint: null,
      minAmount: null,
      currentAmount: null,
      symbol: 'DAEMON',
    }
  }

  const result = await rpc<{ value: ParsedTokenAccount[] }>('getTokenAccountsByOwner', [
    wallet,
    { mint: config.holderMint },
    { encoding: 'jsonParsed', commitment: 'confirmed' },
  ])

  const currentAmount = result.value.reduce((sum, account) => {
    const tokenAmount = account.account.data.parsed?.info?.tokenAmount
    if (typeof tokenAmount?.uiAmount === 'number') return sum + tokenAmount.uiAmount
    if (tokenAmount?.uiAmountString) return sum + Number(tokenAmount.uiAmountString)
    return sum
  }, 0)

  return {
    enabled: true,
    eligible: currentAmount >= config.holderMinAmount,
    mint: config.holderMint,
    minAmount: config.holderMinAmount,
    currentAmount,
    symbol: 'DAEMON',
  }
}

export function buildHolderClaimMessage(wallet: string, nonce: string): string {
  return `Claim DAEMON Pro holder access\nwallet:${wallet}\nnonce:${nonce}\nmint:${config.holderMint}\nminAmount:${config.holderMinAmount}`
}

export function verifyHolderClaimSignature(params: {
  wallet: string
  nonce: string
  signature: string
}): boolean {
  try {
    const message = Buffer.from(buildHolderClaimMessage(params.wallet, params.nonce), 'utf8')
    const publicKey = bs58.decode(params.wallet)
    const signature = bs58.decode(params.signature)
    return nacl.sign.detached.verify(message, signature, publicKey)
  } catch {
    return false
  }
}
