import { useState, useRef, useEffect } from 'react'
import { useEmailStore, type FilterMode } from '../../../store/email'

const FILTERS: { label: string; value: FilterMode }[] = [
  { label: 'All', value: 'all' },
  { label: 'Unread', value: 'unread' },
  { label: 'Important', value: 'important' },
  { label: 'Newsletters', value: 'newsletters' },
]

export function ActionToolbar() {
  const {
    filterMode,
    setFilterMode,
    selectMode,
    toggleSelectMode,
    selectedIds,
    selectAll,
    clearSelection,
    setViewMode,
    messages,
    activeAccountId,
    summarize,
    extractCode,
    setAISidebar,
  } = useEmailStore()

  const [showAIMenu, setShowAIMenu] = useState(false)
  const aiMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showAIMenu) return
    const handleClick = (e: MouseEvent) => {
      if (aiMenuRef.current && !aiMenuRef.current.contains(e.target as Node)) {
        setShowAIMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showAIMenu])

  const handleSummarizeUnread = async () => {
    setShowAIMenu(false)
    const unread = messages.filter((m) => !m.isRead)
    if (unread.length === 0) return

    setAISidebar('summary')
    useEmailStore.setState({ aiSidebarLoading: true })

    const summaryParts: string[] = []
    for (const msg of unread.slice(0, 10)) {
      try {
        await summarize(msg.id, msg.accountId)
        const summary = useEmailStore.getState().summaries[msg.id]
        if (summary) {
          summaryParts.push(`[${msg.from}] ${msg.subject}\n${summary}`)
        }
      } catch {
        // Continue on individual failures
      }
    }
    useEmailStore.setState({
      aiSidebarData: summaryParts.join('\n\n---\n\n') || 'No unread messages to summarize.',
      aiSidebarLoading: false,
    })
  }

  const handleExtractAll = async () => {
    setShowAIMenu(false)
    setAISidebar('extraction')
    useEmailStore.setState({ aiSidebarLoading: true })

    for (const msg of messages.slice(0, 20)) {
      try {
        await extractCode(msg.id, msg.accountId)
      } catch {
        // Continue
      }
    }
    useEmailStore.setState({ aiSidebarLoading: false })
  }

  const handleCleanup = () => {
    setShowAIMenu(false)
    setAISidebar('cleanup')
    useEmailStore.setState({
      aiSidebarData: null,
      aiSidebarLoading: false,
    })
  }

  return (
    <div className="email__action-toolbar">
      <div className="email__action-toolbar-left">
        <button
          className="email__toolbar-btn email__toolbar-btn--primary"
          onClick={() => setViewMode('compose')}
        >
          Compose
        </button>

        <div className="email__ai-dropdown" ref={aiMenuRef}>
          <button
            className="email__toolbar-btn"
            onClick={() => setShowAIMenu(!showAIMenu)}
          >
            AI Actions
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
              <path d="M1 2.5L4 5.5L7 2.5" />
            </svg>
          </button>
          {showAIMenu && (
            <div className="email__ai-menu">
              <button className="email__ai-menu-item" onClick={handleCleanup}>
                Clean up inbox
              </button>
              <button className="email__ai-menu-item" onClick={handleSummarizeUnread}>
                Summarize unread
              </button>
              <button className="email__ai-menu-item" onClick={handleExtractAll}>
                Extract all code
              </button>
            </div>
          )}
        </div>

        <div className="email__filter-pills">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={`email__filter-pill ${filterMode === f.value ? 'email__filter-pill--active' : ''}`}
              onClick={() => setFilterMode(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="email__action-toolbar-right">
        {selectMode && (
          <>
            <span className="email__select-count">{selectedIds.size} selected</span>
            <button className="email__toolbar-btn-sm" onClick={selectAll}>All</button>
            <button className="email__toolbar-btn-sm" onClick={clearSelection}>None</button>
          </>
        )}
        <button
          className={`email__toolbar-btn-sm ${selectMode ? 'email__toolbar-btn-sm--active' : ''}`}
          onClick={toggleSelectMode}
          title="Toggle select mode"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="2" y="2" width="5" height="5" rx="1" />
            <rect x="2" y="9" width="5" height="5" rx="1" />
            <path d="M10 4h4M10 11h4" />
          </svg>
        </button>
      </div>
    </div>
  )
}
