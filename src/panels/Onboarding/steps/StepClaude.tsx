import { useState, useEffect } from 'react'
import { useOnboardingStore } from '../../../store/onboarding'

type CheckState = 'idle' | 'checking' | 'ok' | 'fail'

export function StepClaude() {
  const advanceStep = useOnboardingStore((s) => s.advanceStep)
  const setStepStatus = useOnboardingStore((s) => s.setStepStatus)

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
  const isChecking = cliState === 'checking' || authState === 'checking'

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
    if (res.data) applyConnection(res.data)
  }

  async function handleSaveApiKey() {
    if (!apiKeyInput.trim()) return
    setSaving(true)
    const res = await window.daemon.claude.storeKey('ANTHROPIC_API_KEY', apiKeyInput.trim())
    setSaving(false)
    if (res.ok) {
      setApiKeyInput('')
      handleConnect()
    }
  }

  function handleContinue() {
    setStepStatus('claude', 'complete')
    advanceStep()
  }

  function dotClass(state: CheckState): string {
    if (state === 'ok') return 'wizard-dot green'
    if (state === 'fail') return 'wizard-dot red'
    if (state === 'checking') return 'wizard-dot pulse'
    return 'wizard-dot'
  }

  return (
    <>
      <div className="wizard-checks">
        <div className="wizard-check">
          <div className={dotClass(cliState)} />
          <span className="wizard-check-label">Claude CLI</span>
          <span className={`wizard-check-status ${cliState === 'fail' ? 'error' : ''}`}>{cliDetail || '\u00A0'}</span>
        </div>
        <div className="wizard-check">
          <div className={dotClass(authState)} />
          <span className="wizard-check-label">Authentication</span>
          <span className={`wizard-check-status ${authState === 'fail' ? 'error' : ''}`}>{authDetail || '\u00A0'}</span>
        </div>
        <div className="wizard-check">
          <div className={dotClass(apiState)} />
          <span className="wizard-check-label">API Key</span>
          <span className="wizard-check-status">{apiDetail || 'Optional'}</span>
        </div>
      </div>

      {error && <div className="wizard-error">{error}</div>}

      {cliState === 'fail' && (
        <div className="wizard-hint" style={{ marginBottom: 12 }}>
          Install Claude Code: <code>npm install -g @anthropic-ai/claude-code</code>
        </div>
      )}

      {cliState === 'ok' && authState === 'fail' && (
        <div className="wizard-hint" style={{ marginBottom: 12 }}>
          Run <code>claude</code> in your terminal to sign in, then retry.
        </div>
      )}

      {isConnected ? (
        <button className="wizard-btn primary" onClick={handleContinue}>
          Continue
        </button>
      ) : (
        <button
          className={`wizard-btn ${cliState === 'idle' ? 'primary' : 'secondary'}`}
          onClick={handleConnect}
          disabled={isChecking}
        >
          {isChecking ? 'Checking...' : cliState === 'idle' ? 'Connect' : 'Retry'}
        </button>
      )}

      <div className="wizard-divider" />

      <div className="wizard-api-section">
        <span className="wizard-api-label">
          API Key (optional — unlocks direct API mode)
        </span>
        <div className="wizard-api-row">
          <input
            className="wizard-api-input"
            type="password"
            autoComplete="off"
            placeholder="sk-ant-api03-..."
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
          />
          <button
            className="wizard-btn secondary small"
            onClick={handleSaveApiKey}
            disabled={saving || !apiKeyInput.trim()}
          >
            {saving ? '...' : 'Save'}
          </button>
        </div>
        <span className="wizard-hint">
          Without an API key, AI runs through your Claude Max subscription.
        </span>
      </div>
    </>
  )
}

function shortenPath(p: string): string {
  const home = p.includes('\\Users\\')
    ? p.replace(/^.*\\Users\\[^\\]+/, '~')
    : p.replace(/^\/home\/[^/]+|^\/Users\/[^/]+/, '~')
  return home.length > 40 ? '...' + home.slice(-37) : home
}
