import { useState } from 'react'

interface VoiceProfileEditorProps {
  voicePrompt: string
  onVoicePromptChange: (value: string) => void
  voiceExamples: string[]
  onVoiceExamplesChange: (examples: string[]) => void
  isEditing: boolean
  onEditingChange: (editing: boolean) => void
  onSave: () => void
}

export function VoiceProfileEditor({
  voicePrompt,
  onVoicePromptChange,
  voiceExamples,
  onVoiceExamplesChange,
  isEditing,
  onEditingChange,
  onSave,
}: VoiceProfileEditorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [newExample, setNewExample] = useState('')

  const addExample = () => {
    if (!newExample.trim()) return
    onVoiceExamplesChange([...voiceExamples, newExample.trim()])
    setNewExample('')
  }

  const removeExample = (idx: number) => {
    onVoiceExamplesChange(voiceExamples.filter((_, i) => i !== idx))
  }

  return (
    <>
      <button
        className="tweet-gen__collapse-toggle"
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className="tweet-gen__section-label">Voice Profile</span>
        <span className={`tweet-gen__arrow${isOpen ? ' tweet-gen__arrow--open' : ''}`}>
          &#9654;
        </span>
      </button>

      {isOpen && (
        <div className="tweet-gen__voice-body">
          <textarea
            className="tweet-gen__voice-prompt"
            value={voicePrompt}
            onChange={(e) => onVoicePromptChange(e.target.value)}
            readOnly={!isEditing}
            placeholder="System prompt for voice style..."
            rows={5}
          />

          <div className="tweet-gen__voice-actions">
            {isEditing ? (
              <>
                <button
                  className="tweet-gen__card-btn"
                  onClick={() => onEditingChange(false)}
                >
                  Cancel
                </button>
                <button type="button" className="tweet-gen__card-btn" onClick={onSave}>
                  Save
                </button>
              </>
            ) : (
              <button
                className="tweet-gen__card-btn"
                onClick={() => onEditingChange(true)}
              >
                Edit
              </button>
            )}
          </div>

          {/* Examples */}
          <div className="tweet-gen__examples">
            <div className="tweet-gen__examples-label">Example tweets</div>
            {voiceExamples.length === 0 && (
              <div className="tweet-gen__empty">No examples added</div>
            )}
            {voiceExamples.map((ex, idx) => (
              <div key={idx} className="tweet-gen__example-row">
                <span className="tweet-gen__example-text">{ex}</span>
                {isEditing && (
                  <button
                    className="tweet-gen__example-remove"
                    onClick={() => removeExample(idx)}
                  >
                    x
                  </button>
                )}
              </div>
            ))}
            {isEditing && (
              <div className="tweet-gen__example-add">
                <input
                  className="tweet-gen__example-input"
                  placeholder="Add example tweet..."
                  value={newExample}
                  onChange={(e) => setNewExample(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addExample()}
                />
                <button type="button" className="tweet-gen__card-btn" onClick={addExample}>
                  Add
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
