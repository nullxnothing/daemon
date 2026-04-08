import { useEffect, useState, useMemo } from 'react'
import { useProStore } from '../../store/pro'
import './ProPanel.css'

/**
 * Arena view — the heart of Daemon Pro.
 *
 * Shows the full list of community submissions with filtering, voting,
 * and inline submit form. Gated by subscription.active — if the user
 * isn't subscribed, the parent ProPanel renders UpgradePrompt instead.
 *
 * UX goals:
 *  - Submissions render as cards sorted by votes desc then submittedAt desc
 *  - Filter by category (tool | agent | skill | mcp | grind-recipe)
 *  - Vote button disabled for submissions you've already voted on (tracked
 *    optimistically — the server is the source of truth)
 *  - Inline submit form collapses by default to keep the list primary
 *  - Empty state has a friendly "be the first to submit" CTA
 */

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
  const submissions = useProStore((s) => s.arenaSubmissions)
  const loading = useProStore((s) => s.loadingArena)
  const loadArena = useProStore((s) => s.loadArena)
  const submitToArena = useProStore((s) => s.submitToArena)
  const voteArena = useProStore((s) => s.voteArena)
  const error = useProStore((s) => s.error)
  const clearError = useProStore((s) => s.clearError)

  const [category, setCategory] = useState<Category>('all')
  const [showForm, setShowForm] = useState(false)
  const [voted, setVoted] = useState<Set<string>>(new Set())

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [formCategory, setFormCategory] = useState<Exclude<Category, 'all'>>('tool')
  const [githubUrl, setGithubUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void loadArena()
  }, [loadArena])

  const filtered = useMemo(() => {
    const list = category === 'all'
      ? submissions
      : submissions.filter((s) => s.category === category)
    // Sort by status first (winners → featured → submitted), then votes desc, then recency
    const statusRank = (s: string) => {
      if (s === 'shipped') return 0
      if (s === 'winner') return 1
      if (s === 'featured') return 2
      return 3
    }
    return [...list].sort((a, b) => {
      const statusDiff = statusRank(a.status) - statusRank(b.status)
      if (statusDiff !== 0) return statusDiff
      if (a.votes !== b.votes) return b.votes - a.votes
      return b.submittedAt - a.submittedAt
    })
  }, [submissions, category])

  const handleSubmit = async () => {
    setSubmitting(true)
    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    const trimmedUrl = githubUrl.trim()

    if (!trimmedTitle || !trimmedDescription || !trimmedUrl) {
      setSubmitting(false)
      return
    }

    const id = await submitToArena({
      title: trimmedTitle,
      description: trimmedDescription,
      category: formCategory,
      githubUrl: trimmedUrl,
    })
    setSubmitting(false)

    if (id) {
      setTitle('')
      setDescription('')
      setGithubUrl('')
      setShowForm(false)
    }
  }

  const handleVote = async (submissionId: string) => {
    if (voted.has(submissionId)) return
    const ok = await voteArena(submissionId)
    if (ok) {
      setVoted((prev) => new Set(prev).add(submissionId))
    }
  }

  return (
    <div className="pro-arena">
      <div className="pro-arena-header">
        <div>
          <div className="pro-section-title">Arena</div>
          <div className="pro-section-caption">
            Community-submitted tools, agents, and skills. Vote on what should ship next.
          </div>
        </div>
        <button
          className="pro-btn pro-btn-primary"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Cancel' : 'Submit a tool'}
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
            <input
              className="pro-form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Helius webhook bot"
              maxLength={100}
            />
          </div>

          <div className="pro-form-row">
            <label className="pro-form-label">Category</label>
            <select
              className="pro-form-input"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value as Exclude<Category, 'all'>)}
            >
              <option value="tool">Tool</option>
              <option value="agent">Agent</option>
              <option value="skill">Skill</option>
              <option value="mcp">MCP</option>
              <option value="grind-recipe">Grind recipe</option>
            </select>
          </div>

          <div className="pro-form-row">
            <label className="pro-form-label">Description</label>
            <textarea
              className="pro-form-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does it do and why should it ship in DAEMON?"
              rows={4}
              maxLength={2000}
            />
            <div className="pro-form-counter">{description.length} / 2000</div>
          </div>

          <div className="pro-form-row">
            <label className="pro-form-label">GitHub URL</label>
            <input
              className="pro-form-input"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/you/your-repo"
            />
          </div>

          <div className="pro-form-actions">
            <button
              className="pro-btn pro-btn-primary"
              disabled={submitting || !title.trim() || !description.trim() || !githubUrl.trim()}
              onClick={handleSubmit}
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
            <button className="pro-btn" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="pro-arena-filters">
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
          <button
            key={c}
            className={`pro-arena-filter ${category === c ? 'active' : ''}`}
            onClick={() => setCategory(c)}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
        <button className="pro-arena-refresh" onClick={() => loadArena()} disabled={loading}>
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {loading && filtered.length === 0 && (
        <div className="pro-arena-empty">Loading arena…</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="pro-arena-empty">
          <div>No submissions{category !== 'all' ? ` in ${CATEGORY_LABELS[category]}` : ''} yet.</div>
          <div className="pro-arena-empty-cta">Be the first to submit a tool.</div>
        </div>
      )}

      <div className="pro-arena-list">
        {filtered.map((sub) => {
          const hasVoted = voted.has(sub.id)
          return (
            <div key={sub.id} className={`pro-arena-card pro-status-${sub.status}`}>
              <div className="pro-arena-card-header">
                <div className="pro-arena-card-title">{sub.title}</div>
                <div className={`pro-arena-status pro-status-${sub.status}`}>
                  {STATUS_LABELS[sub.status] ?? sub.status}
                </div>
              </div>
              <div className="pro-arena-card-meta">
                <span className="pro-arena-author">@{sub.author.handle}</span>
                <span className="pro-arena-category">{CATEGORY_LABELS[sub.category] ?? sub.category}</span>
                <span className="pro-arena-date">{formatRelative(sub.submittedAt)}</span>
              </div>
              <div className="pro-arena-card-description">{sub.description}</div>
              <div className="pro-arena-card-footer">
                {sub.githubUrl && (
                  <a
                    className="pro-arena-link"
                    href={sub.githubUrl}
                    onClick={(e) => {
                      e.preventDefault()
                      const url = sub.githubUrl
                      if (url) void window.daemon.shell.openExternal(url)
                    }}
                  >
                    GitHub →
                  </a>
                )}
                <div className="pro-arena-vote-group">
                  <button
                    className={`pro-arena-vote ${hasVoted ? 'voted' : ''}`}
                    disabled={hasVoted}
                    onClick={() => handleVote(sub.id)}
                    title={hasVoted ? 'You already voted' : 'Vote up'}
                  >
                    ▲ {sub.votes}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`
  const d = new Date(ts)
  return d.toLocaleDateString()
}
