import { useState } from 'react'

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-20250514', label: 'Opus' },
  { value: 'claude-sonnet-4-20250514', label: 'Sonnet' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku' },
]

interface AgentFormProps {
  agent: Agent | null
  onSave: () => void
  onCancel: () => void
}

export function AgentForm({ agent, onSave, onCancel }: AgentFormProps) {
  const [name, setName] = useState(agent?.name ?? '')
  const [model, setModel] = useState(agent?.model ?? 'claude-sonnet-4-20250514')
  const [prompt, setPrompt] = useState(agent?.system_prompt ?? '')
  const [shortcut, setShortcut] = useState(agent?.shortcut ?? '')
  const [nameError, setNameError] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setNameError('Name is required'); return }

    if (agent) {
      await window.daemon.agents.update(agent.id, {
        name: name.trim(),
        model,
        system_prompt: prompt,
        shortcut: shortcut || null,
      })
    } else {
      await window.daemon.agents.create({
        name: name.trim(),
        systemPrompt: prompt,
        model,
        mcps: [],
        shortcut: shortcut || undefined,
      })
    }
    onSave()
  }

  return (
    <div className="agent-form">
      <div className="agent-form-title">{agent ? 'Edit Agent' : 'New Agent'}</div>
      <div className="agent-form-field">
        <label>Name</label>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); if (nameError) setNameError('') }}
          placeholder="Agent name"
          autoFocus
        />
        {nameError && <span className="agent-form-error" style={{ fontSize: 11, color: 'var(--red)' }}>{nameError}</span>}
      </div>
      <div className="agent-form-field">
        <label>Model</label>
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {MODEL_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
      <div className="agent-form-field">
        <label>System Prompt</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} placeholder="What should this agent do?" />
      </div>
      <div className="agent-form-field">
        <label>Shortcut (optional)</label>
        <input value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="e.g. cmd+6" />
      </div>
      <div className="agent-form-actions">
        <button className="agent-form-cancel" onClick={onCancel}>Cancel</button>
        <button className="agent-form-save" onClick={handleSubmit}>Save</button>
      </div>
    </div>
  )
}
