import { useState, useEffect } from 'react'
import { useUIStore } from '../../store/ui'
import './Onboarding.css'

type CheckState = 'idle' | 'checking' | 'ok' | 'fail'

export function Onboarding() {
  const setShowOnboarding = useUIStore((s) => s.setShowOnboarding)

  const [cliState, setCliState] = useState<CheckState>('idle')
  const [authState, setAuthState] = useState<CheckState>('idle')
  const [apiState, setApiState] = useState<CheckState>('idle')
  const [cliDetail, setCliDetail] = useState('')
  const [authDetail, setAuthDetail] = useState('')
  const [apiDetail, setApiDetail] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isConnected = cliState === 'ok' && authState === 'ok'
  const isChecking = cliState === 'checking' || authState === 'checking' || apiState === 'checking'

  // Check cached connection on mount
  useEffect(() => {
    checkCached()
  }, [])

  async function checkCached() {
    const res = await window.daemon.claude.getConnection()
    if (res.ok && res.data && res.data.authMode !== 'none') {
      applyConnection(res.data)
    }
  }

  function applyConnection(conn: ClaudeConnection) {
    setCliState(conn.claudePath ? 'ok' : 'fail')
    setCliDetail(conn.claudePath ? shortenPath(conn.claudePath) : 'Not found')

    setAuthState(conn.isAuthenticated ? 'ok' : 'fail')
    setAuthDetail(conn.isAuthenticated ? 'Max subscription active' : 'Not signed in')

    setApiState(conn.hasApiKey ? 'ok' : 'idle')
    setApiDetail(conn.hasApiKey ? 'Configured' : 'Optional')
  }

  async function handleConnect() {
    setError('')
    setCliState('checking')
    setAuthState('checking')
    setApiState('checking')
    setCliDetail('')
    setAuthDetail('')
    setApiDetail('')

    const res = await window.daemon.claude.verifyConnection()

    if (!res.ok) {
      setError(res.error ?? 'Verification failed')
      setCliState('fail')
      setAuthState('fail')
      setApiState('fail')
      return
    }

    applyConnection(res.data!)
  }

  async function handleSaveApiKey() {
    if (!apiKeyInput.trim()) return
    setSaving(true)
    const res = await window.daemon.claude.storeKey('ANTHROPIC_API_KEY', apiKeyInput.trim())
    setSaving(false)
    if (res.ok) {
      setApiKeyInput('')
      // Re-verify to pick up the new key
      handleConnect()
    }
  }

  function handleContinue() {
    setShowOnboarding(false)
  }

  function dotClass(state: CheckState): string {
    if (state === 'ok') return 'onboarding-dot green'
    if (state === 'fail') return 'onboarding-dot red'
    if (state === 'checking') return 'onboarding-dot pulse'
    return 'onboarding-dot'
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-title">DAEMON</div>
        <div className="onboarding-subtitle">Connect with Claude Code</div>

        <div className="onboarding-checks">
          <div className="onboarding-check">
            <div className={dotClass(cliState)} />
            <span className="check-label">Claude CLI</span>
            <span className={`check-status ${cliState === 'fail' ? 'error' : ''}`}>{cliDetail || '\u00A0'}</span>
          </div>
          <div className="onboarding-check">
            <div className={dotClass(authState)} />
            <span className="check-label">Authentication</span>
            <span className={`check-status ${authState === 'fail' ? 'error' : ''}`}>{authDetail || '\u00A0'}</span>
          </div>
          <div className="onboarding-check">
            <div className={dotClass(apiState)} />
            <span className="check-label">API Key</span>
            <span className={`check-status`}>{apiDetail || 'Optional'}</span>
          </div>
        </div>

        {error && <div className="onboarding-error">{error}</div>}

        {cliState === 'fail' && (
          <div className="onboarding-hint" style={{ marginBottom: 12 }}>
            Install Claude Code: <code>npm install -g @anthropic-ai/claude-code</code>
          </div>
        )}

        {cliState === 'ok' && authState === 'fail' && (
          <div className="onboarding-hint" style={{ marginBottom: 12 }}>
            Run <code>claude</code> in your terminal to sign in, then retry.
          </div>
        )}

        {isConnected ? (
          <button className="onboarding-btn" onClick={handleContinue}>
            Continue
          </button>
        ) : (
          <button
            className={`onboarding-btn ${cliState === 'idle' ? '' : 'secondary'}`}
            onClick={handleConnect}
            disabled={isChecking}
          >
            {isChecking ? 'Checking...' : cliState === 'idle' ? 'Connect' : 'Retry'}
          </button>
        )}

        <div className="onboarding-divider" />

        <div className="onboarding-api-section">
          <span className="onboarding-api-label">
            API Key (optional — enables direct API for faster responses)
          </span>
          <div className="onboarding-api-row">
            <input
              className="onboarding-api-input"
              type="password"
              placeholder="sk-ant-api03-..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
            />
            <button
              className="onboarding-api-save"
              onClick={handleSaveApiKey}
              disabled={saving || !apiKeyInput.trim()}
            >
              {saving ? '...' : 'Save'}
            </button>
          </div>
          <span className="onboarding-hint">
            Without an API key, all AI features route through your Max subscription via Claude CLI.
          </span>
        </div>
      </div>
    </div>
  )
}

function shortenPath(p: string): string {
  const home = p.includes('\\Users\\') ? p.replace(/^.*\\Users\\[^\\]+/, '~') : p.replace(/^\/home\/[^/]+|^\/Users\/[^/]+/, '~')
  return home.length > 40 ? '...' + home.slice(-37) : home
}
