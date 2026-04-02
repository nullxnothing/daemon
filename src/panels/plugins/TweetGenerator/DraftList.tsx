interface DraftListProps {
  drafts: Tweet[]
  onStatusChange: (id: string, status: string) => void
  onDelete: (id: string) => void
}

function dotClass(status: string): string {
  switch (status) {
    case 'posted': return 'tweet-gen__dot--posted'
    case 'pending': return 'tweet-gen__dot--pending'
    case 'rejected': return 'tweet-gen__dot--rejected'
    case 'selected': return 'tweet-gen__dot--selected'
    default: return 'tweet-gen__dot--selected'
  }
}

function modeTag(mode: string | null): string {
  if (!mode) return ''
  return mode.charAt(0).toUpperCase() + mode.slice(1)
}

export function DraftList({ drafts, onStatusChange, onDelete }: DraftListProps) {
  return (
    <>
      <div className="tweet-gen__section-label">Recent Drafts</div>
      {drafts.length === 0 ? (
        <div className="tweet-gen__empty">No drafts yet</div>
      ) : (
        <div className="tweet-gen__drafts">
          {drafts.map((d) => (
            <div key={d.id} className="tweet-gen__draft">
              <div className="tweet-gen__draft-row">
                <div className={`tweet-gen__dot ${dotClass(d.status)}`} />
                <div className="tweet-gen__draft-preview">{d.content}</div>
              </div>
              <div className="tweet-gen__draft-meta">
                {d.mode && (
                  <span className="tweet-gen__draft-mode">{modeTag(d.mode)}</span>
                )}
                <div className="tweet-gen__draft-actions">
                  {d.status === 'pending' && (
                    <button
                      className="tweet-gen__draft-btn"
                      onClick={() => onStatusChange(d.id, 'posted')}
                    >
                      Posted
                    </button>
                  )}
                  <button
                    className="tweet-gen__draft-btn tweet-gen__draft-btn--danger"
                    onClick={() => onDelete(d.id)}
                  >
                    Del
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
