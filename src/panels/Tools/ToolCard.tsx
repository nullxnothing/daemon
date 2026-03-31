interface ToolCardProps {
  tool: {
    id: string
    name: string
    description: string | null
    category: string
    language: string
    run_count: number
    last_run_at: number | null
  }
  isRunning: boolean
  onRun: () => void
  onEdit: () => void
  onOpenFolder: () => void
  onDelete: () => void
}

function isBuiltin(tool: ToolCardProps['tool']): boolean {
  return tool.language === 'builtin'
}

const CATEGORY_COLORS: Record<string, string> = {
  solana: 'var(--green)',
  web3: 'var(--blue)',
  dev: 'var(--amber)',
  general: 'var(--t3)',
}

export function ToolCard({ tool, isRunning, onRun, onEdit, onOpenFolder, onDelete }: ToolCardProps) {
  const dotColor = CATEGORY_COLORS[tool.category] ?? 'var(--t3)'

  return (
    <div className="tool-card">
      <div className="tool-card-header">
        <div className="tool-card-dot" style={{ background: dotColor }} />
        <span className="tool-card-name">{tool.name}</span>
        <span className="tool-card-lang">{tool.language}</span>
      </div>

      {tool.description && (
        <div className="tool-card-desc">{tool.description}</div>
      )}

      <div className="tool-card-meta">
        <span className="tool-card-category">{tool.category}</span>
        {tool.run_count > 0 && (
          <span className="tool-card-runs">{tool.run_count} runs</span>
        )}
        {tool.last_run_at && (
          <span className="tool-card-last">{formatRelative(tool.last_run_at)}</span>
        )}
      </div>

      <div className="tool-card-actions">
        <button className="tool-btn primary" onClick={onRun} disabled={isRunning}>
          {isBuiltin(tool) ? 'Open' : isRunning ? 'Running...' : 'Run'}
        </button>
        {!isBuiltin(tool) && (
          <>
            <button className="tool-btn" onClick={onEdit}>Edit</button>
            <button className="tool-btn" onClick={onOpenFolder}>Folder</button>
            <button className="tool-btn danger" onClick={onDelete}>Delete</button>
          </>
        )}
      </div>
    </div>
  )
}

function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
