import { type RefObject, useEffect, useRef } from 'react'

type ResizableWebview = HTMLElement & {
  executeJavaScript?: (code: string) => Promise<unknown>
  contentWindow?: Window | null
}

export function useWebviewResizeSync<T extends HTMLElement>(
  webviewRef: RefObject<T | null>,
  enabled = true,
) {
  const resizeFrame = useRef<number | null>(null)

  useEffect(() => {
    const webview = webviewRef.current as ResizableWebview | null
    const parent = webview?.parentElement
    if (!enabled || !webview || !parent) return

    const syncSize = () => {
      if (resizeFrame.current !== null) cancelAnimationFrame(resizeFrame.current)
      resizeFrame.current = requestAnimationFrame(() => {
        resizeFrame.current = null
        const rect = parent.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return

        webview.style.width = `${Math.floor(rect.width)}px`
        webview.style.height = `${Math.floor(rect.height)}px`
        if (webview.executeJavaScript) {
          webview.executeJavaScript('window.dispatchEvent(new Event("resize"))').catch(() => {})
          return
        }
        try {
          webview.contentWindow?.dispatchEvent(new Event('resize'))
        } catch {
          // Cross-origin iframes can ignore this; sizing still updates.
        }
      })
    }

    syncSize()
    const observer = new ResizeObserver(syncSize)
    observer.observe(parent)
    window.addEventListener('resize', syncSize)

    return () => {
      if (resizeFrame.current !== null) cancelAnimationFrame(resizeFrame.current)
      observer.disconnect()
      window.removeEventListener('resize', syncSize)
    }
  }, [enabled, webviewRef])
}
