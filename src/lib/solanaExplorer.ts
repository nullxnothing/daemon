export type SolanaExplorerCluster = 'mainnet' | 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet'

function clusterQuery(cluster: SolanaExplorerCluster): string {
  if (cluster === 'mainnet' || cluster === 'mainnet-beta') return ''
  return `?cluster=${cluster}`
}

export function canOpenSolscan(cluster: SolanaExplorerCluster): boolean {
  return cluster !== 'localnet'
}

export function getSolscanClusterLabel(cluster: SolanaExplorerCluster): string {
  if (cluster === 'mainnet' || cluster === 'mainnet-beta') return 'mainnet'
  if (cluster === 'localnet') return 'localnet'
  return cluster
}

export function getSolscanTxLabel(cluster: SolanaExplorerCluster): string {
  if (!canOpenSolscan(cluster)) return 'Copy signature'
  return `Open Solscan (${getSolscanClusterLabel(cluster)})`
}

export function getSolscanTxUrl(signature: string, cluster: SolanaExplorerCluster = 'mainnet'): string {
  return `https://solscan.io/tx/${encodeURIComponent(signature)}${clusterQuery(cluster)}`
}

export function getSolscanAddressUrl(address: string, cluster: SolanaExplorerCluster = 'mainnet'): string {
  return `https://solscan.io/account/${encodeURIComponent(address)}${clusterQuery(cluster)}`
}
