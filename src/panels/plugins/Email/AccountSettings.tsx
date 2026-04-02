import { useState, useEffect } from 'react'
import { Toggle } from '../../../components/Toggle'

interface EmailAccount {
  id: string
  provider: 'gmail' | 'icloud'
  email: string
  status: 'connected' | 'error' | 'refreshing'
  last_sync_at: number | null
}

interface AccountSettingsProps {
  accounts: EmailAccount[]
  onClose: () => void
  onAddClick: () => void
  onAccountRemoved: () => void
}

function relativeTime(ts: number | null): string {
  if (!ts) return 'Never'
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

export function AccountSettings({ accounts, onClose, onAddClick, onAccountRemoved }: AccountSettingsProps) {
  const [removing, setRemoving] = useState<string | null>(null)
  const [agentAccess, setAgentAccess] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('daemon:email_agent_access')
    if (stored !== null) setAgentAccess(stored !== 'false')
  }, [])

  const handleAgentAccessToggle = (enabled: boolean) => {
    setAgentAccess(enabled)
    localStorage.setItem('daemon:email_agent_access', String(enabled))
  }

  const handleDisconnect = async (accountId: string) => {
    setRemoving(accountId)
    try {
      const res = await window.daemon.email.remove(accountId)
      if (res.ok) onAccountRemoved()
    } catch { /* handled by store */ }
    setRemoving(null)
  }

  return (
    <div className="email__overlay" onClick={onClose}>
      <div className="email__overlay-card" onClick={(e) => e.stopPropagation()}>
        <div className="email__overlay-header">
          <span className="email__overlay-title">Email Settings</span>
          <button className="email__overlay-close" onClick={onClose}>x</button>
        </div>

        {/* Agent Access Toggle */}
        <div className="email__settings-section">Agent Access</div>
        <div className="email__settings-agent-row">
          <div className="email__settings-agent-info">
            <div className="email__settings-email">Allow Claude to read email</div>
            <div className="email__settings-meta">
              Agents can list, read, extract code, and suggest cleanup across all connected inboxes
            </div>
          </div>
          <Toggle checked={agentAccess} onChange={handleAgentAccessToggle} />
        </div>

        {/* Connected Accounts */}
        <div className="email__settings-section">Connected Accounts</div>

        {accounts.length === 0 && (
          <div className="email__empty">No accounts connected</div>
        )}

        {accounts.map((account) => (
          <div key={account.id} className="email__settings-account">
            <span className={`email__settings-dot email__settings-dot--${account.status}`} />
            <div className="email__settings-info">
              <div className="email__settings-email">{account.email}</div>
              <div className="email__settings-meta">
                {account.provider} &middot; Last sync: {relativeTime(account.last_sync_at)}
              </div>
            </div>
            <button
              className="email__disconnect"
              onClick={() => handleDisconnect(account.id)}
              disabled={removing === account.id}
            >
              {removing === account.id ? '...' : 'Disconnect'}
            </button>
          </div>
        ))}

        <button className="email__auth-btn" onClick={onAddClick}>
          + Add Account
        </button>
      </div>
    </div>
  )
}
