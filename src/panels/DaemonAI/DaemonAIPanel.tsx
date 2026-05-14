import { useEffect, useMemo, useState } from 'react'
import { useAiStore } from '../../store/aiStore'
import { useUIStore } from '../../store/ui'
import './DaemonAIPanel.css'

type ContextKey = keyof NonNullable<DaemonAiChatRequest['context']>

const CONTEXT_OPTIONS: Array<{ key: ContextKey; label: string }> = [
  { key: 'activeFile', label: 'Active file' },
  { key: 'projectTree', label: 'Project tree' },
  { key: 'gitDiff', label: 'Git diff' },
  { key: 'terminalLogs', label: 'Terminal logs' },
  { key: 'walletContext', label: 'Wallet context' },
]

export function DaemonAIPanel() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const openFiles = useUIStore((s) => s.openFiles)
  const activeFilePath = useUIStore((s) => activeProjectId ? s.activeFilePathByProject[activeProjectId] ?? null : null)
  const activeFile = openFiles.find((file) => file.path === activeFilePath) ?? null

  const messages = useAiStore((s) => s.messages)
  const usage = useAiStore((s) => s.usage)
  const features = useAiStore((s) => s.features)
  const models = useAiStore((s) => s.models)
  const loading = useAiStore((s) => s.loading)
  const error = useAiStore((s) => s.error)
  const load = useAiStore((s) => s.load)
  const send = useAiStore((s) => s.send)
  const clear = useAiStore((s) => s.clear)

  const [message, setMessage] = useState('')
  const [accessMode, setAccessMode] = useState<'byok' | 'hosted'>('byok')
  const [mode, setMode] = useState<'ask' | 'plan'>('ask')
  const [modelPreference, setModelPreference] = useState<DaemonAiChatRequest['modelPreference']>('auto')
  const [context, setContext] = useState<NonNullable<DaemonAiChatRequest['context']>>({
    activeFile: true,
    projectTree: true,
    gitDiff: false,
    terminalLogs: false,
    walletContext: false,
  })

  useEffect(() => {
    void load()
  }, [load])

  const canUseHosted = Boolean(features?.hostedAvailable && features.backendConfigured)
  const canSend = message.trim().length > 0 && !loading && (accessMode === 'byok' || canUseHosted)
  const remainingLabel = useMemo(() => {
    if (!usage) return 'No usage loaded'
    if (usage.monthlyCredits <= 0) return 'BYOK only'
    return `${usage.remainingCredits.toLocaleString()} / ${usage.monthlyCredits.toLocaleString()} credits`
  }, [usage])

  const handleToggleContext = (key: ContextKey) => {
    setContext((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSend) return
    const nextMessage = message.trim()
    setMessage('')
    const ok = await send({
      message: nextMessage,
      accessMode,
      mode,
      modelPreference,
      projectId: activeProjectId,
      projectPath: activeProjectPath,
      activeFilePath,
      activeFileContent: activeFile?.content ?? null,
      context,
    })
    if (!ok) setMessage(nextMessage)
  }

  return (
    <section className="daemon-ai-panel">
      <header className="daemon-ai-header">
        <div>
          <div className="daemon-ai-kicker">DAEMON AI</div>
          <h2>Project-aware AI</h2>
        </div>
        <button type="button" className="daemon-ai-ghost-btn" onClick={clear} disabled={loading || messages.length === 0}>
          Clear
        </button>
      </header>

      <div className="daemon-ai-status-grid">
        <div className="daemon-ai-stat">
          <span>Plan</span>
          <strong>{usage?.plan ?? 'light'}</strong>
        </div>
        <div className="daemon-ai-stat">
          <span>Usage</span>
          <strong>{remainingLabel}</strong>
        </div>
        <div className="daemon-ai-stat">
          <span>Cloud</span>
          <strong>{canUseHosted ? 'Ready' : 'BYOK'}</strong>
        </div>
      </div>

      <div className="daemon-ai-controls">
        <div className="daemon-ai-segment">
          <button type="button" className={accessMode === 'byok' ? 'active' : ''} onClick={() => setAccessMode('byok')}>BYOK</button>
          <button type="button" className={accessMode === 'hosted' ? 'active' : ''} onClick={() => setAccessMode('hosted')}>Hosted</button>
        </div>
        <div className="daemon-ai-segment">
          <button type="button" className={mode === 'ask' ? 'active' : ''} onClick={() => setMode('ask')}>Ask</button>
          <button type="button" className={mode === 'plan' ? 'active' : ''} onClick={() => setMode('plan')}>Plan</button>
        </div>
        <select className="daemon-ai-select" value={modelPreference} onChange={(e) => setModelPreference(e.target.value as DaemonAiChatRequest['modelPreference'])}>
          {models.map((model) => (
            <option key={model.lane} value={model.lane}>{model.label}</option>
          ))}
        </select>
      </div>

      {accessMode === 'hosted' && !canUseHosted && (
        <div className="daemon-ai-gate">
          Hosted DAEMON AI needs active Pro or holder access. BYOK mode remains available for local provider accounts.
        </div>
      )}

      <div className="daemon-ai-context">
        {CONTEXT_OPTIONS.map((option) => (
          <label key={option.key} className="daemon-ai-check">
            <input type="checkbox" checked={Boolean(context[option.key])} onChange={() => handleToggleContext(option.key)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>

      <div className="daemon-ai-chat">
        {messages.length === 0 ? (
          <div className="daemon-ai-empty">
            Ask about the current project, a failing Solana build, a file, or a release plan.
          </div>
        ) : (
          messages.map((item) => (
            <article key={item.id} className={`daemon-ai-message ${item.role}`}>
              <div className="daemon-ai-message-role">{item.role === 'user' ? 'You' : 'DAEMON AI'}</div>
              <div className="daemon-ai-message-body">{item.content}</div>
            </article>
          ))
        )}
        {loading && <div className="daemon-ai-thinking">Working...</div>}
      </div>

      {error && <div className="daemon-ai-error">{error}</div>}

      <form className="daemon-ai-composer" onSubmit={handleSubmit}>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask DAEMON AI..."
          rows={3}
        />
        <button type="submit" disabled={!canSend}>
          Send
        </button>
      </form>
    </section>
  )
}
