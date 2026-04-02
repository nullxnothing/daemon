import { useState, useEffect } from 'react'

interface AddAccountOverlayProps {
  onClose: () => void
  onAccountAdded: () => void
}

type Provider = 'gmail' | 'icloud'

export function AddAccountOverlay({ onClose, onAccountAdded }: AddAccountOverlayProps) {
  const [provider, setProvider] = useState<Provider>('gmail')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasGmailCreds, setHasGmailCreds] = useState<boolean | null>(null)
  const [showCredsForm, setShowCredsForm] = useState(false)

  // Gmail first-time setup
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')

  // iCloud state
  const [appleEmail, setAppleEmail] = useState('')
  const [appPassword, setAppPassword] = useState('')

  useEffect(() => {
    window.daemon.email.hasGmailCreds().then((res) => {
      if (res.ok) setHasGmailCreds(!!res.data)
    }).catch(() => setHasGmailCreds(false))
  }, [])

  const handleGmailQuickConnect = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.daemon.email.addGmail()
      if (res.ok) {
        onAccountAdded()
        onClose()
      } else {
        setError(res.error ?? 'Gmail connection failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    }
    setLoading(false)
  }

  const handleGmailFirstSetup = async () => {
    if (!clientId.trim() || !clientSecret.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await window.daemon.email.addGmail(clientId.trim(), clientSecret.trim())
      if (res.ok) {
        onAccountAdded()
        onClose()
      } else {
        setError(res.error ?? 'Gmail connection failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    }
    setLoading(false)
  }

  const handleICloudConnect = async () => {
    if (!appleEmail.trim() || !appPassword.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await window.daemon.email.addICloud(appleEmail, appPassword)
      if (res.ok) {
        onAccountAdded()
        onClose()
      } else {
        setError(res.error ?? 'iCloud connection failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    }
    setLoading(false)
  }

  return (
    <div className="email__overlay" onClick={onClose}>
      <div className="email__overlay-card" onClick={(e) => e.stopPropagation()}>
        <div className="email__overlay-header">
          <span className="email__overlay-title">Add Email Account</span>
          <button className="email__overlay-close" onClick={onClose}>x</button>
        </div>

        <div className="email__provider-pills">
          <button
            className={`email__provider-pill ${provider === 'gmail' ? 'email__provider-pill--active' : ''}`}
            onClick={() => { setProvider('gmail'); setError(null); setShowCredsForm(false) }}
          >
            Gmail
          </button>
          <button
            className={`email__provider-pill ${provider === 'icloud' ? 'email__provider-pill--active' : ''}`}
            onClick={() => { setProvider('icloud'); setError(null) }}
          >
            iCloud
          </button>
        </div>

        {error && <div className="email__error">{error}</div>}

        {provider === 'gmail' && (
          <div className="email__auth">
            {loading ? (
              <div className="email__auth-waiting">
                <span className="email__auth-waiting-text">Waiting for Google authorization...</span>
                <span className="email__auth-waiting-hint">Complete sign-in in your browser. This window will update automatically.</span>
              </div>
            ) : hasGmailCreds && !showCredsForm ? (
              /* One-click connect — credentials already stored */
              <>
                <button className="email__auth-btn email__auth-btn--primary" onClick={handleGmailQuickConnect}>
                  Connect with Google
                </button>
                <button
                  className="email__auth-link"
                  onClick={() => setShowCredsForm(true)}
                >
                  Use different credentials
                </button>
              </>
            ) : (
              /* First-time setup — need Client ID + Secret */
              <>
                <span className="email__auth-setup-hint">
                  {hasGmailCreds === false
                    ? 'One-time setup: enter your Google OAuth credentials'
                    : 'Enter new Google OAuth credentials'}
                </span>
                <label className="email__input-label">Client ID</label>
                <input
                  className="email__auth-input"
                  type="text"
                  placeholder="Google OAuth Client ID"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
                <label className="email__input-label">Client Secret</label>
                <input
                  className="email__auth-input"
                  type="password"
                  placeholder="Google OAuth Client Secret"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                />
                <button
                  className="email__auth-btn"
                  onClick={handleGmailFirstSetup}
                  disabled={!clientId.trim() || !clientSecret.trim()}
                >
                  Connect with Google
                </button>
              </>
            )}
          </div>
        )}

        {provider === 'icloud' && (
          <div className="email__auth">
            <label className="email__input-label">Apple ID Email</label>
            <input
              className="email__auth-input"
              type="email"
              placeholder="you@icloud.com"
              value={appleEmail}
              onChange={(e) => setAppleEmail(e.target.value)}
            />
            <label className="email__input-label">App-Specific Password</label>
            <input
              className="email__auth-input"
              type="password"
              placeholder="xxxx-xxxx-xxxx-xxxx"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
            />
            <span className="email__input-hint">
              Generate at appleid.apple.com/account
            </span>
            <button
              className="email__auth-btn"
              onClick={handleICloudConnect}
              disabled={loading || !appleEmail.trim() || !appPassword.trim()}
            >
              {loading ? 'Testing...' : 'Test & Connect'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
