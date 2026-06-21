import { useCallback, useEffect, useState } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { runIpc } from '../../lib/runIpc'
import { useBridgeStore } from '../../store/bridge'

/**
 * DAEMON Bridge settings — status of the loopback MCP bridge, token rotation,
 * and per-project registration so external agents (Claude Code, Cursor) can
 * call DAEMON's gated tools. Rendered inside the Integrations tab; reuses the
 * global settings-* classes from SettingsPanel.css.
 */
export function BridgeSection({ projectPath }: { projectPath: string | null }) {
  const [status, setStatus] = useState<BridgeStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [registered, setRegistered] = useState(false)
  const activity = useBridgeStore((s) => s.activity)

  const load = useCallback(async () => {
    const data = await runIpc(daemon.bridge.status(), { context: 'Bridge', silent: true })
    if (data) setStatus(data)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleRotate = async () => {
    setBusy(true)
    const data = await runIpc(daemon.bridge.rotateToken(), { context: 'Bridge' })
    if (data) setStatus(data)
    setBusy(false)
  }

  const handleRegister = async () => {
    if (!projectPath) return
    setBusy(true)
    const data = await runIpc(daemon.bridge.registerProject(projectPath), { context: 'Bridge' })
    if (data) {
      setStatus(data)
      setRegistered(true)
    }
    setBusy(false)
  }

  return (
    <div className="settings-section">
      <div className="settings-section-label">DAEMON Bridge</div>
      <div className="settings-section-desc">
        Lets agents in other tools (Claude Code, Cursor) call DAEMON&apos;s wallet, launch, and
        memory tools over MCP. Every write action still requires your approval inside DAEMON;
        sensitive actions keep typed confirmation.
      </div>

      <div className="settings-key-list">
        <div className="settings-key-row">
          <div className={`settings-integration-dot ${status?.running ? 'green' : 'red'}`} />
          <span className="settings-key-name">
            {status?.running ? `Listening on 127.0.0.1:${status.port}` : status?.error ?? 'Not running'}
          </span>
          <span className="settings-key-hint">
            {status ? `${status.toolCount} tools exposed` : ''}
          </span>
        </div>
        {status?.tokenFile ? (
          <div className="settings-key-row">
            <div className="settings-integration-dot" />
            <span className="settings-key-hint" title={status.tokenFile}>Token: {status.tokenFile}</span>
          </div>
        ) : null}
      </div>

      <div className="settings-key-add">
        <button
          type="button"
          className="settings-btn primary"
          disabled={busy || !projectPath || !status?.running}
          onClick={handleRegister}
          title={projectPath ? `Writes the daemon-bridge MCP entry to ${projectPath}\\.mcp.json` : 'Open a project first'}
        >
          {registered ? 'Enabled for active project' : 'Enable for active project'}
        </button>
        <button type="button" className="settings-btn" disabled={busy} onClick={handleRotate}>
          Rotate token
        </button>
      </div>

      {activity.length > 0 ? (
        <>
          <div className="settings-section-label">Recent bridge calls</div>
          <div className="settings-key-list">
            {activity.slice(0, 8).map((entry) => (
              <div key={entry.callId} className="settings-key-row">
                <div className={`settings-integration-dot ${entry.status === 'done' ? 'green' : 'red'}`} />
                <code className="settings-key-name">{entry.name}</code>
                <span className="settings-key-hint" title={entry.summary}>{entry.summary}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
