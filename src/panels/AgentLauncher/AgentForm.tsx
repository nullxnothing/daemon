import { useState } from 'react'

const PROVIDER_OPTIONS = [
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
  { value: 'auto', label: 'Auto (default)' },
]

const CLAUDE_MODEL_OPTIONS = [
  { value: 'claude-opus-4-20250514', label: 'Opus' },
  { value: 'claude-sonnet-4-20250514', label: 'Sonnet' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku' },
]

const CODEX_MODEL_OPTIONS = [
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'o3', label: 'o3' },
  { value: 'o4-mini', label: 'o4-mini' },
]

interface AgentFormProps {
  agent: Agent | null
  onSave: () => void
  onCancel: () => void
}

export function AgentForm({ agent, onSave, onCancel }: AgentFormProps) {
  const [name, setName] = useState(agent?.name ?? '')
  const [provider, setProvider] = useState(agent?.provider ?? (agent ? 'auto' : 'claude'))
  const [model, setModel] = useState(agent?.model ?? 'claude-sonnet-4-20250514')
  const [prompt, setPrompt] = useState(agent?.system_prompt ?? '')
  const [shortcut, setShortcut] = useState(agent?.shortcut ?? '')
  const [nameError, setNameError] = useState('')

  const modelOptions = provider === 'codex' ? CODEX_MODEL_OPTIONS : CLAUDE_MODEL_OPTIONS

  const handleSubmit = async () => {
    if (!name.trim()) { setNameError('Name is required'); return }

    if (agent) {
      await window.daemon.agents.update(agent.id, {
        name: name.trim(),
        model,
        provider,
        system_prompt: prompt,
        shortcut: shortcut || null,
      })
    } else {
      await window.daemon.agents.create({
        name: name.trim(),
        systemPrompt: prompt,
        model,
        provider,
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
        <label>Provider</label>
        <select value={provider} onChange={(e) => {
          const p = e.target.value
          setProvider(p)
          // Reset model to first option of new provider
          if (p === 'codex') setModel(CODEX_MODEL_OPTIONS[0].value)
          else if (p === 'claude') setModel(CLAUDE_MODEL_OPTIONS[0].value)
        }}>
          {PROVIDER_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      <div className="agent-form-field">
        <label>Model</label>
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {modelOptions.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {provider === 'auto' && (
          <span style={{ fontSize: 10, color: 'var(--t4)', marginTop: 4 }}>
            Auto picks Claude when available; on Codex, Opus/Sonnet map to GPT-5.4 and Haiku maps to o4-mini.
          </span>
        )}
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
        <button type="button" className="agent-form-cancel" onClick={onCancel}>Cancel</button>
        <button type="button" className="agent-form-save" onClick={handleSubmit}>Save</button>
      </div>
    </div>
  )
}
