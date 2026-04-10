import { useEffect, type RefObject } from 'react'
import { useEmailStore } from '../../store/email'
import { useUIStore } from '../../store/ui'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { QuickView } from './QuickView'

interface EmailQuickViewProps {
  triggerRef: RefObject<HTMLElement | null>
}

function relativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

export function EmailQuickView({ triggerRef }: EmailQuickViewProps) {
  const isOpen = useUIStore((s) => s.emailQuickViewOpen)
  const closeAll = useUIStore((s) => s.closeAllQuickViews)
  const setDrawerTool = useWorkflowShellStore((s) => s.setDrawerTool)

  const accounts = useEmailStore((s) => s.accounts)
  const messages = useEmailStore((s) => s.messages)
  const unreadTotal = useEmailStore((s) => s.unreadTotal)
  const loadAccounts = useEmailStore((s) => s.loadAccounts)
  const loadMessages = useEmailStore((s) => s.loadMessages)

  useEffect(() => {
    if (!isOpen) return
    const init = async () => {
      if (accounts.length === 0) await loadAccounts()
      await loadMessages()
    }
    init()
  }, [isOpen])

  const navigateToEmail = () => {
    closeAll()
    useUIStore.getState().openWorkspaceTool('email')
  }

  const handleCompose = () => {
    useEmailStore.getState().setViewMode('compose')
    navigateToEmail()
  }

  const handleMarkAllRead = async () => {
    await useEmailStore.getState().markAllRead()
  }

  const handleMessageClick = (messageId: string) => {
    useEmailStore.getState().selectMessage(messageId)
    navigateToEmail()
  }

  const recentMessages = messages.slice(0, 5)

  return (
    <QuickView
      isOpen={isOpen}
      onClose={closeAll}
      triggerRef={triggerRef}
      anchor="above"
      variant="email"
    >
      <div className="quickview-email-header">
        <div className="quickview-email-header-left">
          <span className="quickview-email-header-title">Inbox</span>
          <span className="quickview-email-header-count">
            {unreadTotal > 0 ? `${unreadTotal} unread` : 'No unread'}
          </span>
        </div>
        <div className="quickview-email-header-right">
          <button
            className="quickview-email-btn quickview-email-btn--primary"
            onClick={handleCompose}
            aria-label="Compose email"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            Compose
          </button>
          {unreadTotal > 0 && (
            <button
              className="quickview-email-btn quickview-email-btn--secondary"
              onClick={handleMarkAllRead}
              aria-label="Mark all as read"
            >
              Mark Read
            </button>
          )}
        </div>
      </div>

      <div className="quickview-list quickview-list--emails" role="list">
        {recentMessages.length === 0 ? (
          <div className="quickview-empty">No recent emails</div>
        ) : (
          recentMessages.map((msg) => {
            const isUnread = !msg.isRead
            return (
              <div
                key={msg.id}
                className={`quickview-email-row ${isUnread ? 'quickview-email-row--unread' : ''}`}
                role="listitem"
                onClick={() => handleMessageClick(msg.id)}
              >
                {isUnread && <span className="quickview-email-dot" />}
                <div className="quickview-email-top">
                  <span className="quickview-email-sender">{msg.from}</span>
                  <span className="quickview-email-time">{relativeTime(msg.date)}</span>
                </div>
                <div className="quickview-email-subject">{msg.subject}</div>
                <div className="quickview-email-preview">{msg.snippet}</div>
              </div>
            )
          })
        )}
      </div>

      <div className="quickview-footer">
        <button className="quickview-footer-link" onClick={navigateToEmail}>
          Open Inbox
        </button>
      </div>
    </QuickView>
  )
}
