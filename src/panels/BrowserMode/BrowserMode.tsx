import { useRef, useCallback } from 'react'
import { useBrowserStore } from '../../store/browser'
import { useSplitter } from '../../hooks/useSplitter'
import { BrowserToolbar } from './BrowserToolbar'
import { BrowserWebview, BrowserWebviewHandle } from './BrowserWebview'
import { BrowserAgentTerminal } from './BrowserAgentTerminal'
import './BrowserMode.css'

export function BrowserMode() {
  const webviewRef = useRef<BrowserWebviewHandle>(null)

  const currentUrl = useBrowserStore((s) => s.currentUrl)
  const isInspectMode = useBrowserStore((s) => s.isInspectMode)
  const loadStatus = useBrowserStore((s) => s.loadStatus)
  const setUrl = useBrowserStore((s) => s.setUrl)
  const setInspectMode = useBrowserStore((s) => s.setInspectMode)

  const { size: terminalHeight, splitterProps } = useSplitter({
    direction: 'vertical',
    min: 100,
    max: 500,
    initial: 200,
  })

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
      />

      <div className="browser-webview-area">
        <BrowserWebview ref={webviewRef} />
      </div>

      <div className="browser-splitter" {...splitterProps} />

      <div className="browser-terminal-area" style={{ height: terminalHeight }}>
        <BrowserAgentTerminal onAgentNavigate={handleNavigate} />
      </div>
    </div>
  )
}
