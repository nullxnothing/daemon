import { useState } from 'react'
import { useEmailStore } from '../../../store/email'

export function ComposeView() {
  const { setViewMode } = useEmailStore()
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const handleSend = async () => {
    if (!to.trim() || !subject.trim()) return
    setSending(true)
    setStatus(null)

    // Check if send endpoint exists on the IPC bridge
    try {
      const emailApi = window.daemon.email as unknown as Record<string, unknown>
      if (typeof emailApi.send === 'function') {
        const sendFn = emailApi.send as (to: string, subject: string, body: string) => Promise<{ ok: boolean; error?: string }>
        const res = await sendFn(to, subject, body)
        if (res.ok) {
          setStatus('Sent')
          setTimeout(() => setViewMode('inbox'), 1000)
        } else {
          setStatus(res.error ?? 'Send failed')
        }
      } else {
        setStatus('Send not yet implemented')
      }
    } catch {
      setStatus('Send not yet implemented')
    }
    setSending(false)
  }

  const handleDiscard = () => {
    setViewMode('inbox')
  }

  return (
    <div className="email__compose">
      <div className="email__compose-header">
        <span className="email__compose-title">New Message</span>
        <div className="email__compose-header-actions">
          <button className="email__toolbar-btn-sm" onClick={handleDiscard}>Discard</button>
          <button
            className="email__toolbar-btn email__toolbar-btn--primary"
            onClick={handleSend}
            disabled={sending || !to.trim() || !subject.trim()}
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>

      <div className="email__compose-fields">
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
