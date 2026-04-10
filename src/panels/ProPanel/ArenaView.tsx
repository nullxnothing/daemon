import { useEffect, useMemo, useState } from 'react'
import { useProStore } from '../../store/pro'
import './ProPanel.css'

type Category = 'all' | 'tool' | 'agent' | 'skill' | 'mcp' | 'grind-recipe'

const CATEGORY_LABELS: Record<Category, string> = {
  all: 'All',
  tool: 'Tools',
  agent: 'Agents',
  skill: 'Skills',
  mcp: 'MCP',
  'grind-recipe': 'Grind recipes',
}

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  featured: 'Featured',
  winner: 'Winner',
  shipped: 'Shipped',
}

export function ArenaView() {
  const submissions = useProStore((state) => state.arenaSubmissions)
  const loading = useProStore((state) => state.loadingArena)
  const loadArena = useProStore((state) => state.loadArena)
  const submitToArena = useProStore((state) => state.submitToArena)
  const voteArena = useProStore((state) => state.voteArena)
  const error = useProStore((state) => state.error)
  const clearError = useProStore((state) => state.clearError)

  const [category, setCategory] = useState<Category>('all')
  const [showForm, setShowForm] = useState(false)
  const [voted, setVoted] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState('')
  const [pitch, setPitch] = useState('')
  const [description, setDescription] = useState('')
  const [formCategory, setFormCategory] = useState<Exclude<Category, 'all'>>('tool')
  const [githubUrl, setGithubUrl] = useState('')
  const [demoUrl, setDemoUrl] = useState('')
  const [xHandle, setXHandle] = useState('')
  const [discordHandle, setDiscordHandle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void loadArena()
  }, [loadArena])

  const filtered = useMemo(() => {
    const list = category === 'all'
      ? submissions
      : submissions.filter((submission) => submission.category === category)
    const rank = (status: string) => {
      if (status === 'shipped') return 0
      if (status === 'winner') return 1
      if (status === 'featured') return 2
      return 3
    }
    return [...list].sort((a, b) => {
      const statusDiff = rank(a.status) - rank(b.status)
      if (statusDiff !== 0) return statusDiff
      if (a.votes !== b.votes) return b.votes - a.votes
      return b.submittedAt - a.submittedAt
    })
  }, [submissions, category])

  const handleSubmit = async () => {
    setSubmitting(true)
    const trimmedTitle = title.trim()
    const trimmedPitch = pitch.trim()
    const trimmedDescription = description.trim()
    const trimmedGithubUrl = githubUrl.trim()
    if (!trimmedTitle || !trimmedPitch || !trimmedDescription || !trimmedGithubUrl) {
      setSubmitting(false)
      return
    }
    const id = await submitToArena({
      title: trimmedTitle,
      pitch: trimmedPitch,
      description: trimmedDescription,
      category: formCategory,
      githubUrl: trimmedGithubUrl,
      demoUrl: demoUrl.trim() || undefined,
      xHandle: xHandle.trim() || undefined,
      discordHandle: discordHandle.trim() || undefined,
    })
    setSubmitting(false)
    if (!id) return
    setTitle('')
    setPitch('')
    setDescription('')
    setGithubUrl('')
    setDemoUrl('')
    setXHandle('')
    setDiscordHandle('')
    setShowForm(false)
  }

  const handleVote = async (submissionId: string) => {
    if (voted.has(submissionId)) return
    const ok = await voteArena(submissionId)
    if (ok) setVoted((prev) => new Set(prev).add(submissionId))
  }

  return (
    <div className="pro-arena">
      <section className="pro-arena-contest">
        <div className="pro-arena-contest-copy">
          <div className="pro-arena-kicker">Build Week 01</div>
          <h2 className="pro-arena-contest-title">Ship something people want inside DAEMON.</h2>
          <p className="pro-arena-contest-body">
            Three weeks. Build the best agent, tool, skill, or MCP workflow for DAEMON.
            Community votes shape the leaderboard, then the DAEMON team picks the final three winners.
          </p>
        </div>
        <div className="pro-arena-contest-prizes">
          <div className="pro-arena-prize-card">
            <div className="pro-arena-prize-label">1st</div>
            <div className="pro-arena-prize-value">250 USDC</div>
            <div className="pro-arena-prize-note">Lifetime Pro + Founding Builder Discord access</div>
          </div>
          <div className="pro-arena-prize-card">
            <div className="pro-arena-prize-label">2nd</div>
            <div className="pro-arena-prize-value">150 USDC</div>
            <div className="pro-arena-prize-note">Lifetime Pro + Founding Builder Discord access</div>
          </div>
          <div className="pro-arena-prize-card">
            <div className="pro-arena-prize-label">3rd</div>
            <div className="pro-arena-prize-value">100 USDC</div>
            <div className="pro-arena-prize-note">Lifetime Pro + Founding Builder Discord access</div>
          </div>
        </div>
      </section>

      <div className="pro-arena-header">
        <div>
          <div className="pro-section-title">Arena</div>
          <div className="pro-section-caption">Submit a polished build, link the repo, and make the case for why it should ship next.</div>
        </div>
        <button className="pro-btn pro-btn-primary" onClick={() => setShowForm((current) => !current)}>
          {showForm ? 'Close submission form' : 'Submit project'}
        </button>
      </div>

      {error && (
        <div className="pro-error">
          {error}
          <button className="pro-error-dismiss" onClick={clearError}>×</button>
        </div>
      )}

      {showForm && (
        <div className="pro-arena-form">
          <div className="pro-form-row">
            <label className="pro-form-label">Title</label>
            <input className="pro-form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Helius webhook bot" />
          </div>
          <div className="pro-form-row">
            <label className="pro-form-label">One-line pitch</label>
            <input className="pro-form-input" value={pitch} onChange={(e) => setPitch(e.target.value)} placeholder="What should people remember after one sentence?" />
          </div>
          <div className="pro-form-row">
            <label className="pro-form-label">Category</label>
            <select className="pro-form-input" value={formCategory} onChange={(e) => setFormCategory(e.target.value as Exclude<Category, 'all'>)}>
              <option value="tool">Tool</option>
              <option value="agent">Agent</option>
              <option value="skill">Skill</option>
              <option value="mcp">MCP</option>
              <option value="grind-recipe">Grind recipe</option>
            </select>
          </div>
          <div className="pro-form-row">
            <label className="pro-form-label">Description</label>
            <textarea className="pro-form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </div>
          <div className="pro-form-row">
            <label className="pro-form-label">GitHub URL</label>
            <input className="pro-form-input" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/you/your-repo" />
          </div>
          <div className="pro-form-row">
            <label className="pro-form-label">Demo URL</label>
            <input className="pro-form-input" value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} placeholder="https://your-demo-site.com or Loom link" />
          </div>
          <div className="pro-form-split">
            <div className="pro-form-row">
              <label className="pro-form-label">X handle</label>
              <input className="pro-form-input" value={xHandle} onChange={(e) => setXHandle(e.target.value)} placeholder="@yourhandle" />
            </div>
            <div className="pro-form-row">
              <label className="pro-form-label">Discord</label>
              <input className="pro-form-input" value={discordHandle} onChange={(e) => setDiscordHandle(e.target.value)} placeholder="username" />
            </div>
          </div>
          <div className="pro-form-actions">
            <button
              className="pro-btn pro-btn-primary"
              disabled={submitting || !title.trim() || !pitch.trim() || !description.trim() || !githubUrl.trim()}
              onClick={() => { void handleSubmit() }}
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
            <button className="pro-btn" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="pro-arena-filters">
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((value) => (
          <button key={value} className={`pro-arena-filter ${category === value ? 'active' : ''}`} onClick={() => setCategory(value)}>
            {CATEGORY_LABELS[value]}
          </button>
        ))}
        <button className="pro-arena-refresh" onClick={() => void loadArena()} disabled={loading}>
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {!loading && filtered.length === 0 && (
        <div className="pro-arena-empty">
          <div>No submissions{category !== 'all' ? ` in ${CATEGORY_LABELS[category]}` : ''} yet.</div>
          <div className="pro-arena-empty-cta">Be the first team on the board for Build Week 01.</div>
        </div>
      )}

      <div className="pro-arena-list">
        {filtered.map((submission) => {
          const hasVoted = voted.has(submission.id)
          return (
            <div key={submission.id} className={`pro-arena-card pro-status-${submission.status}`}>
              <div className="pro-arena-card-header">
                <div>
                  <div className="pro-arena-card-title">{submission.title}</div>
                  <div className="pro-arena-card-pitch">{submission.pitch}</div>
                </div>
                <div className={`pro-arena-status pro-status-${submission.status}`}>{STATUS_LABELS[submission.status] ?? submission.status}</div>
              </div>
              <div className="pro-arena-card-meta">
                <span className="pro-arena-author">@{submission.author.handle}</span>
                <span className="pro-arena-category">{CATEGORY_LABELS[submission.category] ?? submission.category}</span>
                {submission.themeWeek && <span className="pro-arena-theme">{submission.themeWeek}</span>}
                <span>{formatRelative(submission.submittedAt)}</span>
              </div>
              <div className="pro-arena-card-description">{submission.description}</div>
              <div className="pro-arena-card-links">
                {submission.demoUrl && (
                  <button className="pro-arena-link" onClick={() => void window.daemon.shell.openExternal(submission.demoUrl!)}>
                    Demo
                  </button>
                )}
                {submission.xHandle && (
                  <button className="pro-arena-link" onClick={() => void window.daemon.shell.openExternal(`https://x.com/${submission.xHandle}`)}>
                    @{submission.xHandle}
                  </button>
                )}
                {submission.discordHandle && (
                  <span className="pro-arena-contact">Discord: {submission.discordHandle}</span>
                )}
              </div>
              <div className="pro-arena-card-footer">
                {submission.githubUrl && (
                  <button className="pro-arena-link" onClick={() => void window.daemon.shell.openExternal(submission.githubUrl!)}>
                    GitHub →
                  </button>
                )}
                <button className={`pro-arena-vote ${hasVoted ? 'voted' : ''}`} disabled={hasVoted} onClick={() => { void handleVote(submission.id) }}>
                  ▲ {submission.votes}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatRelative(timestamp: number) {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(timestamp).toLocaleDateString()
}
