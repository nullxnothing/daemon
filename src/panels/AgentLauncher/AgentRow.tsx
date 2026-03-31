const MODEL_OPTIONS = [
  { value: 'claude-opus-4-20250514', label: 'Opus' },
  { value: 'claude-sonnet-4-20250514', label: 'Sonnet' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku' },
]

const MODEL_LABELS: Record<string, string> = Object.fromEntries(MODEL_OPTIONS.map((m) => [m.value, m.label]))

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

export function DaemonAgentRow({
  agent,
  selected,
  onHover,
  onSpawn,
  onEdit,
  onDelete,
}: {
  agent: Agent
  selected: boolean
  onHover: () => void
  onSpawn: () => void
  onEdit: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
}) {
  return (
    <div
      className={`agent-launcher-item ${selected ? 'selected' : ''}`}
      onClick={onSpawn}
      onMouseEnter={onHover}
    >
      <div className="agent-launcher-item-main">
        <span className="agent-launcher-name">
          {agent.name}
          {(agent.source ?? 'daemon') === 'claude-import' && <span className="agent-source-badge">imported</span>}
        </span>
        <div className="agent-launcher-item-actions">
          <span className="agent-launcher-model">{MODEL_LABELS[agent.model] ?? agent.model}</span>
          <button className="agent-edit-btn" onClick={onEdit} title="Edit"><EditIcon /></button>
          <button className="agent-delete-btn" onClick={onDelete} title="Delete"><DeleteIcon /></button>
        </div>
      </div>
      <div className="agent-launcher-item-sub">
        {agent.system_prompt?.slice(0, 80)}
        {(agent.system_prompt?.length ?? 0) > 80 ? '...' : ''}
      </div>
    </div>
  )
}

export function ClaudeAgentRow({
  agent,
  importedAgent,
  selected,
  onHover,
  onSpawn,
  onSync,
  onEdit,
  onDelete,
  onImport,
}: {
  agent: ClaudeAgentFile
  importedAgent?: Agent
  selected: boolean
  onHover: () => void
  onSpawn: () => void
  onSync: () => void
  onEdit?: (e: React.MouseEvent) => void
  onDelete?: (e: React.MouseEvent) => void
  onImport: () => void
}) {
  const imported = Boolean(importedAgent)

  return (
    <div
      className={`agent-launcher-item agent-launcher-item-claude ${selected ? 'selected' : ''} ${imported ? 'launchable' : ''}`}
      onClick={imported ? onSpawn : undefined}
      onMouseEnter={onHover}
    >
      <div className="agent-launcher-item-main">
        <span className="agent-launcher-name">
          {agent.name}
          <span className="agent-source-badge subtle">claude</span>
          {imported && <span className="agent-source-badge">imported</span>}
        </span>
        <div className="agent-launcher-item-actions visible">
          <span className="agent-launcher-model">{MODEL_LABELS[agent.model] ?? agent.model}</span>
          {imported ? (
            <>
              <button className="agent-import-btn" onClick={(e) => { e.stopPropagation(); onSync() }}>
                Sync
              </button>
              {onEdit && (
                <button className="agent-edit-btn always-visible" onClick={onEdit} title="Edit Imported Copy">
                  <EditIcon />
                </button>
              )}
              {onDelete && (
                <button className="agent-delete-btn always-visible" onClick={onDelete} title="Delete Imported Copy">
                  <DeleteIcon />
                </button>
              )}
            </>
          ) : (
            <button className="agent-import-btn" onClick={(e) => { e.stopPropagation(); onImport() }}>
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
}
