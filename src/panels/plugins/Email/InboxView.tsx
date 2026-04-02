import { useState, useCallback, useMemo } from 'react'
import { useEmailStore } from '../../../store/email'
import { MessageItem } from './MessageItem'

function matchesFilter(message: { isRead: boolean; labels: string[]; subject: string; snippet: string }, filter: string): boolean {
  if (filter === 'all') return true
  if (filter === 'unread') return !message.isRead
  if (filter === 'important') {
    const labels = message.labels?.map((l) => l.toLowerCase()) ?? []
    return labels.includes('important') || labels.includes('starred')
  }
  if (filter === 'newsletters') {
    const lower = (message.subject + ' ' + message.snippet).toLowerCase()
    const labels = message.labels?.map((l) => l.toLowerCase()) ?? []
    return labels.includes('category_promotions') || lower.includes('unsubscribe') || lower.includes('newsletter')
  }
  return true
}

export function InboxView() {
  const [query, setQuery] = useState('')
  const {
    messages,
    loading,
    error,
    activeAccountId,
    selectedMessageId,
    selectMessage,
    loadMessages,
    filterMode,
  } = useEmailStore()

  const isUnified = activeAccountId === 'all'

  const filteredMessages = useMemo(
    () => messages.filter((m) => matchesFilter(m, filterMode)),
    [messages, filterMode],
  )

  const handleSearch = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      loadMessages(activeAccountId === 'all' ? undefined : activeAccountId, query || undefined)
    }
  }, [query, activeAccountId, loadMessages])

  const handleRefresh = useCallback(() => {
    loadMessages(activeAccountId === 'all' ? undefined : activeAccountId, query || undefined)
  }, [query, activeAccountId, loadMessages])

  return (
    <>
      <div className="email__toolbar">
        <input
          className="email__search"
          type="text"
          placeholder="Search messages..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearch}
        />
        <button className="email__refresh-btn" onClick={handleRefresh} title="Refresh">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M14 2v4h-4" />
            <path d="M2 14v-4h4" />
            <path d="M13.5 6A6 6 0 0 0 3.5 4L2 6" />
            <path d="M2.5 10a6 6 0 0 0 10 2l1.5-2" />
          </svg>
        </button>
      </div>

      {error && <div className="email__error">{error}</div>}

      <div className="email__list">
        {loading && messages.length === 0 && (
          <div className="email__loading">Checking mail...</div>
        )}

        {!loading && filteredMessages.length === 0 && (
          <div className="email__empty">
            {messages.length === 0 ? 'No messages' : `No ${filterMode} messages`}
          </div>
        )}

        {filteredMessages.map((msg) => (
          <MessageItem
            key={`${msg.accountId}-${msg.id}`}
            message={msg}
            isSelected={selectedMessageId === msg.id}
            isUnified={isUnified}
            onClick={() => selectMessage(msg.id)}
          />
        ))}
      </div>
    </>
  )
}
