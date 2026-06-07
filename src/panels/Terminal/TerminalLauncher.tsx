import { useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { type TerminalLaunchRecent } from './RecentsManager'

const LAUNCHER_MENU_WIDTH = 188
const LAUNCHER_MENU_GUTTER = 8
const LAUNCHER_MENU_OFFSET = 6
const ESTIMATED_LAUNCHER_MENU_HEIGHT = 240 // fallback before the menu is measured

interface TerminalLauncherProps {
  activeProjectId: string | null
  canLaunchInProject: boolean
  launchRecents: TerminalLaunchRecent[]
  onStartShell: () => void
  onStartClaudeChat: () => void
  onStartSpettro: () => void
  onStartSolanaAgent: () => void
  onLaunchAgent: (agent: Agent) => void
  onLaunchCommand: (command: string, label: string) => void
}

export function TerminalLauncher({
  activeProjectId,
  canLaunchInProject,
  launchRecents,
  onStartShell,
  onStartClaudeChat,
  onStartSpettro,
  onStartSolanaAgent,
  onLaunchAgent,
  onLaunchCommand,
}: TerminalLauncherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null)
  const launcherRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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
      if (!launcherRef.current.contains(target) && !menuRef.current?.contains(target)) {
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

  const updateMenuPosition = useCallback(() => {
    const launcher = launcherRef.current
    if (!launcher) return

    const rect = launcher.getBoundingClientRect()
    const maxLeft = Math.max(
      LAUNCHER_MENU_GUTTER,
      window.innerWidth - LAUNCHER_MENU_WIDTH - LAUNCHER_MENU_GUTTER,
    )

    const menuHeight = menuRef.current?.offsetHeight ?? ESTIMATED_LAUNCHER_MENU_HEIGHT
    const belowTop = rect.bottom + LAUNCHER_MENU_OFFSET
    const wouldOverflowBottom = belowTop + menuHeight > window.innerHeight - LAUNCHER_MENU_GUTTER
    // The launcher lives at the bottom of the window, so flip the menu above the
    // button whenever dropping it down would push it off the viewport bottom.
    const top = wouldOverflowBottom
      ? Math.max(LAUNCHER_MENU_GUTTER, rect.top - LAUNCHER_MENU_OFFSET - menuHeight)
      : belowTop

    setMenuPosition({
      left: Math.min(Math.max(rect.left, LAUNCHER_MENU_GUTTER), maxLeft),
      top,
    })
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPosition(null)
      return
    }

    // First pass positions with the estimated height; once the menu mounts the
    // next frame re-measures with its real height so the upward flip lands precisely.
    updateMenuPosition()
    const raf = requestAnimationFrame(updateMenuPosition)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [isOpen, updateMenuPosition])

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

  const handleSpettro = useCallback(() => {
    onStartSpettro()
    setIsOpen(false)
  }, [onStartSpettro])

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

  const menu = isOpen && menuPosition ? (
    <div
      ref={menuRef}
      className="terminal-launcher-menu"
      role="menu"
      aria-label="New terminal options"
      style={{
        left: menuPosition.left,
        top: menuPosition.top,
        width: LAUNCHER_MENU_WIDTH,
      }}
    >
      <div className="terminal-launcher-header" aria-hidden="true">
        <span className="terminal-launcher-kicker">Quick Start</span>
        <span className="terminal-launcher-title">Open the right session</span>
      </div>
      <button
        className="terminal-launcher-item"
        onClick={handleShell}
        disabled={!canLaunchInProject}
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
        disabled={!canLaunchInProject}
        aria-label="Solana Agent"
      >
        <span className="terminal-launcher-item-title">Solana Agent</span>
        <span className="terminal-launcher-item-desc">Start the Solana-focused coding agent</span>
      </button>
      <button
        className="terminal-launcher-item"
        onClick={handleSpettro}
        disabled={!canLaunchInProject}
        aria-label="Spettro"
      >
        <span className="terminal-launcher-item-title">Spettro</span>
        <span className="terminal-launcher-item-desc">Launch Spettro in the current project</span>
      </button>
      <button
        className="terminal-launcher-item"
        onClick={() => handleCommand('surfpool', 'Surfpool')}
        disabled={!canLaunchInProject}
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
              disabled={!canLaunchInProject || !agent}
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
              disabled={!canLaunchInProject || !item.command}
            >
              <span className="terminal-launcher-item-title">{item.label}</span>
              <span className="terminal-launcher-item-desc">Recent command</span>
            </button>
          ))}
        </>
      )}
    </div>
  ) : null

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
      {menu && createPortal(menu, document.body)}
    </div>
  )
}
