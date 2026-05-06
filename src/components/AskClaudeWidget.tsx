import { useState, useRef, useEffect } from 'react'
import { useUIStore } from '../store/ui'
import './AskClaudeWidget.css'

interface AskClaudeWidgetProps {
  lineNumber: number
  lineContent: string
  filePath: string
  position: { top: number; left: number }
  onClose: () => void
}

export function AskClaudeWidget({
  lineNumber,
  lineContent,
  filePath,
  position,
  onClose,
}: AskClaudeWidgetProps) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeTerminalIdByProject = useUIStore((s) => s.activeTerminalIdByProject)

  const activeTerminalId = activeProjectId ? activeTerminalIdByProject[activeProjectId] ?? null : null

  useEffect(() => {
    inputRef.current?.focus()

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const handleSubmit = async () => {
    if (!query.trim() || !activeTerminalId) return

    setLoading(true)
    try {
      const fileName = filePath.split(/[\\/]/).pop() ?? 'file'
      const context = `File: ${fileName}, Line ${lineNumber}\nCode: ${lineContent.trim()}\n\nQuestion: ${query}`

      // Send to active Claude terminal session
      window.daemon.terminal.write(activeTerminalId, context + '\n')
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const quickActions = [
    { label: 'Explain', query: 'Explain this code' },
    { label: 'Refactor', query: 'Suggest a refactor for this' },
    { label: 'Fix', query: 'Find and fix any issues' },
    { label: 'Test', query: 'Write a test for this' },
  ]

  return (
    <div
      className="ask-claude-widget"
      style={{ top: position.top, left: position.left }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ask-claude-header">
        <span className="ask-claude-icon">C</span>
        <span className="ask-claude-title">Ask Claude</span>
        <span className="ask-claude-line">Line {lineNumber}</span>
        <button type="button" className="ask-claude-close" onClick={onClose}>&times;</button>
      </div>

      <div className="ask-claude-context">
        <code>{lineContent.trim().slice(0, 60)}{lineContent.length > 60 ? '...' : ''}</code>
      </div>

      <div className="ask-claude-quick">
        {quickActions.map((action) => (
          <button
            key={action.label}
            className="ask-claude-quick-btn"
            onClick={() => {
              setQuery(action.query)
              inputRef.current?.focus()
            }}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="ask-claude-input-row">
        <input
          ref={inputRef}
          className="ask-claude-input"
          placeholder="Ask about this code..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />
        <button
          className="ask-claude-send"
          onClick={handleSubmit}
          disabled={!query.trim() || loading || !activeTerminalId}
        >
          {loading ? '...' : 'Send'}
        </button>
      </div>

      {!activeTerminalId && (
        <div className="ask-claude-warning">
          Start a Claude session first
        </div>
      )}
    </div>
  )
}
