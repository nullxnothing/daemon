import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { confirm } from '../../store/confirm'
import { useNotificationsStore } from '../../store/notifications'
import { PanelHeader, Stat } from '../../components/Panel'
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
  const attachedProjects = new Set(registered.map((p) => p.projectId)).size

  return (
    <div className="ports-panel">
      <PanelHeader
        className="ports-panel-header"
        kicker="Local routing"
        brandKicker
        title="Know what is actually running"
        subtitle="Registered dev servers come first. Ghost listeners are separated so you can clean up noise without guessing."
        actions={
          <button className="ports-btn" onClick={() => load()}>
            Refresh
          </button>
        }
      />

      <div className="ports-body">
        <div className="ports-summary-grid">
          <Stat className="ports-stat-card" label="Tracked ports" value={dedupedRegistered.length} detail={`${livePorts.length} responding`} />
          <Stat className="ports-stat-card" label="Active projects" value={attachedProjects} detail="with registered services" />
          <Stat
            className="ports-stat-card"
            label="Ghost listeners"
            value={safeGhosts.length}
            detail={safeGhosts.length > 0 ? 'reviewable' : 'all clear'}
            tone={safeGhosts.length > 0 ? 'warn' : 'default'}
          />
        </div>

        <section className="ports-section">
          <div className="ports-section-head">
            <div>
              <div className="ports-section-kicker">Registered</div>
              <h3 className="ports-section-title">Tracked app endpoints</h3>
            </div>
            <span className="ports-section-count">{dedupedRegistered.length}</span>
          </div>

          {dedupedRegistered.length === 0 ? (
            <div className="ports-empty-card">
              No tracked ports yet. Start a local app through DAEMON or register a service to keep it in the browser workflow.
            </div>
          ) : (
            <div className="ports-list">
              {dedupedRegistered.map((port) => (
                <article key={`${port.port}-${port.projectId}`} className="ports-row-card">
                  <div className="ports-row-main">
                    <div className="ports-row-titleline">
                      <span className={`ports-status-dot ${port.isListening ? 'live' : 'dead'}`} />
                      <strong>:{port.port}</strong>
                      <span className="ports-service-pill">{port.serviceName}</span>
                    </div>
                    <div className="ports-row-meta">
                      <span>{port.projectNames.join(', ') || port.projectName}</span>
                      <span>{port.pid ? `PID ${port.pid}` : 'PID unknown'}</span>
                      <span>{port.isListening ? 'Responding' : 'Not responding'}</span>
                    </div>
                  </div>
                  <div className="ports-row-actions">
                    {port.isListening && (
                      <button className="ports-btn danger" onClick={() => handleKill(port.port)}>
                        Kill
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="ports-section">
          <div className="ports-section-head">
            <div>
              <div className="ports-section-kicker">Untracked</div>
              <h3 className="ports-section-title">Ghost listeners</h3>
            </div>
            <span className="ports-section-count">{safeGhosts.length}</span>
          </div>

          {safeGhosts.length === 0 ? (
            <div className="ports-empty-card">No user-actionable ghost listeners detected.</div>
          ) : (
            <div className="ports-list">
              {safeGhosts.map((ghost) => {
                const canKill = DEV_PROCESS_PATTERN.test(ghost.processName ?? '') && !PROTECTED_PROCESS_PATTERN.test(ghost.processName ?? '')
                return (
                <article key={ghost.port} className="ports-row-card ghost">
                  <div className="ports-row-main">
                    <div className="ports-row-titleline">
                      <span className="ports-status-dot warning" />
                      <strong>:{ghost.port}</strong>
                      <span className="ports-service-pill muted">{ghost.processName ?? 'Unknown process'}</span>
                    </div>
                    <div className="ports-row-meta">
                      <span>{ghost.address}</span>
                      <span>PID {ghost.pid}</span>
                      {!canKill && <span>review in Task Manager</span>}
                    </div>
                  </div>
                  <div className="ports-row-actions">
                    {canKill ? (
                      <button className="ports-btn danger" onClick={() => handleKill(ghost.port)}>
                        Kill
                      </button>
                    ) : (
                      <span className="ports-row-note">Protected</span>
                    )}
                  </div>
                </article>
              )})}
            </div>
          )}
        </section>
      </div>
    </div>
  )
})
