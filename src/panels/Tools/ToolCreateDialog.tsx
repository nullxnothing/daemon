import { useState } from 'react'

interface ToolCreateDialogProps {
  onClose: () => void
  onCreated: () => void
}

const LANGUAGES = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'shell', label: 'Shell' },
]

const CATEGORIES = [
  { value: 'solana', label: 'Solana' },
  { value: 'web3', label: 'Web3' },
  { value: 'dev', label: 'Dev' },
  { value: 'general', label: 'General' },
]

export function ToolCreateDialog({ onClose, onCreated }: ToolCreateDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('general')
  const [language, setLanguage] = useState('typescript')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    setError('')

    const res = await window.daemon.tools.create({
      name: name.trim(),
      description: description.trim() || undefined,
      category,
      language,
    })

    setCreating(false)
    if (!res.ok) {
      setError(res.error ?? 'Failed to create tool')
      return
    }

    onCreated()
  }

  return (
    <div className="tool-dialog-overlay" onClick={onClose}>
      <div className="tool-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="tool-dialog-header">
          <h3>New Tool</h3>
          <button className="tool-dialog-close" onClick={onClose}>&times;</button>
        </div>

        <div className="tool-dialog-body">
          <div className="tool-dialog-field">
            <label>Name</label>
            <input
              className="tool-dialog-input"
              placeholder="Token Scanner"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>

          <div className="tool-dialog-field">
            <label>Description</label>
            <input
              className="tool-dialog-input"
              placeholder="What does this tool do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="tool-dialog-row">
            <div className="tool-dialog-field">
              <label>Category</label>
              <select
                className="tool-dialog-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="tool-dialog-field">
              <label>Language</label>
              <select
                className="tool-dialog-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <div className="tool-dialog-error">{error}</div>}
        </div>

        <div className="tool-dialog-footer">
          <button className="tool-btn" onClick={onClose}>Cancel</button>
          <button
            className="tool-btn primary"
            onClick={handleCreate}
            disabled={creating || !name.trim()}
          >
            {creating ? 'Creating...' : 'Create Tool'}
          </button>
        </div>
      </div>
    </div>
  )
}
