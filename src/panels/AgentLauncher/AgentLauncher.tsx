import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useUIStore } from '../../store/ui'
import { AgentForm } from './AgentForm'
import { DaemonAgentRow, ClaudeAgentRow } from './AgentRow'
import './AgentLauncher.css'

interface Props {
  isOpen: boolean
  onClose: () => void
}

function SectionLabel({ title, count }: { title: string; count: number }) {
  return (
    <div className="agent-section-label">
      <span>{title}</span>
      <span>{count}</span>
    </div>
  )
}

export function AgentLauncher({ isOpen, onClose }: Props) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [claudeAgents, setClaudeAgents] = useState<ClaudeAgentFile[]>([])
  const [filter, setFilter] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const setCenterMode = useUIStore((s) => s.setCenterMode)

  const loadAgents = useCallback((guard?: { cancelled: boolean }) => {
    window.daemon.agents.list().then((res) => {
      if (guard?.cancelled) return
      if (res.ok && res.data) setAgents(res.data as Agent[])
    })
    window.daemon.agents.claudeList().then((res) => {
      if (guard?.cancelled) return
      if (res.ok && res.data) setClaudeAgents(res.data as ClaudeAgentFile[])
    })
  }, [])

  useEffect(() => {
    const guard = { cancelled: false }
    if (isOpen) {
      loadAgents(guard)
      setFilter('')
      setSelectedIdx(0)
      setShowForm(false)
      setEditingAgent(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
    return () => { guard.cancelled = true }
  }, [isOpen, loadAgents])

  // Block Escape from reaching window-level capture listeners (e.g. CommandDrawer)
  // while the launcher is open. React synthetic events don't stop native capture listeners,
  // so we intercept at the capture phase ourselves and handle the close here.
  useEffect(() => {
    if (!isOpen) return
    const handleNativeEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      // Mirror the React handler logic: form open → close form, else close launcher
      if (showForm) {
        setShowForm(false)
        setEditingAgent(null)
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', handleNativeEscape, true)
    return () => window.removeEventListener('keydown', handleNativeEscape, true)
  }, [isOpen, showForm, onClose])

  const daemonAgents = useMemo(
    () => agents.filter((a) => (a.source ?? 'daemon') !== 'claude-import'),
    [agents]
  )
  const importedClaudeAgents = useMemo(
    () => agents.filter((a) => (a.source ?? 'daemon') === 'claude-import'),
    [agents]
  )
  const importedClaudeAgentsByPath = useMemo(
    () => new Map(
      importedClaudeAgents
        .filter((agent) => agent.external_path)
        .map((agent) => [agent.external_path as string, agent])
    ),
    [importedClaudeAgents]
  )

  const filterLower = useMemo(() => filter.toLowerCase(), [filter])
  const filtered = useMemo(
    () => daemonAgents.filter((a) => a.name.toLowerCase().includes(filterLower)),
    [daemonAgents, filterLower]
  )
  const filteredClaude = useMemo(
    () => claudeAgents.filter((a) => a.name.toLowerCase().includes(filterLower)),
    [claudeAgents, filterLower]
  )

  useEffect(() => { setSelectedIdx(0) }, [filter])

  const [error, setError] = useState<string | null>(null)

  const spawnAgent = useCallback(async (agent: Agent) => {
    setError(null)
    if (!activeProjectId) { setError('Select a project first'); return }

    try {
      const res = await window.daemon.terminal.spawnAgent({
        agentId: agent.id,
        projectId: activeProjectId,
      })
      if (res.ok && res.data) {
        addTerminal(activeProjectId, res.data.id, res.data.agentName ?? agent.name, res.data.agentId)
        setCenterMode('canvas')
        onClose()
      } else {
        setError(res.error ?? 'Failed to spawn agent')
      }
    } catch (err) {
      setError(String(err))
    }
  }, [activeProjectId, addTerminal, setCenterMode, onClose])

  const spawnClaudeAgent = useCallback(async (claudeAgent: ClaudeAgentFile) => {
    setError(null)
    if (!activeProjectId) { setError('Select a project first'); return }

    // Auto-import if not already imported, then spawn
    let imported = importedClaudeAgentsByPath.get(claudeAgent.filePath)
    if (!imported) {
      const importRes = await window.daemon.agents.importClaude(claudeAgent.filePath)
      if (!importRes.ok || !importRes.data) {
        setError(importRes.error ?? 'Failed to import Claude agent')
        return
      }
      imported = importRes.data as Agent
      loadAgents()
    }
    spawnAgent(imported)
  }, [activeProjectId, importedClaudeAgentsByPath, spawnAgent, loadAgents])

  const syncClaude = useCallback(async (claudeAgent: ClaudeAgentFile) => {
    setError(null)
    const res = await window.daemon.agents.syncClaude(claudeAgent.filePath)
    if (res.ok) {
      loadAgents()
    } else {
      setError(res.error ?? 'Failed to sync Claude agent')
    }
  }, [loadAgents])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      e.preventDefault()
      if (showForm) { setShowForm(false); setEditingAgent(null) }
      else onClose()
    } else if (!showForm) {
      const totalItems = filtered.length + filteredClaude.length
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, totalItems - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter') {
        const daemonIdx = selectedIdx
        if (daemonIdx < filtered.length && filtered[daemonIdx]) {
          spawnAgent(filtered[daemonIdx])
        } else {
          const claudeIdx = selectedIdx - filtered.length
          if (claudeIdx >= 0 && filteredClaude[claudeIdx]) {
            spawnClaudeAgent(filteredClaude[claudeIdx])
          }
        }
      }
    }
  }

  const handleEdit = useCallback((e: React.MouseEvent, agent: Agent) => {
    e.stopPropagation()
    setEditingAgent(agent)
    setShowForm(true)
  }, [])

  const handleDelete = useCallback(async (e: React.MouseEvent, agent: Agent) => {
    e.stopPropagation()
    await window.daemon.agents.delete(agent.id)
    loadAgents()
  }, [loadAgents])

  const handleFormSave = () => {
    setShowForm(false)
    setEditingAgent(null)
    loadAgents()
  }

  const handleImportClaude = async (claudeAgent: ClaudeAgentFile) => {
    setError(null)
    const res = await window.daemon.agents.importClaude(claudeAgent.filePath)
    if (res.ok) {
      loadAgents()
    } else {
      setError(res.error ?? 'Failed to import Claude agent')
    }
  }

  if (!isOpen) return null

  return (
    <div className="agent-launcher-overlay" onClick={onClose}>
      <div className="agent-launcher" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {showForm ? (
          <AgentForm agent={editingAgent} onSave={handleFormSave} onCancel={() => { setShowForm(false); setEditingAgent(null) }} />
        ) : (
          <>
            <input
              ref={inputRef}
              className="agent-launcher-input"
              placeholder={activeProjectId ? 'Search agents...' : 'Select a project first'}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              disabled={!activeProjectId}
            />
            {error && <div className="agent-launcher-error">{error}</div>}
            <div className="agent-launcher-list">
              <SectionLabel title="DAEMON Agents" count={filtered.length} />
              {filtered.map((agent, i) => (
                <DaemonAgentRow
                  key={agent.id}
                  agent={agent}
                  index={i}
                  selected={i === selectedIdx}
                  onSelect={setSelectedIdx}
                  onSpawn={spawnAgent}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
              <SectionLabel title="Claude Agents" count={filteredClaude.length} />
              {filteredClaude.map((agent, i) => {
                const importedAgent = importedClaudeAgentsByPath.get(agent.filePath)
                const globalIdx = filtered.length + i
                return (
                  <ClaudeAgentRow
                    key={agent.filePath}
                    agent={agent}
                    importedAgent={importedAgent}
                    index={globalIdx}
                    selected={globalIdx === selectedIdx}
                    onSelect={setSelectedIdx}
                    onSpawn={spawnClaudeAgent}
                    onSync={syncClaude}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onImport={handleImportClaude}
                  />
                )
              })}
              {filtered.length === 0 && filteredClaude.length === 0 && (
                <div className="agent-launcher-empty">
                  {agents.length === 0 && claudeAgents.length === 0 ? 'No agents configured' : 'No matches'}
                </div>
              )}
            </div>
            <button className="agent-create-btn" onClick={() => setShowForm(true)}>
              + New Agent
            </button>
          </>
        )}
      </div>
    </div>
  )
}
