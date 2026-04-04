// Portable validation helpers shared between desktop and mobile.

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function isValidSolanaAddress(address: string): boolean {
  return SOLANA_ADDRESS_REGEX.test(address)
}

export function isValidAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0
}

export function isValidSOLAmount(amountSol: number): boolean {
  return isValidAmount(amountSol) && amountSol <= 1_000_000
}

export function sanitizeString(input: string, maxLength = 256): string {
  return input.trim().slice(0, maxLength)
}

export function resolveModelName(shorthand: string): string {
  const modelMap: Record<string, string> = {
    haiku: 'claude-haiku-4-5-20251001',
    sonnet: 'claude-sonnet-4-20250514',
    opus: 'claude-opus-4-20250514',
  }
  return modelMap[shorthand] ?? shorthand
}
