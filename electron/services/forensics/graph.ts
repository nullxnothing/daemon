import crypto from 'node:crypto'
import type {
  ForensicsBundleCluster,
  ForensicsGraphLink,
  ForensicsGraphNode,
  ForensicsNodeType,
} from '../../shared/types'
import type { FunderInfo, HeliusAsset, HeliusTransaction, TokenHolder, WalletIdentity } from './heliusClient'
import { labelForAddress, truncateAddress } from './address'

export const NODE_COLORS: Record<ForensicsNodeType, string> = {
  target: '#00ff41',
  funder: '#64b5f6',
  funded: '#8b8bff',
  connected: '#f59e0b',
  holder: '#1a7a3a',
  token: '#f59e0b',
  'cabal-funder': '#ff3366',
  sniper: '#00ffcc',
  bundled: '#c084fc',
}

export function createNode(address: string, depth: number, type: ForensicsNodeType, amount = 1): ForensicsGraphNode {
  const localLabel = labelForAddress(address)
  return {
    id: address,
    label: localLabel ?? truncateAddress(address),
    val: Math.max(5, Math.log10(Math.max(amount, 1) + 1) * 10),
    type,
    depth,
    tokenAmount: type === 'holder' || type === 'token' ? amount : undefined,
    solBalance: type !== 'holder' && type !== 'token' ? amount : undefined,
    expanded: false,
  }
}

export function createLink(source: string, target: string, value: number, txSignature?: string, suspicious?: boolean): ForensicsGraphLink {
  return { source, target, value, txSignature, suspicious }
}

export function applyIdentity(node: ForensicsGraphNode, identity?: WalletIdentity): ForensicsGraphNode {
  if (!identity) return node
  return {
    ...node,
    label: identity.name ?? node.label,
    identity: {
      name: identity.name,
      category: identity.category,
      type: identity.type,
      tags: identity.tags ?? [],
    },
  }
}

export function tokenMetadataFromAsset(asset: HeliusAsset | null) {
  if (!asset) return null
  return {
    name: asset.content?.metadata?.name,
    symbol: asset.content?.metadata?.symbol,
    image: asset.content?.links?.image ?? asset.content?.files?.find((file) => file.mime?.startsWith('image/'))?.cdn_uri,
    description: asset.content?.metadata?.description,
  }
}

export function tokenSecurityFromAsset(asset: HeliusAsset | null) {
  if (!asset) return null
  const freezeAuthority = asset.authorities?.find((authority) => authority.scopes.includes('freeze') || authority.scopes.includes('full'))
  const mintAuthority = asset.authorities?.find((authority) => authority.scopes.includes('mint') || authority.scopes.includes('full'))
  const riskFactors: string[] = []
  if (freezeAuthority) riskFactors.push('Freeze authority is active')
  if (mintAuthority) riskFactors.push('Mint authority is active')
  if (asset.mutable) riskFactors.push('Metadata is mutable')

  const riskLevel =
    freezeAuthority && mintAuthority ? 'critical'
      : freezeAuthority || mintAuthority ? 'high'
        : asset.mutable ? 'medium'
          : 'low'

  return {
    hasFreezeAuthority: Boolean(freezeAuthority),
    freezeAuthority: freezeAuthority?.address,
    hasMintAuthority: Boolean(mintAuthority),
    mintAuthority: mintAuthority?.address,
    isMutable: Boolean(asset.mutable),
    supply: asset.token_info?.supply,
    decimals: asset.token_info?.decimals,
    riskLevel,
    riskFactors,
  } as const
}

export function topFilteredHolders(holders: TokenHolder[], mint: string, topN: number): { holders: TokenHolder[]; filteredOut: number } {
  const active = holders.filter((holder) => holder.amount > 0 && holder.owner !== mint)
  const total = active.reduce((sum, holder) => sum + holder.amount, 0)
  const filtered = active.filter((holder) => total <= 0 || holder.amount / total <= 0.4)
  return {
    holders: filtered.sort((a, b) => b.amount - a.amount).slice(0, topN),
    filteredOut: holders.length - filtered.length,
  }
}

export function findSniper(
  transactions: HeliusTransaction[],
  wallet: string,
  mint: string,
  launchSlot: number,
  launchTimestamp: number,
): { blocksAfterLaunch: number; secondsAfterLaunch: number; signature: string } | null {
  for (const tx of transactions) {
    const tokenTransfer = tx.tokenTransfers?.find((transfer) =>
      transfer.mint === mint && transfer.toUserAccount === wallet && transfer.tokenAmount > 0
    )
    const accountChange = tx.accountData?.some((account) =>
      account.tokenBalanceChanges?.some((change) =>
        change.mint === mint && change.userAccount === wallet && Number(change.rawTokenAmount?.tokenAmount ?? 0) > 0
      )
    )
    const swapOutput = tx.events?.swap?.tokenOutputs?.some((output) => output.mint === mint)
    if (!tokenTransfer && !accountChange && !swapOutput) continue
    return {
      blocksAfterLaunch: tx.slot - launchSlot,
      secondsAfterLaunch: tx.timestamp - launchTimestamp,
      signature: tx.signature,
    }
  }
  return null
}

export function detectBundleClusters(
  holderTxMap: Map<string, HeliusTransaction[]>,
  options: { mint: string; tokenName?: string; tokenSymbol?: string; funderMap: Map<string, string[]> },
): ForensicsBundleCluster[] {
  const slotGroups = new Map<number, Array<{ wallet: string; signature: string; timestamp: number }>>()

  for (const [wallet, txs] of holderTxMap) {
    const tx = txs.find((candidate) =>
      candidate.tokenTransfers?.some((transfer) => transfer.mint === options.mint && transfer.toUserAccount === wallet && transfer.tokenAmount > 0)
      || candidate.accountData?.some((account) => account.tokenBalanceChanges?.some((change) =>
        change.mint === options.mint && change.userAccount === wallet && Number(change.rawTokenAmount?.tokenAmount ?? 0) > 0
      ))
    )
    if (!tx) continue
    const group = slotGroups.get(tx.slot) ?? []
    group.push({ wallet, signature: tx.signature, timestamp: tx.timestamp })
    slotGroups.set(tx.slot, group)
  }

  const clusters: ForensicsBundleCluster[] = []
  for (const [slot, entries] of slotGroups) {
    const wallets = [...new Set(entries.map((entry) => entry.wallet))].sort()
    if (wallets.length < 2) continue

    let sharedFunder: string | undefined
    for (const [funder, funded] of options.funderMap) {
      if (wallets.filter((wallet) => funded.includes(wallet)).length >= 2) {
        sharedFunder = funder
        break
      }
    }

    const timestamps = entries.map((entry) => entry.timestamp).filter(Boolean)
    const confidence = Math.min(100, 50 + Math.min(30, (wallets.length - 2) * 10) + (sharedFunder ? 20 : 0))
    clusters.push({
      id: crypto.createHash('sha256').update(wallets.join(':')).digest('hex').slice(0, 16),
      wallets,
      tokens: [{
        mint: options.mint,
        tokenName: options.tokenName,
        tokenSymbol: options.tokenSymbol,
        slot,
        timestamp: Math.min(...timestamps),
        walletCount: wallets.length,
        transactionSignatures: [...new Set(entries.map((entry) => entry.signature))],
      }],
      totalAppearances: 1,
      firstSeenTimestamp: Math.min(...timestamps),
      lastSeenTimestamp: Math.max(...timestamps),
      confidence,
      sharedFunder,
      metadata: { avgClusterSize: wallets.length, maxSameSlotCount: entries.length },
    })
  }

  return clusters
}

export function attachFundingSource(node: ForensicsGraphNode, funder: FunderInfo, identity?: WalletIdentity): ForensicsGraphNode {
  return {
    ...node,
    fundingSource: {
      funderAddress: funder.address,
      funderName: identity?.name ?? null,
      funderType: funder.txSource !== 'UNKNOWN' ? funder.txSource : identity?.category ?? null,
      amount: funder.amount,
      timestamp: funder.timestamp,
      signature: funder.txSignature,
    },
  }
}
