import { useState } from 'react'
import { useEmailStore } from '../../../store/email'

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&#39;': "'", '&#x27;': "'", '&quot;': '"', '&amp;': '&',
    '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&apos;': "'",
  }
  let decoded = text
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replaceAll(entity, char)
  }
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  return decoded
}

function parseSenderName(from: string): string {
  const match = from.match(/^(.+?)\s*<[^>]+>$/)
  if (match) return match[1].replace(/^["']|["']$/g, '').trim()
  return from
}

function parseSenderEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  if (match) return match[1]
  if (from.includes('@')) return from
  return ''
}

export function MessagePreview() {
  const {
    messages,
    selectedMessageId,
    selectMessage,
    extractCode,
    summarize,
    setAISidebar,
    openCompanion,
  } = useEmailStore()

  const [extracting, setExtracting] = useState(false)
  const [summarizing, setSummarizing] = useState(false)

  const message = messages.find((m) => m.id === selectedMessageId)
  if (!message) return null

  const senderName = parseSenderName(message.from)
  const senderEmail = parseSenderEmail(message.from)
  const body = decodeHtmlEntities(message.body || '')
  const subject = decodeHtmlEntities(message.subject)

  const handleExtract = async () => {
    setExtracting(true)
    await extractCode(message.id, message.accountId)
    setExtracting(false)
    setAISidebar('extraction')
  }

  const handleSummarize = async () => {
    setSummarizing(true)
    await summarize(message.id, message.accountId)
    setSummarizing(false)
    const summary = useEmailStore.getState().summaries[message.id]
    if (summary) {
      setAISidebar('summary', summary)
    }
  }

  const handleOpenFull = () => {
    openCompanion(message.id)
  }

  return (
    <div className="email__preview">
      <div className="email__preview-header">
        <div className="email__preview-header-left">
          <button className="email__preview-back" onClick={() => selectMessage(null)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M10 12L6 8l4-4" />
            </svg>
            Back
          </button>
        </div>
        <div className="email__preview-actions">
          <button className="email__action-btn" onClick={handleExtract} disabled={extracting}>
            {extracting ? 'Extracting...' : 'Extract Code'}
          </button>
          <button className="email__action-btn" onClick={handleSummarize} disabled={summarizing}>
            {summarizing ? 'Summarizing...' : 'Summarize'}
          </button>
          <button className="email__action-btn email__action-btn--open" onClick={handleOpenFull}>
            Open Full
          </button>
        </div>
      </div>

      <div className="email__preview-content">
        <div className="email__preview-subject">{subject}</div>
        <div className="email__preview-meta">
          <div className="email__preview-meta-from">
            <span className="email__preview-sender">{senderName}</span>
            <span className="email__preview-email">{senderEmail}</span>
          </div>
          <span className="email__preview-date">{relativeTime(message.date)}</span>
        </div>
        <div className="email__preview-body">{body}</div>
      </div>
    </div>
  )
}
