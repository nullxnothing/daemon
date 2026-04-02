import type { EmailAccount } from '../../../types/daemon.d'

interface AccountBarProps {
  accounts: EmailAccount[]
  activeId: string | 'all'
  onSelect: (id: string | 'all') => void
  onAddClick: () => void
  onSettingsClick: () => void
}

function providerLabel(provider: string): string {
  if (provider === 'gmail') return 'Gmail'
  if (provider === 'icloud') return 'iCloud'
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}

function truncateEmail(email: string): string {
  if (email.length <= 18) return email
  const [local, domain] = email.split('@')
  if (!domain) return email.slice(0, 18)
  const truncLocal = local.length > 8 ? local.slice(0, 8) + '..' : local
  return `${truncLocal}@${domain}`
}

function providerDotClass(provider: string): string {
  if (provider === 'gmail') return 'email__pill-dot email__pill-dot--gmail'
  if (provider === 'icloud') return 'email__pill-dot email__pill-dot--icloud'
  return 'email__pill-dot'
}

export function AccountBar({ accounts, activeId, onSelect, onAddClick, onSettingsClick }: AccountBarProps) {
  const totalUnread = accounts.reduce((sum, a) => sum + a.unreadCount, 0)

  return (
    <div className="email__account-bar">
      <button
        className={`email__account-pill ${activeId === 'all' ? 'email__account-pill--active' : ''}`}
        onClick={() => onSelect('all')}
        title="All accounts"
      >
        <span className="email__pill-label">All</span>
        {totalUnread > 0 && (
          <span className="email__account-pill__badge">{totalUnread}</span>
        )}
      </button>

      {accounts.map((account) => (
        <button
          key={account.id}
          className={`email__account-pill ${activeId === account.id ? 'email__account-pill--active' : ''}`}
          onClick={() => onSelect(account.id)}
          title={account.email}
        >
          <span className={providerDotClass(account.provider)} />
          <span className="email__pill-label">{truncateEmail(account.email)}</span>
          {account.unreadCount > 0 && (
            <span className="email__account-pill__badge">{account.unreadCount}</span>
          )}
        </button>
      ))}

      <button
        className="email__account-pill email__account-pill--add"
        onClick={onAddClick}
        title="Add account"
      >
        +
      </button>

      <button
        className="email__account-pill email__account-pill--settings"
        onClick={onSettingsClick}
        title="Settings"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
        </svg>
      </button>
    </div>
  )
}
