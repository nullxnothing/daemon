import { useEffect } from 'react'
import { useEmailStore } from '../../../store/email'
import { AccountBar } from './AccountBar'
import { ActionToolbar } from './ActionToolbar'
import { InboxView } from './InboxView'
import { MessagePreview } from './MessagePreview'
import { ComposeView } from './ComposeView'
import { AISidebar } from './AISidebar'
import { AddAccountOverlay } from './AddAccountOverlay'
import { AccountSettings } from './AccountSettings'
import '../plugin.css'
import './EmailPanel.css'

export default function EmailPanel() {
  const accounts = useEmailStore((s) => s.accounts)
  const activeAccountId = useEmailStore((s) => s.activeAccountId)
  const viewMode = useEmailStore((s) => s.viewMode)
  const aiSidebar = useEmailStore((s) => s.aiSidebar)
  const showSettings = useEmailStore((s) => s.showSettings)
  const showAddAccount = useEmailStore((s) => s.showAddAccount)
  const loadAccounts = useEmailStore((s) => s.loadAccounts)
  const setActiveAccount = useEmailStore((s) => s.setActiveAccount)
  const loadMessages = useEmailStore((s) => s.loadMessages)
  const setShowSettings = useEmailStore((s) => s.setShowSettings)
  const setShowAddAccount = useEmailStore((s) => s.setShowAddAccount)

  useEffect(() => {
    loadAccounts()
    loadMessages()
  }, [loadAccounts, loadMessages])

  const handleAccountAdded = () => {
    loadAccounts()
    loadMessages()
  }

  const handleAccountRemoved = () => {
    loadAccounts()
    loadMessages()
  }

  return (
    <div className="email">
      <AccountBar
        accounts={accounts}
        activeId={activeAccountId}
        onSelect={setActiveAccount}
        onAddClick={() => setShowAddAccount(true)}
        onSettingsClick={() => setShowSettings(true)}
      />

      <ActionToolbar />

      <div className="email__body">
        {viewMode === 'compose' ? (
          <ComposeView />
        ) : viewMode === 'message' ? (
          <div className="email__split">
            <div className="email__split-left">
              <InboxView />
            </div>
            <div className="email__split-right">
              <MessagePreview />
              {aiSidebar && <AISidebar />}
            </div>
          </div>
        ) : (
          <div className="email__inbox-full">
            <InboxView />
            {aiSidebar && <AISidebar />}
          </div>
        )}
      </div>

      {showAddAccount && (
        <AddAccountOverlay
          onClose={() => setShowAddAccount(false)}
          onAccountAdded={handleAccountAdded}
        />
      )}

      {showSettings && (
        <AccountSettings
          accounts={accounts}
          onClose={() => setShowSettings(false)}
          onAddClick={() => {
            setShowSettings(false)
            setShowAddAccount(true)
          }}
          onAccountRemoved={handleAccountRemoved}
        />
      )}
    </div>
  )
}
