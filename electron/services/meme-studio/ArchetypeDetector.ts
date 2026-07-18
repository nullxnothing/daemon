import fs from 'node:fs/promises'
import path from 'node:path'
import { registeredProjectRoot, safeProjectPath } from './projectBoundary'
import type { MemeTechEvidence, MemeTechProjectProfile } from './types'

const CANDIDATES = [
  'daemon.meme-tech.json', 'package.json', 'pnpm-workspace.yaml', 'Cargo.toml', 'Anchor.toml',
  'apps/game/package.json', 'apps/api/package.json', 'apps/web/package.json',
  'services/indexer/package.json', 'services/keeper/package.json',
]
const MAX_FILE_BYTES = 256 * 1024

async function readCandidate(root: string, relativePath: string): Promise<string | null> {
  const filePath = safeProjectPath(root, relativePath)
  const canonicalPath = await fs.realpath(filePath).catch(() => null)
  if (!canonicalPath) return null
  const canonicalRelative = path.relative(root, canonicalPath)
  if (canonicalRelative.startsWith('..') || path.isAbsolute(canonicalRelative)) return null
  const stats = await fs.stat(canonicalPath).catch(() => null)
  if (!stats?.isFile() || stats.size > MAX_FILE_BYTES) return null
  return fs.readFile(canonicalPath, 'utf8').catch(() => null)
}

function hasAny(content: string, terms: string[]): boolean {
  const lower = content.toLowerCase()
  return terms.some((term) => lower.includes(term))
}

function addEvidence(evidence: MemeTechEvidence[], code: string, file: string, detail: string): void {
  if (!evidence.some((item) => item.code === code)) evidence.push({ code, path: file, detail })
}

export async function detectMemeTechArchetype(projectPath: string): Promise<MemeTechProjectProfile> {
  const root = await registeredProjectRoot(projectPath)
  const files = new Map<string, string>()
  await Promise.all(CANDIDATES.map(async (candidate) => {
    const content = await readCandidate(root, candidate)
    if (content !== null) files.set(candidate, content)
  }))

  const evidence: MemeTechEvidence[] = []
  const topology = new Set<string>()
  const capabilities = new Set<string>()
  const tokenMints = new Set<string>()
  const clusterSources: Array<{ source: string; value: string }> = []
  let gameScore = 0
  let marketScore = 0
  let communityScore = 0
  let solanaScore = 0

  for (const [file, content] of files) {
    if (/\b(localnet|devnet|mainnet(?:-beta)?)\b/i.test(content)) {
      clusterSources.push({ source: file, value: content.match(/\b(localnet|devnet|mainnet(?:-beta)?)\b/i)?.[1] ?? 'unknown' })
    }
    if (file === 'daemon.meme-tech.json') continue
    if (hasAny(content, ['@coral-xyz/anchor', 'anchor-lang', '@solana/', 'solana-program'])) {
      solanaScore += 2
      capabilities.add('solana')
      addEvidence(evidence, 'solana-stack', file, 'Solana or Anchor dependency detected')
    }
    if (hasAny(content, ['phaser', 'pixi.js', 'babylonjs', 'game-server'])) {
      gameScore += 3
      topology.add('game-client')
      addEvidence(evidence, 'game-runtime', file, 'Browser game runtime detected')
    }
    if (hasAny(content, ['inventory', 'quest', 'leaderboard', 'marketplace'])) {
      gameScore += 2
      communityScore += 1
      capabilities.add('product-loop')
      addEvidence(evidence, 'game-economy', file, 'Persistent game or community economy vocabulary detected')
    }
    if (hasAny(content, ['indexer', 'backfill', 'checkpoint', 'websocket'])) {
      marketScore += 2
      topology.add('indexer')
      addEvidence(evidence, 'indexer', file, 'Indexer or stream recovery evidence detected')
    }
    if (hasAny(content, ['keeper', 'crank', 'oracle', 'perpetual', 'margin', 'liquidation'])) {
      marketScore += 3
      topology.add('keeper')
      addEvidence(evidence, 'market-runtime', file, 'Oracle, keeper, or risk runtime detected')
    }
    if (hasAny(content, ['token-2022', 'spl-token-2022'])) {
      marketScore += 2
      capabilities.add('token-2022')
      addEvidence(evidence, 'token-2022', file, 'Token-2022 dependency or configuration detected')
    }
    if (file.includes('apps/web')) topology.add('frontend')
    if (file.includes('apps/api')) topology.add('api')
  }

  const explicit = files.get('daemon.meme-tech.json')
  if (explicit) {
    try {
      const config = JSON.parse(explicit) as { archetype?: string; tokenMint?: string; tokenMints?: string[] }
      if (config.archetype === 'token-gated-game-economy' && gameScore >= 2) gameScore += 3
      if (config.archetype === 'permissionless-market-indexer' && marketScore >= 2) marketScore += 3
      const declaredMints = [config.tokenMint, ...(Array.isArray(config.tokenMints) ? config.tokenMints : [])]
      for (const mint of declaredMints) {
        if (typeof mint === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) tokenMints.add(mint)
      }
      addEvidence(evidence, 'studio-manifest', 'daemon.meme-tech.json', 'Explicit Meme Tech Studio manifest detected')
    } catch {
      addEvidence(evidence, 'invalid-studio-manifest', 'daemon.meme-tech.json', 'Studio manifest is not valid JSON')
    }
  }

  const strongest = Math.max(gameScore, marketScore, communityScore, solanaScore)
  const archetype = gameScore >= 5 && gameScore > marketScore
    ? 'token-gated-game-economy'
    : marketScore >= 5 && marketScore >= gameScore
      ? 'permissionless-market-indexer'
      : communityScore >= 2
        ? 'token-community-app'
        : solanaScore >= 2
          ? 'generic-solana-app'
          : 'unknown'
  const confidence = Math.min(0.96, strongest / 10)
  const gaps: MemeTechProjectProfile['gaps'] = []
  if (!topology.has('api') && archetype === 'token-gated-game-economy') gaps.push({ severity: 'blocker', code: 'missing-authority', detail: 'No authoritative API boundary was detected.', action: 'Add server-verified sessions and economy outcomes.' })
  if (archetype === 'permissionless-market-indexer' && !topology.has('indexer')) gaps.push({ severity: 'blocker', code: 'missing-indexer', detail: 'No durable indexer was detected.', action: 'Add cursor persistence, reconciliation, and lag reporting.' })
  if (!files.has('daemon.meme-tech.json')) gaps.push({ severity: 'info', code: 'missing-manifest', detail: 'Project intent is inferred.', action: 'Add daemon.meme-tech.json to make architecture claims explicit.' })
  if (clusterSources.some((source) => source.value.startsWith('mainnet'))) gaps.push({ severity: 'warning', code: 'mainnet-config', detail: 'Mainnet appears in project configuration.', action: 'Use localnet or devnet for Studio proof workflows.' })

  return {
    archetype,
    confidence,
    evidence,
    topology: [...topology],
    capabilities: [...capabilities],
    gaps,
    tokenMints: [...tokenMints].slice(0, 12),
    clusterSources,
    inspectedAt: Date.now(),
  }
}
