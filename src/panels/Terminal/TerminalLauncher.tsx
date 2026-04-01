import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { type TerminalLaunchRecent } from './RecentsManager'

interface TerminalLauncherProps {
  activeProjectId: string | null
  launchRecents: TerminalLaunchRecent[]
  onStartShell: () => void
  onStartClaudeChat: () => void
  onStartSolanaAgent: () => void
  onLaunchAgent: (agent: Agent) => void
  onLaunchCommand: (command: string, label: string) => void
}

export function TerminalLauncher({
  activeProjectId,
  launchRecents,
  onStartShell,
  onStartClaudeChat,
  onStartSolanaAgent,
  onLaunchAgent,
  onLaunchCommand,
}: TerminalLauncherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const launcherRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    window.daemon.agents.list().then((res) => {
      if (res.ok && res.data) {
        setAgents(res.data)
      }
    })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!launcherRef.current || !target) return
      if (!launcherRef.current.contains(target)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleShell = useCallback(() => {
    onStartShell()
    setIsOpen(false)
  }, [onStartShell])

  const handleClaude = useCallback(() => {
    onStartClaudeChat()
    setIsOpen(false)
  }, [onStartClaudeChat])

  const handleSolana = useCallback(() => {
    onStartSolanaAgent()
    setIsOpen(false)
  }, [onStartSolanaAgent])

  const handleAgent = useCallback((agent: Agent) => {
    onLaunchAgent(agent)
    setIsOpen(false)
  }, [onLaunchAgent])

  const handleCommand = useCallback((command: string, label: string) => {
    onLaunchCommand(command, label)
    setIsOpen(false)
  }, [onLaunchCommand])

  const launchableAgents = useMemo(
    () => agents.filter((agent) => (agent.source ?? 'daemon') !== 'claude-import'),
    [agents],
  )

  const recentAgentItems = useMemo(
    () => launchRecents.filter((item) => item.kind === 'agent').slice(0, 5),
    [launchRecents],
  )

  const recentCommandItems = useMemo(
    () => launchRecents.filter((item) => item.kind === 'command').slice(0, 3),
    [launchRecents],
  )

  return (
    <div className="terminal-launcher" ref={launcherRef}>
      <button className="terminal-tab-add" onClick={() => setIsOpen((v) => !v)} title="New tab options">+</button>
      {isOpen && (
        <div className="terminal-launcher-menu" role="menu" aria-label="New terminal options">
          <button
            className="terminal-launcher-item"
            onClick={handleShell}
            disabled={!activeProjectId}
          >
            Standard Terminal
          </button>
          <button
            className="terminal-launcher-item"
            onClick={handleClaude}
          >
            Claude Chat
          </button>
          <button
            className="terminal-launcher-item"
            onClick={handleSolana}
            disabled={!activeProjectId}
          >
            Solana Agent
          </button>

          <div className="terminal-launcher-divider" />
          <div className="terminal-launcher-section">Recent Agents</div>
          {recentAgentItems.length === 0 ? (
            <div className="terminal-launcher-empty">No recent agents</div>
          ) : (
            recentAgentItems.map((item) => {
              const agent = launchableAgents.find((candidate) => candidate.id === item.key)
              return (
                <button
                  key={`recent-agent-${item.key}`}
                  className="terminal-launcher-item"
                  onClick={() => agent && handleAgent(agent)}
                  disabled={!activeProjectId || !agent}
                  title={agent ? undefined : 'Agent no longer available'}
                >
                  {item.label}
                </button>
              )
            })
          )}

          {recentCommandItems.length > 0 && (
            <>
              <div className="terminal-launcher-divider" />
              <div className="terminal-launcher-section">Recent Commands</div>
              {recentCommandItems.map((item) => (
                <button
                  key={`recent-command-${item.key}`}
                  className="terminal-launcher-item"
                  onClick={() => item.command && handleCommand(item.command, item.label)}
                  disabled={!activeProjectId || !item.command}
                >
                  {item.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
