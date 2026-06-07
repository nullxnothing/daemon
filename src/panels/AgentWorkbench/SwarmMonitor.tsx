import { useCallback, useEffect, useState } from 'react'

type Run = SwarmRun
type Lane = SwarmLane

const STATUS_COLOR: Record<string, string> = {
  running: 'var(--green)',
  spawning: 'var(--amber)',
  pending: 'var(--line-2)',
  done: 'var(--green)',
  failed: 'var(--red)',
  cancelled: 'var(--t3)',
}

function Dot({ status }: { status: string }) {
  return <span className="swarm-dot" style={{ background: STATUS_COLOR[status] ?? 'var(--line-2)' }} />
}

function relativeTime(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return day === 1 ? '1 day ago' : `${day} days ago`
}

export function SwarmMonitor() {
  const [runs, setRuns] = useState<Run[]>([])
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [lanes, setLanes] = useState<Lane[]>([])
  const [openLaneId, setOpenLaneId] = useState<string | null>(null)

  const loadRuns = useCallback(async () => {
    const res = await window.daemon.swarm.list(30)
    if (res.ok && res.data) setRuns(res.data)
  }, [])

  const loadDetail = useCallback(async (runId: string) => {
    const res = await window.daemon.swarm.runDetail(runId)
    if (res.ok && res.data) setLanes(res.data.lanes)
  }, [])

  useEffect(() => {
    void loadRuns()
    const off = window.daemon.swarm.onUpdate(() => {
      void loadRuns()
      setOpenRunId((cur) => { if (cur) void loadDetail(cur); return cur })
    })
    return off
  }, [loadRuns, loadDetail])

  const toggleRun = (runId: string) => {
    if (openRunId === runId) { setOpenRunId(null); return }
    setOpenRunId(runId)
    setOpenLaneId(null)
    void loadDetail(runId)
  }

  const cancel = async (runId: string) => {
    await window.daemon.swarm.cancel(runId)
    void loadRuns()
    if (openRunId === runId) void loadDetail(runId)
  }

  if (runs.length === 0) {
    return (
      <div className="swarm-monitor">
        <div className="swarm-empty">
          No swarm runs yet.
          <span className="swarm-empty-sub">Ask the operator to run tasks in parallel worktrees.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="swarm-monitor">
      <div className="swarm-runs">
        {runs.map((r) => {
          const isOpen = r.id === openRunId
          const isLive = r.status === 'running'
          return (
            <div key={r.id} className={`swarm-run${isOpen ? ' open' : ''}`}>
              <button type="button" className="swarm-run-head" onClick={() => toggleRun(r.id)}>
                <span className="swarm-caret" aria-hidden>{isOpen ? '▾' : '▸'}</span>
                <Dot status={r.status} />
                <span className="swarm-run-body">
                  <span className="swarm-run-id">{r.id.slice(0, 8)}</span>
                  <span className="swarm-run-meta">{relativeTime(r.created_at)}</span>
                </span>
                <span className={`swarm-run-status status-${r.status}`}>{r.status}</span>
              </button>

              {isOpen ? (
                <div className="swarm-lanes">
                  {isLive ? (
                    <button type="button" className="swarm-cancel" onClick={() => void cancel(r.id)}>Cancel run</button>
                  ) : null}
                  {lanes.length === 0 ? (
                    <div className="swarm-lanes-empty">No lanes.</div>
                  ) : (
                    lanes.map((l) => (
                      <div key={l.id} className="swarm-lane">
                        <button type="button" className="swarm-lane-head" onClick={() => setOpenLaneId(openLaneId === l.id ? null : l.id)}>
                          <Dot status={l.status} />
                          <span className="swarm-lane-task" title={l.task}>{l.task}</span>
                          {l.exit_code != null && l.status === 'failed' ? <span className="swarm-lane-exit">exit {l.exit_code}</span> : null}
                        </button>
                        {openLaneId === l.id ? (
                          <pre className="swarm-lane-results">
                            {l.results ?? (l.status === 'running' ? 'Lane running…' : 'No RESULTS.md produced.')}
                          </pre>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
