import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { confirm } from '../../store/confirm'
import { useNotificationsStore } from '../../store/notifications'
import { PanelHeader } from '../../components/Panel'
import './PortsPanel.css'

interface RegisteredPort {
  port: number
  projectId: string
  projectName: string
  serviceName: string
  pid: number | null
  isListening: boolean
}

interface GhostPort {
  port: number
  pid: number
  address: string
  processName: string | null
}

const PROTECTED_PROCESS_PATTERN = /^(lsass|wininit|services|svchost|csrss|smss|dwm|fontdrvhost|memory compression|system)$/i
const DEV_PROCESS_PATTERN = /(node|bun|deno|python|uv|ruby|go|java|next|vite|webpack|turbo|cargo|rust|npm|pnpm|yarn|electron|daemon|php|apache|nginx|postgres|mysql|redis)/i

export const PortsPanel = memo(function PortsPanel() {
  const [registered, setRegistered] = useState<RegisteredPort[]>([])
  const [ghosts, setGhosts] = useState<GhostPort[]>([])

  const load = useCallback(async () => {
    const [regRes, ghostRes] = await Promise.all([
      window.daemon.ports.registered(),
      window.daemon.ports.ghosts(),
    ])
    if (regRes.ok && regRes.data) setRegistered(regRes.data as RegisteredPort[])
    if (ghostRes.ok && ghostRes.data) setGhosts(ghostRes.data as GhostPort[])
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    const unsubscribe = window.daemon.events.on('port:changed', () => load())
    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [load])

  const handleKill = async (port: number) => {
    const ok = await confirm({
      title: `Kill port :${port}?`,
      body: 'The process bound to this port will be terminated.',
      danger: true,
      confirmLabel: 'Kill',
    })
    if (!ok) return
    const res = await window.daemon.ports.kill(port)
    if (res.ok) {
      useNotificationsStore.getState().pushSuccess(`Killed port :${port}`, 'Ports')
    } else {
      useNotificationsStore.getState().pushError(res.error ?? 'Kill failed', 'Ports')
    }
    setTimeout(load, 500)
  }

  const dedupedRegistered = useMemo(() => {
    const byPort = new Map<number, RegisteredPort & { projectNames: string[] }>()
    for (const entry of registered) {
      const existing = byPort.get(entry.port)
      if (!existing) {
        byPort.set(entry.port, {
          ...entry,
          projectNames: entry.projectName ? [entry.projectName] : [],
        })
        continue
      }
      existing.isListening = existing.isListening || entry.isListening
      existing.pid = existing.pid ?? entry.pid
      if (entry.projectName && !existing.projectNames.includes(entry.projectName)) {
        existing.projectNames.push(entry.projectName)
      }
    }
    return Array.from(byPort.values())
  }, [registered])

  const safeGhosts = useMemo(
    () => ghosts.filter((ghost) => !PROTECTED_PROCESS_PATTERN.test(ghost.processName ?? '')).slice(0, 24),
    [ghosts],
  )

  const livePorts = dedupedRegistered.filter((p) => p.isListening)
  const killableGhosts = useMemo(
    () => safeGhosts.filter((ghost) => (
      DEV_PROCESS_PATTERN.test(ghost.processName ?? '') && !PROTECTED_PROCESS_PATTERN.test(ghost.processName ?? '')
    )).length,
    [safeGhosts],
  )

  return (
    <div className="ports-panel">
      <PanelHeader
        className="ports-panel-header"
        kicker="Local routing"
        brandKicker
        title="Know what is actually running"
        subtitle="Registered dev servers come first. Ghost listeners are separated so you can clean up noise without guessing."
        actions={
          <button type="button" className="ports-btn" onClick={() => load()}>
            Refresh
          </button>
        }
      />

      <div className="ports-body">
        {/* fused summary strip — counts only, no big stat cards */}
        <div className="ports-summary">
          <span className="ports-summary-cell">
            <span className="ports-summary-value">{dedupedRegistered.length}</span>
            <span className="ports-summary-label">Tracked ports</span>
          </span>
          <span className="ports-summary-cell">
            <span className="ports-summary-value ports-summary-value--ok">{livePorts.length}</span>
            <span className="ports-summary-label">Responding</span>
          </span>
          <span className="ports-summary-cell">
            <span className={`ports-summary-value ${safeGhosts.length > 0 ? 'ports-summary-value--warn' : ''}`}>{safeGhosts.length}</span>
            <span className="ports-summary-label">Ghost listeners</span>
          </span>
        </div>

        <section className="ports-section">
          <div className="ports-section-head">
            <span className="ports-section-kicker">Registered</span>
            <h3 className="ports-section-title">Tracked app endpoints</h3>
            <span className="ports-section-count">{dedupedRegistered.length}</span>
          </div>

          {dedupedRegistered.length === 0 ? (
            <div className="ports-empty">
              No tracked ports yet. Start a local app through DAEMON or register a service to keep it in the browser workflow.
            </div>
          ) : (
            <div className="ports-table" role="table" aria-label="Tracked app endpoints">
              <div className="ports-thead" role="row">
                <span role="columnheader">Port</span>
                <span role="columnheader">Service</span>
                <span role="columnheader">Address</span>
                <span role="columnheader">PID</span>
                <span role="columnheader">State</span>
                <span aria-hidden="true" />
              </div>
              {dedupedRegistered.map((port) => (
                <div key={`${port.port}-${port.projectId}`} className="ports-trow" role="row">
                  <span className="ports-cell-port" role="cell">
                    <span className={`ports-dot ${port.isListening ? 'live' : 'dead'}`} aria-hidden="true" />
                    :{port.port}
                  </span>
                  <span role="cell"><span className="ports-tag">{port.serviceName}</span></span>
                  <span className="ports-cell-mono" role="cell">{port.projectNames.join(', ') || port.projectName || '127.0.0.1'}</span>
                  <span className="ports-cell-mono ports-cell-dim" role="cell">{port.pid ? `PID ${port.pid}` : 'PID —'}</span>
                  <span className={`ports-cell-state ${port.isListening ? 'live' : 'dead'}`} role="cell">
                    {port.isListening ? 'Responding' : 'Not responding'}
                  </span>
                  <span className="ports-cell-action" role="cell">
                    {port.isListening && (
                      <button type="button" className="ports-btn danger sm" onClick={() => handleKill(port.port)}>
                        Kill
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="ports-section">
          <div className="ports-section-head">
            <span className="ports-section-kicker">Untracked</span>
            <h3 className="ports-section-title">Ghost listeners</h3>
            <span className="ports-section-count">
              {safeGhosts.length}
              {killableGhosts > 0 ? <span className="ports-section-sub"> · {killableGhosts} killable</span> : null}
            </span>
          </div>

          {safeGhosts.length === 0 ? (
            <div className="ports-empty">No user-actionable ghost listeners detected.</div>
          ) : (
            <div className="ports-table" role="table" aria-label="Ghost listeners">
              <div className="ports-thead" role="row">
                <span role="columnheader">Port</span>
                <span role="columnheader">Process</span>
                <span role="columnheader">Address</span>
                <span role="columnheader">PID</span>
                <span role="columnheader">State</span>
                <span aria-hidden="true" />
              </div>
              {safeGhosts.map((ghost) => {
                const canKill = DEV_PROCESS_PATTERN.test(ghost.processName ?? '') && !PROTECTED_PROCESS_PATTERN.test(ghost.processName ?? '')
                return (
                  <div key={ghost.port} className="ports-trow" role="row">
                    <span className="ports-cell-port" role="cell">
                      <span className="ports-dot warning" aria-hidden="true" />
                      :{ghost.port}
                    </span>
                    <span role="cell"><span className="ports-tag muted">{ghost.processName ?? 'Unknown process'}</span></span>
                    <span className="ports-cell-mono" role="cell">{ghost.address}</span>
                    <span className="ports-cell-mono ports-cell-dim" role="cell">PID {ghost.pid}</span>
                    <span className={`ports-cell-state ${canKill ? '' : 'protected'}`} role="cell">
                      {canKill ? 'Listening' : 'Protected'}
                    </span>
                    <span className="ports-cell-action" role="cell">
                      {canKill ? (
                        <button type="button" className="ports-btn danger sm" onClick={() => handleKill(ghost.port)}>
                          Kill
                        </button>
                      ) : null}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <footer className="ports-footer">
        <span className="ports-footer-left">
          <span className={`ports-dot ${livePorts.length > 0 ? 'live' : 'dead'}`} aria-hidden="true" />
          {livePorts.length} responding
        </span>
        <span className="ports-footer-right">{safeGhosts.length} ghost · {killableGhosts} killable</span>
      </footer>
    </div>
  )
})
