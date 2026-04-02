import { useRef, useEffect, useState, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import './ImageEditor.css'

// miniPaint is served via the minipaint:// custom protocol
const MINIPAINT_URL = 'minipaint:///index.html'

interface MiniPaintWindow extends Window {
  Layers: {
    insert: (config: { name: string; type: string; data: HTMLImageElement; width: number; height: number }) => void
    get_dimensions: () => { width: number; height: number }
    convert_layers_to_canvas: (ctx: CanvasRenderingContext2D, _w?: number, _h?: number) => void
  }
}

export default function ImageEditor() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  // Load the image that triggered the editor (from store or most recent image tab)
  useEffect(() => {
    const state = useUIStore.getState()
    const projectId = state.activeProjectId
    if (!projectId) return
    const activePath = state.activeFilePathByProject[projectId]
    if (activePath && isImageFile(activePath)) {
      setImagePath(activePath)
    }
  }, [])

  // Once iframe is loaded and we have an image, inject it
  useEffect(() => {
    if (!loaded || !imagePath) return

    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return

    // Load the image via IPC, then inject into miniPaint
    window.daemon.fs.readImageBase64(imagePath).then((res) => {
      if (!res.ok || !res.data) return
      const mpWin = iframe.contentWindow as unknown as MiniPaintWindow
      if (!mpWin?.Layers) return

      const img = new Image()
      img.onload = () => {
        mpWin.Layers.insert({
          name: imagePath.split(/[\\/]/).pop() ?? 'image',
          type: 'image',
          data: img,
          width: img.width,
          height: img.height,
        })
      }
      img.src = res.data.dataUrl
    })
  }, [loaded, imagePath])

  const handleSave = useCallback(async () => {
    if (!imagePath || saving) return
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return

    setSaving(true)
    setStatus(null)

    try {
      const mpWin = iframe.contentWindow as unknown as MiniPaintWindow
      const dims = mpWin.Layers.get_dimensions()
      const canvas = document.createElement('canvas')
      canvas.width = dims.width
      canvas.height = dims.height
      const ctx = canvas.getContext('2d')!
      mpWin.Layers.convert_layers_to_canvas(ctx)

      // Convert to appropriate format based on extension
      const ext = imagePath.split('.').pop()?.toLowerCase() ?? 'png'
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), mimeType, 0.95)
      })

      const buffer = await blob.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))

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
  }, [imagePath, saving])

  const handleOpenFile = useCallback(async () => {
    // Let user pick any image from the project
    const res = await window.daemon.fs.pickImage()
    if (res.ok && res.data) {
      setImagePath(res.data)
      setLoaded(false) // Force re-inject on next load
      // Reload the iframe to clear miniPaint state
      if (iframeRef.current) {
        iframeRef.current.src = MINIPAINT_URL
      }
    }
  }, [])

  return (
    <div className="image-editor">
      <div className="image-editor-toolbar">
        <button className="ie-btn" onClick={handleOpenFile}>Open Image</button>
        <button className="ie-btn ie-btn-primary" onClick={handleSave} disabled={saving || !imagePath}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {imagePath && (
          <span className="ie-filepath">{imagePath.split(/[\\/]/).pop()}</span>
        )}
        {status && <span className="ie-status">{status}</span>}
      </div>
      <iframe
        ref={iframeRef}
        src={MINIPAINT_URL}
        className="image-editor-iframe"
        onLoad={() => {
          // Give miniPaint a moment to initialize its global objects
          setTimeout(() => setLoaded(true), 500)
        }}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  )
}

function isImageFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif'].includes(ext)
}
