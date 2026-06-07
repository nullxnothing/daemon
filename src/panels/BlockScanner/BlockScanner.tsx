import { useState, useRef, useCallback, useEffect } from 'react'
import { ProductSurfaceStrip } from '../../components/ProductSurfaceStrip'
import {
  BLOCK_SCANNER_HANDOFF_EVENT,
  BLOCK_SCANNER_HANDOFF_KEY,
  consumeSurfaceHandoff,
  type BlockScannerHandoff,
} from '../../lib/surfaceHandoffs'
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
type ScannerInputKind = 'account' | 'transaction'

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/

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

function shortValue(value: string): string {
  if (value.length <= 16) return value
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

function inputFromExplorerUrl(value: string): string {
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    return parts[parts.length - 1] ?? value
  } catch {
    return value
  }
}

function classifyScannerInput(value: string): { kind: ScannerInputKind; value: string } | { error: string } {
  const candidate = inputFromExplorerUrl(value.trim())
  if (!BASE58_RE.test(candidate)) {
    return { error: 'Paste a base58 Solana address, token mint, program ID, or transaction signature.' }
  }
  if (candidate.length >= 64 && candidate.length <= 96) return { kind: 'transaction', value: candidate }
  if (candidate.length >= 32 && candidate.length <= 44) return { kind: 'account', value: candidate }
  return { error: 'Use a 32-44 char address/mint/program ID or a 64-96 char transaction signature.' }
}

function normalizeCluster(value: string | undefined, fallback: Cluster): Cluster {
  return CLUSTERS.some((cluster) => cluster.value === value) ? value as Cluster : fallback
}

export default function BlockScanner() {
  const [cluster, setCluster] = useState<Cluster>('mainnet')
  const [search, setSearch] = useState('')
  const [url, setUrl] = useState(() => clusterBase('mainnet'))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [inputIssue, setInputIssue] = useState<string | null>(null)
  const [lastInputHint, setLastInputHint] = useState<string | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const webviewRef = useRef<WebviewElement | null>(null)

  const navigate = useCallback((target: string) => {
    setLoadError(null)
    setUrl(target)
  }, [])

  const inspectValue = useCallback((rawValue: string, targetCluster = cluster) => {
    const q = rawValue.trim()
    setInputIssue(null)
    if (!q) {
      setCluster(targetCluster)
      navigate(clusterBase(targetCluster))
      setLastInputHint(null)
      setSearch('')
      return
    }
    const input = classifyScannerInput(q)
    if ('error' in input) {
      setInputIssue(input.error)
      setLastInputHint(null)
      return
    }
    setCluster(targetCluster)
    if (input.kind === 'transaction') {
      navigate(txUrl(targetCluster, input.value))
    } else {
      navigate(addressUrl(targetCluster, input.value))
    }
    setLastInputHint(`Opened ${input.kind === 'transaction' ? 'transaction' : 'account'} ${shortValue(input.value)}`)
    setSearch('')
  }, [cluster, navigate])

  const handleSearch = () => {
    inspectValue(search, cluster)
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

  useEffect(() => {
    const applyHandoff = (handoff: BlockScannerHandoff | null) => {
      if (!handoff?.value) return
      inspectValue(handoff.value, normalizeCluster(handoff.cluster, cluster))
    }

    applyHandoff(consumeSurfaceHandoff<BlockScannerHandoff>(BLOCK_SCANNER_HANDOFF_KEY))

    const onHandoff = (event: Event) => {
      applyHandoff((event as CustomEvent<BlockScannerHandoff>).detail)
    }
    window.addEventListener(BLOCK_SCANNER_HANDOFF_EVENT, onHandoff)
    return () => window.removeEventListener(BLOCK_SCANNER_HANDOFF_EVENT, onHandoff)
  }, [cluster, inspectValue])

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
            placeholder="Wallet, mint, program ID, tx signature, or explorer URL"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setInputIssue(null)
            }}
            onKeyDown={handleKeyDown}
            aria-invalid={Boolean(inputIssue)}
            aria-describedby="scanner-input-status"
          />
          <button type="button" className="scanner-go" onClick={handleSearch}>
            {search.trim() ? 'Search' : 'Home'}
          </button>
        </div>
      </div>

      {(inputIssue || lastInputHint) && (
        <div
          id="scanner-input-status"
          className={`scanner-input-status${inputIssue ? ' scanner-input-status--error' : ''}`}
          role="status"
        >
          {inputIssue ?? lastInputHint}
        </div>
      )}

      <ProductSurfaceStrip
        surfaceId="block-scanner"
        stateLabel={loadError ? 'Load issue' : 'Explorer'}
        setupLabel={cluster}
        tone={loadError ? 'warning' : 'info'}
        detail={inputIssue ?? lastInputHint ?? 'Paste a wallet, mint, program ID, transaction signature, or explorer URL from the forensics journey.'}
        primaryLabel={search.trim() ? 'Inspect input' : 'Open explorer'}
        onPrimary={handleSearch}
      />

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
