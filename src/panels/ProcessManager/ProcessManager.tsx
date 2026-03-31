import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import { CollapsibleSection } from '../../components/CollapsibleSection'
import type { ProcessInfo, OrphanProcess } from '../../../electron/shared/types'
import './ProcessManager.css'

const MODEL_SHORT: Record<string, string> = {
  'claude-opus-4-20250514': 'Opus',
  'claude-sonnet-4-20250514': 'Sonnet',
  'claude-haiku-4-5-20251001': 'Haiku',
}

export function ProcessManager() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [orphans, setOrphans] = useState<OrphanProcess[]>([])
  const setActiveTerminal = useUIStore((s) => s.setActiveTerminal)
  const setActiveProject = useUIStore((s) => s.setActiveProject)
  const setActivePanel = useUIStore((s) => s.setActivePanel)

  const load = useCallback(async () => {
    const [procRes, orphanRes] = await Promise.all([
      window.daemon.process.list(),
      window.daemon.process.orphans(),
    ])
    if (procRes.ok && procRes.data) setProcesses(procRes.data)
    if (orphanRes.ok && orphanRes.data) setOrphans(orphanRes.data)
  }, [])

  // Poll every 5s
  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  const handleKill = async (pid: number) => {
    await window.daemon.process.kill(pid)
    setTimeout(load, 1000)
  }

  const handleFocus = (proc: ProcessInfo) => {
    if (proc.projectId && proc.projectPath) {
      setActiveProject(proc.projectId, proc.projectPath)
      setActiveTerminal(proc.projectId, proc.id)
    }
    setActivePanel('claude') // Switch back to main view to see terminal
  }

  const totalMemory = processes.reduce((s, p) => s + p.memory, 0)

  return (
    <div className="process-panel">
      <div className="panel-header">Processes</div>

      <CollapsibleSection title="Active Sessions" count={processes.length} defaultOpen>
        {processes.length === 0 ? (
          <div className="process-empty">No active sessions</div>
        ) : (
          <>
            {processes.map((proc) => (
              <div key={proc.id} className="process-row">
                <div className="process-row-main">
                  <span className={`process-dot ${memoryLevel(proc.memory)}`} />
                  <span className="process-name">{proc.name}</span>
                  {proc.model && (
                    <span className="process-model">{MODEL_SHORT[proc.model] ?? '?'}</span>
                  )}
                  <span className="process-mem">{formatMB(proc.memory)}</span>
                </div>
                <div className="process-row-sub">
                  {proc.projectName && <span>{proc.projectName}</span>}
                  <span>{formatUptime(proc.startedAt)}</span>
                </div>
                <MemoryBar memory={proc.memory} />
                <div className="process-actions">
                  <button className="process-btn" onClick={() => handleFocus(proc)} title="Focus terminal">
                    Focus
                  </button>
                  <button className="process-btn danger" onClick={() => handleKill(proc.pid)} title="Kill process">
                    Kill
                  </button>
                </div>
              </div>
            ))}
            <div className="process-total">
              Total: {formatMB(totalMemory)} across {processes.length} session{processes.length !== 1 ? 's' : ''}
            </div>
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Orphaned" count={orphans.length} defaultOpen={false}>
        {orphans.length === 0 ? (
          <div className="process-empty">No orphaned processes</div>
        ) : (
          orphans.map((proc) => (
            <div key={proc.pid} className="process-row orphan">
              <div className="process-row-main">
                <span className="process-dot critical" />
                <span className="process-name">{proc.name}</span>
                <span className="process-mem">{formatMB(proc.memory)}</span>
              </div>
              <div className="process-row-sub">
                <span>PID {proc.pid}</span>
              </div>
              <div className="process-actions">
                <button className="process-btn danger" onClick={() => handleKill(proc.pid)}>
                  Kill
                </button>
              </div>
            </div>
          ))
        )}
      </CollapsibleSection>
    </div>
  )
}

function MemoryBar({ memory }: { memory: number }) {
  const mb = memory / (1024 * 1024)
  const pct = Math.min(100, (mb / 500) * 100) // 500MB = full bar
  const level = memoryLevel(memory)

  return (
    <div className="memory-bar">
      <div className={`memory-bar-fill ${level}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function memoryLevel(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb > 400) return 'critical'
  if (mb > 200) return 'warning'
  return 'healthy'
}

function formatMB(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 1000 ? `${(mb / 1024).toFixed(1)}GB` : `${Math.round(mb)}MB`
}

function formatUptime(startedAt: number): string {
  const elapsed = Date.now() - startedAt
  const min = Math.floor(elapsed / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
