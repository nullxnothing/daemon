import { useState, useRef, useEffect, useCallback } from 'react'
import { usePluginStore } from '../../../store/plugins'
import './Remotion.css'

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

const DEFAULT_URL = 'http://localhost:3000'

// Electron webview element type
interface WebviewElement extends HTMLElement {
  src: string
  goBack: () => void
  goForward: () => void
  reload: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  addEventListener: HTMLElement['addEventListener']
  removeEventListener: HTMLElement['removeEventListener']
}

export default function Remotion() {
  const plugins = usePluginStore((s) => s.plugins)
  const remotionPlugin = plugins.find((p) => p.id === 'remotion')
  const configStr = remotionPlugin?.config || '{}'

  const [url, setUrl] = useState(() => {
    try {
      const parsed = JSON.parse(configStr)
      return parsed.url || DEFAULT_URL
    } catch {
      return DEFAULT_URL
    }
  })
  const [inputValue, setInputValue] = useState(url)
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [isNavigated, setIsNavigated] = useState(false)

  const webviewRef = useRef<WebviewElement | null>(null)

  // Persist URL changes to plugin config
  const persistUrl = useCallback((newUrl: string) => {
    window.daemon.plugins.setConfig('remotion', JSON.stringify({ url: newUrl }))
  }, [])

  // Navigate to URL
  const navigateTo = useCallback((targetUrl: string) => {
    const trimmed = targetUrl.trim()
    if (!trimmed) return

    const normalized = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `http://${trimmed}`

    setUrl(normalized)
    setInputValue(normalized)
    setStatus('loading')
    setErrorMessage('')
    setIsNavigated(true)
    persistUrl(normalized)

    if (webviewRef.current) {
      webviewRef.current.src = normalized
    }
  }, [persistUrl])

  // Attach webview event listeners
  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onStartLoading = () => setStatus('loading')
    const onStopLoading = () => setStatus('loaded')
    const onFailLoad = (_event: Event) => {
      const detail = (_event as CustomEvent).detail || {}
      const code = detail.errorCode ?? -1
      // Ignore aborted loads (user navigated away before load finished)
      if (code === -3) return
      setStatus('error')
      setErrorMessage(detail.errorDescription || 'Failed to connect')
    }

    wv.addEventListener('did-start-loading', onStartLoading)
    wv.addEventListener('did-stop-loading', onStopLoading)
    wv.addEventListener('did-fail-load', onFailLoad)

    return () => {
      wv.removeEventListener('did-start-loading', onStartLoading)
      wv.removeEventListener('did-stop-loading', onStopLoading)
      wv.removeEventListener('did-fail-load', onFailLoad)
    }
  }, [isNavigated])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      navigateTo(inputValue)
    }
  }

  const handleBack = () => webviewRef.current?.goBack()
  const handleForward = () => webviewRef.current?.goForward()
  const handleReload = () => {
    if (webviewRef.current && isNavigated) {
      setStatus('loading')
      webviewRef.current.reload()
    } else {
      navigateTo(inputValue)
    }
  }

  const handleOpenExternal = () => {
    if (url) window.daemon.shell.openExternal(url)
  }

  const showPlaceholder = !isNavigated || status === 'error'

  return (
    <div className="remotion-panel">
      {/* Toolbar */}
      <div className="remotion-toolbar">
        <button
          className="remotion-nav-btn"
          onClick={handleBack}
          disabled={!isNavigated}
          title="Back"
        >
          &#8592;
        </button>
        <button
          className="remotion-nav-btn"
          onClick={handleForward}
          disabled={!isNavigated}
          title="Forward"
        >
          &#8594;
        </button>
        <button
          className="remotion-nav-btn"
          onClick={handleReload}
          title="Reload"
        >
          &#8635;
        </button>

        <input
          className="remotion-url-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="http://localhost:3000"
          spellCheck={false}
        />

        <div
          className="remotion-status-dot"
          data-status={status}
          title={status}
        />

        <button
          className="remotion-nav-btn"
          onClick={() => navigateTo(inputValue)}
          title="Go"
        >
          Go
        </button>
        <button
          className="remotion-nav-btn"
          onClick={handleOpenExternal}
          title="Open in browser"
          style={{ fontSize: 10, width: 'auto', padding: '0 6px' }}
        >
          External
        </button>
      </div>

      {/* Webview Area */}
      <div className="remotion-webview-container">
        {isNavigated && (
          <webview
            ref={webviewRef}
            src={url}
            partition="persist:remotion"
            style={{ width: '100%', height: '100%' }}
          />
        )}

        {showPlaceholder && (
          <div className="remotion-placeholder">
            {status === 'error' ? (
              <>
                <div className="remotion-placeholder-title">
                  Remotion Studio not detected
                </div>
                <div>Could not connect to {url}</div>
                {errorMessage && (
                  <div style={{ color: 'var(--t3)', fontSize: 11 }}>{errorMessage}</div>
                )}
                <div className="remotion-placeholder-hint">
                  npx remotion studio
                </div>
                <button
                  className="remotion-retry-btn"
                  onClick={() => navigateTo(url)}
                >
                  Retry
                </button>
              </>
            ) : (
              <>
                <div className="remotion-placeholder-title">
                  Remotion Studio
                </div>
                <div>
                  Enter a URL and click Go to connect to a running Remotion Studio instance.
                </div>
                <div className="remotion-placeholder-hint">
                  npx remotion studio
                </div>
                <button
                  className="remotion-retry-btn"
                  onClick={() => navigateTo(inputValue)}
                >
                  Connect
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
