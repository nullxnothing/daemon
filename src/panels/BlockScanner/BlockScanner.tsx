import { useState } from 'react'
import './BlockScanner.css'

const CLUSTERS = [
  { label: 'Mainnet', value: 'mainnet' },
  { label: 'Devnet', value: 'devnet' },
  { label: 'Testnet', value: 'testnet' },
] as const

type Cluster = typeof CLUSTERS[number]['value']

function clusterUrl(cluster: Cluster): string {
  if (cluster === 'mainnet') return 'https://orbmarkets.io'
  return `https://orbmarkets.io/?cluster=${cluster}`
}

function addressUrl(cluster: Cluster, address: string): string {
  const base = cluster === 'mainnet'
    ? `https://orbmarkets.io/account/${address}`
    : `https://orbmarkets.io/account/${address}?cluster=${cluster}`
  return base
}

function txUrl(cluster: Cluster, sig: string): string {
  const base = cluster === 'mainnet'
    ? `https://orbmarkets.io/tx/${sig}`
    : `https://orbmarkets.io/tx/${sig}?cluster=${cluster}`
  return base
}

export default function BlockScanner() {
  const [cluster, setCluster] = useState<Cluster>('mainnet')
  const [search, setSearch] = useState('')

  const openOrb = (url: string) => {
    window.daemon.scanner.open(url)
  }

  const handleSearch = () => {
    const q = search.trim()
    if (!q) {
      openOrb(clusterUrl(cluster))
      return
    }
    // Tx signatures are 87-88 base58 chars, addresses are 32-44
    if (q.length > 60) {
      openOrb(txUrl(cluster, q))
    } else {
      openOrb(addressUrl(cluster, q))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    }
  }

  return (
    <div className="block-scanner">
      <div className="block-scanner__header">
        <div className="block-scanner__title">Block Scanner</div>
        <div className="block-scanner__subtitle">Powered by Orb</div>
      </div>

      <div className="block-scanner__cluster-row">
        {CLUSTERS.map((c) => (
          <button
            key={c.value}
            className={`block-scanner__cluster-btn${cluster === c.value ? ' block-scanner__cluster-btn--active' : ''}`}
            onClick={() => setCluster(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="block-scanner__search-row">
        <input
          className="block-scanner__search"
          placeholder="Address or transaction signature..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="block-scanner__go" onClick={handleSearch}>
          {search.trim() ? 'Search' : 'Open'}
        </button>
      </div>

      <div className="block-scanner__quick">
        <div className="block-scanner__quick-label">Quick Links</div>
        <button className="block-scanner__link" onClick={() => openOrb(clusterUrl(cluster))}>
          Explorer Home
        </button>
        <button className="block-scanner__link" onClick={() => openOrb('https://orbmarkets.io/stats')}>
          Network Stats
        </button>
        <button className="block-scanner__link" onClick={() => openOrb('https://orbmarkets.io/markets?category=majors')}>
          Markets
        </button>
      </div>
    </div>
  )
}
