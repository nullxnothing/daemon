import { useState, useRef, useCallback, useEffect } from 'react'
import './BlockScanner.css'

interface WebviewElement extends HTMLElement {
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
  const [url, setUrl] = useState(() => clusterBase('mainnet'))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const webviewRef = useRef<WebviewElement | null>(null)

  const navigate = useCallback((target: string) => {
    setLoadError(null)
    setUrl(target)
  }, [])

  const handleSearch = () => {
    const q = search.trim()
    if (!q) {
      navigate(clusterBase(cluster))
      return
    }
    // Tx signatures are 87-88 base58 chars, addresses are 32-44
    if (q.length > 60) {
      navigate(txUrl(cluster, q))
    } else {
      navigate(addressUrl(cluster, q))
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

    const updateNavState = () => {
      try {
        setCanGoBack(wv.canGoBack())
        setCanGoForward(wv.canGoForward())
      } catch { /* not ready */ }
    }

    const onStartLoading = () => {
      setLoadError(null)
    }

    const onNavigate = (event: any) => {
      const newUrl = event.url || ''
      if (newUrl) setUrl(newUrl)
      updateNavState()
    }

    const onFailLoad = (event: any) => {
      const code = event.errorCode ?? -1
      if (code === -3) return
      const description = event.errorDescription || 'Could not load Orb.'
      setLoadError(`${description} (${code})`)
      updateNavState()
    }

    const onStopLoading = () => updateNavState()

    wv.addEventListener('did-start-loading', onStartLoading)
    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('did-navigate-in-page', onNavigate)
    wv.addEventListener('did-fail-load', onFailLoad)
    wv.addEventListener('did-stop-loading', onStopLoading)
    return () => {
      wv.removeEventListener('did-start-loading', onStartLoading)
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('did-navigate-in-page', onNavigate)
      wv.removeEventListener('did-fail-load', onFailLoad)
      wv.removeEventListener('did-stop-loading', onStopLoading)
    }
  }, [])

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
            onClick={() => {
              setLoadError(null)
              webviewRef.current?.reload()
            }}
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
          <button type="button" className="scanner-go" onClick={handleSearch}>
            {search.trim() ? 'Search' : 'Home'}
          </button>
        </div>
      </div>

      <div className="scanner-webview-area">
        <webview {...webviewProps} />
        {loadError && (
          <div className="scanner-load-error" role="status">
            <span>Orb could not finish loading.</span>
            <small>{loadError}</small>
            <button type="button" onClick={() => navigate(url)}>Retry</button>
          </div>
        )}
      </div>
    </div>
  )
}
