import { useRef, useCallback } from 'react'
import { useBrowserStore } from '../../store/browser'
import { PluginErrorBoundary } from '../../components/ErrorBoundary'
import { BrowserToolbar } from './BrowserToolbar'
import { BrowserWebview, BrowserWebviewHandle } from './BrowserWebview'
import './BrowserMode.css'

// Browser mode now renders ONLY the toolbar + webview.
// The terminal below (shared xterm.js panel) handles agent interaction.
// This removes the duplicate BrowserAgentTerminal chat widget.

export function BrowserMode() {
  const webviewRef = useRef<BrowserWebviewHandle>(null)

  const currentUrl = useBrowserStore((s) => s.currentUrl)
  const isInspectMode = useBrowserStore((s) => s.isInspectMode)
  const loadStatus = useBrowserStore((s) => s.loadStatus)
  const canGoBack = useBrowserStore((s) => s.canGoBack)
  const canGoForward = useBrowserStore((s) => s.canGoForward)
  const setUrl = useBrowserStore((s) => s.setUrl)
  const setInspectMode = useBrowserStore((s) => s.setInspectMode)

  const handleNavigate = useCallback(
    (url: string) => {
      setUrl(url)
      webviewRef.current?.navigate(url)
    },
    [setUrl]
  )

  const handleBack = useCallback(() => {
    webviewRef.current?.goBack()
  }, [])

  const handleForward = useCallback(() => {
    webviewRef.current?.goForward()
  }, [])

  const handleReload = useCallback(() => {
    webviewRef.current?.reload()
  }, [])

  const handleToggleInspect = useCallback(() => {
    const next = !isInspectMode
    setInspectMode(next)
    if (next) {
      webviewRef.current?.injectInspector()
    } else {
      webviewRef.current?.removeInspector()
    }
  }, [isInspectMode, setInspectMode])

  return (
    <div className="browser-mode">
      <BrowserToolbar
        url={currentUrl}
        onNavigate={handleNavigate}
        onBack={handleBack}
        onForward={handleForward}
        onReload={handleReload}
        isInspectMode={isInspectMode}
        onToggleInspect={handleToggleInspect}
        loadStatus={loadStatus}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
      />

      <div className="browser-webview-area" style={{ flex: 1 }}>
        <PluginErrorBoundary>
          <BrowserWebview ref={webviewRef} />
        </PluginErrorBoundary>
      </div>
    </div>
  )
}
