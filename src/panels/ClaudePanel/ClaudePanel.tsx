import { useState, useEffect, useRef, useCallback } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { useUIStore } from '../../store/ui'
import { CollapsibleSection } from '../../components/CollapsibleSection'
import { Toggle } from '../../components/Toggle'
import type { IpcResponse, McpEntry, SessionUsage } from '../../../electron/shared/types'
import './ClaudePanel.css'

export function ClaudePanel() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)

  // All hooks must be called unconditionally (before any early return)
  const projectMcpLoadFn = useCallback(
    () => activeProjectPath ? window.daemon.claude.projectMcpAll(activeProjectPath) : Promise.resolve({ ok: true, data: [] } as IpcResponse<McpEntry[]>),
    [activeProjectPath],
  )
  const projectMcpToggleFn = useCallback(
    (name: string, enabled: boolean) => activeProjectPath ? window.daemon.claude.projectMcpToggle(activeProjectPath, name, enabled) : Promise.resolve({ ok: false, error: 'No project' } as IpcResponse),
    [activeProjectPath],
  )
  const globalMcpLoadFn = useCallback(() => window.daemon.claude.globalMcpAll(), [])
  const globalMcpToggleFn = useCallback(
    (name: string, enabled: boolean) => window.daemon.claude.globalMcpToggle(name, enabled),
    [],
  )

  if (!activeProjectPath) {
    return (
      <div className="claude-panel">
        <div className="panel-header">Claude</div>
        <div className="claude-empty">Select a project</div>
      </div>
    )
  }

  return (
    <div className="claude-panel">
      <div className="panel-header">Claude</div>
      <StatusBadge />
      <RestartButton />
      <CollapsibleSection title="Last Session" defaultOpen>
        <UsageSection projectPath={activeProjectPath} />
      </CollapsibleSection>
      <CollapsibleSection title="Project MCP Servers" defaultOpen={false}>
        <McpSection
          loadFn={projectMcpLoadFn}
          toggleFn={projectMcpToggleFn}
          description="Toggles the current project's .mcp.json. Restart the session to apply changes."
        />
      </CollapsibleSection>
      <CollapsibleSection title="Global MCP Servers" defaultOpen={false}>
        <McpSection
          loadFn={globalMcpLoadFn}
          toggleFn={globalMcpToggleFn}
          description="Toggles user-level MCPs in your Claude config. This affects Claude outside this project too."
          emptyText="No global MCPs found"
        />
      </CollapsibleSection>
      <CollapsibleSection title="Skills & Plugins" defaultOpen={false}>
        <SkillsSection />
      </CollapsibleSection>
      <ClaudeMdSection projectPath={activeProjectPath} />
    </div>
  )
}

// --- Status Badge ---

function StatusBadge() {
  const [status, setStatus] = useState<AnthropicStatus | null>(null)

  useEffect(() => {
    const pollStatus = () => {
      window.daemon.claude.status().then((res) => {
        if (res.ok && res.data) setStatus(res.data)
      })
    }
    pollStatus()
    const interval = setInterval(pollStatus, 300_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="status-badge">
      <span className={`status-dot ${status?.indicator ?? 'none'}`} />
      <span className="status-text">{status?.description ?? 'Checking...'}</span>
    </div>
  )
}

// --- Restart Button ---

function RestartButton() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeTerminalIdByProject = useUIStore((s) => s.activeTerminalIdByProject)
  const mcpDirty = useUIStore((s) => s.mcpDirty)
  const setMcpDirty = useUIStore((s) => s.setMcpDirty)
  const activeTerminalId = activeProjectId ? activeTerminalIdByProject[activeProjectId] ?? null : null
  if (!activeTerminalId) return null

  const handleRestart = async () => {
    if (!activeTerminalId) return
    const res = await window.daemon.claude.restartSession(activeTerminalId)
    if (res.ok) setMcpDirty(false)
  }

  return (
    <div className="claude-section">
      <button className={`restart-btn ${mcpDirty ? 'dirty' : ''}`} onClick={handleRestart}>
        {mcpDirty ? 'Restart to apply MCP changes' : 'Restart session'}
      </button>
    </div>
  )
}

// --- MCP Section ---

function McpSection({ loadFn, toggleFn, description, emptyText }: {
  loadFn: () => Promise<IpcResponse<McpEntry[]>>
  toggleFn: (name: string, enabled: boolean) => Promise<IpcResponse>
  description: string
  emptyText?: string
}) {
  const setMcpDirty = useUIStore((s) => s.setMcpDirty)
  // Re-fetch whenever any panel toggles an MCP (mcpVersion acts as a signal)
  const mcpVersion = useUIStore((s) => s.mcpVersion)
  const [mcps, setMcps] = useState<McpEntry[]>([])

  const load = useCallback(async () => {
    const res = await loadFn()
    if (res.ok && res.data) setMcps(res.data)
  }, [loadFn])

  useEffect(() => { load() }, [load, mcpVersion])

  const handleToggle = async (name: string, currentlyEnabled: boolean) => {
    await toggleFn(name, !currentlyEnabled)
    load()
    setMcpDirty(true)
    useUIStore.getState().bumpMcpVersion()
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 8 }}>
        {description}
      </div>
      {mcps.map((mcp) => (
        <div key={mcp.name} className="mcp-row">
          <div className="mcp-info">
            <div className="mcp-name">{mcp.name}</div>
            <div className="mcp-desc">{mcp.config?.command} {(mcp.config?.args || []).slice(0, 3).join(' ')}</div>
          </div>
          <Toggle checked={mcp.enabled} onChange={() => handleToggle(mcp.name, mcp.enabled)} />
        </div>
      ))}
      {mcps.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>{emptyText ?? 'No MCPs found'}</div>
      )}
    </div>
  )
}

// --- Skills & Plugins Section ---

function SkillsSection() {
  const [items, setItems] = useState<Array<{ name: string; type: string; enabled: boolean }>>([])

  useEffect(() => {
    window.daemon.claude.skills().then((res) => {
      if (res.ok && res.data) setItems(res.data)
    })
  }, [])

  if (items.length === 0) {
    return <div style={{ fontSize: 11, color: 'var(--t3)', padding: '4px 0' }}>No skills installed</div>
  }

  return (
    <>
      {items.map((item) => (
        <div key={item.name} className="mcp-row">
          <div className="mcp-info">
            <div className="mcp-name">
              {item.name}
              <span className="mcp-badge">{item.type}</span>
            </div>
          </div>
          <span className={`status-dot ${item.enabled ? 'none' : ''}`} style={{ width: 5, height: 5 }} />
        </div>
      ))}
    </>
  )
}

// --- Usage Section (reads from ~/.claude.json, no admin key) ---

function UsageSection({ projectPath }: { projectPath: string }) {
  const [usage, setUsage] = useState<SessionUsage | null>(null)

  useEffect(() => {
    window.daemon.claude.usage(projectPath).then((res) => {
      if (res.ok && res.data) setUsage(res.data as SessionUsage)
    })
  }, [projectPath])

  if (!usage) {
    return <div style={{ fontSize: 11, color: 'var(--t3)' }}>No usage data</div>
  }

  const totalInput = Object.values(usage.models).reduce((s, m) => s + m.inputTokens, 0)
  const totalOutput = Object.values(usage.models).reduce((s, m) => s + m.outputTokens, 0)
  const totalCache = Object.values(usage.models).reduce((s, m) => s + m.cacheReadInputTokens, 0)

  return (
    <>
      <div className="usage-grid">
        <div className="usage-stat">
          <div className="usage-label">Input</div>
          <div className="usage-value usage-green">{formatTokens(totalInput)}</div>
        </div>
        <div className="usage-stat">
          <div className="usage-label">Output</div>
          <div className="usage-value usage-green">{formatTokens(totalOutput)}</div>
        </div>
        <div className="usage-stat">
          <div className="usage-label">Cache</div>
          <div className="usage-value">{formatTokens(totalCache)}</div>
        </div>
        <div className="usage-stat">
          <div className="usage-label">Cost</div>
          <div className="usage-value usage-red">${usage.lastCost.toFixed(2)}</div>
        </div>
      </div>
      {Object.entries(usage.models).map(([model, stats]) => (
        <div key={model} className="usage-model-row">
          <span className="usage-model-name">{model.split('-').slice(0, 2).join(' ')}</span>
          <span className="usage-model-cost">${stats.costUSD.toFixed(2)}</span>
        </div>
      ))}
    </>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

// --- CLAUDE.md Section ---

function ClaudeMdSection({ projectPath }: { projectPath: string }) {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const openFile = useUIStore((s) => s.openFile)
  const [isLoading, setIsLoading] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [original, setOriginal] = useState('')
  const [modified, setModified] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Open CLAUDE.md in editor — no API key needed
  const handleOpen = async () => {
    const mdPath = projectPath.replace(/\\/g, '/') + '/CLAUDE.md'
    const res = await window.daemon.fs.readFile(mdPath)
    if (res.ok && res.data && activeProjectId) {
      openFile({ path: res.data.path, name: 'CLAUDE.md', content: res.data.content, projectId: activeProjectId })
    }
  }

  // AI-generate updated version — needs API key
  const handleGenerate = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const genRes = await window.daemon.claude.claudeMdGenerate(projectPath)
      if (!genRes.ok) {
        setError(genRes.error ?? 'Failed to generate')
        return
      }

      const readRes = await window.daemon.claude.claudeMdRead(projectPath)
      setOriginal(readRes.ok && readRes.data ? (readRes.data as ClaudeMdData).content : '')
      setModified(genRes.data as string)
      setShowDiff(true)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAccept = async (content: string) => {
    const res = await window.daemon.claude.claudeMdWrite(projectPath, content)
    if (!res.ok) { setError(res.error ?? 'Failed to write CLAUDE.md'); return }
    setShowDiff(false)
  }

  return (
    <div className="claude-section">
      <div className="claude-section-title">CLAUDE.md</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="claudemd-btn" style={{ flex: 1 }} onClick={handleOpen}>
          Open
        </button>
        <button className="claudemd-btn" style={{ flex: 1 }} onClick={handleGenerate} disabled={isLoading}>
          {isLoading ? 'Generating...' : 'AI Update'}
        </button>
      </div>
      {error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{error}</div>}
      {showDiff && (
        <ClaudeMdDiffModal
          original={original}
          modified={modified}
          onAccept={handleAccept}
          onReject={() => setShowDiff(false)}
        />
      )}
    </div>
  )
}

// --- Diff Modal ---

function ClaudeMdDiffModal({ original, modified, onAccept, onReject }: {
  original: string
  modified: string
  onAccept: (content: string) => void
  onReject: () => void
}) {
  const editorRef = useRef<any>(null)

  return (
    <div className="diff-modal-overlay" onClick={onReject}>
      <div className="diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="diff-modal-header">
          <span className="diff-modal-title">CLAUDE.md Update Preview</span>
          <div className="diff-modal-actions">
            <button className="diff-reject-btn" onClick={onReject}>Discard</button>
            <button className="diff-accept-btn" onClick={() => {
              if (editorRef.current) {
                onAccept(editorRef.current.getModifiedEditor().getValue())
              }
            }}>Accept</button>
          </div>
        </div>
        <div className="diff-modal-body">
          <DiffEditor
            height="100%"
            language="markdown"
            original={original}
            modified={modified}
            onMount={(editor) => { editorRef.current = editor }}
            theme="vs-dark"
            options={{
              renderSideBySide: true,
              originalEditable: false,
              readOnly: false,
              enableSplitViewResizing: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
            }}
          />
        </div>
      </div>
    </div>
  )
}
