import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUIStore } from '../../store/ui'
import { confirm } from '../../store/confirm'
import { useNotificationsStore } from '../../store/notifications'
import { Toggle } from '../../components/Toggle'
import { Dot } from '../../components/Dot'
import { FocusTrap } from '../../components/FocusTrap'
import './EnvManager.css'

interface UnifiedKey {
  key: string
  isSecret: boolean
  secretLabel: string | null
  projects: Array<{ projectId: string; projectName: string; projectPath: string; filePath: string; value: string }>
}

interface VercelEnvVar {
  id: string
  key: string
  value: string
  target: string[]
  type: string
}

interface MergedVar {
  key: string
  isSecret: boolean
  secretLabel: string | null
  devValue: string | null
  devFilePath: string | null
  devProjects: UnifiedKey['projects']
  prodValue: string | null
  prodVarId: string | null
  prodTarget: string[]
  prodType: string
  status: 'synced' | 'diverged' | 'dev-only' | 'prod-only'
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
  for (const [patternKey, config] of Object.entries(VALIDATION_PATTERNS)) {
    if (key.toUpperCase().includes(patternKey) || key.toUpperCase() === patternKey) {
      return { valid: config.pattern.test(value), label: config.label, hint: config.hint }
    }
  }
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

async function resolveVercelProjectId(activeProjectId: string | null): Promise<string | null> {
  if (!activeProjectId) return null
  try {
    const res = await window.daemon.deploy.status(activeProjectId)
    if (!res.ok || !res.data) return null
    const vercel = (res.data as Array<{ platform: string; linked: boolean }>).find(
      (s) => s.platform === 'vercel' && s.linked
    )
    return vercel ? activeProjectId : null
  } catch {
    return null
  }
}

function mergeVars(localKeys: UnifiedKey[], vercelVars: VercelEnvVar[]): MergedVar[] {
  const merged = new Map<string, MergedVar>()

  for (const k of localKeys) {
    const activeProject = k.projects[0]
    merged.set(k.key, {
      key: k.key,
      isSecret: k.isSecret,
      secretLabel: k.secretLabel,
      devValue: activeProject?.value ?? null,
      devFilePath: activeProject?.filePath ?? null,
      devProjects: k.projects,
      prodValue: null,
      prodVarId: null,
      prodTarget: [],
      prodType: 'plain',
      status: 'dev-only',
    })
  }

  for (const v of vercelVars) {
    const existing = merged.get(v.key)
    if (existing) {
      existing.prodValue = v.value
      existing.prodVarId = v.id
      existing.prodTarget = v.target
      existing.prodType = v.type
      if (existing.devValue === v.value) {
        existing.status = 'synced'
      } else {
        existing.status = 'diverged'
      }
    } else {
      merged.set(v.key, {
        key: v.key,
        isSecret: v.type === 'secret' || v.type === 'sensitive' || v.type === 'encrypted',
        secretLabel: v.type !== 'plain' ? v.type : null,
        devValue: null,
        devFilePath: null,
        devProjects: [],
        prodValue: v.value,
        prodVarId: v.id,
        prodTarget: v.target,
        prodType: v.type,
        status: 'prod-only',
      })
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.key.localeCompare(b.key))
}

const STATUS_DOT: Record<MergedVar['status'], 'green' | 'amber' | 'blue' | 'red'> = {
  synced: 'green',
  diverged: 'amber',
  'dev-only': 'blue',
  'prod-only': 'red',
}

export function EnvManager() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const projects = useUIStore((s) => s.projects)
  const openFile = useUIStore((s) => s.openFile)
  const setDrawerTool = useUIStore((s) => s.setDrawerTool)

  const [localKeys, setLocalKeys] = useState<UnifiedKey[]>([])
  const [vercelVars, setVercelVars] = useState<VercelEnvVar[]>([])
  const [filter, setFilter] = useState('')
  const [secretsOnly, setSecretsOnly] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [propagating, setPropagating] = useState<UnifiedKey | null>(null)
  const [loadingLocal, setLoadingLocal] = useState(true)
  const [loadingVercel, setLoadingVercel] = useState(false)
  const [vercelConnected, setVercelConnected] = useState(false)
  const [vercelError, setVercelError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ target: 'dev' | 'prod'; key: string; filePath?: string; varId?: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [revealedValues, setRevealedValues] = useState<Set<string>>(new Set())
  const [addingNew, setAddingNew] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [pushingKeys, setPushingKeys] = useState<Set<string>>(new Set())
  const [pullingKeys, setPullingKeys] = useState<Set<string>>(new Set())

  const [vercelLinked, setVercelLinked] = useState(false)

  // Check Vercel link status from the backend (not the stale Zustand store)
  useEffect(() => {
    let cancelled = false
    resolveVercelProjectId(activeProjectId).then((id) => {
      if (!cancelled) setVercelLinked(!!id)
    })
    return () => { cancelled = true }
  }, [activeProjectId])

  const loadLocal = useCallback(() => {
    setLoadingLocal(true)
    window.daemon.env.scanAll().then((res) => {
      if (res.ok && res.data) setLocalKeys(res.data as UnifiedKey[])
      setLoadingLocal(false)
    })
  }, [])

  const loadVercel = useCallback(() => {
    if (!vercelLinked || !activeProjectId) {
      setVercelVars([])
      setVercelConnected(false)
      return
    }
    setLoadingVercel(true)
    setVercelError(null)
    window.daemon.env.vercelVars(activeProjectId).then((res) => {
      if (res.ok && res.data) {
        setVercelVars(res.data as VercelEnvVar[])
        setVercelConnected(true)
      } else {
        setVercelVars([])
        setVercelConnected(false)
        if (res.error) setVercelError(res.error)
      }
      setLoadingVercel(false)
    }).catch(() => {
      setVercelVars([])
      setVercelConnected(false)
      setLoadingVercel(false)
    })
  }, [vercelLinked, activeProjectId])

  useEffect(() => { loadLocal() }, [loadLocal])
  useEffect(() => { loadVercel() }, [loadVercel])

  const merged = useMemo(() => mergeVars(localKeys, vercelVars), [localKeys, vercelVars])

  const filtered = merged.filter((m) => {
    if (filter && !m.key.toLowerCase().includes(filter.toLowerCase())) return false
    if (secretsOnly && !m.isSecret) return false
    return true
  })

  const stats = useMemo(() => {
    const localCount = merged.filter(m => m.devValue !== null).length
    const prodCount = merged.filter(m => m.prodValue !== null).length
    const syncedCount = merged.filter(m => m.status === 'synced').length
    return { localCount, prodCount, syncedCount }
  }, [merged])

  const handleCopy = (value: string) => {
    window.daemon.env.copyValue(value)
  }

  const handleCopyBest = (m: MergedVar) => {
    const value = m.devValue ?? m.prodValue ?? ''
    if (value) window.daemon.env.copyValue(value)
  }

  const handleOpenFile = async (filePath: string) => {
    const res = await window.daemon.fs.readFile(filePath)
    if (res.ok && res.data && activeProjectId) {
      openFile({ path: res.data.path, name: filePath.split(/[\\/]/).pop() ?? '.env', content: res.data.content, projectId: activeProjectId })
      setDrawerTool(null)
    }
  }

  const handleStartEditDev = (key: string, filePath: string, value: string) => {
    setEditing({ target: 'dev', key, filePath })
    setEditValue(value)
  }

  const handleStartEditProd = (key: string, varId: string, value: string) => {
    setEditing({ target: 'prod', key, varId })
    setEditValue(value)
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    try {
      if (editing.target === 'dev' && editing.filePath) {
        await window.daemon.env.updateVar(editing.filePath, editing.key, editValue)
      } else if (editing.target === 'prod' && editing.varId && activeProjectId) {
        await window.daemon.env.vercelUpdateVar(activeProjectId, editing.varId, editValue)
      }
    } finally {
      setEditing(null)
      loadLocal()
      loadVercel()
    }
  }

  const handlePush = async (m: MergedVar) => {
    if (!activeProjectId || m.devValue === null) return
    const ok = await confirm({
      title: `Push ${m.key} to Vercel production?`,
      body: `This will overwrite the production value for "${m.key}". Type the variable name to confirm.`,
      danger: true,
      confirmLabel: 'Push to production',
      typedConfirmation: m.key,
    })
    if (!ok) return
    setPushingKeys(prev => new Set(prev).add(m.key))
    try {
      if (m.prodVarId) {
        await window.daemon.env.vercelUpdateVar(activeProjectId, m.prodVarId, m.devValue)
      } else {
        await window.daemon.env.vercelCreateVar(activeProjectId, m.key, m.devValue, ['production', 'preview', 'development'])
      }
      useNotificationsStore.getState().pushSuccess(`Pushed ${m.key} to Vercel`, 'Env')
      loadVercel()
    } catch (err) {
      useNotificationsStore.getState().pushError(err, 'Env push')
    } finally {
      setPushingKeys(prev => { const next = new Set(prev); next.delete(m.key); return next })
    }
  }

  const handlePull = async (m: MergedVar) => {
    if (m.prodValue === null) return
    const project = projects.find(p => p.id === activeProjectId)
    if (!project) return
    const filePath = m.devFilePath ?? `${project.path}/.env`
    setPullingKeys(prev => new Set(prev).add(m.key))
    try {
      await window.daemon.env.updateVar(filePath, m.key, m.prodValue)
      loadLocal()
    } finally {
      setPullingKeys(prev => { const next = new Set(prev); next.delete(m.key); return next })
    }
  }

  const toggleReveal = (compositeKey: string) => {
    setRevealedValues((prev) => {
      const next = new Set(prev)
      next.has(compositeKey) ? next.delete(compositeKey) : next.add(compositeKey)
      return next
    })
  }

  const handleAddNew = async () => {
    if (!newKey.trim() || !activeProjectId) return
    const project = projects.find(p => p.id === activeProjectId)
    if (!project) return
    await window.daemon.env.updateVar(`${project.path}/.env`, newKey.trim(), newValue)
    setNewKey('')
    setNewValue('')
    setAddingNew(false)
    loadLocal()
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
          <span className="env-subtitle">
            {stats.localCount} local / {stats.prodCount} production / {stats.syncedCount} synced
          </span>
        </div>
        <div className="env-header-actions">
          <label className="env-secrets-toggle">
            <Toggle checked={secretsOnly} onChange={setSecretsOnly} />
            <span>Secrets only</span>
          </label>
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

      {/* Vercel status banner */}
      {!vercelConnected && !loadingVercel && activeProjectId && vercelError && (
        <div className="env-banner env-banner-warn">{vercelError}</div>
      )}
      {!vercelLinked && !loadingVercel && activeProjectId && (
        <div className="env-banner env-banner-info">Link a Vercel project to see production vars</div>
      )}

      {/* Table */}
      <div className="env-table">
        <div className="env-table-header">
          <span className="env-col-status"></span>
          <span className="env-col-key">Variable</span>
          <span className="env-col-dev">DEV (.env)</span>
          <span className="env-col-prod">PROD (Vercel)</span>
          <span className="env-col-actions"></span>
        </div>

        {/* In-grid add row */}
        {addingNew && (
          <div className="env-row env-add-row">
            <span className="env-col-status"></span>
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
            <span className="env-col-dev">
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
            <span className="env-col-prod"></span>
            <span className="env-col-actions">
              <button className="env-btn" onClick={() => { setAddingNew(false); setNewKey(''); setNewValue('') }}>Cancel</button>
              <button className="env-btn env-btn-green" onClick={handleAddNew} disabled={!newKey.trim()}>Add</button>
            </span>
          </div>
        )}

        {loadingLocal ? (
          <div className="env-loading">Scanning .env files...</div>
        ) : filtered.length === 0 && merged.length === 0 ? (
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
          filtered.map((m) => (
            <EnvRow
              key={m.key}
              m={m}
              isExpanded={expanded === m.key}
              onToggleExpand={() => setExpanded(expanded === m.key ? null : m.key)}
              vercelConnected={vercelConnected}
              activeProjectId={activeProjectId}
              editing={editing}
              editValue={editValue}
              setEditValue={setEditValue}
              onStartEditDev={handleStartEditDev}
              onStartEditProd={handleStartEditProd}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={() => setEditing(null)}
              onCopy={handleCopyBest}
              onCopyValue={handleCopy}
              onPush={handlePush}
              onPull={handlePull}
              isPushing={pushingKeys.has(m.key)}
              isPulling={pullingKeys.has(m.key)}
              revealedValues={revealedValues}
              toggleReveal={toggleReveal}
              onPropagate={(k) => {
                const unified = localKeys.find(lk => lk.key === k)
                if (unified) setPropagating(unified)
              }}
              onOpenFile={handleOpenFile}
              loadingVercel={loadingVercel}
            />
          ))
        )}
      </div>

      {/* Propagate Modal */}
      {propagating && (
        <PropagateModal
          envKey={propagating}
          onClose={() => setPropagating(null)}
          onDone={() => { setPropagating(null); loadLocal() }}
        />
      )}
    </div>
  )
}

// --- Row Component ---

interface EnvRowProps {
  m: MergedVar
  isExpanded: boolean
  onToggleExpand: () => void
  vercelConnected: boolean
  activeProjectId: string | null
  editing: { target: 'dev' | 'prod'; key: string; filePath?: string; varId?: string } | null
  editValue: string
  setEditValue: (v: string) => void
  onStartEditDev: (key: string, filePath: string, value: string) => void
  onStartEditProd: (key: string, varId: string, value: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onCopy: (m: MergedVar) => void
  onCopyValue: (value: string) => void
  onPush: (m: MergedVar) => void
  onPull: (m: MergedVar) => void
  isPushing: boolean
  isPulling: boolean
  revealedValues: Set<string>
  toggleReveal: (key: string) => void
  onPropagate: (key: string) => void
  onOpenFile: (filePath: string) => void
  loadingVercel: boolean
}

function EnvRow({
  m, isExpanded, onToggleExpand, vercelConnected, activeProjectId,
  editing, editValue, setEditValue,
  onStartEditDev, onStartEditProd, onSaveEdit, onCancelEdit,
  onCopy, onCopyValue, onPush, onPull, isPushing, isPulling,
  revealedValues, toggleReveal, onPropagate, onOpenFile, loadingVercel,
}: EnvRowProps) {
  const isDevRevealed = revealedValues.has(`${m.key}:dev`)
  const isProdRevealed = revealedValues.has(`${m.key}:prod`)
  const isEditingDev = editing?.target === 'dev' && editing?.key === m.key
  const isEditingProd = editing?.target === 'prod' && editing?.key === m.key
  const devValidation = m.devValue ? validateValue(m.key, m.devValue) : null
  const hasDev = m.devValue !== null
  const hasProd = m.prodValue !== null
  const canPush = hasDev && vercelConnected
  const canPull = hasProd

  return (
    <div className={`env-row-group ${isExpanded ? 'expanded' : ''}`}>
      <div className="env-row" onClick={onToggleExpand}>
        {/* Status dot */}
        <span className="env-col-status">
          <Dot color={STATUS_DOT[m.status]} />
        </span>

        {/* Key */}
        <span className="env-col-key">
          <span className="env-row-arrow">{isExpanded ? '\u25BE' : '\u25B8'}</span>
          <code>{m.key}</code>
          {m.secretLabel && <span className="env-secret-badge">{m.secretLabel}</span>}
          {devValidation && (
            <span
              className={`env-validation-badge ${devValidation.valid ? 'valid' : 'invalid'}`}
              title={devValidation.hint}
            >
              {devValidation.valid ? '\u2713' : '!'} {devValidation.label}
            </span>
          )}
        </span>

        {/* DEV value */}
        <span className="env-col-dev" onClick={(e) => e.stopPropagation()}>
          {isEditingDev ? (
            <input
              className="env-inline-edit"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit()
                if (e.key === 'Escape') onCancelEdit()
              }}
              onBlur={onSaveEdit}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : hasDev ? (
            <span
              className={`env-value-text ${isDevRevealed ? 'env-plain' : 'env-obscured'} env-clickable`}
              onClick={(e) => {
                e.stopPropagation()
                // Single click toggles reveal; double-click opens editor.
                // Prevents the prior conflict where hover-reveal fired
                // unintentionally on every cursor pass.
                if (e.detail === 2 && m.devFilePath) {
                  onStartEditDev(m.key, m.devFilePath, m.devValue!)
                } else {
                  toggleReveal(`${m.key}:dev`)
                }
              }}
              title="Click to reveal, double-click to edit"
            >
              {isDevRevealed ? truncate(m.devValue!, 28) : obscure(m.devValue!)}
            </span>
          ) : (
            <span className="env-not-set">(not set)</span>
          )}
        </span>

        {/* PROD value */}
        <span className={`env-col-prod ${!vercelConnected ? 'env-col-disabled' : ''}`} onClick={(e) => e.stopPropagation()}>
          {loadingVercel ? (
            <span className="env-loading-inline">Loading...</span>
          ) : !vercelConnected ? (
            <span className="env-not-set">--</span>
          ) : isEditingProd ? (
            <input
              className="env-inline-edit"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit()
                if (e.key === 'Escape') onCancelEdit()
              }}
              onBlur={onSaveEdit}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : hasProd ? (
            <span
              className={`env-value-text ${isProdRevealed ? 'env-plain' : 'env-obscured'} env-clickable`}
              onMouseEnter={() => toggleReveal(`${m.key}:prod`)}
              onMouseLeave={() => toggleReveal(`${m.key}:prod`)}
              onClick={(e) => {
                e.stopPropagation()
                if (m.prodVarId && activeProjectId) onStartEditProd(m.key, m.prodVarId, m.prodValue!)
              }}
              title={isProdRevealed ? m.prodValue! : 'Hover to reveal, click to edit'}
            >
              {isProdRevealed ? truncate(m.prodValue!, 28) : obscure(m.prodValue!)}
            </span>
          ) : (
            <span className="env-not-set">(not set)</span>
          )}
        </span>

        {/* Actions */}
        <span className="env-col-actions" onClick={(e) => e.stopPropagation()}>
          <button className="env-btn" onClick={() => onCopy(m)} title="Copy value">Copy</button>
          {canPush && (
            <button
              className="env-btn env-btn-push"
              onClick={() => onPush(m)}
              disabled={isPushing}
              title="Push local value to Vercel"
            >
              {isPushing ? '...' : 'Push'}
            </button>
          )}
          {canPull && (
            <button
              className="env-btn env-btn-pull"
              onClick={() => onPull(m)}
              disabled={isPulling}
              title="Pull Vercel value to local .env"
            >
              {isPulling ? '...' : 'Pull'}
            </button>
          )}
          {m.devProjects.length > 1 && (
            <button className="env-btn env-btn-green" onClick={() => onPropagate(m.key)}>Propagate</button>
          )}
        </span>
      </div>

      {/* Expanded: per-project breakdown */}
      {isExpanded && (
        <div className="env-expanded">
          {m.devProjects.length > 0 && (
            <div className="env-expanded-section">
              <div className="env-expanded-label">Local files</div>
              {m.devProjects.map((p, i) => (
                <div key={i} className="env-expanded-row">
                  <span className="env-expanded-project">{p.projectName}</span>
                  <span className="env-expanded-file">{p.filePath.split(/[\\/]/).pop()}</span>
                  <span className="env-expanded-value">{p.value || '(empty)'}</span>
                  <div className="env-expanded-actions">
                    <button className="env-btn-sm" onClick={() => onCopyValue(p.value)}>Copy</button>
                    <button className="env-btn-sm" onClick={() => onOpenFile(p.filePath)}>Open</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {hasProd && (
            <div className="env-expanded-section">
              <div className="env-expanded-label">Vercel</div>
              <div className="env-expanded-row">
                <span className="env-expanded-project">Production</span>
                <span className="env-expanded-file">{m.prodType}</span>
                <span className="env-expanded-value">{m.prodValue}</span>
                <div className="env-expanded-actions">
                  <span className="env-target-badges">
                    {m.prodTarget.map(t => (
                      <span key={t} className="env-target-badge">{t.slice(0, 3)}</span>
                    ))}
                  </span>
                  <button className="env-btn-sm" onClick={() => onCopyValue(m.prodValue!)}>Copy</button>
                </div>
              </div>
            </div>
          )}
        </div>
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
      <FocusTrap>
      <div className="env-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Propagate environment variable">
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
            className="env-btn env-btn-green"
            onClick={handlePropagate}
            disabled={updating || selected.size === 0}
          >
            {updating ? 'Updating...' : `Update ${selected.size} project${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
      </FocusTrap>
    </div>
  )
}

// --- Helpers ---

function obscure(value: string): string {
  if (!value || value.length <= 4) return '\u2022\u2022\u2022\u2022\u2022\u2022'
  return '\u2022\u2022\u2022\u2022\u2022\u2022' + value.slice(-4)
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) + '...' : value
}
