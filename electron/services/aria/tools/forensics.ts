/**
 * Forensics (RicoMaps) ARIA tools: investigate a Solana token or wallet for
 * cabal funders, snipers, and bundle clusters, and trace funding chains.
 *
 * Backed by the in-process RicoMaps engine (RicoMapsService.scan / expandNode),
 * the same engine that powers the RicoMaps forensics panel. Read-only: these
 * tools query chain state via Helius and never sign or mutate, so they auto-run.
 *
 * Handlers return the compact stats + security verdict, not the full graph — the
 * node/link arrays are huge and meant for the canvas, not the model context.
 */
import * as RicoMapsService from '../../RicoMapsService'
import type { AriaTool } from '../AriaTool'
import type { ForensicsScanResult, ForensicsExpandInput } from '../../../shared/types'

function isAddress(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim())
}

/** Pull the model-relevant signal out of a scan result (drop the graph payload). */
function summarizeScan(result: ForensicsScanResult) {
  const s = result.stats
  return {
    mode: result.mode,
    cabalConnections: s.cabalConnectionsFound ?? 0,
    snipersDetected: s.snipersDetected ?? 0,
    bundleClusters: s.bundleClustersDetected ?? 0,
    suspiciousWallets: s.suspiciousWallets ?? [],
    sniperWallets: s.sniperWallets ?? [],
    bundledWallets: s.bundledWallets ?? [],
    totalHolders: s.totalHolders ?? null,
    analyzedHolders: s.analyzedHolders ?? null,
    analysisIncomplete: Boolean(s.analysisIncomplete),
    tokenSecurity: result.tokenSecurity ?? null,
    tokenMetadata: result.tokenMetadata
      ? { name: result.tokenMetadata.name, symbol: result.tokenMetadata.symbol }
      : null,
  }
}

/** A one-line verdict the model can lead its narration with. */
function verdict(result: ForensicsScanResult): string {
  const s = result.stats
  const flags: string[] = []
  if (s.cabalConnectionsFound) flags.push(`${s.cabalConnectionsFound} cabal connection(s)`)
  if (s.snipersDetected) flags.push(`${s.snipersDetected} sniper(s)`)
  if (s.bundleClustersDetected) flags.push(`${s.bundleClustersDetected} bundle cluster(s)`)
  const risk = result.tokenSecurity?.riskLevel
  if (risk && risk !== 'low') flags.push(`${risk} token-security risk`)
  return flags.length ? `Flags: ${flags.join(', ')}.` : 'No coordinated-actor flags detected.'
}

export const forensicsTools: AriaTool[] = [
  {
    name: 'forensic_scan_token',
    description: 'Run a RicoMaps forensic scan on a Solana token mint. Maps the top holders, traces who funded each, and detects cabal funders, snipers (first-block buyers), and bundle clusters. Also reports mint/freeze authority and a token-security risk level. Read-only.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        mint: { type: 'string', description: 'Solana token mint address.' },
        topHolders: { type: 'number', description: 'How many top holders to analyze (default 20).' },
      },
      required: ['mint'],
    },
    async handler(input) {
      const mint = String(input.mint ?? '').trim()
      if (!isAddress(mint)) return { ok: false, summary: 'A valid Solana token mint is required.' }
      const topHolders = typeof input.topHolders === 'number' && input.topHolders > 0 ? Math.floor(input.topHolders) : undefined
      const result = await RicoMapsService.scan({ address: mint, mode: 'token', topHolders })
      return { ok: true, summary: `Scanned token ${mint}. ${verdict(result)}`, data: summarizeScan(result) }
    },
  },
  {
    name: 'forensic_trace_wallet',
    description: 'Trace a Solana wallet backwards through its funding chain with RicoMaps to find who funded it and surface shared funders. Read-only.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        wallet: { type: 'string', description: 'Solana wallet address to trace.' },
        maxDepth: { type: 'number', description: 'How many funding hops to trace (default engine value).' },
      },
      required: ['wallet'],
    },
    async handler(input) {
      const wallet = String(input.wallet ?? '').trim()
      if (!isAddress(wallet)) return { ok: false, summary: 'A valid Solana wallet address is required.' }
      const maxDepth = typeof input.maxDepth === 'number' && input.maxDepth > 0 ? Math.floor(input.maxDepth) : undefined
      const result = await RicoMapsService.scan({ address: wallet, mode: 'wallet', maxDepth })
      return { ok: true, summary: `Traced wallet ${wallet}. ${verdict(result)}`, data: summarizeScan(result) }
    },
  },
  {
    name: 'forensic_expand_wallet',
    description: 'Expand one wallet node in a RicoMaps graph to reveal its funders or the wallets it funded. Use after a scan to drill into a flagged address. Read-only.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        wallet: { type: 'string', description: 'Wallet address to expand.' },
        mode: { type: 'string', enum: ['funding', 'funded'], description: 'Trace upstream funders or downstream recipients.' },
      },
      required: ['wallet'],
    },
    async handler(input) {
      const wallet = String(input.wallet ?? '').trim()
      if (!isAddress(wallet)) return { ok: false, summary: 'A valid wallet address is required.' }
      const mode = input.mode === 'funded' ? 'funded' : 'funding'
      const result = await RicoMapsService.expandNode({ wallet, mode, existingNodes: [] } as ForensicsExpandInput)
      const added = result.newNodes?.length ?? 0
      return {
        ok: true,
        summary: `Expanded ${wallet} (${mode}): ${added} connected wallet(s).`,
        data: { newNodes: result.newNodes, newLinks: result.newLinks },
      }
    },
  },
]
