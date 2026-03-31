interface TweetVariation {
  id: string
  content: string
  isEditing: boolean
  editContent: string
  copied: boolean
}

type TweetMode = 'original' | 'reply' | 'quote'

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

const charCount = (text: string) => text.length

function charClass(len: number) {
  if (len > 280) return 'tweet-gen__char-count--over'
  if (len > 260) return 'tweet-gen__char-count--warn'
  return ''
}

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
  return (
    <>
      {/* Mode selector */}
      <div className="tweet-gen__modes">
        {(['original', 'reply', 'quote'] as const).map((m) => (
          <button
            key={m}
            className={`tweet-gen__mode-btn${mode === m ? ' tweet-gen__mode-btn--active' : ''}`}
            onClick={() => onModeChange(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Source tweet input */}
      {mode !== 'original' && (
        <div>
          <div className="tweet-gen__source-label">
            {mode === 'reply' ? 'Replying to' : 'Quoting'}
          </div>
          <textarea
            className="tweet-gen__textarea"
            placeholder="Paste the tweet here..."
            value={sourceTweet}
            onChange={(e) => onSourceTweetChange(e.target.value)}
            rows={2}
          />
        </div>
      )}

      {/* Prompt */}
      <textarea
        className="tweet-gen__textarea"
        placeholder="What should the tweet be about?"
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        rows={3}
      />

      {/* Generate */}
      <button
        className="tweet-gen__generate-btn"
        onClick={onGenerate}
        disabled={isGenerating || !prompt.trim()}
      >
        {isGenerating ? 'Generating...' : 'Generate'}
      </button>

      {error && <div className="tweet-gen__error">{error}</div>}

      {/* Variations */}
      {variations.length > 0 && (
        <div className="tweet-gen__variations">
          <div className="tweet-gen__variations-title">Variations</div>
          {variations.map((v, idx) => (
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
                <span
                  className={`tweet-gen__char-count ${charClass(charCount(v.isEditing ? v.editContent : v.content))}`}
                >
                  {charCount(v.isEditing ? v.editContent : v.content)} / 280
                </span>

                <div className="tweet-gen__card-actions">
                  {v.isEditing ? (
                    <button className="tweet-gen__card-btn" onClick={() => onSaveEdit(idx)}>
                      Save
                    </button>
                  ) : (
                    <button className="tweet-gen__card-btn" onClick={() => onToggleEdit(idx)}>
                      Edit
                    </button>
                  )}
                  <button
                    className={`tweet-gen__card-btn${v.copied ? ' tweet-gen__card-btn--copied' : ''}`}
                    onClick={() => onCopy(idx)}
                  >
                    {v.copied ? 'Copied' : 'Use'}
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
