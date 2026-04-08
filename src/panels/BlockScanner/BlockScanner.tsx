import { useState, useRef, useCallback, useEffect } from 'react'
import './BlockScanner.css'

interface WebviewElement extends HTMLElement {
  src: string
  goBack: () => void
  goForward: () => void
  reload: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
}

const CLUSTERS = [
  { label: 'Mainnet', value: 'mainnet' },
  { label: 'Devnet', value: 'devnet' },
  { label: 'Testnet', value: 'testnet' },
] as const

type Cluster = typeof CLUSTERS[number]['value']

function clusterBase(cluster: Cluster): string {
  if (cluster === 'mainnet') return 'https://orbmarkets.io'
  return `https://orbmarkets.io/?cluster=${cluster}`
}

function addressUrl(cluster: Cluster, address: string): string {
  if (cluster === 'mainnet') return `https://orbmarkets.io/account/${address}`
  return `https://orbmarkets.io/account/${address}?cluster=${cluster}`
}

function txUrl(cluster: Cluster, sig: string): string {
  if (cluster === 'mainnet') return `https://orbmarkets.io/tx/${sig}`
  return `https://orbmarkets.io/tx/${sig}?cluster=${cluster}`
}

export default function BlockScanner() {
  const [cluster, setCluster] = useState<Cluster>('mainnet')
  const [search, setSearch] = useState('')
  const [url, setUrl] = useState('')
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const webviewRef = useRef<WebviewElement | null>(null)

  const navigate = useCallback(async (target: string) => {
    try {
      const res = await window.daemon.browser.navigate(target)
      if (!res.ok || !res.data) return
      setUrl(target)
      if (webviewRef.current) {
        webviewRef.current.src = target
      }
    } catch {
      // blocked by main-process browser safety policy
    }
  }, [])

  const handleSearch = async () => {
    const q = search.trim()
    if (!q) {
      await navigate(clusterBase(cluster))
      return
    }
    // Tx signatures are 87-88 base58 chars, addresses are 32-44
    if (q.length > 60) {
      await navigate(txUrl(cluster, q))
    } else {
      await navigate(addressUrl(cluster, q))
    }
    setSearch('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    }
  }

  // Wire up webview navigation events
  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onNavigate = (event: any) => {
      const newUrl = event.url || ''
      if (newUrl) setUrl(newUrl)
      try {
        setCanGoBack(wv.canGoBack())
        setCanGoForward(wv.canGoForward())
      } catch { /* not ready */ }
    }

    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('did-navigate-in-page', onNavigate)
    return () => {
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('did-navigate-in-page', onNavigate)
    }
  }, [])

  // If no URL yet, start on cluster home
  useEffect(() => {
    if (!url) {
      const initial = clusterBase(cluster)
      void navigate(initial)
    }
  }, [cluster, navigate, url])

  const webviewProps = {
    ref: webviewRef as React.Ref<HTMLElement>,
    className: 'scanner-webview',
    partition: 'persist:scanner',
    allowedfeatures: '',
    src: url,
  } as React.DetailedHTMLProps<React.WebViewHTMLAttributes<HTMLWebViewElement>, HTMLWebViewElement>

  return (
    <div className="block-scanner">
      <div className="scanner-toolbar">
        <div className="scanner-nav-btns">
          <button
            className="scanner-nav-btn"
            disabled={!canGoBack}
            onClick={() => webviewRef.current?.goBack()}
            title="Back"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button
            className="scanner-nav-btn"
            disabled={!canGoForward}
            onClick={() => webviewRef.current?.goForward()}
            title="Forward"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <button
            className="scanner-nav-btn"
            onClick={() => webviewRef.current?.reload()}
            title="Reload"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          </button>
        </div>

        <div className="scanner-cluster-btns">
          {CLUSTERS.map((c) => (
            <button
              key={c.value}
              className={`scanner-cluster-btn${cluster === c.value ? ' scanner-cluster-btn--active' : ''}`}
              onClick={() => { setCluster(c.value); navigate(clusterBase(c.value)) }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="scanner-search-row">
          <input
            className="scanner-search"
            placeholder="Address or tx signature..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="scanner-go" onClick={handleSearch}>
            {search.trim() ? 'Search' : 'Home'}
          </button>
        </div>
      </div>

      <div className="scanner-webview-area">
        <webview {...webviewProps} />
      </div>
    </div>
  )
}
