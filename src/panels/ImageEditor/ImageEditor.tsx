import { useRef, useEffect, useState, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import './ImageEditor.css'

// miniPaint is served via the minipaint:// custom protocol.
// Communication with the iframe uses postMessage (cross-origin safe).
const MINIPAINT_URL = 'minipaint://app/index.html'
const READY_RETRY_INTERVAL_MS = 250
const READY_RETRY_LIMIT = 20
const READY_FALLBACK_MS = 2500

export default function ImageEditor() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  // Holds resolve/reject for the pending export request
  const exportResolverRef = useRef<{
    resolve: (base64: string) => void
    reject: (err: Error) => void
  } | null>(null)
  const readyRetryRef = useRef<number | null>(null)
  const readyFallbackRef = useRef<number | null>(null)

  const clearReadyTimers = useCallback(() => {
    if (readyRetryRef.current !== null) {
      window.clearInterval(readyRetryRef.current)
      readyRetryRef.current = null
    }
    if (readyFallbackRef.current !== null) {
      window.clearTimeout(readyFallbackRef.current)
      readyFallbackRef.current = null
    }
  }, [])

  const markReady = useCallback(() => {
    setReady(true)
    clearReadyTimers()
  }, [clearReadyTimers])

  const pingMiniPaint = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    iframe.contentWindow.postMessage({ type: 'mp:ping' }, '*')
  }, [])

  // Load the image that triggered the editor from the active file in the store
  useEffect(() => {
    const state = useUIStore.getState()
    const projectId = state.activeProjectId
    if (!projectId) return
    const activePath = state.activeFilePathByProject[projectId]
    if (activePath && isImageFile(activePath)) {
      setImagePath(activePath)
    }
  }, [])

  // Listen for postMessages from the miniPaint iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data
      if (!msg || typeof msg.type !== 'string') return

      if (msg.type === 'mp:ready') {
        markReady()
        return
      }

      if (msg.type === 'mp:inserted') {
        // Image successfully injected into miniPaint
        return
      }

      if (msg.type === 'mp:exported') {
        exportResolverRef.current?.resolve(msg.base64 as string)
        exportResolverRef.current = null
        return
      }

      if (msg.type === 'mp:export-error') {
        exportResolverRef.current?.reject(new Error(msg.error as string))
        exportResolverRef.current = null
        return
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [markReady])

  // Once miniPaint signals ready and we have an image path, inject it
  useEffect(() => {
    if (!ready || !imagePath) return
    let cancelled = false

    window.daemon.fs.readImageBase64(imagePath).then((res) => {
      if (cancelled || !res.ok || !res.data) return
      const targetWindow = iframeRef.current?.contentWindow
      if (!targetWindow) return
      targetWindow.postMessage({
        type: 'mp:insert-image',
        name: imagePath.split(/[\\/]/).pop() ?? 'image',
        dataUrl: res.data.dataUrl,
      }, '*')
    })

    return () => {
      cancelled = true
    }
  }, [ready, imagePath])

  const requestExport = useCallback((mimeType: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const iframe = iframeRef.current
      if (!iframe?.contentWindow) {
        reject(new Error('iframe not ready'))
        return
      }
      exportResolverRef.current = { resolve, reject }
      iframe.contentWindow.postMessage({ type: 'mp:export', mimeType }, '*')

      // Timeout guard — reject if miniPaint doesn't respond within 15s
      setTimeout(() => {
        if (exportResolverRef.current) {
          exportResolverRef.current.reject(new Error('Export timed out'))
          exportResolverRef.current = null
        }
      }, 15000)
    })
  }, [])

  const handleSave = useCallback(async () => {
    if (!imagePath || saving || !ready) return

    setSaving(true)
    setStatus(null)

    try {
      const ext = imagePath.split('.').pop()?.toLowerCase() ?? 'png'
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
      const base64 = await requestExport(mimeType)
      const res = await window.daemon.fs.writeImageFromBase64(imagePath, base64)
      if (res.ok) {
        setStatus('Saved')
        setTimeout(() => setStatus(null), 2000)
      } else {
        setStatus(res.error ?? 'Save failed')
      }
    } catch (e) {
      setStatus((e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [imagePath, saving, ready, requestExport])

  const handleOpenFile = useCallback(async () => {
    const res = await window.daemon.fs.pickImage()
    if (!res.ok || !res.data) return

    setImagePath(res.data)
    setReady(false)

    // Reload the iframe to get a fresh miniPaint instance
    if (iframeRef.current) {
      iframeRef.current.src = MINIPAINT_URL
    }
  }, [])

  const handleIframeLoad = useCallback(() => {
    setReady(false)
    clearReadyTimers()
    pingMiniPaint()

    let attempts = 1
    readyRetryRef.current = window.setInterval(() => {
      if (attempts >= READY_RETRY_LIMIT) {
        clearReadyTimers()
        return
      }
      attempts += 1
      pingMiniPaint()
    }, READY_RETRY_INTERVAL_MS)

    // The iframe can finish booting before our initial ready listener sees the first signal.
    // Once we have given the bridge several chances to respond, unblock the UI instead of
    // leaving it in a permanent loading state.
    readyFallbackRef.current = window.setTimeout(() => {
      markReady()
    }, READY_FALLBACK_MS)
  }, [clearReadyTimers, markReady, pingMiniPaint])

  useEffect(() => {
    return () => {
      clearReadyTimers()
    }
  }, [clearReadyTimers])

  return (
    <div className="image-editor">
      <div className="image-editor-toolbar">
        <button className="ie-btn" onClick={handleOpenFile}>Open Image</button>
        <button
          className="ie-btn ie-btn-primary"
          onClick={handleSave}
          disabled={saving || !imagePath || !ready}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {imagePath && (
          <span className="ie-filepath">{imagePath.split(/[\\/]/).pop()}</span>
        )}
        {status && <span className="ie-status">{status}</span>}
        {!ready && <span className="ie-status ie-status--dim">Loading editor...</span>}
      </div>
      <iframe
        ref={iframeRef}
        src={MINIPAINT_URL}
        className="image-editor-iframe"
        onLoad={handleIframeLoad}
        /* sandbox removed — minipaint: protocol is already isolated and
           allow-scripts + allow-same-origin together is equivalent to no sandbox */
        title="miniPaint image editor"
      />
    </div>
  )
}

function isImageFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif'].includes(ext)
}
