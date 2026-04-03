import { useState, useEffect, useCallback, useRef } from 'react'
import { useUIStore } from '../../store/ui'
import './HackathonPanel.css'

const DEADLINE_KEY = 'daemon:hackathon-deadline'
const CHECKLIST_KEY = 'daemon:hackathon-checklist'

const CHECKLIST_ITEMS = [
  'GitHub repo',
  'Demo video',
  'Presentation',
  'Project description',
  'Technical demo',
]

interface ChecklistState {
  [key: string]: boolean
}

function loadChecklist(): ChecklistState {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveChecklist(state: ChecklistState) {
  localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state))
}

function getDeadline(): number | null {
  const raw = localStorage.getItem(DEADLINE_KEY)
  if (!raw) return null
  const ts = Number(raw)
  return isNaN(ts) ? null : ts
}

function formatCountdown(ms: number): { text: string; urgency: 'normal' | 'warning' | 'urgent' } {
  if (ms <= 0) return { text: 'Deadline passed', urgency: 'urgent' }

  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (days === 0) parts.push(`${minutes}m`)

  const urgency = ms < 86_400_000 ? 'urgent' : ms < 604_800_000 ? 'warning' : 'normal'
  return { text: `${parts.join(' ')} remaining`, urgency }
}

export function HackathonPanel() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null)
  const [patInput, setPatInput] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search state
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<ColosseumProject[]>([])

  // Checklist
  const [checklist, setChecklist] = useState<ChecklistState>(loadChecklist)

  // Countdown
  const [countdown, setCountdown] = useState<{ text: string; urgency: 'normal' | 'warning' | 'urgent' } | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.daemon.colosseum.isConfigured().then((res) => {
      setIsConfigured(res.ok ? !!res.data : false)
    })
  }, [])

  // Countdown timer
  useEffect(() => {
    const deadline = getDeadline()
    if (!deadline) {
      // Default: set to 30 days from now if none exists
      const defaultDeadline = Date.now() + 30 * 86_400_000
      localStorage.setItem(DEADLINE_KEY, String(defaultDeadline))
    }

    const tick = () => {
      const dl = getDeadline()
      if (dl) {
        setCountdown(formatCountdown(dl - Date.now()))
      }
    }
    tick()
    const interval = setInterval(tick, 60_000)
    return () => clearInterval(interval)
  }, [])

  const handleConnect = useCallback(async () => {
    if (!patInput.trim()) return
    setConnecting(true)
    setError(null)
    try {
      const storeRes = await window.daemon.colosseum.storePat(patInput.trim())
      if (!storeRes.ok) throw new Error(storeRes.error)

      const statusRes = await window.daemon.colosseum.status()
      if (!statusRes.ok) throw new Error(statusRes.error)

      setIsConfigured(true)
      setPatInput('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setConnecting(false)
    }
  }, [patInput])

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    try {
      const res = await window.daemon.colosseum.searchProjects(query.trim(), 8)
      if (!res.ok) throw new Error(res.error)
      setResults((res.data as { results: ColosseumProject[] }).results ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSearching(false)
    }
  }, [query])

  const handleCheckToggle = useCallback((item: string) => {
    setChecklist((prev) => {
      const next = { ...prev, [item]: !prev[item] }
      saveChecklist(next)
      return next
    })
  }, [])

  const handleResearchAgent = useCallback(() => {
    // Spawn the colosseum-research agent
    const projectId = useUIStore.getState().activeProjectId
    if (projectId) {
      window.daemon.terminal.spawnAgent({ agentId: 'colosseum-research', projectId })
    }
  }, [])

  const handleOpenArena = useCallback(() => {
    window.daemon.shell.openExternal('https://arena.colosseum.org')
  }, [])

  if (isConfigured === null) {
    return <div className="hackathon-panel"><span className="hackathon-loading">Loading...</span></div>
  }

  // Disconnected state
  if (!isConfigured) {
    return (
      <div className="hackathon-panel">
        <div className="hackathon-header">
          <span className="hackathon-dot disconnected" />
          <span className="hackathon-header-label">COLOSSEUM</span>
        </div>

        <div className="hackathon-connect">
          <p className="hackathon-desc">
            Connect to research 5,400+ hackathon projects and track your submission.
          </p>

          <div className="hackathon-input-row">
            <input
              type="password"
              className="hackathon-input"
              placeholder="Copilot PAT"
              value={patInput}
              onChange={(e) => setPatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConnect() }}
            />
            <button
              className="hackathon-btn"
              onClick={handleConnect}
              disabled={connecting || !patInput.trim()}
            >
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
          </div>

          <span
            className="hackathon-link"
            onClick={() => window.daemon.shell.openExternal('https://arena.colosseum.org/copilot')}
          >
            Get a token at arena.colosseum.org/copilot
          </span>

          {error && <div className="hackathon-error">{error}</div>}
        </div>
      </div>
    )
  }

  // Connected state
  const completedCount = CHECKLIST_ITEMS.filter((item) => checklist[item]).length

  return (
    <div className="hackathon-panel">
      <div className="hackathon-header">
        <span className="hackathon-dot connected" />
        <span className="hackathon-header-label">COLOSSEUM</span>
        <span className="hackathon-header-status">Connected</span>
      </div>

      {/* Active hackathon card */}
      <div className="hackathon-card">
        <span className="hackathon-card-title">Frontier</span>
        {countdown && (
          <span className={`hackathon-countdown ${countdown.urgency}`}>
            {countdown.text}
          </span>
        )}
      </div>

      {/* Submission checklist */}
      <span className="hackathon-section-title">Submission Checklist ({completedCount}/{CHECKLIST_ITEMS.length})</span>
      <div className="hackathon-checklist">
        {CHECKLIST_ITEMS.map((item) => (
          <label
            key={item}
            className={`hackathon-check-item${checklist[item] ? ' done' : ''}`}
          >
            <input
              type="checkbox"
              checked={!!checklist[item]}
              onChange={() => handleCheckToggle(item)}
            />
            {item}
          </label>
        ))}
      </div>

      {/* Research search */}
      <span className="hackathon-section-title">Research</span>
      <form className="hackathon-search-form" onSubmit={handleSearch}>
        <input
          ref={searchInputRef}
          className="hackathon-input"
          placeholder="Search 5,400+ projects..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="hackathon-btn"
          type="submit"
          disabled={searching || !query.trim()}
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && <div className="hackathon-error">{error}</div>}

      {results.length > 0 && (
        <div className="hackathon-results">
          {results.map((project) => (
            <div
              key={project.slug}
              className="hackathon-result-card"
              onClick={() => {
                window.daemon.colosseum.projectDetail(project.slug)
              }}
            >
              <div className="hackathon-result-name">{project.name}</div>
              <div className="hackathon-result-oneliner">{project.oneLiner}</div>
              <div className="hackathon-result-meta">
                <span className="hackathon-badge">{project.hackathon.name}</span>
                {project.tracks.map((t) => (
                  <span key={t.key} className="hackathon-badge">{t.name}</span>
                ))}
                {project.similarity > 0 && (
                  <span className="hackathon-badge similarity">
                    {Math.round(project.similarity * 100)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <span className="hackathon-section-title">Quick Actions</span>
      <div className="hackathon-actions">
        <button className="hackathon-btn-secondary" onClick={handleResearchAgent}>
          Research Competition
        </button>
        <button className="hackathon-btn-secondary" onClick={handleOpenArena}>
          Open Arena
        </button>
      </div>
    </div>
  )
}
