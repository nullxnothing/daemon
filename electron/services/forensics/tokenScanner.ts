import type {
  ForensicsGraphLink,
  ForensicsGraphNode,
  ForensicsScanInput,
  ForensicsScanResult,
} from '../../shared/types'
import { shouldFilterAddress } from './address'
import {
  batchIdentifyWallets,
  getAsset,
  getTokenAccounts,
  getTokenLaunchInfo,
  getTransactionsForAddress,
  getWalletFundedBy,
  type FunderInfo,
  type HeliusAsset,
  type HeliusTransaction,
} from './heliusClient'
import {
  applyIdentity,
  attachFundingSource,
  createLink,
  createNode,
  detectBundleClusters,
  findSniper,
  tokenMetadataFromAsset,
  tokenSecurityFromAsset,
  topFilteredHolders,
} from './graph'
import { persistBundleClusters } from './bundleStore'

const SNIPER_BLOCK_THRESHOLD = 10
const SNIPER_SECONDS_THRESHOLD = 60

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

async function boundedMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

export async function scanToken(input: ForensicsScanInput, knownAsset: HeliusAsset | null): Promise<ForensicsScanResult> {
  const topN = clampInt(input.topHolders, 20, 5, 50)
  const [asset, holders, launchInfo] = await Promise.all([
    knownAsset ? Promise.resolve(knownAsset) : getAsset(input.address),
    getTokenAccounts(input.address, 2),
    getTokenLaunchInfo(input.address),
  ])

  const tokenMetadata = tokenMetadataFromAsset(asset)
  const tokenSecurity = tokenSecurityFromAsset(asset)
  const filtered = topFilteredHolders(holders, input.address, topN)
  const holderAddresses = filtered.holders.map((holder) => holder.owner)
  const holderSet = new Set(holderAddresses)
  const totalAmount = holders.reduce((sum, holder) => sum + holder.amount, 0)

  const [fundingResults, identities, txEntries] = await Promise.all([
    boundedMap(filtered.holders, 4, async (holder) => ({
      owner: holder.owner,
      funder: await getWalletFundedBy(holder.owner).catch(() => null),
    })),
    batchIdentifyWallets(holderAddresses),
    boundedMap(holderAddresses, 4, async (address) => [address, await getTransactionsForAddress(address, 12).catch(() => [])] as const),
  ])

  const earlyTxs = new Map<string, HeliusTransaction[]>(txEntries)
  const { funderMap, funderAmounts, funderInfo } = mapFunders(fundingResults)
  const { sniperWallets, sniperData } = detectSnipers(holderAddresses, earlyTxs, input.address, launchInfo)
  const bundleClusters = detectBundleClusters(earlyTxs, {
    mint: input.address,
    tokenName: tokenMetadata?.name,
    tokenSymbol: tokenMetadata?.symbol,
    funderMap,
  })
  persistBundleClusters(bundleClusters)

  const bundledWallets = new Set(bundleClusters.flatMap((cluster) => cluster.wallets))
  const funderIdentities = await batchIdentifyWallets([...funderMap.keys()])
  const nodes: ForensicsGraphNode[] = [createNode(input.address, 0, 'token', totalAmount)]
  const links: ForensicsGraphLink[] = []
  const nodeIds = new Set(nodes.map((node) => node.id))

  for (const holder of filtered.holders) {
    const funder = fundingResults.find((entry) => entry.owner === holder.owner)?.funder
    const type = sniperData.has(holder.owner) ? 'sniper' : bundledWallets.has(holder.owner) ? 'bundled' : 'holder'
    let node = applyIdentity(createNode(holder.owner, 1, type, holder.amount), identities.get(holder.owner))
    if (funder) node = attachFundingSource(node, funder, funderIdentities.get(funder.address))
    if (sniperData.has(holder.owner)) node.metadata = { ...node.metadata, suspicious: true, isSniper: true, blocksAfterLaunch: sniperData.get(holder.owner)?.blocksAfterLaunch }
    if (bundledWallets.has(holder.owner)) node.metadata = { ...node.metadata, suspicious: true, isBundled: true }
    nodes.push(node)
    nodeIds.add(holder.owner)
  }

  const { suspiciousWallets, cabalConnectionsFound } = addFunderNodes(nodes, links, nodeIds, funderMap, funderAmounts, funderInfo, funderIdentities)
  markSharedFunderGroups(nodes, funderMap)
  addBundleLinks(links, bundleClusters, holderSet)

  return {
    mode: 'token',
    data: { nodes, links },
    stats: {
      rawHolderCount: holders.length,
      totalHolders: holders.length - filtered.filteredOut,
      filteredOut: filtered.filteredOut,
      analyzedHolders: filtered.holders.length,
      analysisIncomplete: false,
      cabalConnectionsFound,
      suspiciousWallets,
      snipersDetected: sniperWallets.length,
      sniperWallets,
      bundleClustersDetected: bundleClusters.length,
      bundledWallets: [...bundledWallets],
      nodesFound: nodes.length,
      linksFound: links.length,
    },
    tokenSecurity,
    tokenMetadata,
  }
}

function mapFunders(fundingResults: Array<{ owner: string; funder: FunderInfo | null }>) {
  const funderMap = new Map<string, string[]>()
  const funderAmounts = new Map<string, number>()
  const funderInfo = new Map<string, FunderInfo>()

  for (const { owner, funder } of fundingResults) {
    if (!funder || shouldFilterAddress(funder.address) || funder.address === owner) continue
    const funded = funderMap.get(funder.address) ?? []
    if (!funded.includes(owner)) funded.push(owner)
    funderMap.set(funder.address, funded)
    funderAmounts.set(funder.address, (funderAmounts.get(funder.address) ?? 0) + funder.amount)
    funderInfo.set(funder.address, funder)
  }

  return { funderMap, funderAmounts, funderInfo }
}

function detectSnipers(
  holderAddresses: string[],
  earlyTxs: Map<string, HeliusTransaction[]>,
  mint: string,
  launchInfo: { mintTimestamp: number; mintSlot: number } | null,
) {
  const sniperWallets: string[] = []
  const sniperData = new Map<string, { blocksAfterLaunch: number; secondsAfterLaunch: number }>()
  if (!launchInfo?.mintTimestamp) return { sniperWallets, sniperData }

  for (const wallet of holderAddresses) {
    const found = findSniper(earlyTxs.get(wallet) ?? [], wallet, mint, launchInfo.mintSlot, launchInfo.mintTimestamp)
    if (!found || found.blocksAfterLaunch > SNIPER_BLOCK_THRESHOLD || found.secondsAfterLaunch > SNIPER_SECONDS_THRESHOLD) continue
    sniperWallets.push(wallet)
    sniperData.set(wallet, found)
  }
  return { sniperWallets, sniperData }
}

function addFunderNodes(
  nodes: ForensicsGraphNode[],
  links: ForensicsGraphLink[],
  nodeIds: Set<string>,
  funderMap: Map<string, string[]>,
  funderAmounts: Map<string, number>,
  funderInfo: Map<string, FunderInfo>,
  funderIdentities: Awaited<ReturnType<typeof batchIdentifyWallets>>,
) {
  const suspiciousWallets: string[] = []
  let cabalConnectionsFound = 0

  for (const [funder, fundedHolders] of funderMap) {
    const isShared = fundedHolders.length > 1
    if (isShared) {
      suspiciousWallets.push(funder)
      cabalConnectionsFound += fundedHolders.length
    }
    if (!nodeIds.has(funder)) {
      const node = applyIdentity(createNode(funder, 2, isShared ? 'cabal-funder' : 'funder', funderAmounts.get(funder) ?? 0), funderIdentities.get(funder))
      node.metadata = isShared ? { suspicious: true, fundedCount: fundedHolders.length, cabalConfidence: Math.min(100, 40 + fundedHolders.length * 12) } : undefined
      nodes.push(node)
      nodeIds.add(funder)
    }
    for (const holder of fundedHolders) {
      links.push(createLink(funder, holder, funderAmounts.get(funder) ?? 0, funderInfo.get(funder)?.txSignature, isShared))
    }
  }

  return { suspiciousWallets, cabalConnectionsFound }
}

function markSharedFunderGroups(nodes: ForensicsGraphNode[], funderMap: Map<string, string[]>): void {
  for (const [funder, fundedHolders] of funderMap) {
    if (fundedHolders.length < 2) continue
    const groupId = `cabal-${funder.slice(0, 6)}`
    for (const holder of fundedHolders) {
      const node = nodes.find((candidate) => candidate.id === holder)
      if (node?.type === 'holder') node.type = 'connected'
      if (node) node.metadata = { ...node.metadata, suspicious: true, sharedFunderGroup: groupId }
    }
  }
}

function addBundleLinks(links: ForensicsGraphLink[], bundleClusters: ReturnType<typeof detectBundleClusters>, holderSet: Set<string>): void {
  for (const cluster of bundleClusters) {
    for (let i = 0; i < cluster.wallets.length; i++) {
      for (let j = i + 1; j < cluster.wallets.length; j++) {
        if (holderSet.has(cluster.wallets[i]) && holderSet.has(cluster.wallets[j])) {
          links.push(createLink(cluster.wallets[i], cluster.wallets[j], 0, undefined, true))
        }
      }
    }
  }
}
