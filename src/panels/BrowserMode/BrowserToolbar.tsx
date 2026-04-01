import { useState, useCallback, useEffect } from 'react'

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

interface BrowserToolbarProps {
  url: string
  onNavigate: (url: string) => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  isInspectMode: boolean
  onToggleInspect: () => void
  loadStatus: LoadStatus
  canGoBack: boolean
  canGoForward: boolean
}

export function BrowserToolbar({
  url,
  onNavigate,
  onBack,
  onForward,
  onReload,
  isInspectMode,
  onToggleInspect,
  loadStatus,
  canGoBack,
  canGoForward,
}: BrowserToolbarProps) {
  const [inputValue, setInputValue] = useState(url)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        onNavigate(inputValue.trim())
      }
    },
    [inputValue, onNavigate]
  )

  // Sync input when URL changes externally (e.g. did-navigate)
  useEffect(() => {
    setInputValue(url)
  }, [url])

  return (
    <div className="browser-toolbar">
      {/* Back */}
      <button className="browser-nav-btn" onClick={onBack} title="Back" disabled={!canGoBack}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Forward */}
      <button className="browser-nav-btn" onClick={onForward} title="Forward" disabled={!canGoForward}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Reload */}
      <button className="browser-nav-btn" onClick={onReload} title="Reload">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13.5 2v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* URL input */}
      <input
        className="browser-url"
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="http://localhost:3000"
        spellCheck={false}
      />

      {/* Status dot */}
      <div
        className={`browser-status-dot browser-status-dot--${loadStatus}`}
        title={loadStatus}
      />

      {/* Inspect toggle */}
      <button
        className={`browser-nav-btn${isInspectMode ? ' browser-nav-btn--active' : ''}`}
        onClick={onToggleInspect}
        title={isInspectMode ? 'Disable inspect' : 'Enable inspect'}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
