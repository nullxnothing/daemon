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
  const currentUrl = useBrowserStore((s) => s.currentUrl)

  const normalizeUrl = useCallback((raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
    return `http://${trimmed}`
  }, [])

  const navigate = useCallback(
    (url: string) => {
      const normalized = normalizeUrl(url)
      if (!normalized) return
      setUrl(normalized)
      setLoadStatus('loading')
      isNavigated.current = true
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
    const onStopLoading = () => setLoadStatus('loaded')

    const onFailLoad = (_event: Event) => {
      const detail = (_event as CustomEvent).detail || {}
      const code = detail.errorCode ?? -1
      if (code === -3) return
      setLoadStatus('error')
    }

    const onNavigate = (_event: Event) => {
      const detail = (_event as CustomEvent).detail || {}
      const newUrl = detail.url || ''
      if (newUrl) setUrl(newUrl)
    }

    const onConsoleMessage = (_event: Event) => {
      const detail = (_event as CustomEvent).detail || {}
      const message: string = detail.message || ''
      const level: number = detail.level ?? 0 // 0=log, 1=warn, 2=error

      const agentTerminalId = useBrowserStore.getState().agentTerminalId

      // Inspector results — special handling
      if (message.startsWith('DAEMON_INSPECT:')) {
        try {
          const payload = JSON.parse(message.slice('DAEMON_INSPECT:'.length))
          addInspectorResult({
            selector: payload.selector,
            tagName: payload.tagName,
            text: payload.text,
            url: currentUrl,
            timestamp: Date.now(),
          })

          if (agentTerminalId) {
            const styles = payload.computedStyles
              ? ` | font: ${payload.computedStyles.fontSize} ${payload.computedStyles.fontWeight} | color: ${payload.computedStyles.color}`
              : ''
            const text = payload.text ? ` "${payload.text.slice(0, 60)}"` : ''
            const line = `\r\n[INSPECT] <${payload.tagName.toLowerCase()}> ${payload.selector}${text}${styles}\r\n`
            window.daemon.terminal.write(agentTerminalId, line)
          }
        } catch {
          // malformed inspect payload
        }
        return
      }

      // Forward console errors and warnings to agent terminal
      if (agentTerminalId && level >= 1) {
        const prefix = level === 2 ? '[ERROR]' : '[CONSOLE]'
        const truncated = message.length > 200 ? message.slice(0, 200) + '...' : message
        window.daemon.terminal.write(agentTerminalId, `\r\n${prefix} ${truncated}\r\n`)
      }
    }

    const onNavigate2 = (_event: Event) => {
      const detail = (_event as CustomEvent).detail || {}
      const newUrl = detail.url || ''
      const agentTerminalId = useBrowserStore.getState().agentTerminalId
      if (agentTerminalId && newUrl) {
        window.daemon.terminal.write(agentTerminalId, `\r\n[NAV] ${newUrl}\r\n`)
      }
    }

    wv.addEventListener('did-start-loading', onStartLoading)
    wv.addEventListener('did-stop-loading', onStopLoading)
    wv.addEventListener('did-fail-load', onFailLoad)
    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('console-message', onConsoleMessage)
    wv.addEventListener('did-navigate', onNavigate2)

    return () => {
      wv.removeEventListener('did-start-loading', onStartLoading)
      wv.removeEventListener('did-stop-loading', onStopLoading)
      wv.removeEventListener('did-fail-load', onFailLoad)
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('console-message', onConsoleMessage)
      wv.removeEventListener('did-navigate', onNavigate2)
    }
  }, [setLoadStatus, setUrl, addInspectorResult, currentUrl])

  return (
    <webview
      ref={webviewRef as React.Ref<HTMLElement>}
      className="browser-webview"
      partition="persist:browser"
      nodeintegration={false}
      src={currentUrl}
    />
  )
})
