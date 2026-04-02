import { useState } from 'react'
import { useEmailStore } from '../../../store/email'

export function AISidebar() {
  const {
    aiSidebar,
    aiSidebarData,
    aiSidebarLoading,
    closeAISidebar,
    extractions,
    messages,
    selectedMessageId,
  } = useEmailStore()

  if (!aiSidebar) return null

  return (
    <div className="email__ai-sidebar">
      <div className="email__ai-sidebar-header">
        <span className="email__ai-sidebar-title">
          {aiSidebar === 'summary' && 'Summary'}
          {aiSidebar === 'extraction' && 'Extractions'}
          {aiSidebar === 'cleanup' && 'Inbox Cleanup'}
        </span>
        <button className="email__ai-sidebar-close" onClick={closeAISidebar}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>

      <div className="email__ai-sidebar-body">
        {aiSidebarLoading && (
          <div className="email__ai-sidebar-loading">
            <div className="email__ai-sidebar-loading-dot" />
            Processing...
          </div>
        )}

        {aiSidebar === 'summary' && !aiSidebarLoading && (
          <SummaryView data={aiSidebarData} messageId={selectedMessageId} />
        )}

        {aiSidebar === 'extraction' && !aiSidebarLoading && (
          <ExtractionView extractions={extractions} messages={messages} messageId={selectedMessageId} />
        )}

        {aiSidebar === 'cleanup' && !aiSidebarLoading && (
          <CleanupView messages={messages} />
        )}
      </div>
    </div>
  )
}

function SummaryView({ data, messageId }: { data: string | null; messageId: string | null }) {
  const summaries = useEmailStore((s) => s.summaries)

  // Single message summary
  if (messageId && summaries[messageId]) {
    return <div className="email__ai-text">{summaries[messageId]}</div>
  }

  // Batch summary
  if (data) {
    return <div className="email__ai-text">{data}</div>
  }

  return <div className="email__ai-empty">No summary available</div>
}

interface ExtractionViewProps {
  extractions: Record<string, { messageId: string; items: { type: string; content: string; language?: string; context: string }[]; summary: string }>
  messages: { id: string; from: string; subject: string }[]
  messageId: string | null
}

function ExtractionView({ extractions, messages, messageId }: ExtractionViewProps) {
  // If viewing a specific message, show just that
  const targetIds = messageId ? [messageId] : messages.map((m) => m.id)
  const results = targetIds
    .filter((id) => extractions[id]?.items?.length > 0)
    .map((id) => ({ id, extraction: extractions[id] }))

  if (results.length === 0) {
    return <div className="email__ai-empty">No code or config found</div>
  }

  return (
    <div className="email__ai-extractions">
      {results.map(({ id, extraction }) => {
        const msg = messages.find((m) => m.id === id)
        return (
          <div key={id} className="email__ai-extraction-group">
            {!messageId && msg && (
              <div className="email__ai-extraction-source">{msg.from} - {msg.subject}</div>
            )}
            {extraction.items.map((item, i) => (
              <ExtractionBlock key={i} item={item} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function ExtractionBlock({ item }: { item: { type: string; content: string; language?: string; context: string } }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(item.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="email__ai-code-block">
      <div className="email__ai-code-header">
        <span className="email__ai-code-lang">{item.language ?? item.type}</span>
        <button className="email__ai-code-copy" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="email__ai-code-content">{item.content}</pre>
      {item.context && <div className="email__ai-code-context">{item.context}</div>}
    </div>
  )
}

function CleanupView({ messages }: { messages: { id: string; from: string; subject: string; isRead: boolean; labels: string[] }[] }) {
  const readOld = messages.filter((m) => m.isRead)
  const newsletters = messages.filter((m) => {
    const lower = (m.subject).toLowerCase()
    const labels = m.labels?.map((l) => l.toLowerCase()) ?? []
    return labels.includes('category_promotions') || lower.includes('unsubscribe') || lower.includes('newsletter')
  })

  return (
    <div className="email__ai-cleanup">
      <div className="email__ai-cleanup-section">
        <div className="email__ai-cleanup-title">Read messages ({readOld.length})</div>
        <div className="email__ai-cleanup-hint">These messages have been read and could be archived.</div>
        {readOld.slice(0, 10).map((m) => (
          <div key={m.id} className="email__ai-cleanup-item">
            <span className="email__ai-cleanup-from">{m.from.split('<')[0].trim()}</span>
            <span className="email__ai-cleanup-subject">{m.subject}</span>
          </div>
        ))}
        {readOld.length > 10 && (
          <div className="email__ai-cleanup-more">+{readOld.length - 10} more</div>
        )}
      </div>

      {newsletters.length > 0 && (
        <div className="email__ai-cleanup-section">
          <div className="email__ai-cleanup-title">Newsletters ({newsletters.length})</div>
          <div className="email__ai-cleanup-hint">Promotional and newsletter emails.</div>
          {newsletters.slice(0, 5).map((m) => (
            <div key={m.id} className="email__ai-cleanup-item">
              <span className="email__ai-cleanup-from">{m.from.split('<')[0].trim()}</span>
              <span className="email__ai-cleanup-subject">{m.subject}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
