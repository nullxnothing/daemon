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
      <button
        className="terminal-tab-add"
        onClick={() => setIsOpen((v) => !v)}
        title="New tab options"
        aria-label="New tab options"
      >
        <span className="terminal-tab-add-plus" aria-hidden="true">+</span>
        <span className="terminal-tab-add-label" aria-hidden="true">New</span>
      </button>
      {isOpen && (
        <div className="terminal-launcher-menu" role="menu" aria-label="New terminal options">
          <div className="terminal-launcher-header" aria-hidden="true">
            <span className="terminal-launcher-kicker">Quick Start</span>
            <span className="terminal-launcher-title">Open the right session</span>
          </div>
          <button
            className="terminal-launcher-item"
            onClick={handleShell}
            disabled={!activeProjectId}
            aria-label="Standard Terminal"
          >
            <span className="terminal-launcher-item-title">Standard Terminal</span>
            <span className="terminal-launcher-item-desc">Plain shell in the current project</span>
          </button>
          <button
            className="terminal-launcher-item"
            onClick={handleClaude}
            aria-label="Claude Chat"
          >
            <span className="terminal-launcher-item-title">Claude Chat</span>
            <span className="terminal-launcher-item-desc">Open the assistant drawer for Claude</span>
          </button>
          <button
            className="terminal-launcher-item"
            onClick={handleSolana}
            disabled={!activeProjectId}
            aria-label="Solana Agent"
          >
            <span className="terminal-launcher-item-title">Solana Agent</span>
            <span className="terminal-launcher-item-desc">Start the Solana-focused coding agent</span>
          </button>
          <button
            className="terminal-launcher-item"
            onClick={() => handleCommand('surfpool', 'Surfpool')}
            disabled={!activeProjectId}
            aria-label="Surfpool"
          >
            <span className="terminal-launcher-item-title">Surfpool</span>
            <span className="terminal-launcher-item-desc">Launch the local Solana dev validator</span>
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
                  <span className="terminal-launcher-item-title">{item.label}</span>
                  <span className="terminal-launcher-item-desc">Recent agent launch</span>
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
                  <span className="terminal-launcher-item-title">{item.label}</span>
                  <span className="terminal-launcher-item-desc">Recent command</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
