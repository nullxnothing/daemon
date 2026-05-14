import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './ZauthPanel.css'

type ZauthPageId = 'database' | 'provider-hub'

type ZauthPage = {
  id: ZauthPageId
  label: string
  url: string
  meta: string
}

type WebviewElement = HTMLElement & {
  goBack: () => void
  goForward: () => void
  reload: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
}

const ZAUTH_PAGES: ZauthPage[] = [
  {
    id: 'database',
    label: 'Database',
    url: 'https://zauth.inc/database',
    meta: 'Verified x402 endpoint registry',
  },
  {
    id: 'provider-hub',
    label: 'Provider Hub',
    url: 'https://zauth.inc/provider-hub',
    meta: 'Endpoint operations console',
  },
]
const ZAUTH_PAGE_STORAGE_KEY = 'daemon:zauth:activePage'

function getPage(pageId: string | null): ZauthPage {
  return ZAUTH_PAGES.find((page) => page.id === pageId) ?? ZAUTH_PAGES[0]
}

function getInitialPage(): ZauthPage {
  if (typeof window === 'undefined') return ZAUTH_PAGES[0]
  try {
    return getPage(window.localStorage.getItem(ZAUTH_PAGE_STORAGE_KEY))
  } catch {
    return ZAUTH_PAGES[0]
  }
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 6 9 12l6 6" />
    </svg>
  )
}

function ForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function ReloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v6h-6" />
    </svg>
  )
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4h6v6" />
      <path d="m10 14 10-10" />
      <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
    </svg>
  )
}

export function ZauthPanel() {
  const initialPage = useMemo(() => getInitialPage(), [])
  const webviewRef = useRef<WebviewElement | null>(null)
  const [activePageId, setActivePageId] = useState<ZauthPageId>(initialPage.id)
  const [currentUrl, setCurrentUrl] = useState(initialPage.url)
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  const activePage = useMemo(
    () => ZAUTH_PAGES.find((page) => page.id === activePageId) ?? ZAUTH_PAGES[0],
    [activePageId],
  )

  const updateNavState = useCallback(() => {
    const webview = webviewRef.current
    if (!webview) return
    try {
      setCanGoBack(webview.canGoBack())
      setCanGoForward(webview.canGoForward())
    } catch {
      setCanGoBack(false)
      setCanGoForward(false)
    }
  }, [])

  const openPage = useCallback((page: ZauthPage) => {
    setActivePageId(page.id)
    setCurrentUrl(page.url)
    setLoadStatus('loading')
    try {
      window.localStorage.setItem(ZAUTH_PAGE_STORAGE_KEY, page.id)
    } catch {
      // Keep navigation working if storage is unavailable.
    }
  }, [])

  const openExternal = useCallback(() => {
    void window.daemon.shell.openExternal(currentUrl || activePage.url)
  }, [activePage.url, currentUrl])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const onStartLoading = () => setLoadStatus('loading')
    const onStopLoading = () => {
      setLoadStatus('ready')
      updateNavState()
    }
    const onFailLoad = (event: any) => {
      if (event.errorCode === -3) return
      setLoadStatus('error')
      updateNavState()
    }
    const onNavigate = (event: any) => {
      if (typeof event.url === 'string' && event.url.trim()) setCurrentUrl(event.url)
      updateNavState()
    }

    webview.addEventListener('did-start-loading', onStartLoading)
    webview.addEventListener('did-stop-loading', onStopLoading)
    webview.addEventListener('did-fail-load', onFailLoad)
    webview.addEventListener('did-navigate', onNavigate)
    webview.addEventListener('did-navigate-in-page', onNavigate)

    return () => {
      webview.removeEventListener('did-start-loading', onStartLoading)
      webview.removeEventListener('did-stop-loading', onStopLoading)
      webview.removeEventListener('did-fail-load', onFailLoad)
      webview.removeEventListener('did-navigate', onNavigate)
      webview.removeEventListener('did-navigate-in-page', onNavigate)
    }
  }, [updateNavState])

  useEffect(() => {
    const onExternalOpen = (event: Event) => {
      const pageId = (event as CustomEvent<ZauthPageId>).detail
      openPage(getPage(pageId))
    }

    window.addEventListener('daemon:zauth-open', onExternalOpen)
    return () => window.removeEventListener('daemon:zauth-open', onExternalOpen)
  }, [openPage])

  const webviewProps = {
    ref: webviewRef as React.Ref<HTMLElement>,
    className: 'zauth-webview',
    partition: 'persist:zauth',
    src: currentUrl,
    webpreferences: 'contextIsolation=yes,nodeIntegration=no',
  } as React.DetailedHTMLProps<React.WebViewHTMLAttributes<HTMLWebViewElement>, HTMLWebViewElement>

  return (
    <div className="zauth-panel">
      <header className="zauth-toolbar">
        <div className="zauth-toolbar-left">
          <div className="zauth-title-block">
            <div className="zauth-kicker">x402 trust layer</div>
            <h2>Zauth</h2>
          </div>
          <div className="zauth-segment" role="tablist" aria-label="Zauth views">
            {ZAUTH_PAGES.map((page) => (
              <button
                key={page.id}
                type="button"
                role="tab"
                aria-selected={activePageId === page.id}
                className={`zauth-segment-btn${activePageId === page.id ? ' active' : ''}`}
                onClick={() => openPage(page)}
                title={page.meta}
              >
                <span>{page.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="zauth-toolbar-right">
          <span className={`zauth-status zauth-status--${loadStatus}`}>{loadStatus}</span>
          <div className="zauth-nav">
            <button type="button" onClick={() => webviewRef.current?.goBack()} disabled={!canGoBack} aria-label="Back" title="Back">
              <BackIcon />
            </button>
            <button type="button" onClick={() => webviewRef.current?.goForward()} disabled={!canGoForward} aria-label="Forward" title="Forward">
              <ForwardIcon />
            </button>
            <button type="button" onClick={() => webviewRef.current?.reload()} aria-label="Reload" title="Reload">
              <ReloadIcon />
            </button>
            <button type="button" onClick={openExternal} aria-label="Open externally" title="Open externally">
              <ExternalIcon />
            </button>
          </div>
        </div>
      </header>

      <div className="zauth-meta-row">
        <span>{activePage.meta}</span>
        <code>{currentUrl}</code>
      </div>

      <div className="zauth-webview-shell">
        <webview {...webviewProps} />
      </div>
    </div>
  )
}

export default ZauthPanel
