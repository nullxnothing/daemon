import { getDb } from '../../db/db'
import type { ForensicsBlacklistResult, ForensicsBundleCluster } from '../../shared/types'

export function persistBundleClusters(clusters: ForensicsBundleCluster[]): void {
  const db = getDb()
  const upsertCluster = db.prepare(`
    INSERT OR REPLACE INTO forensic_bundle_clusters
      (id, wallets_json, tokens_json, total_appearances, confidence, shared_funder, first_seen, last_seen, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const upsertWallet = db.prepare('INSERT OR IGNORE INTO forensic_bundle_wallet_index (wallet, cluster_id) VALUES (?, ?)')
  db.transaction(() => {
    for (const cluster of clusters) {
      upsertCluster.run(
        cluster.id,
        JSON.stringify(cluster.wallets),
        JSON.stringify(cluster.tokens),
        cluster.totalAppearances,
        cluster.confidence,
        cluster.sharedFunder ?? null,
        cluster.firstSeenTimestamp,
        cluster.lastSeenTimestamp,
        JSON.stringify(cluster.metadata ?? {}),
      )
      for (const wallet of cluster.wallets) upsertWallet.run(wallet, cluster.id)
    }
  })()
}

export function listBlacklist(): ForensicsBlacklistResult {
  const rows = getDb().prepare('SELECT * FROM forensic_bundle_clusters ORDER BY confidence DESC, last_seen DESC LIMIT 100').all() as Array<{
    id: string
    wallets_json: string
    tokens_json: string
    total_appearances: number
    confidence: number
    shared_funder: string | null
    first_seen: number
    last_seen: number
    metadata_json: string
  }>

  const clusters = rows.map((row) => ({
    id: row.id,
    wallets: JSON.parse(row.wallets_json) as string[],
    tokens: JSON.parse(row.tokens_json),
    totalAppearances: row.total_appearances,
    confidence: row.confidence,
    sharedFunder: row.shared_funder ?? undefined,
    firstSeenTimestamp: row.first_seen,
    lastSeenTimestamp: row.last_seen,
    metadata: JSON.parse(row.metadata_json),
  })) as ForensicsBundleCluster[]
  const walletCount = getDb().prepare('SELECT COUNT(DISTINCT wallet) as count FROM forensic_bundle_wallet_index').get() as { count: number }
  return { clusters, totalWallets: walletCount.count, totalClusters: clusters.length }
}

export function exportBlacklistCsv(): string {
  const blacklist = listBlacklist()
  const lines = ['wallet,cluster_id,confidence,total_appearances,last_seen,shared_funder']
  for (const cluster of blacklist.clusters) {
    for (const wallet of cluster.wallets) {
      lines.push([wallet, cluster.id, cluster.confidence, cluster.totalAppearances, cluster.lastSeenTimestamp, cluster.sharedFunder ?? ''].join(','))
    }
  }
  return lines.join('\n')
}
