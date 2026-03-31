import { useState, useEffect, useRef } from 'react'
import { useUIStore } from '../../store/ui'
import './Onboarding.css'

type CheckState = 'idle' | 'checking' | 'ok' | 'fail'
type Step = 'claude' | 'integrations'

interface Integration {
  id: string
  name: string
  mcpName: string
  description: string
  cliCheck: string
  installHint: string
  state: CheckState
  detail: string
  enabled: boolean
}

const INTEGRATIONS_CONFIG: Omit<Integration, 'state' | 'detail' | 'enabled'>[] = [
  {
    id: 'github',
    name: 'GitHub',
    mcpName: 'github',
    description: 'Repos, PRs, issues, code search',
    cliCheck: 'gh',
    installHint: 'npm install -g gh',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    mcpName: 'vercel',
    description: 'Deployments, domains, env sync',
    cliCheck: 'vercel',
    installHint: 'npm install -g vercel',
  },
]

export function Onboarding() {
  const setShowOnboarding = useUIStore((s) => s.setShowOnboarding)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const overlayRef = useRef<HTMLDivElement>(null)

  const [step, setStep] = useState<Step>('claude')
  const [cliState, setCliState] = useState<CheckState>('idle')
  const [authState, setAuthState] = useState<CheckState>('idle')
  const [apiState, setApiState] = useState<CheckState>('idle')
  const [cliDetail, setCliDetail] = useState('')
  const [authDetail, setAuthDetail] = useState('')
  const [apiDetail, setApiDetail] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [integrations, setIntegrations] = useState<Integration[]>(
    INTEGRATIONS_CONFIG.map((cfg) => ({ ...cfg, state: 'idle', detail: '', enabled: false }))
  )
  const [checkingIntegrations, setCheckingIntegrations] = useState(false)

  const isConnected = cliState === 'ok' && authState === 'ok'
  const isChecking = cliState === 'checking' || authState === 'checking' || apiState === 'checking'

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
      handleConnect()
    }
  }

  function handleContinueToIntegrations() {
    setStep('integrations')
    detectIntegrations()
  }

  function handleFinish() {
    setShowOnboarding(false)
  }

  async function detectIntegrations() {
    setCheckingIntegrations(true)

    // Load current MCP states for the active project
    let mcpStates: Record<string, boolean> = {}
    if (activeProjectPath) {
      const res = await window.daemon.claude.projectMcpAll(activeProjectPath)
      if (res.ok && res.data) {
        for (const mcp of res.data) {
          mcpStates[mcp.name] = mcp.enabled
        }
      }
    }

    setIntegrations((prev) =>
      prev.map((intg) => ({
        ...intg,
        state: 'ok',
        detail: mcpStates[intg.mcpName] ? 'MCP enabled' : 'Available',
        enabled: mcpStates[intg.mcpName] ?? false,
      }))
    )

    setCheckingIntegrations(false)
  }

  async function toggleIntegration(id: string) {
    if (!activeProjectPath) return

    const intg = integrations.find((i) => i.id === id)
    if (!intg) return

    const newEnabled = !intg.enabled

    const res = await window.daemon.claude.projectMcpToggle(activeProjectPath, intg.mcpName, newEnabled)
    if (res.ok) {
      setIntegrations((prev) =>
        prev.map((i) =>
          i.id === id
            ? { ...i, enabled: newEnabled, detail: newEnabled ? 'MCP enabled' : 'Available' }
            : i
        )
      )
    }
  }

  function dotClass(state: CheckState): string {
    if (state === 'ok') return 'onboarding-dot green'
    if (state === 'fail') return 'onboarding-dot red'
    if (state === 'checking') return 'onboarding-dot pulse'
    return 'onboarding-dot'
  }

  useEffect(() => {
    overlayRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (step === 'integrations' || isConnected) handleFinish()
    }
  }

  return (
    <div
      className="onboarding-overlay"
      ref={overlayRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="onboarding-card">
        <div className="onboarding-title">DAEMON</div>

        {step === 'claude' ? (
          <>
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
                <span className="check-status">{apiDetail || 'Optional'}</span>
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
              <button className="onboarding-btn" onClick={handleContinueToIntegrations}>
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

            {isConnected && (
              <button className="onboarding-skip" onClick={handleFinish}>
                Skip integrations
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
          </>
        ) : (
          <>
            <div className="onboarding-subtitle">Connect your tools</div>
            <div className="onboarding-hint" style={{ textAlign: 'center', marginBottom: 16 }}>
              Enable integrations to give Claude access to your services via MCP.
              {!activeProjectPath && ' Select a project first to configure per-project MCPs.'}
            </div>

            <div className="onboarding-checks">
              {integrations.map((intg) => (
                <div key={intg.id} className="onboarding-check">
                  <div className={intg.enabled ? 'onboarding-dot green' : 'onboarding-dot'} />
                  <div className="check-label-wrap">
                    <span className="check-label">{intg.name}</span>
                    <span className="check-description">{intg.description}</span>
                  </div>
                  <button
                    className={`onboarding-toggle ${intg.enabled ? 'on' : ''}`}
                    onClick={() => void toggleIntegration(intg.id)}
                    disabled={!activeProjectPath || checkingIntegrations}
                    title={!activeProjectPath ? 'Select a project first' : intg.enabled ? 'Disable' : 'Enable'}
                  >
                    <span className="onboarding-toggle-thumb" />
                  </button>
                </div>
              ))}
            </div>

            <button className="onboarding-btn" onClick={handleFinish}>
              Done
            </button>

            <button className="onboarding-skip" onClick={() => setStep('claude')}>
              Back
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function shortenPath(p: string): string {
  const home = p.includes('\\Users\\') ? p.replace(/^.*\\Users\\[^\\]+/, '~') : p.replace(/^\/home\/[^/]+|^\/Users\/[^/]+/, '~')
  return home.length > 40 ? '...' + home.slice(-37) : home
}
