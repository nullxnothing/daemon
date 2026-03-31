import { useState, useEffect, useCallback } from 'react'
import { CollapsibleSection } from '../../components/CollapsibleSection'
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

export function PortsPanel() {
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
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [load])

  const handleKill = async (port: number) => {
    await window.daemon.ports.kill(port)
    setTimeout(load, 1000)
  }

  return (
    <div className="ports-panel">
      <div className="panel-header">Ports</div>

      <CollapsibleSection title="Registered" count={registered.length} defaultOpen>
        {registered.length === 0 ? (
          <div className="ports-empty">No registered ports</div>
        ) : (
          registered.map((p) => (
            <div key={`${p.port}-${p.projectId}`} className="port-row">
              <span className={`port-dot ${p.isListening ? 'live' : 'dead'}`} />
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
              <span className="port-dot warning" />
              <span className="port-number">:{g.port}</span>
              <span className="port-process">{g.processName ?? `PID ${g.pid}`}</span>
              <button className="port-btn danger" onClick={() => handleKill(g.port)}>Kill</button>
            </div>
          ))
        )}
      </CollapsibleSection>
    </div>
  )
}
