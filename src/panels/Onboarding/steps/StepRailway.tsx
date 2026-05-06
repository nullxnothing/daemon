import { useState, useEffect } from 'react'
import { useOnboardingStore } from '../../../store/onboarding'

type ConnectState = 'idle' | 'input' | 'checking' | 'connected' | 'failed'

export function StepRailway() {
  const advanceStep = useOnboardingStore((s) => s.advanceStep)
  const setStepStatus = useOnboardingStore((s) => s.setStepStatus)

  const [state, setState] = useState<ConnectState>('idle')
  const [token, setToken] = useState('')
  const [userName, setUserName] = useState('')
  const [error, setError] = useState('')

  // Check if already authenticated
  useEffect(() => {
    window.daemon.deploy.authStatus().then((res) => {
      if (res.ok && res.data?.railway.authenticated) {
        setState('connected')
        setUserName(res.data.railway.user ?? '')
      }
    })
  }, [])

  function handleOpenRailway() {
    window.daemon.shell.openExternal('https://railway.com/account/tokens')
    setState('input')
  }

  async function handleSaveToken() {
    if (!token.trim()) return
    setError('')
    setState('checking')
    try {
      const res = await window.daemon.deploy.connectRailway(token.trim())
      if (res.ok && res.data) {
        setState('connected')
        setUserName(res.data.name || res.data.email || '')
        setToken('')
      } else {
        setState('failed')
        setError(res.error ?? 'Invalid token')
      }
    } catch {
      setState('failed')
      setError('Failed to verify token')
    }
  }

  function handleContinue() {
    setStepStatus('railway', state === 'connected' ? 'complete' : 'skipped')
    advanceStep()
  }

  function handleSkip() {
    setStepStatus('railway', 'skipped')
    advanceStep()
  }

  return (
    <>
      <div className="wizard-checks">
        <div className="wizard-check">
          <div className={`wizard-dot ${state === 'connected' ? 'green' : state === 'checking' ? 'pulse' : state === 'failed' ? 'red' : ''}`} />
          <div className="wizard-check-label-wrap">
            <span className="wizard-check-label">Railway</span>
            <span className="wizard-check-desc">
              {state === 'connected'
                ? `Connected as ${userName}`
                : 'Deploy services, manage databases, sync env vars'}
            </span>
          </div>
        </div>
      </div>

      {(state === 'input' || state === 'failed') && (
        <>
          <div className="wizard-external-tip">
            <div className="wizard-tip-accent" />
            <div className="wizard-tip-content">
              Create an API token in Railway settings, then paste it below.
            </div>
          </div>

          <div className="wizard-token-row">
            <input
              className="wizard-token-input"
              type="password"
              autoComplete="off"
              placeholder="Paste Railway token..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveToken()}
              autoFocus
            />
            <button
              className="wizard-btn secondary small"
              onClick={handleSaveToken}
              disabled={!token.trim()}
            >
              Verify
            </button>
          </div>
        </>
      )}

      {error && <div className="wizard-error">{error}</div>}

      {state === 'connected' ? (
        <button type="button" className="wizard-btn primary" onClick={handleContinue}>
          Continue
        </button>
      ) : state === 'idle' ? (
        <>
          <button type="button" className="wizard-btn primary" onClick={handleOpenRailway}>
            Open Railway
          </button>
          <button type="button" className="wizard-skip-step" onClick={handleSkip}>
            Skip this step
          </button>
        </>
      ) : state === 'checking' ? (
        <button type="button" className="wizard-btn secondary" disabled>
          Verifying...
        </button>
      ) : (
        <button type="button" className="wizard-skip-step" onClick={handleSkip}>
          Skip this step
        </button>
      )}
    </>
  )
}
