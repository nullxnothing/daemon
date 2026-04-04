import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { useUIStore } from '../../store/ui'
import { TerminalTabs } from './TerminalTabs'
import { TerminalInstance } from './TerminalInstance'
import { readTerminalLaunchRecents, addToRecents, type TerminalLaunchRecent } from './RecentsManager'
import './Terminal.css'

const SOLANA_AGENT_DB_ID = 'solana-agent'

type SplitLayout = {
  direction: 'horizontal' | 'vertical'
  secondaryId: string
}

export function TerminalPanel() {
  const terminals = useUIStore((s) => s.terminals)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const removeTerminal = useUIStore((s) => s.removeTerminal)
  const setActiveTerminal = useUIStore((s) => s.setActiveTerminal)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const centerMode = useUIStore((s) => s.centerMode)
  const setCenterMode = useUIStore((s) => s.setCenterMode)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const activeTerminalId = useUIStore((s) =>
    s.activeProjectId ? s.activeTerminalIdByProject[s.activeProjectId] ?? null : null,
  )
  const visibleTerminals = useMemo(
    () => terminals.filter((tab) => tab.projectId === activeProjectId),
    [terminals, activeProjectId],
  )
  const [splitLayoutsByProject, setSplitLayoutsByProject] = useState<Record<string, SplitLayout | undefined>>({})
  const [launchRecents, setLaunchRecents] = useState<TerminalLaunchRecent[]>(() => readTerminalLaunchRecents())
  const [isDragOver, setIsDragOver] = useState(false)
  const [claudeInstallStatus, setClaudeInstallStatus] = useState<'idle' | 'installing' | 'failed'>('idle')
  const [solanaSkillEnabled, setSolanaSkillEnabled] = useState(true)
  const panelDragDepthRef = useRef(0)
  const creatingRef = useRef(false)
  const splitLayout = activeProjectId ? splitLayoutsByProject[activeProjectId] : undefined

  useEffect(() => {
    if (!activeProjectId) return
    let cancelled = false
    window.daemon.settings.solanaSkillEnabled(activeProjectId).then((res) => {
      if (!cancelled && res.ok && res.data !== undefined) setSolanaSkillEnabled(res.data)
    })
    return () => { cancelled = true }
  }, [activeProjectId])

  const addLaunchRecent = useCallback((recent: Omit<TerminalLaunchRecent, 'timestamp'>) => {
    setLaunchRecents((prev) => addToRecents(prev, recent))
  }, [])

  const handleNewTerminal = useCallback(async (label = 'Terminal', startupCommand?: string) => {
    if (!activeProjectId) return null
    const res = await window.daemon.terminal.create({ cwd: activeProjectPath ?? undefined, startupCommand })
    if (res.ok && res.data) {
      addTerminal(activeProjectId, res.data.id, label)
      return res.data.id
    }
    return null
  }, [activeProjectId, activeProjectPath, addTerminal])

  const handleFolderDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    panelDragDepthRef.current = 0
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      const filePath = (file as File & { path?: string }).path
      if (!filePath) continue

      const folderName = filePath.replace(/\\/g, '/').split('/').pop() ?? 'Terminal'
      const res = await window.daemon.terminal.create({ cwd: filePath, userInitiated: true })
      if (res.ok && res.data && activeProjectId) {
        addTerminal(activeProjectId, res.data.id, folderName)
      }
    }
  }, [activeProjectId, addTerminal])

  const handleStartShell = useCallback(async () => {
    await handleNewTerminal('Terminal')
  }, [handleNewTerminal])

  const handleLaunchCommand = useCallback(async (command: string, label: string) => {
    const terminalId = await handleNewTerminal(label)
    if (!terminalId) return
    window.daemon.terminal.write(terminalId, `${command}\n`)
    addLaunchRecent({ kind: 'command', key: command, command, label })
  }, [addLaunchRecent, handleNewTerminal])

  const handleStartClaudeChat = useCallback(() => {
    setActivePanel('claude')
  }, [setActivePanel])

  const handleStartSolanaAgent = useCallback(async () => {
    if (!activeProjectId) return
    const res = await window.daemon.terminal.spawnAgent({ agentId: SOLANA_AGENT_DB_ID, projectId: activeProjectId })
    if (res.ok && res.data) {
      addTerminal(activeProjectId, res.data.id, res.data.agentName ?? 'Solana Agent', res.data.agentId)
    }
  }, [activeProjectId, addTerminal])

  const handleLaunchAgent = useCallback(async (agent: Agent) => {
    if (!activeProjectId) return
    const res = await window.daemon.terminal.spawnAgent({ agentId: agent.id, projectId: activeProjectId })
    if (res.ok && res.data) {
      addTerminal(activeProjectId, res.data.id, res.data.agentName ?? agent.name, res.data.agentId)
      addLaunchRecent({ kind: 'agent', key: agent.id, label: agent.name })
    }
  }, [activeProjectId, addLaunchRecent, addTerminal])

  const handleCloseTerminal = useCallback(async (id: string) => {
    if (!activeProjectId) return
    await window.daemon.terminal.kill(id)
    removeTerminal(activeProjectId, id)
    setSplitLayoutsByProject((prev) => {
      const current = prev[activeProjectId]
      if (!current || current.secondaryId !== id) return prev
      return { ...prev, [activeProjectId]: undefined }
    })
  }, [activeProjectId, removeTerminal])

  const handleSplit = useCallback(async (direction: 'horizontal' | 'vertical') => {
    if (!activeProjectId || !activeTerminalId) return
    let secondaryId = splitLayoutsByProject[activeProjectId]?.secondaryId
    const hasExistingSecondary = Boolean(secondaryId && visibleTerminals.some((tab) => tab.id === secondaryId))
    if (!hasExistingSecondary) {
      const res = await window.daemon.terminal.create({ cwd: activeProjectPath ?? undefined })
      if (!res.ok || !res.data) return
      secondaryId = res.data.id
      addTerminal(activeProjectId, secondaryId, 'Split')
      setActiveTerminal(activeProjectId, activeTerminalId)
    }
    if (!secondaryId) return
    setSplitLayoutsByProject((prev) => ({ ...prev, [activeProjectId]: { direction, secondaryId } }))
  }, [activeProjectId, activeProjectPath, activeTerminalId, addTerminal, setActiveTerminal, splitLayoutsByProject, visibleTerminals])

  const handleUnsplit = useCallback(() => {
    if (!activeProjectId) return
    setSplitLayoutsByProject((prev) => ({ ...prev, [activeProjectId]: undefined }))
  }, [activeProjectId])

  // Auto-create first terminal for project — starts in Claude mode if CLI is available
  useEffect(() => {
    if (!activeProjectId || visibleTerminals.length !== 0 || creatingRef.current) return
    creatingRef.current = true

    window.daemon.terminal.checkClaude().then((res): Promise<void> => {
      if (!res.ok || !res.data) {
        // Fallback to plain shell if the check itself fails
        return handleNewTerminal('Terminal').then(() => {})
      }

      const { installed } = res.data

      if (installed) {
        return handleNewTerminal('Claude', 'claude').then(() => {})
      }

      // Claude CLI not found — open terminal and run the install command
      setClaudeInstallStatus('installing')
      return handleNewTerminal('Installing Claude').then((terminalId) => {
        if (!terminalId) {
          setClaudeInstallStatus('failed')
          return
        }
        window.daemon.terminal.write(terminalId, 'npm install -g @anthropic-ai/claude-code\r')
      })
    }).finally(() => {
      creatingRef.current = false
    })
  }, [activeProjectId, visibleTerminals.length, handleNewTerminal])

  // Sync split layout when terminals change
  useEffect(() => {
    if (!activeProjectId || !activeTerminalId) return
    const split = splitLayoutsByProject[activeProjectId]
    if (!split) return
    const hasSecondary = visibleTerminals.some((tab) => tab.id === split.secondaryId)
    if (!hasSecondary) {
      const fallback = visibleTerminals.find((tab) => tab.id !== activeTerminalId)?.id
      setSplitLayoutsByProject((prev) => ({
        ...prev,
        [activeProjectId]: fallback ? { ...split, secondaryId: fallback } : undefined,
      }))
      return
    }
    if (split.secondaryId === activeTerminalId) {
      const fallback = visibleTerminals.find((tab) => tab.id !== activeTerminalId)?.id
      if (!fallback) {
        setSplitLayoutsByProject((prev) => ({ ...prev, [activeProjectId]: undefined }))
      } else {
        setSplitLayoutsByProject((prev) => ({ ...prev, [activeProjectId]: { ...split, secondaryId: fallback } }))
      }
    }
  }, [activeProjectId, activeTerminalId, splitLayoutsByProject, visibleTerminals])

  const terminalById = useMemo(() => {
    const map = new Map<string, (typeof visibleTerminals)[number]>()
    for (const terminal of visibleTerminals) map.set(terminal.id, terminal)
    return map
  }, [visibleTerminals])

  const paneIds = useMemo(() => {
    if (!activeTerminalId) return []
    if (!splitLayout) return [activeTerminalId]
    if (splitLayout.secondaryId === activeTerminalId) return [activeTerminalId]
    if (!terminalById.has(splitLayout.secondaryId)) return [activeTerminalId]
    return [activeTerminalId, splitLayout.secondaryId]
  }, [activeTerminalId, splitLayout, terminalById])

  return (
    <div
      className={`terminal-panel ${isDragOver ? 'drag-over' : ''} ${claudeInstallStatus !== 'idle' ? 'has-install-banner' : ''}`}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        panelDragDepthRef.current += 1
        setIsDragOver(true)
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        panelDragDepthRef.current = Math.max(0, panelDragDepthRef.current - 1)
        if (panelDragDepthRef.current === 0) setIsDragOver(false)
      }}
      onDrop={handleFolderDrop}
    >
      {claudeInstallStatus === 'installing' && (
        <div className="claude-install-banner">
          Claude CLI not found. Installing via npm — this may take a moment.
          <button className="claude-install-dismiss" onClick={() => setClaudeInstallStatus('idle')}>Dismiss</button>
        </div>
      )}
      {claudeInstallStatus === 'failed' && (
        <div className="claude-install-banner claude-install-banner--error">
          Failed to create install terminal. Open a new terminal and run: npm install -g @anthropic-ai/claude-code
          <button className="claude-install-dismiss" onClick={() => setClaudeInstallStatus('idle')}>Dismiss</button>
        </div>
      )}
      <TerminalTabs
        visibleTerminals={visibleTerminals}
        activeTerminalId={activeTerminalId}
        activeProjectId={activeProjectId}
        centerMode={centerMode}
        splitLayout={splitLayout}
        launchRecents={launchRecents}
        solanaSkillEnabled={solanaSkillEnabled}
        onSelectTerminal={(id) => activeProjectId && setActiveTerminal(activeProjectId, id)}
        onCloseTerminal={handleCloseTerminal}
        onToggleGrindMode={() => setCenterMode(centerMode === 'grind' ? 'canvas' : 'grind')}
        onSplit={handleSplit}
        onUnsplit={handleUnsplit}
        onStartShell={handleStartShell}
        onStartClaudeChat={handleStartClaudeChat}
        onStartSolanaAgent={handleStartSolanaAgent}
        onLaunchAgent={handleLaunchAgent}
        onLaunchCommand={handleLaunchCommand}
      />
      <div className="terminal-views">
        {paneIds.length <= 1 ? (
          activeTerminalId ? <TerminalInstance key={activeTerminalId} id={activeTerminalId} isVisible /> : null
        ) : (
          <div className={`terminal-split ${splitLayout?.direction ?? 'vertical'}`}>
            {paneIds.map((id) => (
              <div key={id} className="terminal-pane">
                <div className="terminal-pane-header">
                  <button
                    className={`terminal-pane-title ${activeTerminalId === id ? 'active' : ''}`}
                    onClick={() => activeProjectId && setActiveTerminal(activeProjectId, id)}
                  >
                    {terminalById.get(id)?.label ?? 'Terminal'}
                  </button>
                  {splitLayout?.secondaryId === id && (
                    <button className="terminal-pane-close" onClick={() => handleUnsplit()} title="Close split pane">&times;</button>
                  )}
                </div>
                <div className="terminal-pane-body">
                  <TerminalInstance id={id} isVisible />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TerminalPanel
