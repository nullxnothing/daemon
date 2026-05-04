import { useState, useEffect } from 'react'
import { useEmailStore } from '../../../store/email'

export function ComposeView() {
  const accounts = useEmailStore((s) => s.accounts)
  const activeAccountId = useEmailStore((s) => s.activeAccountId)
  const setViewMode = useEmailStore((s) => s.setViewMode)
  const sendEmail = useEmailStore((s) => s.sendEmail)

  const connectedAccounts = accounts.filter((a) => a.status === 'connected')

  // Default to active account or first connected account
  const defaultAccountId = activeAccountId !== 'all' ? activeAccountId : connectedAccounts[0]?.id ?? ''
  const [fromAccountId, setFromAccountId] = useState(defaultAccountId)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!fromAccountId && connectedAccounts.length > 0) {
      setFromAccountId(connectedAccounts[0].id)
    }
  }, [connectedAccounts, fromAccountId])

  const handleSend = async () => {
    if (!to.trim() || !subject.trim()) return
    if (!fromAccountId) {
      setStatus('No account selected')
      return
    }

    setSending(true)
    setStatus(null)

    const res = await sendEmail(fromAccountId, to.trim(), subject.trim(), body)
    if (res.ok) {
      setStatus('Sent')
      setTimeout(() => setViewMode('inbox'), 1000)
    } else {
      setStatus(res.error ?? 'Send failed')
    }

    setSending(false)
  }

  const handleDiscard = () => {
    setViewMode('inbox')
  }

  const selectedAccount = connectedAccounts.find((a) => a.id === fromAccountId)

  return (
    <div className="email__compose">
      <div className="email__compose-header">
        <span className="email__compose-title">New Message</span>
        <div className="email__compose-header-actions">
          <button className="email__toolbar-btn-sm" onClick={handleDiscard}>Discard</button>
          <button
            className="email__toolbar-btn email__toolbar-btn--primary"
            onClick={handleSend}
            disabled={sending || !to.trim() || !subject.trim() || !fromAccountId}
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>

      <div className="email__compose-fields">
        {connectedAccounts.length > 1 && (
          <div className="email__compose-field">
            <label className="email__compose-label">From</label>
            <select
              className="email__compose-input email__compose-select"
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
            >
              {connectedAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.email}</option>
              ))}
            </select>
          </div>
        )}

        {connectedAccounts.length === 1 && selectedAccount && (
          <div className="email__compose-field">
            <label className="email__compose-label">From</label>
            <span className="email__compose-from-display">{selectedAccount.email}</span>
          </div>
        )}

        {connectedAccounts.length === 0 && (
          <div className="email__compose-field">
            <span className="email__compose-error">No email accounts connected. Add one in Settings.</span>
          </div>
        )}

        <div className="email__compose-field">
          <label className="email__compose-label">To</label>
          <input
            className="email__compose-input"
            type="email"
            placeholder="recipient@example.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        <div className="email__compose-field">
          <label className="email__compose-label">Subject</label>
          <input
            className="email__compose-input"
            type="text"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <textarea
          className="email__compose-body"
          placeholder="Write your message..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      {status && (
        <div className={`email__compose-status ${status === 'Sent' ? 'email__compose-status--success' : 'email__compose-status--error'}`}>
          {status}
        </div>
      )}
    </div>
  )
}
