import { useState, useEffect } from 'react'
import { useOnboardingStore } from '../../../store/onboarding'
import { useEmailStore } from '../../../store/email'

type ConnectState = 'idle' | 'waiting' | 'connected' | 'failed'

export function StepGmail() {
  const advanceStep = useOnboardingStore((s) => s.advanceStep)
  const setStepStatus = useOnboardingStore((s) => s.setStepStatus)
  const emailAccounts = useEmailStore((s) => s.accounts)

  const [state, setState] = useState<ConnectState>('idle')
  const [error, setError] = useState('')

  // Check if already connected on mount
  useEffect(() => {
    useEmailStore.getState().loadAccounts()
  }, [])

  useEffect(() => {
    if (emailAccounts.length > 0) setState('connected')
  }, [emailAccounts])

  // Auto-detect on window focus (user returning from OAuth browser)
  useEffect(() => {
    if (state !== 'waiting') return

    const handleFocus = () => {
      setTimeout(async () => {
        await useEmailStore.getState().loadAccounts()
        const accounts = useEmailStore.getState().accounts
        if (accounts.length > 0) {
          setState('connected')
        }
      }, 500)
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [state])

  async function handleConnect() {
    setError('')
    setState('waiting')
    try {
      const res = await window.daemon.email.addGmail()
      if (res.ok && res.data) {
        setState('connected')
      } else {
        setState('failed')
        setError(res.error ?? 'Connection failed')
      }
    } catch {
      setState('failed')
      setError('OAuth flow was cancelled or failed')
    }
  }

  function handleContinue() {
    setStepStatus('gmail', state === 'connected' ? 'complete' : 'skipped')
    advanceStep()
  }

  function handleSkip() {
    setStepStatus('gmail', 'skipped')
    advanceStep()
  }

  return (
    <>
      <div className="wizard-checks">
        <div className="wizard-check">
          <div className={`wizard-dot ${state === 'connected' ? 'green' : state === 'waiting' ? 'pulse' : state === 'failed' ? 'red' : ''}`} />
          <div className="wizard-check-label-wrap">
            <span className="wizard-check-label">Gmail Account</span>
            <span className="wizard-check-desc">
              {state === 'connected'
                ? `${emailAccounts.length} account${emailAccounts.length !== 1 ? 's' : ''} connected`
                : state === 'waiting'
                  ? 'Waiting for sign-in...'
                  : 'Lets Claude read and extract code from emails'}
            </span>
          </div>
        </div>
      </div>

      {state === 'waiting' && (
        <div className="wizard-external-tip">
          <div className="wizard-tip-accent" />
          <div className="wizard-tip-content">
            A browser window will open for Google sign-in.
            Complete the authorization, then return here — DAEMON will detect it automatically.
          </div>
        </div>
      )}

      {error && <div className="wizard-error">{error}</div>}

      {state === 'connected' ? (
        <button className="wizard-btn primary" onClick={handleContinue}>
          Continue
        </button>
      ) : state === 'waiting' ? (
        <div className="wizard-btn-row">
          <button className="wizard-btn secondary" onClick={handleConnect}>
            Retry
          </button>
          <button className="wizard-btn secondary" onClick={handleSkip}>
            Skip
          </button>
        </div>
      ) : (
        <>
          <button className="wizard-btn primary" onClick={handleConnect}>
            Connect Gmail
          </button>
          <button className="wizard-skip-step" onClick={handleSkip}>
            Skip this step
          </button>
        </>
      )}
    </>
  )
}
