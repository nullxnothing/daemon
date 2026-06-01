import { getDb } from '../db/db'
import type { ForensicsScanInput, ForensicsScanResult } from '../shared/types'
import { isValidSolanaAddress } from './forensics/address'
import { getAsset, type HeliusAsset } from './forensics/heliusClient'
import { scanToken } from './forensics/tokenScanner'
import { scanWallet, expandNode, pollHolders } from './forensics/walletScanner'
import { exportBlacklistCsv, listBlacklist } from './forensics/bundleStore'

export { expandNode, pollHolders, exportBlacklistCsv, listBlacklist }

const CACHE_TTL_MS = 2 * 60 * 60 * 1000

interface ScanCacheRow {
  result_json: string
  expires_at: number
}

function cacheKey(input: ForensicsScanInput, mode: 'wallet' | 'token'): string {
  return `${mode}:${input.address}:${input.topHolders ?? ''}:${input.maxDepth ?? ''}:${input.maxNodesPerLevel ?? ''}`
}

function getCachedScan(key: string): ForensicsScanResult | null {
  const row = getDb().prepare('SELECT result_json, expires_at FROM forensic_scan_cache WHERE cache_key = ?').get(key) as ScanCacheRow | undefined
  if (!row || row.expires_at <= Date.now()) return null
  const parsed = JSON.parse(row.result_json) as ForensicsScanResult
  return { ...parsed, stats: { ...parsed.stats, cacheHit: true } }
}

function setCachedScan(key: string, address: string, mode: 'wallet' | 'token', result: ForensicsScanResult): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO forensic_scan_cache (cache_key, address, mode, result_json, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(key, address, mode, JSON.stringify(result), Date.now(), Date.now() + CACHE_TTL_MS)
}

function isTokenAsset(asset: HeliusAsset | null): boolean {
  return Boolean(asset && ['FungibleToken', 'FungibleAsset', 'V1_TOKEN'].includes(asset.interface ?? ''))
}

export async function scan(input: ForensicsScanInput): Promise<ForensicsScanResult> {
  const address = input.address?.trim()
  if (!address || !isValidSolanaAddress(address)) throw new Error('Invalid Solana address')

  const asset = await getAsset(address)
  const detectedMode = input.mode === 'wallet' || input.mode === 'token'
    ? input.mode
    : isTokenAsset(asset) ? 'token' : 'wallet'

  const key = cacheKey({ ...input, address }, detectedMode)
  if (!input.force) {
    const cached = getCachedScan(key)
    if (cached) return cached
  }

  const result = detectedMode === 'token'
    ? await scanToken({ ...input, address }, asset)
    : await scanWallet({ ...input, address })

  setCachedScan(key, address, detectedMode, result)
  return result
}
