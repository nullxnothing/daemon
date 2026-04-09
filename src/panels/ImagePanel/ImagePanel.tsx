import { useState, useEffect, useRef, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { useImageStore } from '../../store/images'
import './ImagePanel.css'

const MODELS = [
  { key: 'fast', label: 'Fast', cost: '$0.02' },
  { key: 'standard', label: 'Standard', cost: '$0.04' },
  { key: 'ultra', label: 'Ultra', cost: '$0.06' },
] as const

const RATIOS = ['1:1', '16:9', '4:3', '9:16', '3:4'] as const

const STYLE_TAGS = [
  'photorealistic',
  'digital art',
  'watercolor',
  'isometric',
  'line art',
  'cinematic',
  'minimal',
  '3D render',
] as const

const MODEL_BADGE: Record<string, string> = { fast: 'F', standard: 'S', ultra: 'U' }

function parseError(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return parsed.message || parsed.error?.message || raw
  } catch {
    return raw
  }
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function ImagePanel() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const {
    images, loading, generating, error, selectedId, hasApiKey, watcherRunning,
    sessionCount, sessionCost,
    loadImages, generate, deleteImage, select, checkApiKey, toggleWatcher, checkWatcher,
  } = useImageStore()

  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('standard')
  const [ratio, setRatio] = useState('1:1')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [keyValue, setKeyValue] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Base64 thumbnail cache
  const [thumbCache, setThumbCache] = useState<Map<string, string>>(new Map())
  const loadingThumbs = useRef<Set<string>>(new Set())

  useEffect(() => {
    checkApiKey()
    checkWatcher()
    loadImages()
  }, [])

  // Load thumbnails for visible images
  const loadThumb = useCallback(async (id: string) => {
    if (thumbCache.has(id) || loadingThumbs.current.has(id)) return
    loadingThumbs.current.add(id)
    try {
      const res = await window.daemon.images.getBase64(id)
      if (res.ok && res.data) {
        const dataUrl = `data:${res.data.mimeType};base64,${res.data.data}`
        setThumbCache((prev) => {
          const next = new Map(prev)
          next.set(id, dataUrl)
          return next
        })
      }
    } catch {
      // Silently skip failed thumbs
    } finally {
      loadingThumbs.current.delete(id)
    }
  }, [thumbCache])

  useEffect(() => {
    for (const img of images) {
      loadThumb(img.id)
    }
  }, [images, loadThumb])

  const handleAutoGrow = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  const handleTagClick = (tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) {
        next.delete(tag)
        setPrompt((p) => p.replace(new RegExp(`${tag},?\\s*|,?\\s*${tag}`), '').trim())
      } else {
        next.add(tag)
        setPrompt((p) => (p ? `${p}, ${tag}` : tag))
      }
      return next
    })
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return
    await generate({
      prompt: prompt.trim(),
      model,
      aspectRatio: ratio,
      projectId: activeProjectId ?? undefined,
      tags: activeTags.size > 0 ? Array.from(activeTags) : undefined,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleGenerate()
    }
  }

  const handleLoadMore = () => {
    const current = useImageStore.getState().filter
    useImageStore.getState().setFilter({ offset: (current.offset ?? 0) + (current.limit ?? 50) })
  }

  const handleReveal = (id: string) => {
    const img = images.find((i) => i.id === id)
    if (img?.filepath) {
      window.daemon.fs.reveal(img.filepath)
    }
  }

  const handleDelete = async (id: string) => {
    await deleteImage(id)
  }

  const handleGoToSettings = () => {
    useWorkflowShellStore.getState().setDrawerTool('settings')
  }

  const handleSaveKey = async () => {
    if (!keyValue.trim() || savingKey) return
    setSavingKey(true)
    try {
      const res = await window.daemon.claude.storeKey('GEMINI_API_KEY', keyValue.trim())
      if (res.ok) {
        setKeyValue('')
        setShowKeyInput(false)
        useImageStore.setState({ error: null })
        await checkApiKey()
      }
    } finally {
      setSavingKey(false)
    }
  }

  const isKeyError = error?.toLowerCase().includes('api key')

  const selectedImage = selectedId ? images.find((i) => i.id === selectedId) : null

  // No API key state or show key input
  if (!hasApiKey || showKeyInput) {
    return (
      <div className="image-panel">
        <div className="image-panel-header">
          <h2 className="image-panel-title">Images</h2>
        </div>
        <div className="image-no-key">
          <div className="image-no-key-text">
            {isKeyError
              ? 'Your Gemini API key is invalid or expired. Enter a new one below.'
              : 'Enter your Gemini API key to start generating images.'}
          </div>
          <div className="image-key-input-row">
            <input
              className="image-key-input"
              type="password"
              placeholder="Paste Gemini API key..."
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveKey() }}
              autoFocus
            />
            <button
              className="image-no-key-btn"
              onClick={handleSaveKey}
              disabled={!keyValue.trim() || savingKey}
            >
              {savingKey ? 'Saving...' : 'Save Key'}
            </button>
          </div>
          <div className="image-no-key-hint">
            Get a key from <span className="image-no-key-link">ai.google.dev</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="image-panel">
      {/* Header */}
      <div className="image-panel-header">
        <h2 className="image-panel-title">Images</h2>
        <div className="image-session-stats">
          <span className="image-session-stat">
            Generated: <span className="image-session-stat-value">{sessionCount}</span>
          </span>
          <span className="image-session-stat">
            Cost: <span className="image-session-stat-value">{formatCost(sessionCost)}</span>
          </span>
        </div>
        <button
          className="image-watcher-toggle"
          onClick={toggleWatcher}
          role="switch"
          aria-checked={watcherRunning}
          aria-label={`Screenshot watcher ${watcherRunning ? 'on' : 'off'}`}
        >
          <span className={`image-watcher-dot ${watcherRunning ? 'running' : 'stopped'}`} />
          Watcher {watcherRunning ? 'On' : 'Off'}
        </button>
      </div>

      {/* Prompt */}
      <div className="image-prompt-area">
        <textarea
          ref={textareaRef}
          className="image-prompt-textarea"
          placeholder="Describe the image you want to generate..."
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); handleAutoGrow() }}
          onKeyDown={handleKeyDown}
          rows={2}
        />
      </div>

      {/* Controls */}
      <div className="image-controls">
        <div className="image-control-group">
          {MODELS.map((m) => (
            <button
              key={m.key}
              className={`image-model-btn ${model === m.key ? 'active' : ''}`}
              onClick={() => setModel(m.key)}
              aria-pressed={model === m.key}
            >
              {m.label} {m.cost}
            </button>
          ))}
        </div>
        <div className="image-control-group">
          {RATIOS.map((r) => (
            <button
              key={r}
              className={`image-ratio-btn ${ratio === r ? 'active' : ''}`}
              onClick={() => setRatio(r)}
              aria-pressed={ratio === r}
            >
              {r}
            </button>
          ))}
        </div>
        <button
          className="image-generate-btn"
          onClick={handleGenerate}
          disabled={generating || !prompt.trim()}
          title="Generate image (Ctrl+Enter)"
        >
          {generating ? 'Generating...' : 'Generate'}
        </button>
      </div>

      {/* Style Tags */}
      <div className="image-tags">
        {STYLE_TAGS.map((tag) => (
          <button
            key={tag}
            className={`image-tag ${activeTags.has(tag) ? 'active' : ''}`}
            onClick={() => handleTagClick(tag)}
            aria-pressed={activeTags.has(tag)}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="image-error">
          <span>{parseError(error)}</span>
          {isKeyError && (
            <button className="image-error-key-btn" onClick={() => setShowKeyInput(true)}>
              Update Key
            </button>
          )}
          <button className="image-error-dismiss" onClick={() => useImageStore.setState({ error: null })} aria-label="Dismiss error">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="image-body">
        {images.length === 0 && !loading ? (
          <div className="image-empty">No images yet. Generate one above.</div>
        ) : (
          <>
            <div className="image-grid">
              {images.map((img) => (
                <div
                  key={img.id}
                  className={`image-grid-item ${selectedId === img.id ? 'selected' : ''}`}
                  onClick={() => select(img.id)}
                >
                  {thumbCache.has(img.id) ? (
                    <img src={thumbCache.get(img.id)} alt={img.prompt ?? img.filename} />
                  ) : (
                    <div className="image-grid-skeleton" />
                  )}
                  {img.model && (
                    <span className="image-grid-badge">
                      {MODEL_BADGE[img.model] ?? img.model.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {images.length >= (useImageStore.getState().filter.limit ?? 50) && (
              <div className="image-load-more">
                <button className="image-load-more-btn" onClick={handleLoadMore}>
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Panel */}
      {selectedImage && (
        <div className="image-detail">
          <div className="image-detail-preview">
            {thumbCache.has(selectedImage.id) && (
              <img src={thumbCache.get(selectedImage.id)} alt={selectedImage.prompt ?? selectedImage.filename} />
            )}
          </div>
          <div className="image-detail-info">
            {selectedImage.prompt && (
              <div className="image-detail-prompt">{selectedImage.prompt}</div>
            )}
            <div className="image-detail-meta">
              {selectedImage.model && (
                <span className="image-detail-meta-item">
                  Model: <span className="image-detail-meta-value">{selectedImage.model}</span>
                </span>
              )}
              <span className="image-detail-meta-item">
                Source: <span className="image-detail-meta-value">{selectedImage.source}</span>
              </span>
              <span className="image-detail-meta-item">
                Date: <span className="image-detail-meta-value">{formatDate(selectedImage.created_at)}</span>
              </span>
            </div>
            {selectedImage.tags && (
              <div className="image-detail-tags">
                {selectedImage.tags.split(',').filter(Boolean).map((t) => (
                  <span key={t.trim()} className="image-detail-tag">{t.trim()}</span>
                ))}
              </div>
            )}
            <div className="image-detail-actions">
              <button
                className="image-detail-action-btn"
                onClick={() => handleReveal(selectedImage.id)}
              >
                Reveal in Explorer
              </button>
              <button
                className="image-detail-action-btn danger"
                onClick={() => handleDelete(selectedImage.id)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
