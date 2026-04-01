import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import { Toggle } from '../../components/Toggle'
import './EnvManager.css'

interface UnifiedKey {
  key: string
  isSecret: boolean
  secretLabel: string | null
  projects: Array<{ projectId: string; projectName: string; projectPath: string; filePath: string; value: string }>
}

// Validation patterns for common env var formats
const VALIDATION_PATTERNS: Record<string, { pattern: RegExp; label: string; hint: string }> = {
  SOLANA_PRIVATE_KEY: { pattern: /^[1-9A-HJ-NP-Za-km-z]{87,88}$/, label: 'Base58', hint: 'Solana private key (Base58)' },
  HELIUS_API_KEY: { pattern: /^[a-f0-9-]{36}$/, label: 'UUID', hint: 'Helius API key (UUID format)' },
  GITHUB_TOKEN: { pattern: /^(ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]{36,}$/, label: 'GitHub', hint: 'GitHub personal access token' },
  VERCEL_TOKEN: { pattern: /^[A-Za-z0-9]{24,}$/, label: 'Token', hint: 'Vercel API token' },
  JWT: { pattern: /^eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*$/, label: 'JWT', hint: 'JSON Web Token' },
  URL: { pattern: /^https?:\/\/[^\s]+$/, label: 'URL', hint: 'Valid HTTP(S) URL' },
  DATABASE_URL: { pattern: /^(postgres|mysql|mongodb|redis):\/\/[^\s]+$/, label: 'DB URL', hint: 'Database connection string' },
  EMAIL: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, label: 'Email', hint: 'Email address' },
}

// Context-aware templates for empty state
const ENV_TEMPLATES = [
  { key: 'HELIUS_API_KEY', placeholder: 'your-helius-api-key', category: 'Solana', hint: 'RPC & indexing' },
  { key: 'SOLANA_RPC_URL', placeholder: 'https://api.mainnet-beta.solana.com', category: 'Solana', hint: 'RPC endpoint' },
  { key: 'OPENAI_API_KEY', placeholder: 'sk-...', category: 'AI', hint: 'OpenAI API' },
  { key: 'ANTHROPIC_API_KEY', placeholder: 'sk-ant-...', category: 'AI', hint: 'Claude API' },
  { key: 'DATABASE_URL', placeholder: 'postgres://user:pass@host:5432/db', category: 'Database', hint: 'Connection string' },
  { key: 'GITHUB_TOKEN', placeholder: 'ghp_...', category: 'Services', hint: 'GitHub PAT' },
  { key: 'VERCEL_TOKEN', placeholder: '', category: 'Services', hint: 'Vercel deploy' },
]

function validateValue(key: string, value: string): { valid: boolean; label?: string; hint?: string } | null {
  // Check specific key patterns first
  for (const [patternKey, config] of Object.entries(VALIDATION_PATTERNS)) {
    if (key.toUpperCase().includes(patternKey) || key.toUpperCase() === patternKey) {
      return { valid: config.pattern.test(value), label: config.label, hint: config.hint }
    }
  }
  // Check for common patterns in value
  if (VALIDATION_PATTERNS.URL.pattern.test(value)) {
    return { valid: true, label: 'URL', hint: 'Valid URL' }
  }
  if (VALIDATION_PATTERNS.JWT.pattern.test(value)) {
    return { valid: true, label: 'JWT', hint: 'JSON Web Token' }
  }
  if (key.toUpperCase().includes('URL') && value && !VALIDATION_PATTERNS.URL.pattern.test(value)) {
    return { valid: false, label: 'URL', hint: 'Expected a valid URL' }
  }
  return null
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
  const [revealedValues, setRevealedValues] = useState<Set<string>>(new Set())
  const [addingNew, setAddingNew] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [vercelSyncing, setVercelSyncing] = useState(false)
  const [vercelResult, setVercelResult] = useState<{ onlyVercel: number; different: number } | null>(null)
  const [vercelError, setVercelError] = useState<string | null>(null)
  const openFile = useUIStore((s) => s.openFile)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const projects = useUIStore((s) => s.projects)

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

  const toggleReveal = (key: string) => {
    setRevealedValues((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const handleAddNew = async () => {
    if (!newKey.trim() || !activeProjectId) return
    const project = projects.find(p => p.id === activeProjectId)
    if (!project) return
    const envPath = `${project.path}/.env`
    await window.daemon.env.updateVar(envPath, newKey.trim(), newValue)
    setNewKey('')
    setNewValue('')
    setAddingNew(false)
    load()
  }

  const handleVercelSync = async () => {
    const project = projects.find(p => p.id === activeProjectId)
    if (!project) return
    setVercelSyncing(true)
    setVercelError(null)
    setVercelResult(null)
    const res = await window.daemon.env.pullVercel(project.path)
    setVercelSyncing(false)
    if (!res.ok) {
      setVercelError(res.error ?? 'Vercel sync failed')
      return
    }
    if (res.data) setVercelResult({ onlyVercel: res.data.onlyVercel.length, different: res.data.different.length })
    load()
  }

  const handleTemplateClick = (template: typeof ENV_TEMPLATES[0]) => {
    setNewKey(template.key)
    setNewValue(template.placeholder)
    setAddingNew(true)
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
            <Toggle checked={secretsOnly} onChange={setSecretsOnly} />
            <span>Secrets only</span>
          </label>
          <button
            className="env-btn env-vercel-btn"
            onClick={handleVercelSync}
            disabled={vercelSyncing || !activeProjectId}
            title="Pull env vars from Vercel"
          >
            {vercelSyncing ? 'Syncing...' : 'Sync Vercel'}
          </button>
          <button className="env-btn env-add-btn" onClick={() => setAddingNew(true)}>+ Add</button>
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

      {vercelError && <div className="env-vercel-message error">{vercelError}</div>}
      {vercelResult && (
        <div className="env-vercel-message success">
          Synced from Vercel: {vercelResult.onlyVercel} new, {vercelResult.different} updated
        </div>
      )}

      {/* Table */}
      <div className="env-table">
        <div className="env-table-header">
          <span className="env-col-key">Variable</span>
          <span className="env-col-value">Value</span>
          <span className="env-col-tag">Type</span>
          <span className="env-col-projects">Projects</span>
          <span className="env-col-actions"></span>
        </div>

        {/* In-grid add row */}
        {addingNew && (
          <div className="env-row env-add-row">
            <span className="env-col-key">
              <input
                className="env-add-input env-add-key"
                placeholder="VARIABLE_NAME"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddNew()
                  if (e.key === 'Escape') { setAddingNew(false); setNewKey(''); setNewValue('') }
                }}
                autoFocus
              />
            </span>
            <span className="env-col-value">
              <input
                className="env-add-input env-add-value"
                placeholder="value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddNew()
                  if (e.key === 'Escape') { setAddingNew(false); setNewKey(''); setNewValue('') }
                }}
              />
            </span>
            <span className="env-col-tag"></span>
            <span className="env-col-projects"></span>
            <span className="env-col-actions">
              <button className="env-btn" onClick={() => { setAddingNew(false); setNewKey(''); setNewValue('') }}>Cancel</button>
              <button className="env-btn propagate" onClick={handleAddNew} disabled={!newKey.trim()}>Add</button>
            </span>
          </div>
        )}

        {loading ? (
          <div className="env-loading">Scanning .env files...</div>
        ) : filtered.length === 0 && keys.length === 0 ? (
          <div className="env-empty-state">
            <div className="env-empty-title">No environment variables found</div>
            <div className="env-empty-subtitle">Add a variable or start with a template</div>
            <div className="env-templates">
              {Object.entries(
                ENV_TEMPLATES.reduce((acc, t) => {
                  if (!acc[t.category]) acc[t.category] = []
                  acc[t.category].push(t)
                  return acc
                }, {} as Record<string, typeof ENV_TEMPLATES>)
              ).map(([category, templates]) => (
                <div key={category} className="env-template-group">
                  <div className="env-template-category">{category}</div>
                  <div className="env-template-items">
                    {templates.map((t) => (
                      <button
                        key={t.key}
                        className="env-template-btn"
                        onClick={() => handleTemplateClick(t)}
                        title={t.hint}
                      >
                        <span className="env-template-key">{t.key}</span>
                        <span className="env-template-hint">{t.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="env-loading">No matches</div>
        ) : (
          filtered.map((k) => {
            const isExpanded = expanded === k.key
            const allSameValue = k.projects.every(p => p.value === k.projects[0]?.value)
            const displayValue = k.projects[0]?.value ?? ''
            const isRevealed = revealedValues.has(k.key)
            const validation = validateValue(k.key, displayValue)

            return (
              <div key={k.key} className={`env-row-group ${isExpanded ? 'expanded' : ''}`}>
                {/* Main row */}
                <div className="env-row" onClick={() => setExpanded(isExpanded ? null : k.key)}>
                  <span className="env-col-key">
                    <span className="env-row-arrow">{isExpanded ? '▾' : '▸'}</span>
                    <code>{k.key}</code>
                  </span>
                  <span className="env-col-value env-value-cell">
                    <span
                      className={`env-value-text ${isRevealed ? 'env-plain' : 'env-obscured'}`}
                      onMouseEnter={() => toggleReveal(k.key)}
                      onMouseLeave={() => toggleReveal(k.key)}
                      title={isRevealed ? displayValue : 'Hover to reveal'}
                    >
                      {isRevealed ? truncate(displayValue, 40) : obscure(displayValue)}
                    </span>
                    {!allSameValue && <span className="env-mixed-badge">mixed</span>}
                    {validation && (
                      <span
                        className={`env-validation-badge ${validation.valid ? 'valid' : 'invalid'}`}
                        title={validation.hint}
                      >
                        {validation.valid ? '✓' : '!'} {validation.label}
                      </span>
                    )}
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
