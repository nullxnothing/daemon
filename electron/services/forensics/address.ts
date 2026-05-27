import { PublicKey } from '@solana/web3.js'

const FILTERED_ADDRESSES = new Set([
  '11111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'ComputeBudget111111111111111111111111111111',
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
  'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',
  'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX',
])

const LABELS = new Map<string, { name: string; category: string }>([
  ['5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9', { name: 'Binance', category: 'cex' }],
  ['H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS', { name: 'Coinbase', category: 'cex' }],
  ['FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5', { name: 'Kraken', category: 'cex' }],
  ['AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2', { name: 'Bybit', category: 'cex' }],
  ['Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb', { name: 'Jito Tips', category: 'protocol' }],
])

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address)
    return address.length >= 32 && address.length <= 44
  } catch {
    return false
  }
}

export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

export function shouldFilterAddress(address: string): boolean {
  return FILTERED_ADDRESSES.has(address)
}

export function labelForAddress(address: string): string | null {
  return LABELS.get(address)?.name ?? null
}
