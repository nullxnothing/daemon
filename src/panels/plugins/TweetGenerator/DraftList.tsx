interface DraftListProps {
  drafts: Tweet[]
  onStatusChange: (id: string, status: string) => void
  onDelete: (id: string) => void
}

function dotClass(status: string) {
  switch (status) {
    case 'posted': return 'tweet-gen__draft-dot--posted'
    case 'pending': return 'tweet-gen__draft-dot--pending'
    case 'rejected': return 'tweet-gen__draft-dot--rejected'
    default: return 'tweet-gen__draft-dot--selected'
  }
}

export function DraftList({ drafts, onStatusChange, onDelete }: DraftListProps) {
  return (
    <>
      <div className="tweet-gen__section-title">Recent Drafts</div>
      {drafts.length === 0 ? (
        <div className="tweet-gen__empty">No drafts yet</div>
      ) : (
        <div className="tweet-gen__drafts">
          {drafts.map((d) => (
            <div key={d.id} className="tweet-gen__draft">
              <div className={`tweet-gen__draft-dot ${dotClass(d.status)}`} />
              <div className="tweet-gen__draft-content">{d.content}</div>
              <div className="tweet-gen__draft-actions">
                {d.status === 'pending' && (
                  <button
                    className="tweet-gen__draft-btn"
                    onClick={() => onStatusChange(d.id, 'posted')}
                    title="Mark as posted"
                  >
                    Post
                  </button>
                )}
                <button
                  className="tweet-gen__draft-btn tweet-gen__draft-btn--danger"
                  onClick={() => onDelete(d.id)}
                  title="Delete"
                >
                  x
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
