import { useState, useEffect, useRef, useCallback } from 'react'
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

  const loadAgents = useCallback(() => {
    window.daemon.agents.list().then((res) => {
      if (res.ok && res.data) setAgents(res.data as Agent[])
    })
    window.daemon.agents.claudeList().then((res) => {
      if (res.ok && res.data) setClaudeAgents(res.data as ClaudeAgentFile[])
    })
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadAgents()
      setFilter('')
      setSelectedIdx(0)
      setShowForm(false)
      setEditingAgent(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen, loadAgents])

  const daemonAgents = agents.filter((a) =>
    (a.source ?? 'daemon') !== 'claude-import'
  )
  const importedClaudeAgents = agents.filter((a) =>
    (a.source ?? 'daemon') === 'claude-import'
  )
  const importedClaudeAgentsByPath = new Map(
    importedClaudeAgents
      .filter((agent) => agent.external_path)
      .map((agent) => [agent.external_path as string, agent])
  )

  const filtered = daemonAgents.filter((a) =>
    a.name.toLowerCase().includes(filter.toLowerCase())
  )
  const filteredClaude = claudeAgents.filter((a) =>
    a.name.toLowerCase().includes(filter.toLowerCase())
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
        onClose()
      } else {
        setError(res.error ?? 'Failed to spawn agent')
      }
    } catch (err) {
      setError(String(err))
    }
  }, [activeProjectId, addTerminal, onClose])

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
      if (showForm) { setShowForm(false); setEditingAgent(null) }
      else onClose()
    } else if (!showForm) {
      const spawnable = [
        ...filtered,
        ...filteredClaude
          .map((agent) => importedClaudeAgentsByPath.get(agent.filePath))
          .filter((agent): agent is Agent => Boolean(agent)),
      ]
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, spawnable.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter' && spawnable[selectedIdx]) { spawnAgent(spawnable[selectedIdx]) }
    }
  }

  const handleEdit = (e: React.MouseEvent, agent: Agent) => {
    e.stopPropagation()
    setEditingAgent(agent)
    setShowForm(true)
  }

  const handleDelete = async (e: React.MouseEvent, agent: Agent) => {
    e.stopPropagation()
    await window.daemon.agents.delete(agent.id)
    loadAgents()
  }

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
                  selected={i === selectedIdx}
                  onHover={() => setSelectedIdx(i)}
                  onSpawn={() => spawnAgent(agent)}
                  onEdit={(e) => handleEdit(e, agent)}
                  onDelete={(e) => handleDelete(e, agent)}
                />
              ))}
              <SectionLabel title="Claude Agents" count={filteredClaude.length} />
              {filteredClaude.map((agent, i) => {
                const importedAgent = importedClaudeAgentsByPath.get(agent.filePath)
                return (
                  <ClaudeAgentRow
                    key={agent.filePath}
                    agent={agent}
                    importedAgent={importedAgent}
                    selected={filtered.length + i === selectedIdx}
                    onHover={() => importedAgent && setSelectedIdx(filtered.length + i)}
                    onSpawn={() => importedAgent && spawnAgent(importedAgent)}
                    onSync={() => syncClaude(agent)}
                    onEdit={importedAgent ? (e) => handleEdit(e, importedAgent) : undefined}
                    onDelete={importedAgent ? (e) => handleDelete(e, importedAgent) : undefined}
                    onImport={() => handleImportClaude(agent)}
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
