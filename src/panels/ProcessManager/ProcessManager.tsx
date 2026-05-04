import { useState, useEffect, useCallback, memo } from 'react'
import { useUIStore } from '../../store/ui'
import { confirm } from '../../store/confirm'
import { useNotificationsStore } from '../../store/notifications'
import type { ProcessInfo, OrphanProcess } from '../../../electron/shared/types'
import { PanelHeader, Stat } from '../../components/Panel'
import './ProcessManager.css'

const MODEL_SHORT: Record<string, string> = {
  'claude-opus-4-20250514': 'Opus',
  'claude-sonnet-4-20250514': 'Sonnet',
  'claude-haiku-4-5-20251001': 'Haiku',
}

export const ProcessManager = memo(function ProcessManager() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [orphans, setOrphans] = useState<OrphanProcess[]>([])
  const setActiveTerminal = useUIStore((s) => s.setActiveTerminal)
  const setActiveProject = useUIStore((s) => s.setActiveProject)

  const load = useCallback(async () => {
    const [procRes, orphanRes] = await Promise.all([
      window.daemon.process.list(),
      window.daemon.process.orphans(),
    ])
    if (procRes.ok && procRes.data) setProcesses(procRes.data)
    if (orphanRes.ok && orphanRes.data) setOrphans(orphanRes.data)
  }, [])

  // Background poll + event-driven refresh
  useEffect(() => {
    load()
    const interval = setInterval(load, 15000)
    const unsubscribe = window.daemon.events.on('process:changed', () => load())
    return () => { clearInterval(interval); unsubscribe() }
  }, [load])

  const handleKill = async (pid: number) => {
    const ok = await confirm({
      title: `Kill process ${pid}?`,
      body: 'The process will be terminated immediately.',
      danger: true,
      confirmLabel: 'Kill',
    })
    if (!ok) return
    const res = await window.daemon.process.kill(pid)
    if (res.ok) {
      useNotificationsStore.getState().pushSuccess(`Killed PID ${pid}`, 'Processes')
    } else {
      useNotificationsStore.getState().pushError(res.error ?? 'Kill failed', 'Processes')
    }
    setTimeout(load, 500)
  }

  const handleFocus = (proc: ProcessInfo) => {
    if (proc.projectId && proc.projectPath) {
      setActiveProject(proc.projectId, proc.projectPath)
      setActiveTerminal(proc.projectId, proc.id)
    }
  }

  const totalMemory = processes.reduce((s, p) => s + p.memory, 0)
  const agentCount = processes.filter((p) => p.kind === 'agent').length
  const shellCount = processes.filter((p) => p.kind === 'shell').length

  return (
    <div className="process-panel">
      <PanelHeader
        className="process-panel-header"
        kicker="Runtime control"
        brandKicker
        title="Keep live sessions under control"
        subtitle="Focus the exact terminal you need, spot heavy sessions quickly, and clean up orphans before they drift."
        actions={
          <button className="process-btn" onClick={() => load()}>
            Refresh
          </button>
        }
      />

      <div className="process-body">
        <div className="process-summary-grid">
          <Stat className="process-stat-card" label="Active sessions" value={processes.length} detail={`${agentCount} agents · ${shellCount} shells`} />
          <Stat className="process-stat-card" label="Total memory" value={formatMB(totalMemory)} detail="across tracked sessions" />
          <Stat
            className="process-stat-card"
            label="Orphans"
            value={orphans.length}
            detail={orphans.length > 0 ? 'needs cleanup' : 'all clear'}
            tone={orphans.length > 0 ? 'warn' : 'default'}
          />
        </div>

        <section className="process-section">
          <div className="process-section-head">
            <div>
              <div className="process-section-kicker">Active</div>
              <h3 className="process-section-title">Live sessions</h3>
            </div>
            <span className="process-section-count">{processes.length}</span>
          </div>

        {processes.length === 0 ? (
          <div className="process-empty-card">No active sessions.</div>
        ) : (
          <div className="process-list">
            {processes.map((proc) => (
              <article key={proc.id} className="process-row-card">
                <div className="process-row-main">
                  <div className="process-row-titleline">
                    <span className={`process-dot ${memoryLevel(proc.memory)}`} />
                    <strong className="process-name">{proc.name}</strong>
                    <span className={`process-kind process-kind--${proc.kind}`}>{proc.kind}</span>
                    {proc.model && (
                      <span className="process-model">{MODEL_SHORT[proc.model] ?? '?'}</span>
                    )}
                  </div>
                  <div className="process-row-meta">
                    {proc.projectName && <span>{proc.projectName}</span>}
                    <span>{formatUptime(proc.startedAt)}</span>
                    <span>{formatMB(proc.memory)}</span>
                  </div>
                  <MemoryBar memory={proc.memory} />
                </div>
                <div className="process-actions">
                  <button className="process-btn" onClick={() => handleFocus(proc)} title="Focus terminal">
                    Focus
                  </button>
                  <button className="process-btn danger" onClick={() => handleKill(proc.pid)} title="Kill process">
                    Kill
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        </section>

        <section className="process-section">
          <div className="process-section-head">
            <div>
              <div className="process-section-kicker">Cleanup</div>
              <h3 className="process-section-title">Orphaned processes</h3>
            </div>
            <span className="process-section-count">{orphans.length}</span>
          </div>

        {orphans.length === 0 ? (
          <div className="process-empty-card">No orphaned processes.</div>
        ) : (
          <div className="process-list">
            {orphans.map((proc) => (
              <article key={proc.pid} className="process-row-card orphan">
                <div className="process-row-main">
                  <div className="process-row-titleline">
                    <span className="process-dot critical" />
                    <strong className="process-name">{proc.name}</strong>
                  </div>
                  <div className="process-row-meta">
                    <span>PID {proc.pid}</span>
                    <span>{formatMB(proc.memory)}</span>
                  </div>
                </div>
                <div className="process-actions">
                  <button className="process-btn danger" onClick={() => handleKill(proc.pid)}>
                    Kill
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        </section>
      </div>
    </div>
  )
})

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
