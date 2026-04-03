import { memo, useCallback } from 'react'

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-20250514', label: 'Opus' },
  { value: 'claude-sonnet-4-20250514', label: 'Sonnet' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku' },
]

const MODEL_LABELS: Record<string, string> = Object.fromEntries(MODEL_OPTIONS.map((m) => [m.value, m.label]))

function modelBadgeClass(model: string): string {
  const label = (MODEL_LABELS[model] ?? model).toLowerCase()
  if (label.includes('opus')) return 'opus'
  if (label.includes('sonnet')) return 'sonnet'
  if (label.includes('haiku')) return 'haiku'
  return ''
}

const EditIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)

const DeleteIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

export const DaemonAgentRow = memo(function DaemonAgentRow({
  agent,
  index,
  selected,
  onSelect,
  onSpawn,
  onEdit,
  onDelete,
}: {
  agent: Agent
  index: number
  selected: boolean
  onSelect: (idx: number) => void
  onSpawn: (agent: Agent) => void
  onEdit: (e: React.MouseEvent, agent: Agent) => void
  onDelete: (e: React.MouseEvent, agent: Agent) => void
}) {
  const handleHover = useCallback(() => onSelect(index), [onSelect, index])
  const handleSpawn = useCallback(() => onSpawn(agent), [onSpawn, agent])
  const handleEdit = useCallback((e: React.MouseEvent) => onEdit(e, agent), [onEdit, agent])
  const handleDelete = useCallback((e: React.MouseEvent) => onDelete(e, agent), [onDelete, agent])

  return (
    <div
      className={`agent-launcher-item ${selected ? 'selected' : ''}`}
      onClick={handleSpawn}
      onMouseEnter={handleHover}
    >
      <div className="agent-launcher-item-main">
        <span className="agent-launcher-name">
          {agent.name}
          {(agent.source ?? 'daemon') === 'claude-import' && <span className="agent-source-badge">imported</span>}
        </span>
        <div className="agent-launcher-item-actions">
          <span className={`agent-launcher-model ${modelBadgeClass(agent.model)}`}>{MODEL_LABELS[agent.model] ?? agent.model}</span>
          <button className="agent-edit-btn" onClick={handleEdit} title="Edit"><EditIcon /></button>
          <button className="agent-delete-btn" onClick={handleDelete} title="Delete"><DeleteIcon /></button>
        </div>
      </div>
      <div className="agent-launcher-item-sub">
        {agent.system_prompt?.slice(0, 80)}
        {(agent.system_prompt?.length ?? 0) > 80 ? '...' : ''}
      </div>
    </div>
  )
})

export const ClaudeAgentRow = memo(function ClaudeAgentRow({
  agent,
  importedAgent,
  index,
  selected,
  onSelect,
  onSpawn,
  onSync,
  onEdit,
  onDelete,
  onImport,
}: {
  agent: ClaudeAgentFile
  importedAgent?: Agent
  index: number
  selected: boolean
  onSelect: (idx: number) => void
  onSpawn: (agent: ClaudeAgentFile) => void
  onSync: (agent: ClaudeAgentFile) => void
  onEdit: (e: React.MouseEvent, agent: Agent) => void
  onDelete: (e: React.MouseEvent, agent: Agent) => void
  onImport: (agent: ClaudeAgentFile) => void
}) {
  const imported = Boolean(importedAgent)
  const handleHover = useCallback(() => onSelect(index), [onSelect, index])
  const handleSpawn = useCallback(() => onSpawn(agent), [onSpawn, agent])
  const handleSync = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onSync(agent) }, [onSync, agent])
  const handleEdit = useCallback((e: React.MouseEvent) => { if (importedAgent) onEdit(e, importedAgent) }, [onEdit, importedAgent])
  const handleDelete = useCallback((e: React.MouseEvent) => { if (importedAgent) onDelete(e, importedAgent) }, [onDelete, importedAgent])
  const handleImport = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onImport(agent) }, [onImport, agent])

  return (
    <div
      className={`agent-launcher-item agent-launcher-item-claude ${selected ? 'selected' : ''} launchable`}
      onClick={handleSpawn}
      onMouseEnter={handleHover}
    >
      <div className="agent-launcher-item-main">
        <span className="agent-launcher-name">
          {agent.name}
          <span className="agent-source-badge subtle">claude</span>
          {imported && <span className="agent-source-badge">imported</span>}
        </span>
        <div className="agent-launcher-item-actions visible">
          <span className={`agent-launcher-model ${modelBadgeClass(agent.model)}`}>{MODEL_LABELS[agent.model] ?? agent.model}</span>
          {imported ? (
            <>
              <button className="agent-import-btn" onClick={handleSync}>
                Sync
              </button>
              {importedAgent && (
                <button className="agent-edit-btn always-visible" onClick={handleEdit} title="Edit Imported Copy">
                  <EditIcon />
                </button>
              )}
              {importedAgent && (
                <button className="agent-delete-btn always-visible" onClick={handleDelete} title="Delete Imported Copy">
                  <DeleteIcon />
                </button>
              )}
            </>
          ) : (
            <button className="agent-import-btn" onClick={handleImport}>
              Import
            </button>
          )}
        </div>
      </div>
      <div className="agent-launcher-item-sub">
        {agent.description.slice(0, 120)}
        {agent.description.length > 120 ? '...' : ''}
      </div>
      <div className="agent-launcher-item-sub agent-launcher-path">
        {agent.filePath}
      </div>
    </div>
  )
})
