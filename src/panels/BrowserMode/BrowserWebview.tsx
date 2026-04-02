import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import { useBrowserStore } from '../../store/browser'
import { INSPECTOR_INJECT_SCRIPT, INSPECTOR_REMOVE_SCRIPT } from './BrowserInspector'

interface WebviewElement extends HTMLElement {
  src: string
  goBack: () => void
  goForward: () => void
  reload: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  executeJavaScript: (code: string) => Promise<unknown>
  addEventListener: HTMLElement['addEventListener']
  removeEventListener: HTMLElement['removeEventListener']
}

export interface BrowserWebviewHandle {
  goBack: () => void
  goForward: () => void
  reload: () => void
  navigate: (url: string) => void
  injectInspector: () => void
  removeInspector: () => void
}

export const BrowserWebview = forwardRef<BrowserWebviewHandle>(function BrowserWebview(_, ref) {
  const webviewRef = useRef<WebviewElement | null>(null)
  const isNavigated = useRef(false)

  const setUrl = useBrowserStore((s) => s.setUrl)
  const setLoadStatus = useBrowserStore((s) => s.setLoadStatus)
  const addInspectorResult = useBrowserStore((s) => s.addInspectorResult)
  const setCanGoBack = useBrowserStore((s) => s.setCanGoBack)
  const setCanGoForward = useBrowserStore((s) => s.setCanGoForward)
  const currentUrl = useBrowserStore((s) => s.currentUrl)
  const lastPageId = useBrowserStore((s) => s.lastPageId)

  const normalizeUrl = useCallback((raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
    return `http://${trimmed}`
  }, [])

  const updateNavState = useCallback(() => {
    const wv = webviewRef.current
    if (!wv) return
    try {
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
    } catch {
      // webview not ready
    }
  }, [setCanGoBack, setCanGoForward])

  const navigate = useCallback(
    async (url: string) => {
      const normalized = normalizeUrl(url)
      if (!normalized) return
      setUrl(normalized)
      setLoadStatus('loading')
      isNavigated.current = true

      // Create page cache entry in main process and store the pageId
      try {
        const res = await window.daemon.browser.navigate(normalized)
        if (res.ok && res.data) {
          useBrowserStore.getState().setLastPageId(res.data.pageId)
        }
      } catch {
        // Cache entry creation failed — capture will use fallback ID
      }

      if (webviewRef.current) {
        webviewRef.current.src = normalized
      }
    },
    [normalizeUrl, setUrl, setLoadStatus]
  )

  const injectInspector = useCallback(() => {
    if (!webviewRef.current) return
    webviewRef.current.executeJavaScript(INSPECTOR_INJECT_SCRIPT).catch(() => {})
  }, [])

  const removeInspector = useCallback(() => {
    if (!webviewRef.current) return
    webviewRef.current.executeJavaScript(INSPECTOR_REMOVE_SCRIPT).catch(() => {})
  }, [])

  useImperativeHandle(ref, () => ({
    goBack: () => webviewRef.current?.goBack(),
    goForward: () => webviewRef.current?.goForward(),
    reload: () => {
      if (webviewRef.current && isNavigated.current) {
        setLoadStatus('loading')
        webviewRef.current.reload()
      }
    },
    navigate,
    injectInspector,
    removeInspector,
  }))

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onStartLoading = () => setLoadStatus('loading')

    const onStopLoading = () => {
      setLoadStatus('loaded')
      updateNavState()

      // Re-inject inspector if inspect mode was active before navigation
      if (useBrowserStore.getState().isInspectMode && wv) {
        wv.executeJavaScript(INSPECTOR_INJECT_SCRIPT).catch(() => {})
      }

      // Capture rendered DOM content and send to main process
      const pageId = useBrowserStore.getState().lastPageId
      if (wv) {
        wv.executeJavaScript(
          `JSON.stringify({ title: document.title, text: document.body.innerText, url: location.href })`
        ).then((result: unknown) => {
          try {
            const parsed = typeof result === 'string' ? JSON.parse(result) : result
            const captureId = pageId || `capture-${Date.now()}`
            window.daemon.browser.capture(
              captureId,
              parsed.url || '',
              parsed.title || '',
              parsed.text || '',
            ).catch(() => {})
          } catch {
            // malformed result
          }
        }).catch(() => {})
      }
    }

    const onFailLoad = (event: any) => {
      const code = event.errorCode ?? -1
      if (code === -3) return
      setLoadStatus('error')
      updateNavState()
    }

    const onNavigate = (event: any) => {
      const newUrl = event.url || ''
      if (newUrl) {
        setUrl(newUrl)
        const agentTerminalId = useBrowserStore.getState().agentTerminalId
        if (agentTerminalId) {
          window.daemon.terminal.write(agentTerminalId, `\r\n[NAV] ${newUrl}\r\n`)
        }
      }
      updateNavState()
    }

    const onConsoleMessage = (event: any) => {
      const message: string = event.message || ''

      // Inspector results — Ctrl+click capture
      if (message.startsWith('DAEMON_INSPECT:')) {
        try {
          const payload = JSON.parse(message.slice('DAEMON_INSPECT:'.length))
          addInspectorResult({
            selector: payload.selector,
            tagName: payload.tagName,
            text: payload.text,
            url: currentUrl,
            timestamp: Date.now(),
            styles: payload.styles,
            attributes: payload.attributes,
          })
        } catch {
          // malformed inspect payload
        }
      }
    }

    wv.addEventListener('did-start-loading', onStartLoading)
    wv.addEventListener('did-stop-loading', onStopLoading)
    wv.addEventListener('did-fail-load', onFailLoad)
    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('console-message', onConsoleMessage)

    return () => {
      wv.removeEventListener('did-start-loading', onStartLoading)
      wv.removeEventListener('did-stop-loading', onStopLoading)
      wv.removeEventListener('did-fail-load', onFailLoad)
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('console-message', onConsoleMessage)
    }
  }, [setLoadStatus, setUrl, addInspectorResult, currentUrl, lastPageId, updateNavState])

  return (
    <webview
      ref={webviewRef as React.Ref<HTMLElement>}
      className="browser-webview"
      partition="persist:browser"
      nodeintegration={false}
      allowpopups={false}
      src={currentUrl}
    />
  )
})
