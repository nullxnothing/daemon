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
      <div className="tweet-gen__voice-toggle" onClick={() => setIsOpen((v) => !v)}>
        <span className="tweet-gen__section-title">Voice Profile</span>
        <span className={`tweet-gen__voice-arrow${isOpen ? ' tweet-gen__voice-arrow--open' : ''}`}>
          &#9654;
        </span>
      </div>

      {isOpen && (
        <div className="tweet-gen__voice-body">
          <textarea
            className="tweet-gen__voice-prompt"
            value={voicePrompt}
            onChange={(e) => onVoicePromptChange(e.target.value)}
            readOnly={!isEditing}
            rows={5}
          />

          <div className="tweet-gen__voice-actions">
            {isEditing ? (
              <>
                <button className="tweet-gen__card-btn" onClick={() => onEditingChange(false)}>
                  Cancel
                </button>
                <button className="tweet-gen__card-btn" onClick={onSave}>
                  Save
                </button>
              </>
            ) : (
              <button className="tweet-gen__card-btn" onClick={() => onEditingChange(true)}>
                Edit
              </button>
            )}
          </div>

          {/* Examples */}
          <div className="tweet-gen__voice-examples">
            <div className="tweet-gen__voice-example-label">Example tweets</div>
            {voiceExamples.length === 0 && (
              <div className="tweet-gen__empty">No examples added</div>
            )}
            {voiceExamples.map((ex, idx) => (
              <div key={idx} className="tweet-gen__voice-example-row">
                <span className="tweet-gen__voice-example-text">{ex}</span>
                {isEditing && (
                  <button
                    className="tweet-gen__voice-example-remove"
                    onClick={() => removeExample(idx)}
                  >
                    x
                  </button>
                )}
              </div>
            ))}
            {isEditing && (
              <div className="tweet-gen__voice-add-row">
                <input
                  className="tweet-gen__voice-add-input"
                  placeholder="Add example tweet..."
                  value={newExample}
                  onChange={(e) => setNewExample(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addExample()}
                />
                <button className="tweet-gen__card-btn" onClick={addExample}>
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
