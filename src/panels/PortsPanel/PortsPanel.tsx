import { useState, useEffect, useCallback, memo } from 'react'
import { CollapsibleSection } from '../../components/CollapsibleSection'
import { confirm } from '../../store/confirm'
import { useNotificationsStore } from '../../store/notifications'
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
    // Slow background poll while we work toward main-side push events.
    // Manual refresh button covers the immediate-feedback case.
    const interval = setInterval(load, 30000)
    const unsubscribe = window.daemon.events.on('port:changed', () => load())
    return () => { clearInterval(interval); unsubscribe() }
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

  return (
    <div className="ports-panel">
      <div className="panel-header">
        Ports
        <button
          className="panel-header-action"
          onClick={() => load()}
          title="Refresh"
          aria-label="Refresh ports"
        >
          ↻
        </button>
      </div>

      <CollapsibleSection title="Registered" count={registered.length} defaultOpen>
        {registered.length === 0 ? (
          <div className="ports-empty">No ports detected. Start a dev server to see active ports here.</div>
        ) : (
          registered.map((p) => (
            <div key={`${p.port}-${p.projectId}`} className="port-row">
              <span className={`port-dot ${p.isListening ? 'live' : 'dead'}`} title={p.isListening ? 'Port listening' : 'Port not responding'} />
              <span className="port-number">:{p.port}</span>
              <span className="port-service">{p.serviceName}</span>
              <span className="port-project">{p.projectName}</span>
              {p.isListening && (
                <button className="port-btn" onClick={() => handleKill(p.port)}>Kill</button>
              )}
            </div>
          ))
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Ghost Servers" count={ghosts.length} defaultOpen={ghosts.length > 0}>
        {ghosts.length === 0 ? (
          <div className="ports-empty">No ghost servers</div>
        ) : (
          ghosts.map((g) => (
            <div key={g.port} className="port-row ghost">
              <span className="port-dot warning" title="Ghost server — unregistered process on port" />
              <span className="port-number">:{g.port}</span>
              <span className="port-process">{g.processName ?? `PID ${g.pid}`}</span>
              <button className="port-btn danger" onClick={() => handleKill(g.port)}>Kill</button>
            </div>
          ))
        )}
      </CollapsibleSection>
    </div>
  )
})
