interface TweetVariation {
  id: string
  content: string
  isEditing: boolean
  editContent: string
  copied: boolean
}

type TweetMode = 'original' | 'reply' | 'quote' | 'thread'

interface TweetVariationsProps {
  mode: TweetMode
  onModeChange: (mode: TweetMode) => void
  sourceTweet: string
  onSourceTweetChange: (value: string) => void
  prompt: string
  onPromptChange: (value: string) => void
  isGenerating: boolean
  onGenerate: () => void
  error: string | null
  variations: TweetVariation[]
  onEditChange: (idx: number, value: string) => void
  onToggleEdit: (idx: number) => void
  onSaveEdit: (idx: number) => void
  onCopy: (idx: number) => void
}

const MODES: TweetMode[] = ['original', 'reply', 'quote', 'thread']

const MODE_LABELS: Record<TweetMode, string> = {
  original: 'Original',
  reply: 'Reply',
  quote: 'Quote',
  thread: 'Thread',
}

const SOURCE_LABELS: Record<TweetMode, string> = {
  original: '',
  reply: 'REPLYING TO',
  quote: 'QUOTING',
  thread: 'THREAD ON',
}

const PROMPT_PLACEHOLDERS: Record<TweetMode, string> = {
  original: 'What should the tweet be about?',
  reply: 'What angle should the reply take?',
  quote: "What's your take on this?",
  thread: 'What point should the thread make?',
}

function charCountClass(len: number): string {
  if (len > 280) return 'tweet-gen__char-badge--over'
  if (len > 260) return 'tweet-gen__char-badge--warn'
  return 'tweet-gen__char-badge--ok'
}

const needsSource = (mode: TweetMode) => mode !== 'original'

export function TweetVariations({
  mode,
  onModeChange,
  sourceTweet,
  onSourceTweetChange,
  prompt,
  onPromptChange,
  isGenerating,
  onGenerate,
  error,
  variations,
  onEditChange,
  onToggleEdit,
  onSaveEdit,
  onCopy,
}: TweetVariationsProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onGenerate()
    }
  }

  return (
    <>
      {/* Mode pills */}
      <div className="tweet-gen__modes">
        {MODES.map((m) => (
          <button
            key={m}
            className={
              'tweet-gen__pill' +
              (mode === m ? ' tweet-gen__pill--active' : '') +
              (m === 'reply' && mode === 'reply' ? ' tweet-gen__pill--primary' : '')
            }
            onClick={() => onModeChange(m)}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Source tweet card */}
      {needsSource(mode) && (
        <div className="tweet-gen__source-card">
          <div className="tweet-gen__source-label">{SOURCE_LABELS[mode]}</div>
          <textarea
            className="tweet-gen__source-input"
            placeholder="Paste the tweet you're replying to..."
            value={sourceTweet}
            onChange={(e) => onSourceTweetChange(e.target.value)}
            rows={3}
          />
        </div>
      )}

      {/* Prompt */}
      <div className="tweet-gen__prompt-wrap">
        <textarea
          className="tweet-gen__textarea"
          placeholder={PROMPT_PLACEHOLDERS[mode]}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
        />
        <span className="tweet-gen__prompt-counter">{prompt.length}</span>
      </div>

      {/* Generate */}
      <button
        className={
          'tweet-gen__generate-btn' +
          (isGenerating ? ' tweet-gen__generate-btn--loading' : '')
        }
        onClick={onGenerate}
        disabled={isGenerating || !prompt.trim()}
      >
        {isGenerating ? 'Generating...' : 'Generate'}
      </button>

      {error && <div className="tweet-gen__error">{error}</div>}

      {/* Variations */}
      {variations.length > 0 && (
        <div className="tweet-gen__variations">
          <div className="tweet-gen__section-label">Variations</div>
          {variations.map((v, idx) => {
            const text = v.isEditing ? v.editContent : v.content
            const len = text.length

            return (
              <div key={v.id} className="tweet-gen__card">
                {v.isEditing ? (
                  <textarea
                    className="tweet-gen__card-edit"
                    value={v.editContent}
                    onChange={(e) => onEditChange(idx, e.target.value)}
                  />
                ) : (
                  <div className="tweet-gen__card-text">{v.content}</div>
                )}

                <div className="tweet-gen__card-footer">
                  <span className={`tweet-gen__char-badge ${charCountClass(len)}`}>
                    {len}
                  </span>

                  <div className="tweet-gen__card-actions">
                    {v.isEditing ? (
                      <button type="button" className="tweet-gen__card-btn" onClick={() => onSaveEdit(idx)}>
                        Save
                      </button>
                    ) : (
                      <button type="button" className="tweet-gen__card-btn" onClick={() => onToggleEdit(idx)}>
                        Edit
                      </button>
                    )}
                    <button
                      className={
                        'tweet-gen__card-btn tweet-gen__card-btn--copy' +
                        (v.copied ? ' tweet-gen__card-btn--copied' : '')
                      }
                      onClick={() => onCopy(idx)}
                    >
                      {v.copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
