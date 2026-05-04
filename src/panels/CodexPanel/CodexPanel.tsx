import { useState, useEffect, useCallback, useRef } from 'react'
import { useUIStore } from '../../store/ui'
import { useAppActions } from '../../store/appActions'
import { CollapsibleSection } from '../../components/CollapsibleSection'
import { Toggle } from '../../components/Toggle'
import { PanelErrorBoundary } from '../../components/ErrorBoundary'
import './CodexPanel.css'

interface CodexMcpEntry {
  name: string
  config: { command: string; args?: string[]; env?: Record<string, string> }
  enabled: boolean
  source: string
}

type StatusKind = 'info' | 'ok' | 'error'
interface StatusMsg { kind: StatusKind; text: string }

function useFlash(): [StatusMsg | null, (msg: StatusMsg, ttl?: number) => void] {
  const [msg, setMsg] = useState<StatusMsg | null>(null)
  const timerRef = useRef<number | null>(null)
  const flash = useCallback((m: StatusMsg, ttl = 4000) => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setMsg(m)
    timerRef.current = window.setTimeout(() => setMsg(null), ttl)
  }, [])
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current) }, [])
  return [msg, flash]
}

function StatusBar({ msg }: { msg: StatusMsg | null }) {
  if (!msg) return null
  return <div className={`codex-statusbar codex-statusbar-${msg.kind}`}>{msg.text}</div>
}

export function CodexPanel() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)

  if (!activeProjectId || !activeProjectPath) {
    return (
      <div className="codex-panel">
        <div className="codex-panel-scroll">
          <div className="codex-empty">Select a project</div>
        </div>
      </div>
    )
  }

  return (
    <div className="codex-panel">
      <div className="codex-panel-scroll">
        <ConnectionSection projectId={activeProjectId} projectPath={activeProjectPath} />
        <RestartButton />
        <CollapsibleSection title="Codex MCP Servers" defaultOpen={false}>
          <McpSection />
        </CollapsibleSection>
        <AgentsMdSection projectPath={activeProjectPath} />
      </div>
    </div>
  )
}

// --- Connection Section (status + account actions) ---

function ConnectionSection({ projectId, projectPath }: { projectId: string; projectPath: string }) {
  const addTerminal = useUIStore((s) => s.addTerminal)
  const setCenterMode = useUIStore((s) => s.setCenterMode)
  const focusTerminal = useAppActions((s) => s.focusTerminal)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [authMode, setAuthMode] = useState<string>('...')
  const [model, setModel] = useState<string>('...')
  const [effort, setEffort] = useState<string>('...')
  const [busy, setBusy] = useState<null | 'verify' | 'logout' | 'login' | 'install'>(null)
  const [msg, flash] = useFlash()

  const refetch = useCallback(async () => {
    const [conn, m, e] = await Promise.all([
      window.daemon.codex.verifyConnection(),
      window.daemon.codex.getModel(),
      window.daemon.codex.getReasoningEffort(),
    ])
    if (conn.ok && conn.data) {
      setConnected(conn.data.isAuthenticated || conn.data.authMode !== 'none')
      setAuthMode(conn.data.authMode)
    } else {
      setConnected(false)
      setAuthMode('none')
    }
    if (m.ok && m.data) setModel(String(m.data))
    if (e.ok && e.data) setEffort(String(e.data))
  }, [])

  useEffect(() => {
    refetch()
    const unsubscribe = window.daemon.events.on('auth:changed', (payload) => {
      const p = payload as { providerId?: string } | undefined
      if (!p || p.providerId === 'codex') refetch()
    })
    return () => unsubscribe()
  }, [refetch])

  const handleVerify = async () => {
    setBusy('verify')
    try {
      await refetch()
      flash({ kind: 'ok', text: 'Connection refreshed' })
    } catch (err) {
      flash({ kind: 'error', text: `Verify failed: ${(err as Error).message}` })
    } finally { setBusy(null) }
  }

  const handleLogout = async () => {
    if (!confirm('Sign out of Codex? This removes ~/.codex/auth.json so you can sign in with a different account.')) return
    setBusy('logout')
    try {
      const res = await window.daemon.codex.logout()
      if (!res.ok) throw new Error(res.error)
      await refetch()
      flash({ kind: 'ok', text: res.data?.removedAuthFile ? 'Signed out. Click "Sign in" to switch accounts.' : 'No active session found.' })
    } catch (err) {
      flash({ kind: 'error', text: `Sign out failed: ${(err as Error).message}` })
    } finally { setBusy(null) }
  }

  const handleLogin = async () => {
    setBusy('login')
    try {
      const res = await window.daemon.terminal.create({
        cwd: projectPath,
        startupCommand: 'codex login',
        userInitiated: true,
      })
      if (!res.ok) throw new Error(res.error)
      if (!res.data) throw new Error('Codex login terminal did not return a session id')
      setCenterMode('canvas')
      addTerminal(projectId, res.data.id, 'Codex Login', res.data.agentId)
      focusTerminal()
      flash({ kind: 'info', text: 'Opened terminal — complete `codex login`, then click Verify.' })
    } catch (err) {
      flash({ kind: 'error', text: `Could not launch codex login: ${(err as Error).message}` })
    } finally { setBusy(null) }
  }

  const handleInstall = async () => {
    setBusy('install')
    try {
      const res = await window.daemon.codex.installCli()
      if (!res.ok) throw new Error(res.error)
      await refetch()
      flash({ kind: 'ok', text: 'Codex CLI installed.' })
    } catch (err) {
      flash({ kind: 'error', text: `Install failed: ${(err as Error).message}` })
    } finally { setBusy(null) }
  }

  const dotClass =
    connected === null ? 'codex-status-dot' :
    connected ? 'codex-status-dot connected' : 'codex-status-dot disconnected'

  return (
    <PanelErrorBoundary>
      <div className="codex-status-row">
        <span className={dotClass} />
        <span>
          {connected === null ? 'Checking…' : connected ? `Connected (${authMode})` : 'Not connected'}
        </span>
      </div>
      <div className="codex-info-row">
        <span className="codex-info-label">Model</span>
        <span className="codex-info-value" title={model}>{model}</span>
      </div>
      <div className="codex-info-row">
        <span className="codex-info-label">Reasoning</span>
        <span className="codex-info-value" title={effort}>{effort}</span>
      </div>
      <div className="codex-actions-row">
        <button className="codex-btn" onClick={handleVerify} disabled={busy !== null}>
          {busy === 'verify' ? 'Verifying…' : 'Verify'}
        </button>
        {connected ? (
          <button className="codex-btn" onClick={handleLogout} disabled={busy !== null}>
            {busy === 'logout' ? 'Signing out…' : 'Sign out / switch'}
          </button>
        ) : (
          <>
            <button className="codex-btn codex-btn-primary" onClick={handleLogin} disabled={busy !== null}>
              {busy === 'login' ? 'Opening…' : 'Sign in'}
            </button>
            <button className="codex-btn" onClick={handleInstall} disabled={busy !== null}>
              {busy === 'install' ? 'Installing…' : 'Install CLI'}
            </button>
          </>
        )}
      </div>
      <StatusBar msg={msg} />
    </PanelErrorBoundary>
  )
}

// --- Restart Button ---

function RestartButton() {
  const [restarting, setRestarting] = useState(false)
  const [msg, flash] = useFlash()

  const handleRestart = useCallback(async () => {
    setRestarting(true)
    try {
      const res = await window.daemon.codex.restartAllSessions()
      if (!res.ok) throw new Error(res.error)
      const { restarted, total } = res.data ?? { restarted: 0, total: 0 }
      if (total === 0) flash({ kind: 'info', text: 'No active Codex sessions.' })
      else if (restarted === total) flash({ kind: 'ok', text: `Restarted ${restarted}/${total} sessions.` })
      else flash({ kind: 'error', text: `Restarted ${restarted}/${total} — some failed.` })
    } catch (err) {
      flash({ kind: 'error', text: `Restart failed: ${(err as Error).message}` })
    } finally {
      setRestarting(false)
    }
  }, [flash])

  return (
    <div className="codex-restart-row">
      <button
        className="codex-restart-btn"
        onClick={handleRestart}
        disabled={restarting}
        title="Gracefully exits Codex in all project terminals and runs `codex resume --last`"
      >
        {restarting ? 'Restarting…' : 'Restart Codex Sessions'}
      </button>
      <StatusBar msg={msg} />
    </div>
  )
}

// --- MCP Section ---

function McpSection() {
  const [mcps, setMcps] = useState<CodexMcpEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [msg, flash] = useFlash()

  const load = useCallback(async () => {
    const res = await window.daemon.codex.mcpAll()
    if (res.ok && res.data) setMcps(res.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggle = async (name: string, enabled: boolean) => {
    // Optimistic
    const prev = mcps
    setMcps((m) => m.map((x) => x.name === name ? { ...x, enabled } : x))
    setPending((s) => new Set(s).add(name))
    try {
      const res = await window.daemon.codex.mcpToggle(name, enabled)
      if (!res.ok) throw new Error(res.error)
      flash({ kind: 'ok', text: `${name} ${enabled ? 'enabled' : 'disabled'}. Restart to apply.` })
      await load()
    } catch (err) {
      setMcps(prev)
      flash({ kind: 'error', text: `Toggle failed: ${(err as Error).message}` })
    } finally {
      setPending((s) => { const n = new Set(s); n.delete(name); return n })
    }
  }

  if (loading) return <div className="codex-mcp-desc">Loading...</div>
  if (mcps.length === 0) return <div className="codex-mcp-desc">No MCP servers configured in ~/.codex/config.toml</div>

  return (
    <div style={{ padding: '0 12px' }}>
      <div className="codex-mcp-desc">
        Toggles MCP servers in your Codex config. Restart sessions to apply.
      </div>
      {mcps.map((mcp) => (
        <div key={mcp.name} className="codex-mcp-item">
          <span className="codex-mcp-name" title={mcp.name}>{mcp.name}</span>
          <Toggle
            checked={mcp.enabled}
            disabled={pending.has(mcp.name)}
            onChange={(enabled) => handleToggle(mcp.name, enabled)}
          />
        </div>
      ))}
      <StatusBar msg={msg} />
    </div>
  )
}

// --- AGENTS.md Section ---

function AgentsMdSection({ projectPath }: { projectPath: string }) {
  const [content, setContent] = useState<string>('')
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, flash] = useFlash()

  const load = useCallback(() => {
    setLoaded(false)
    window.daemon.codex.agentsMdRead(projectPath).then((res) => {
      if (res.ok && res.data) setContent(res.data.content ?? '')
      setLoaded(true)
    })
  }, [projectPath])

  useEffect(() => { load() }, [load])

  const startEdit = () => { setDraft(content); setEditing(true) }
  const cancelEdit = () => { setEditing(false); setDraft('') }
  const save = async () => {
    setSaving(true)
    try {
      const res = await window.daemon.codex.agentsMdWrite(projectPath, draft)
      if (!res.ok) throw new Error(res.error)
      setContent(draft)
      setEditing(false)
      flash({ kind: 'ok', text: 'AGENTS.md saved.' })
    } catch (err) {
      flash({ kind: 'error', text: `Save failed: ${(err as Error).message}` })
    } finally { setSaving(false) }
  }

  return (
    <CollapsibleSection title="AGENTS.md" defaultOpen={false}>
      <div style={{ padding: '0 12px' }}>
        {!loaded ? (
          <div className="codex-mcp-desc">Loading...</div>
        ) : editing ? (
          <>
            <textarea
              className="codex-agents-editor"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={14}
              spellCheck={false}
            />
            <div className="codex-actions-row">
              <button className="codex-btn codex-btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="codex-btn" onClick={cancelEdit} disabled={saving}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            {content ? (
              <pre className="codex-agents-preview">
                {content.length > 2000 ? `${content.slice(0, 2000)}\n… (${content.length - 2000} more chars)` : content}
              </pre>
            ) : (
              <div className="codex-mcp-desc">No AGENTS.md in this project.</div>
            )}
            <div className="codex-actions-row">
              <button className="codex-btn" onClick={startEdit}>
                {content ? 'Edit' : 'Create AGENTS.md'}
              </button>
            </div>
          </>
        )}
        <StatusBar msg={msg} />
      </div>
    </CollapsibleSection>
  )
}

export default CodexPanel
