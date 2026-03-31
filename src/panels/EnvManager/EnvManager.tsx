import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import './EnvManager.css'

interface UnifiedKey {
  key: string
  isSecret: boolean
  secretLabel: string | null
  projects: Array<{ projectId: string; projectName: string; projectPath: string; filePath: string; value: string }>
}

export function EnvManager() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const [keys, setKeys] = useState<UnifiedKey[]>([])
  const [filter, setFilter] = useState('')
  const [secretsOnly, setSecretsOnly] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [propagating, setPropagating] = useState<UnifiedKey | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<{ filePath: string; key: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const openFile = useUIStore((s) => s.openFile)
  const setActivePanel = useUIStore((s) => s.setActivePanel)

  const load = useCallback(() => {
    setLoading(true)
    window.daemon.env.scanAll().then((res) => {
      if (res.ok && res.data) setKeys(res.data as UnifiedKey[])
      setLoading(false)
    })
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = keys.filter((k) => {
    if (filter && !k.key.toLowerCase().includes(filter.toLowerCase())) return false
    if (secretsOnly && !k.isSecret) return false
    return true
  })

  const handleCopy = (value: string) => {
    window.daemon.env.copyValue(value)
  }

  const handleOpenFile = async (filePath: string) => {
    const res = await window.daemon.fs.readFile(filePath)
    if (res.ok && res.data && activeProjectId) {
      openFile({ path: res.data.path, name: filePath.split(/[\\/]/).pop() ?? '.env', content: res.data.content, projectId: activeProjectId })
      setActivePanel('claude') // switch back to editor view
    }
  }

  const handleStartEdit = (filePath: string, key: string, value: string) => {
    setEditing({ filePath, key })
    setEditValue(value)
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    await window.daemon.env.updateVar(editing.filePath, editing.key, editValue)
    setEditing(null)
    load()
  }

  return (
    <div className="env-center">
      {/* Header */}
      <div className="env-header">
        <div className="env-header-left">
          <h2 className="env-title">Environment Variables</h2>
          <span className="env-subtitle">{keys.length} keys across {new Set(keys.flatMap(k => k.projects.map(p => p.projectId))).size} projects</span>
        </div>
        <div className="env-header-actions">
          <label className="env-secrets-toggle">
            <input type="checkbox" checked={secretsOnly} onChange={(e) => setSecretsOnly(e.target.checked)} />
            <span>Secrets only</span>
          </label>
        </div>
      </div>

      {/* Search */}
      <div className="env-search-bar">
        <input
          className="env-search-input"
          placeholder="Search keys..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="env-table">
        <div className="env-table-header">
          <span className="env-col-key">Variable</span>
          <span className="env-col-value">Value</span>
          <span className="env-col-tag">Type</span>
          <span className="env-col-projects">Projects</span>
          <span className="env-col-actions"></span>
        </div>

        {loading ? (
          <div className="env-loading">Scanning .env files...</div>
        ) : filtered.length === 0 ? (
          <div className="env-loading">{keys.length === 0 ? 'Add projects to scan' : 'No matches'}</div>
        ) : (
          filtered.map((k) => {
            const isExpanded = expanded === k.key
            const allSameValue = k.projects.every(p => p.value === k.projects[0]?.value)
            const displayValue = k.projects[0]?.value ?? ''

            return (
              <div key={k.key} className={`env-row-group ${isExpanded ? 'expanded' : ''}`}>
                {/* Main row */}
                <div className="env-row" onClick={() => setExpanded(isExpanded ? null : k.key)}>
                  <span className="env-col-key">
                    <span className="env-row-arrow">{isExpanded ? '▾' : '▸'}</span>
                    <code>{k.key}</code>
                  </span>
                  <span className="env-col-value">
                    <span className={k.isSecret ? 'env-obscured' : 'env-plain'}>
                      {k.isSecret ? obscure(displayValue) : truncate(displayValue, 40)}
                    </span>
                    {!allSameValue && <span className="env-mixed-badge">mixed</span>}
                  </span>
                  <span className="env-col-tag">
                    {k.secretLabel && <span className="env-secret-badge">{k.secretLabel}</span>}
                  </span>
                  <span className="env-col-projects">
                    <span className="env-project-count">{k.projects.length}</span>
                  </span>
                  <span className="env-col-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="env-btn" onClick={() => handleCopy(displayValue)}>Copy</button>
                    <button className="env-btn propagate" onClick={() => setPropagating(k)}>Propagate</button>
                  </span>
                </div>

                {/* Expanded: per-project values */}
                {isExpanded && (
                  <div className="env-expanded">
                    {k.projects.map((p, i) => {
                      const isEditing = editing?.filePath === p.filePath && editing?.key === k.key
                      return (
                        <div key={i} className="env-expanded-row">
                          <span className="env-expanded-project">{p.projectName}</span>
                          {isEditing ? (
                            <input
                              className="env-inline-edit"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit()
                                if (e.key === 'Escape') setEditing(null)
                              }}
                              onBlur={handleSaveEdit}
                              autoFocus
                            />
                          ) : (
                            <span
                              className={`env-expanded-value ${k.isSecret ? 'env-obscured' : ''} env-clickable`}
                              onClick={() => handleStartEdit(p.filePath, k.key, p.value)}
                              title="Click to edit"
                            >
                              {k.isSecret ? obscure(p.value) : p.value || '(empty)'}
                            </span>
                          )}
                          <div className="env-expanded-actions">
                            <button className="env-btn-sm" onClick={() => handleCopy(p.value)}>Copy</button>
                            <button className="env-btn-sm" onClick={() => handleOpenFile(p.filePath)}>Open</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Propagate Modal */}
      {propagating && (
        <PropagateModal
          envKey={propagating}
          onClose={() => setPropagating(null)}
          onDone={() => { setPropagating(null); load() }}
        />
      )}
    </div>
  )
}

// --- Propagate Modal ---

function PropagateModal({ envKey, onClose, onDone }: {
  envKey: UnifiedKey
  onClose: () => void
  onDone: () => void
}) {
  const [newValue, setNewValue] = useState(envKey.projects[0]?.value ?? '')
  const [selected, setSelected] = useState<Set<string>>(
    new Set(envKey.projects.map(p => p.projectPath))
  )
  const [updating, setUpdating] = useState(false)
  const [showValue, setShowValue] = useState(false)

  const toggleProject = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  const handlePropagate = async () => {
    if (selected.size === 0) return
    setUpdating(true)
    await window.daemon.env.propagate(envKey.key, newValue, Array.from(selected))
    setUpdating(false)
    onDone()
  }

  return (
    <div className="env-modal-overlay" onClick={onClose}>
      <div className="env-modal" onClick={(e) => e.stopPropagation()}>
        <div className="env-modal-header">
          <h3>Propagate <code>{envKey.key}</code></h3>
          <span className="env-modal-close" onClick={onClose}>&times;</span>
        </div>

        <div className="env-modal-body">
          <div className="env-modal-field">
            <label>New value</label>
            <div className="env-modal-input-row">
              <input
                type={showValue ? 'text' : 'password'}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="env-modal-input"
              />
              <button className="env-btn" onClick={() => setShowValue(!showValue)}>
                {showValue ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="env-modal-field">
            <label>Update in these projects ({selected.size} selected)</label>
            <div className="env-modal-projects">
              {envKey.projects.map((p) => {
                const isSame = p.value === newValue
                return (
                  <label key={p.projectPath} className="env-modal-project-row">
                    <input
                      type="checkbox"
                      checked={selected.has(p.projectPath)}
                      onChange={() => toggleProject(p.projectPath)}
                    />
                    <span className="env-modal-project-name">{p.projectName}</span>
                    <span className={`env-modal-project-status ${isSame ? 'same' : 'different'}`}>
                      {isSame ? 'current' : 'will update'}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>

        <div className="env-modal-footer">
          <button className="env-btn" onClick={onClose}>Cancel</button>
          <button
            className="env-btn propagate"
            onClick={handlePropagate}
            disabled={updating || selected.size === 0}
          >
            {updating ? 'Updating...' : `Update ${selected.size} project${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Helpers ---

function obscure(value: string): string {
  if (!value || value.length <= 4) return '••••••'
  return '••••••' + value.slice(-4)
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) + '...' : value
}
