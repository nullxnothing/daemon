import { useState, useEffect, useRef } from 'react'
import { useOnboardingStore } from '../../../store/onboarding'
import { markFunnelStep } from '../../../lib/firstMission'

type Phase = 'cli' | 'auth' | 'connected'
type CheckState = 'idle' | 'checking' | 'ok' | 'fail'

// claude:auth-login spawns a detached terminal and returns immediately, so the
// only way to notice a finished OAuth is to re-verify on a timer. 4s keeps the
// step responsive without hammering the CLI; 5 minutes covers a slow browser flow.
const AUTH_POLL_INTERVAL_MS = 4000
const AUTH_POLL_TIMEOUT_MS = 5 * 60 * 1000

export function StepClaude() {
  const advanceStep = useOnboardingStore((s) => s.advanceStep)
  const setStepStatus = useOnboardingStore((s) => s.setStepStatus)

  const [phase, setPhase] = useState<Phase>('cli')
  const [cliState, setCliState] = useState<CheckState>('idle')
  const [authState, setAuthState] = useState<CheckState>('idle')
  const [apiState, setApiState] = useState<CheckState>('idle')
  const [cliDetail, setCliDetail] = useState('')
  const [authDetail, setAuthDetail] = useState('')
  const [apiDetail, setApiDetail] = useState('')
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [pollElapsedSec, setPollElapsedSec] = useState(0)
  const [showApiInput, setShowApiInput] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const mountedRef = useRef(true)
  const pollTimerRef = useRef<number | null>(null)

  useEffect(() => {
    mountedRef.current = true
    checkInitial()
    return () => {
      mountedRef.current = false
      stopAuthPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopAuthPolling() {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  /** Poll verifyConnection until OAuth completes, the timeout passes, or the
   *  step unmounts. Success routes through applyConnection like any other path. */
  function startAuthPolling() {
    stopAuthPolling()
    const startedAt = Date.now()
    setPollElapsedSec(0)
    pollTimerRef.current = window.setInterval(async () => {
      const elapsed = Date.now() - startedAt
      if (!mountedRef.current) return
      setPollElapsedSec(Math.floor(elapsed / 1000))
      if (elapsed >= AUTH_POLL_TIMEOUT_MS) {
        stopAuthPolling()
        setAuthLoading(false)
        setAuthState('idle')
        setAuthDetail('Still not signed in — try again or use an API key')
        return
      }
      const verify = await window.daemon.claude.verifyConnection()
      if (!mountedRef.current) return
      if (verify.ok && verify.data?.isAuthenticated) {
        stopAuthPolling()
        setAuthLoading(false)
        applyConnection(verify.data)
      }
    }, AUTH_POLL_INTERVAL_MS)
  }

  async function checkInitial() {
    // Try cached connection first
    const cached = await window.daemon.claude.getConnection()
    if (cached.ok && cached.data && cached.data.authMode !== 'none') {
      applyConnection(cached.data)
      return
    }
    // Run fresh verification
    await runVerification()
  }

  async function runVerification() {
    if (!mountedRef.current) return
    setCliState('checking')
    setCliDetail('Detecting...')

    const res = await window.daemon.claude.verifyConnection()
    if (!mountedRef.current) return

    if (!res.ok) {
      setCliState('fail')
      setCliDetail('Not found')
      setPhase('cli')
      return
    }

    if (res.data) {
      applyConnection(res.data)
    }
  }

  function applyConnection(conn: ClaudeConnection) {
    const hasCliPath = !!conn.claudePath && conn.claudePath !== 'claude.cmd' && conn.claudePath !== 'claude'
    setCliState(hasCliPath ? 'ok' : 'fail')
    setCliDetail(hasCliPath ? shortenPath(conn.claudePath) : 'Not found')

    setAuthState(conn.isAuthenticated ? 'ok' : 'idle')
    setAuthDetail(conn.isAuthenticated ? 'Signed in' : '')

    setApiState(conn.hasApiKey ? 'ok' : 'idle')
    setApiDetail(conn.hasApiKey ? 'Configured' : '')

    if (hasCliPath) markFunnelStep('claude_cli_ok')
    if (conn.isAuthenticated || conn.hasApiKey) markFunnelStep('claude_auth_ok')

    // Determine phase
    if (!hasCliPath) {
      setPhase('cli')
    } else if (conn.isAuthenticated || conn.hasApiKey) {
      setPhase('connected')
    } else {
      setPhase('auth')
    }
  }

  const canProceed = cliState === 'ok' && (authState === 'ok' || apiState === 'ok')

  // --- Phase 1: Install CLI ---

  async function handleInstallCli() {
    setInstalling(true)
    setInstallError('')
    setCliDetail('Installing...')
    setCliState('checking')

    const res = await window.daemon.claude.installCli()
    if (!mountedRef.current) return

    if (res.ok) {
      setInstalling(false)
      setCliState('ok')
      setCliDetail('Installed')
      // Re-verify to pick up the new path
      const verify = await window.daemon.claude.verifyConnection()
      if (verify.ok && verify.data) {
        applyConnection(verify.data)
      } else {
        setPhase('auth')
      }
    } else {
      setInstalling(false)
      setCliState('fail')
      setCliDetail('Install failed')
      setInstallError(res.error ?? 'Installation failed. Make sure npm is installed and accessible.')
    }
  }

  // --- Phase 2: Auth ---

  async function handleSignIn() {
    setAuthLoading(true)
    setAuthState('checking')
    setAuthDetail('Opening terminal and browser...')

    const res = await window.daemon.claude.authLogin()
    if (!mountedRef.current) return

    if (!res.ok) {
      setAuthState('fail')
      setAuthDetail(res.error ?? 'Sign-in failed')
      setAuthLoading(false)
      return
    }

    // authLogin returns before the user has finished OAuth in the browser, so a
    // one-shot re-verify here would report "not signed in". Poll instead and let
    // the poller settle the state; authLoading stays on until it does.
    setAuthDetail('Waiting for sign-in...')
    startAuthPolling()
  }

  async function handleSaveApiKey() {
    if (!apiKeyInput.trim()) return
    setSavingKey(true)
    const res = await window.daemon.claude.storeKey('ANTHROPIC_API_KEY', apiKeyInput.trim())
    if (!mountedRef.current) return
    setSavingKey(false)

    if (res.ok) {
      setApiKeyInput('')
      setApiState('ok')
      setApiDetail('Configured')
      // Re-verify to update authMode
      const verify = await window.daemon.claude.verifyConnection()
      if (verify.ok && verify.data) {
        applyConnection(verify.data)
      } else {
        setPhase('connected')
      }
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    await window.daemon.claude.disconnect()
    if (!mountedRef.current) return
    setDisconnecting(false)
    // Reset all state to fresh
    setCliState('idle')
    setCliDetail('')
    setAuthState('idle')
    setAuthDetail('')
    setApiState('idle')
    setApiDetail('')
    setShowApiInput(false)
    setApiKeyInput('')
    setPhase('cli')
    // Re-run detection (CLI is still installed, just credentials cleared)
    await runVerification()
  }

  function handleContinue() {
    setStepStatus('claude', 'complete')
    advanceStep()
  }

  function handleSkip() {
    stopAuthPolling()
    setStepStatus('claude', 'skipped')
    markFunnelStep('claude_skipped')
    advanceStep()
  }

  function handleOpenConsole() {
    window.daemon.shell.openExternal('https://console.anthropic.com/settings/keys')
  }

  function dotClass(state: CheckState): string {
    if (state === 'ok') return 'wizard-dot green'
    if (state === 'fail') return 'wizard-dot red'
    if (state === 'checking') return 'wizard-dot pulse'
    return 'wizard-dot'
  }

  // --- Render ---

  return (
    <>
      {/* Status indicators — always visible */}
      <div className="wizard-checks">
        <div className="wizard-check">
          <div className={dotClass(cliState)} />
          <span className="wizard-check-label">Claude CLI</span>
          <span className={`wizard-check-status ${cliState === 'fail' ? 'error' : ''}`}>
            {cliDetail || '\u00A0'}
          </span>
        </div>
        <div className="wizard-check">
          <div className={dotClass(authState)} />
          <span className="wizard-check-label">Authentication</span>
          <span className={`wizard-check-status ${authState === 'fail' ? 'error' : ''}`}>
            {authDetail || '\u00A0'}
          </span>
        </div>
        <div className="wizard-check">
          <div className={dotClass(apiState)} />
          <span className="wizard-check-label">API Key</span>
          <span className="wizard-check-status">{apiDetail || 'Optional'}</span>
        </div>
      </div>

      {/* Phase 1: CLI not found */}
      {phase === 'cli' && cliState === 'fail' && !installing && (
        <>
          <div className="wizard-hint" style={{ marginBottom: 12 }}>
            Claude Code CLI is required. It can be installed automatically.
          </div>
          {installError && <div className="wizard-error">{installError}</div>}
          <button type="button" className="wizard-btn primary" onClick={handleInstallCli}>
            Install Claude Code
          </button>
          {installError && (
            <div className="wizard-hint" style={{ marginTop: 8 }}>
              Manual install: <code>npm install -g @anthropic-ai/claude-code</code>
              <button
                type="button"
                className="wizard-skip-step"
                style={{ padding: 0, textAlign: 'left' }}
                onClick={() => window.daemon.shell.openExternal('https://nodejs.org')}
              >
                No npm? Get Node.js at nodejs.org
              </button>
            </div>
          )}
        </>
      )}

      {/* Phase 1: Installing */}
      {phase === 'cli' && installing && (
        <div className="wizard-hint">
          Installing Claude Code globally via npm... this may take a minute.
        </div>
      )}

      {/* Phase 1: Still checking */}
      {phase === 'cli' && cliState === 'checking' && !installing && (
        <div className="wizard-hint">Detecting Claude CLI...</div>
      )}

      {/* Phase 2: Auth options */}
      {phase === 'auth' && (
        <>
          <div className="wizard-hint" style={{ marginBottom: 12 }}>
            This opens a terminal window and your browser. Sign in there, then come back.
            This step usually takes about a minute.
          </div>

          <button
            type="button"
            className="wizard-btn primary"
            onClick={handleSignIn}
            disabled={authLoading}
          >
            {authLoading ? 'Waiting for sign-in...' : 'Sign in with Claude'}
          </button>
          {authLoading ? (
            <span className="wizard-hint" style={{ display: 'block', textAlign: 'center', margin: 'var(--space-xs) 0' }}>
              Waiting for sign-in... checking every few seconds.
              {pollElapsedSec > 0 ? ` (${pollElapsedSec}s)` : ''}
            </span>
          ) : (
            <span className="wizard-hint" style={{ display: 'block', textAlign: 'center', margin: 'var(--space-xs) 0' }}>
              Recommended for Max / Pro subscribers
            </span>
          )}

          <div className="wizard-divider" />

          {!showApiInput ? (
            <button
              type="button"
              className="wizard-btn secondary"
              onClick={() => setShowApiInput(true)}
            >
              Use API Key instead
            </button>
          ) : (
            <div className="wizard-api-section">
              <span className="wizard-api-label">
                Anthropic API Key
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
                  type="button"
                  className="wizard-btn secondary small"
                  onClick={handleSaveApiKey}
                  disabled={savingKey || !apiKeyInput.trim()}
                >
                  {savingKey ? '...' : 'Save'}
                </button>
              </div>
              <button
                type="button"
                className="wizard-skip-step"
                onClick={handleOpenConsole}
                style={{ padding: 0, textAlign: 'left' }}
              >
                Get an API key at console.anthropic.com
              </button>
            </div>
          )}
        </>
      )}

      {/* Phase 3: Connected */}
      {phase === 'connected' && (
        <>
          <div className="wizard-external-tip">
            <div className="wizard-tip-accent" />
            <div className="wizard-tip-content">
              {authState === 'ok' && apiState === 'ok'
                ? 'Connected via subscription and API key.'
                : authState === 'ok'
                  ? 'Connected via Claude subscription.'
                  : 'Connected via API key.'}
            </div>
          </div>
          <button type="button" className="wizard-btn primary" data-testid="wizard-primary" onClick={handleContinue}>
            Continue
          </button>
          <button type="button" className="wizard-skip-step" onClick={handleDisconnect}>
            {disconnecting ? 'Disconnecting...' : 'Disconnect / switch account'}
          </button>
        </>
      )}

      {/* Skip option — always available when not connected */}
      {phase !== 'connected' && (
        <button type="button" className="wizard-skip-step" onClick={handleSkip}>
          Skip for now (the First Mission needs Claude, so it will wait for you in the console)
        </button>
      )}
    </>
  )
}

function shortenPath(p: string): string {
  const home = p.includes('\\Users\\')
    ? p.replace(/^.*\\Users\\[^\\]+/, '~')
    : p.replace(/^\/home\/[^/]+|^\/Users\/[^/]+/, '~')
  return home.length > 40 ? '...' + home.slice(-37) : home
}
