import { useCallback, useEffect, useRef, useState } from 'react'
import { ProductSurfaceStrip } from '../../components/ProductSurfaceStrip'
import { useWebviewResizeSync } from '../../hooks/useWebviewResizeSync'
import type { RicoMapsEmbedStatus } from '../../types/daemon'
import './RicoMaps.css'

interface WebviewElement extends HTMLElement {
  goBack: () => void
  goForward: () => void
  reload: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
}

const FALLBACK_URL = 'http://localhost:3600'

export function RicoMapsPanel() {
  const [status, setStatus] = useState<RicoMapsEmbedStatus | null>(null)
  const [url, setUrl] = useState(FALLBACK_URL)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const webviewRef = useRef<WebviewElement | null>(null)
  useWebviewResizeSync(webviewRef, Boolean(status?.running))

  const refreshStatus = useCallback(async () => {
    const result = await window.daemon.forensics.ricoMapsStatus()
    if (!result.ok || !result.data) {
      setLoadError(result.error ?? 'Could not check RicoMaps.')
      return null
    }
    setStatus(result.data)
    setUrl(result.data.url)
    return result.data
  }, [])

  const startRicoMaps = useCallback(async () => {
    setIsStarting(true)
    setLoadError(null)
    const result = await window.daemon.forensics.startRicoMaps()
    setIsStarting(false)
    if (!result.ok || !result.data) {
      setLoadError(result.error ?? 'Could not start RicoMaps.')
      return
    }
    setStatus(result.data)
    setUrl(result.data.url)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      const current = await refreshStatus()
      if (cancelled || current?.running || current?.installed === false) return
      await startRicoMaps()
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [refreshStatus, startRicoMaps])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const updateNavState = () => {
      try {
        setCanGoBack(webview.canGoBack())
        setCanGoForward(webview.canGoForward())
      } catch {
        setCanGoBack(false)
        setCanGoForward(false)
      }
    }

    const onStartLoading = () => setLoadError(null)
    const onStopLoading = () => updateNavState()
    const onNavigate = (event: any) => {
      if (event.url) setUrl(event.url)
      updateNavState()
    }
    const onFailLoad = (event: any) => {
      if (event.errorCode === -3) return
      setLoadError(event.errorDescription || 'RicoMaps could not load.')
      updateNavState()
    }

    webview.addEventListener('did-start-loading', onStartLoading)
    webview.addEventListener('did-stop-loading', onStopLoading)
    webview.addEventListener('did-navigate', onNavigate)
    webview.addEventListener('did-navigate-in-page', onNavigate)
    webview.addEventListener('did-fail-load', onFailLoad)
    return () => {
      webview.removeEventListener('did-start-loading', onStartLoading)
      webview.removeEventListener('did-stop-loading', onStopLoading)
      webview.removeEventListener('did-navigate', onNavigate)
      webview.removeEventListener('did-navigate-in-page', onNavigate)
      webview.removeEventListener('did-fail-load', onFailLoad)
    }
  }, [status?.running])

  const webviewProps = {
    ref: webviewRef as React.Ref<HTMLElement>,
    className: 'ricomaps-webview',
    partition: 'persist:ricomaps',
    allowedfeatures: '',
    src: url,
  } as React.DetailedHTMLProps<React.WebViewHTMLAttributes<HTMLWebViewElement>, HTMLWebViewElement>

  const isReady = status?.running
  const isMissingSetup = status?.installed === false
  const canStart = !isStarting && !isReady && !isMissingSetup
  const ricoMapsDetail = isMissingSetup
    ? `Install RicoMaps dependencies at ${status?.projectPath ?? 'the configured RicoMaps project path'}`
    : loadError ?? status?.error ?? status?.projectPath ?? 'Local graph explorer for wallet and token forensics.'
  const setupLabel = isMissingSetup ? 'Setup needed' : isStarting ? 'Starting' : `Port ${status?.port ?? 3600}`

  return (
    <div className="ricomaps-panel">
      <div className="ricomaps-toolbar">
        <div className="ricomaps-nav">
          <button type="button" disabled={!canGoBack} onClick={() => webviewRef.current?.goBack()} title="Back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button type="button" disabled={!canGoForward} onClick={() => webviewRef.current?.goForward()} title="Forward">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <button type="button" onClick={() => webviewRef.current?.reload()} title="Reload">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
          </button>
        </div>

        <button type="button" className="ricomaps-home" onClick={() => setUrl(status?.url ?? FALLBACK_URL)}>
          RicoMaps
        </button>

        <div className="ricomaps-url" title={url}>{url}</div>

        <button
          type="button"
          className="ricomaps-start"
          disabled={!canStart}
          onClick={() => void startRicoMaps()}
          title={isMissingSetup ? 'Install RicoMaps before starting the embedded service' : undefined}
        >
          {isStarting ? 'Starting' : isReady ? 'Ready' : 'Start'}
        </button>
      </div>

      <ProductSurfaceStrip
        surfaceId="ricomaps"
        stateLabel={isReady ? 'Running' : 'Needs service'}
        setupLabel={setupLabel}
        tone={isReady ? 'success' : loadError ? 'danger' : 'warning'}
        detail={ricoMapsDetail}
        primaryLabel={isMissingSetup ? 'Check status' : isReady ? 'Refresh status' : isStarting ? 'Starting' : 'Start service'}
        onPrimary={() => {
          if (isReady || isMissingSetup || isStarting) {
            void refreshStatus()
            return
          }
          void startRicoMaps()
        }}
      />

      <div className="ricomaps-webview-shell">
        {isReady && <webview {...webviewProps} />}
        {(!isReady || loadError) && (
          <div className="ricomaps-overlay" role="status">
            <span>{isStarting ? 'Starting RicoMaps...' : isMissingSetup ? 'RicoMaps setup required.' : 'RicoMaps is not ready.'}</span>
            <small>{ricoMapsDetail}</small>
            <div>
              {!isMissingSetup && (
                <button type="button" onClick={() => void startRicoMaps()} disabled={!canStart}>Start</button>
              )}
              <button type="button" onClick={() => void refreshStatus()}>Retry</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default RicoMapsPanel
