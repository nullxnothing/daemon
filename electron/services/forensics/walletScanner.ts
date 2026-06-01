import type {
  ForensicsExpandInput,
  ForensicsExpandResult,
  ForensicsGraphData,
  ForensicsGraphLink,
  ForensicsGraphNode,
  ForensicsHolderPollResult,
  ForensicsScanInput,
  ForensicsScanResult,
} from '../../shared/types'
import { isValidSolanaAddress, shouldFilterAddress } from './address'
import { batchIdentifyWallets, getTokenAccounts, getWalletTransfers } from './heliusClient'
import { applyIdentity, createLink, createNode } from './graph'

const SOL_MINT = 'So11111111111111111111111111111111111111112'

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

export async function scanWallet(input: ForensicsScanInput): Promise<ForensicsScanResult> {
  const maxDepth = clampInt(input.maxDepth, 1, 1, 3)
  const maxNodesPerLevel = clampInt(input.maxNodesPerLevel, 10, 3, 25)
  const data = await traceFundingChain(input.address, maxDepth, maxNodesPerLevel, new Set())
  return {
    mode: 'wallet',
    data,
    stats: { nodesFound: data.nodes.length, linksFound: data.links.length, scanDepth: maxDepth },
  }
}

async function traceFundingChain(target: string, maxDepth: number, maxNodesPerLevel: number, seen: Set<string>): Promise<ForensicsGraphData> {
  const nodes: ForensicsGraphNode[] = [createNode(target, 0, 'target')]
  const links: ForensicsGraphLink[] = []
  const queue: Array<{ wallet: string; depth: number }> = [{ wallet: target, depth: 0 }]
  seen.add(target)

  while (queue.length) {
    const { wallet, depth } = queue.shift()!
    if (depth >= maxDepth) continue
    const transfers = await getWalletTransfers(wallet, 100)
    const incoming = groupTransfers(transfers.filter((tx) => tx.direction === 'in' && tx.mint === SOL_MINT && tx.amount >= 0.01))
      .slice(0, maxNodesPerLevel)

    for (const [funder, info] of incoming) {
      links.push(createLink(funder, wallet, info.total, info.signature))
      if (seen.has(funder) || shouldFilterAddress(funder)) continue
      seen.add(funder)
      nodes.push(createNode(funder, depth + 1, 'funder', info.total))
      queue.push({ wallet: funder, depth: depth + 1 })
    }
  }

  const identities = await batchIdentifyWallets(nodes.map((node) => node.id))
  return { nodes: nodes.map((node) => applyIdentity(node, identities.get(node.id))), links }
}

function groupTransfers(transfers: Array<{ counterparty: string; amount: number; signature: string }>) {
  const grouped = new Map<string, { total: number; signature: string }>()
  for (const transfer of transfers) {
    if (shouldFilterAddress(transfer.counterparty)) continue
    const existing = grouped.get(transfer.counterparty)
    grouped.set(transfer.counterparty, {
      total: (existing?.total ?? 0) + transfer.amount,
      signature: existing?.signature ?? transfer.signature,
    })
  }
  return [...grouped.entries()].sort((a, b) => b[1].total - a[1].total)
}

export async function expandNode(input: ForensicsExpandInput): Promise<ForensicsExpandResult> {
  if (!isValidSolanaAddress(input.wallet)) throw new Error('Invalid wallet address')
  const existing = new Set(input.existingNodes)
  const transfers = await getWalletTransfers(input.wallet, 100)
  const direction = input.mode === 'funding' ? 'in' : 'out'
  const grouped = groupTransfers(transfers.filter((tx) => tx.direction === direction && tx.mint === SOL_MINT && tx.amount >= 0.01)).slice(0, 15)
  const newNodes = grouped
    .filter(([address]) => !existing.has(address))
    .map(([address, info]) => createNode(address, 0, input.mode === 'funding' ? 'funder' : 'funded', info.total))
  const identities = await batchIdentifyWallets(newNodes.map((node) => node.id))

  return {
    newNodes: newNodes.map((node) => applyIdentity(node, identities.get(node.id))),
    newLinks: grouped.map(([address, info]) =>
      input.mode === 'funding'
        ? createLink(address, input.wallet, info.total, info.signature)
        : createLink(input.wallet, address, info.total, info.signature)
    ),
  }
}

export async function pollHolders(mint: string): Promise<ForensicsHolderPollResult> {
  if (!isValidSolanaAddress(mint)) throw new Error('Invalid mint address')
  const holders = (await getTokenAccounts(mint, 1))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 30)
    .map((holder) => ({ owner: holder.owner, amount: holder.amount }))
  return { holders, timestamp: Date.now() }
}
