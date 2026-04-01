import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useUIStore } from '../../store/ui'
import './Terminal.css'

const COMMAND_HINTS = [
  'git status',
  'git diff',
  'git add .',
  'git commit -m ""',
  'npm run dev',
  'npm run build',
  'npm test',
  'pnpm install',
  'pnpm dev',
  'pnpm build',
  'ls',
  'cd ..',
  'pwd',
  'clear',
]

const SOLANA_AGENT_STARTUP_COMMAND = 'pnpm run solana:agent'

type SplitLayout = {
  direction: 'horizontal' | 'vertical'
  secondaryId: string
}

type TerminalLaunchRecent = {
  kind: 'agent' | 'command'
  key: string
  label: string
  command?: string
  timestamp: number
}

const TERMINAL_LAUNCH_RECENTS_KEY = 'daemon.terminal.launchRecents'
const MAX_TERMINAL_LAUNCH_RECENTS = 8

function readTerminalLaunchRecents(): TerminalLaunchRecent[] {
  try {
    const raw = window.localStorage.getItem(TERMINAL_LAUNCH_RECENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item) => item && (item.kind === 'agent' || item.kind === 'command') && typeof item.key === 'string' && typeof item.label === 'string')
      .map((item) => ({
        kind: item.kind as 'agent' | 'command',
        key: item.key as string,
        label: item.label as string,
        command: typeof item.command === 'string' ? item.command : undefined,
        timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_TERMINAL_LAUNCH_RECENTS)
  } catch {
    return []
  }
}

function writeTerminalLaunchRecents(recents: TerminalLaunchRecent[]) {
  try {
    window.localStorage.setItem(TERMINAL_LAUNCH_RECENTS_KEY, JSON.stringify(recents.slice(0, MAX_TERMINAL_LAUNCH_RECENTS)))
  } catch {
    // Ignore storage errors
  }
}

export function TerminalPanel() {
  const terminals = useUIStore((s) => s.terminals)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const removeTerminal = useUIStore((s) => s.removeTerminal)
  const setActiveTerminal = useUIStore((s) => s.setActiveTerminal)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const agentGridMode = useUIStore((s) => s.agentGridMode)
  const setAgentGridMode = useUIStore((s) => s.setAgentGridMode)
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
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [launchRecents, setLaunchRecents] = useState<TerminalLaunchRecent[]>(() => readTerminalLaunchRecents())
  const launcherRef = useRef<HTMLDivElement>(null)
  const creatingRef = useRef(false)
  const splitLayout = activeProjectId ? splitLayoutsByProject[activeProjectId] : undefined

  const addLaunchRecent = useCallback((recent: Omit<TerminalLaunchRecent, 'timestamp'>) => {
    setLaunchRecents((prev) => {
      const next: TerminalLaunchRecent[] = [
        { ...recent, timestamp: Date.now() },
        ...prev.filter((item) => !(item.kind === recent.kind && item.key === recent.key)),
      ].slice(0, MAX_TERMINAL_LAUNCH_RECENTS)
      writeTerminalLaunchRecents(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (!launcherOpen) return
    window.daemon.agents.list().then((res) => {
      if (res.ok && res.data) {
        setAgents(res.data)
      }
    })
  }, [launcherOpen])

  useEffect(() => {
    if (!launcherOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!launcherRef.current || !target) return
      if (!launcherRef.current.contains(target)) {
        setLauncherOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLauncherOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [launcherOpen])

  const handleNewTerminal = useCallback(async (label = 'Terminal', startupCommand?: string) => {
    if (!activeProjectId) return
    const res = await window.daemon.terminal.create({
      cwd: activeProjectPath ?? undefined,
      startupCommand,
    })
    if (res.ok && res.data) {
      addTerminal(activeProjectId, res.data.id, label)
      return res.data.id
    }
    return null
  }, [activeProjectId, activeProjectPath, addTerminal])

  const handleStartShell = useCallback(async () => {
    await handleNewTerminal('Terminal')
    setLauncherOpen(false)
  }, [handleNewTerminal])

  const launchCommand = useCallback(async (command: string, label: string) => {
    const terminalId = await handleNewTerminal(label)
    if (!terminalId) return
    window.daemon.terminal.write(terminalId, `${command}\n`)
    addLaunchRecent({ kind: 'command', key: command, command, label })
    setLauncherOpen(false)
  }, [addLaunchRecent, handleNewTerminal])

  const handleStartClaudeChat = useCallback(() => {
    setActivePanel('claude')
    setLauncherOpen(false)
  }, [setActivePanel])

  const handleStartSolanaAgent = useCallback(async () => {
    await handleNewTerminal('Solana Agent', SOLANA_AGENT_STARTUP_COMMAND)
    setLauncherOpen(false)
  }, [handleNewTerminal])

  const launchAgent = useCallback(async (agent: Agent) => {
    if (!activeProjectId) return

    const res = await window.daemon.terminal.spawnAgent({
      agentId: agent.id,
      projectId: activeProjectId,
    })
    if (res.ok && res.data) {
      addTerminal(activeProjectId, res.data.id, res.data.agentName ?? agent.name, res.data.agentId)
      addLaunchRecent({ kind: 'agent', key: agent.id, label: agent.name })
      setLauncherOpen(false)
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

    setSplitLayoutsByProject((prev) => ({
      ...prev,
      [activeProjectId]: { direction, secondaryId },
    }))
  }, [activeProjectId, activeProjectPath, activeTerminalId, addTerminal, setActiveTerminal, splitLayoutsByProject, visibleTerminals])

  const handleUnsplit = useCallback(() => {
    if (!activeProjectId) return
    setSplitLayoutsByProject((prev) => ({ ...prev, [activeProjectId]: undefined }))
  }, [activeProjectId])

  useEffect(() => {
    if (activeProjectId && visibleTerminals.length === 0 && !creatingRef.current) {
      creatingRef.current = true
      handleNewTerminal().finally(() => { creatingRef.current = false })
    }
  }, [activeProjectId, visibleTerminals.length, handleNewTerminal])

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
        setSplitLayoutsByProject((prev) => ({
          ...prev,
          [activeProjectId]: { ...split, secondaryId: fallback },
        }))
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
    <div className="terminal-panel">
      <div className="terminal-tabs">
        {visibleTerminals.map((tab) => (
          <button
            key={tab.id}
            className={`terminal-tab ${activeTerminalId === tab.id ? 'active' : ''}`}
            onClick={() => activeProjectId && setActiveTerminal(activeProjectId, tab.id)}
          >
            <span className={`terminal-tab-dot ${tab.agentId ? 'agent' : ''}`} />
            <span>{tab.label}</span>
            <span
              className="terminal-tab-close"
              onClick={(e) => { e.stopPropagation(); handleCloseTerminal(tab.id) }}
            >
              &times;
            </span>
          </button>
        ))}
        <div className="terminal-launcher" ref={launcherRef}>
          <button className="terminal-tab-add" onClick={() => setLauncherOpen((v) => !v)} title="New tab options">+</button>
          {launcherOpen && (
            <div className="terminal-launcher-menu" role="menu" aria-label="New terminal options">
              <button
                className="terminal-launcher-item"
                onClick={() => void handleStartShell()}
                disabled={!activeProjectId}
              >
                Standard Terminal
              </button>
              <button
                className="terminal-launcher-item"
                onClick={handleStartClaudeChat}
              >
                Claude Chat
              </button>
              <button
                className="terminal-launcher-item"
                onClick={() => void handleStartSolanaAgent()}
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
                      onClick={() => agent && void launchAgent(agent)}
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
                      onClick={() => item.command && void launchCommand(item.command, item.label)}
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
        <div className="terminal-tools">
          <button
            className={`terminal-tool-btn ${agentGridMode ? 'active' : ''}`}
            onClick={() => setAgentGridMode(!agentGridMode)}
            title="Agent Grid (2x2 Claude sessions)"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
              <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
            </svg>
          </button>
          <button className="terminal-tool-btn" onClick={() => void handleSplit('vertical')} title="Split vertical">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
          </button>
          <button className="terminal-tool-btn" onClick={() => void handleSplit('horizontal')} title="Split horizontal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
          </button>
          <button className="terminal-tool-btn" onClick={handleUnsplit} title="Unsplit" disabled={!splitLayout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <div className="terminal-views">
        {paneIds.length <= 1 ? (
          activeTerminalId ? <TerminalView key={activeTerminalId} id={activeTerminalId} isVisible /> : null
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
                    <button className="terminal-pane-close" onClick={() => handleUnsplit()} title="Close split pane">×</button>
                  )}
                </div>
                <div className="terminal-pane-body">
                  <TerminalView id={id} isVisible />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TerminalView({ id, isVisible }: { id: string; isVisible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragDepthRef = useRef(0)
  const [currentInput, setCurrentInputState] = useState('')
  const [commandHistory, setCommandHistoryState] = useState<string[]>([])
  const [historySearchOpen, setHistorySearchOpenState] = useState(false)
  const [historySearchQuery, setHistorySearchQueryState] = useState('')
  const [historySelectionIndex, setHistorySelectionIndexState] = useState(0)
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; x: number; y: number }>({
    isOpen: false,
    x: 0,
    y: 0,
  })
  const currentInputRef = useRef('')
  const commandHistoryRef = useRef<string[]>([])
  const completionHintsRef = useRef<string[]>([])
  const historySearchOpenRef = useRef(false)
  const historySearchQueryRef = useRef('')
  const historySelectionIndexRef = useRef(0)
  const historyMatchesRef = useRef<string[]>([])

  const setCurrentInput = (value: string) => {
    currentInputRef.current = value
    setCurrentInputState(value)
  }

  const setCommandHistory = (value: string[]) => {
    commandHistoryRef.current = value
    setCommandHistoryState(value)
  }

  const setHistorySearchOpen = (value: boolean) => {
    historySearchOpenRef.current = value
    setHistorySearchOpenState(value)
  }

  const setHistorySearchQuery = (value: string) => {
    historySearchQueryRef.current = value
    setHistorySearchQueryState(value)
  }

  const setHistorySelectionIndex = (value: number) => {
    historySelectionIndexRef.current = value
    setHistorySelectionIndexState(value)
  }

  const historyMatches = useMemo(() => {
    const query = historySearchQuery.trim().toLowerCase()
    const source = [...commandHistory].reverse()
    const result = query
      ? source.filter((command) => command.toLowerCase().includes(query))
      : source
    historyMatchesRef.current = result
    return result
  }, [commandHistory, historySearchQuery])

  const completionHints = useMemo(() => {
    const query = currentInput.trim().toLowerCase()
    if (!query || historySearchOpen) return []

    const historyHints = [...commandHistory]
      .reverse()
      .filter((command) => command.toLowerCase().startsWith(query) && command.toLowerCase() !== query)

    const staticHints = COMMAND_HINTS
      .filter((command) => command.toLowerCase().startsWith(query) && command.toLowerCase() !== query)

    const hints = [...new Set([...historyHints, ...staticHints])].slice(0, 8)
    completionHintsRef.current = hints
    return hints
  }, [commandHistory, currentInput, historySearchOpen])

  const pushHistory = (command: string) => {
    const normalized = command.trim()
    if (!normalized) return
    const deduped = commandHistoryRef.current.filter((item) => item !== normalized)
    const next = [...deduped, normalized].slice(-200)
    setCommandHistory(next)
  }

  const applyHistorySelection = () => {
    const selection = historyMatches[historySelectionIndexRef.current]
    if (!selection) return
    window.daemon.terminal.write(id, '\u0003')
    window.setTimeout(() => {
      window.daemon.terminal.write(id, selection)
    }, 10)
    setCurrentInput(selection)
  }

  const acceptHint = (hint: string) => {
    const existing = currentInputRef.current
    if (!existing) {
      window.daemon.terminal.write(id, hint)
      setCurrentInput(hint)
      return
    }

    if (hint.toLowerCase().startsWith(existing.toLowerCase())) {
      const remainder = hint.slice(existing.length)
      window.daemon.terminal.write(id, remainder)
      setCurrentInput(hint)
      return
    }

    window.daemon.terminal.write(id, '\u0003')
    window.setTimeout(() => {
      window.daemon.terminal.write(id, hint)
    }, 10)
    setCurrentInput(hint)
  }

  const trackInputFromData = (data: string) => {
    let nextInput = currentInputRef.current
    for (const char of data) {
      if (char === '\r') {
        pushHistory(nextInput)
        nextInput = ''
        continue
      }

      if (char === '\u007f' || char === '\b') {
        nextInput = nextInput.slice(0, -1)
        continue
      }

      if (char === '\u0015') {
        nextInput = ''
        continue
      }

      const code = char.charCodeAt(0)
      const isPrintable = code >= 32 && code !== 127
      if (isPrintable) {
        nextInput += char
      }
    }
    setCurrentInput(nextInput)
  }

  const interceptHistorySearchInput = (data: string): boolean => {
    if (!historySearchOpenRef.current) return false

    if (data === '\u001b') {
      setHistorySearchOpen(false)
      setHistorySearchQuery('')
      setHistorySelectionIndex(0)
      return true
    }

    if (data === '\u007f' || data === '\b') {
      const next = historySearchQueryRef.current.slice(0, -1)
      setHistorySearchQuery(next)
      setHistorySelectionIndex(0)
      return true
    }

    if (data === '\r') {
      applyHistorySelection()
      setHistorySearchOpen(false)
      setHistorySearchQuery('')
      setHistorySelectionIndex(0)
      return true
    }

    if (data === '\u0010') {
      const next = Math.max(0, historySelectionIndexRef.current - 1)
      setHistorySelectionIndex(next)
      return true
    }

    if (data === '\u000e') {
      const next = Math.min(Math.max(0, historyMatchesRef.current.length - 1), historySelectionIndexRef.current + 1)
      setHistorySelectionIndex(next)
      return true
    }

    if (data.length === 1 && data >= ' ' && data !== '\u007f') {
      const next = historySearchQueryRef.current + data
      setHistorySearchQuery(next)
      setHistorySelectionIndex(0)
      return true
    }

    return false
  }

  const doFit = useCallback(() => {
    const fit = fitRef.current
    const term = xtermRef.current
    if (!fit || !term) return
    if (!containerRef.current) return

    const { clientWidth, clientHeight } = containerRef.current
    if (clientWidth === 0 || clientHeight === 0) return

    try {
      fit.fit()
      window.daemon.terminal.resize(id, term.cols, term.rows)
    } catch {}
  }, [id])

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev))
  }, [])

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    setContextMenu({
      isOpen: true,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }, [])

  const handlePasteFromContextMenu = useCallback(async () => {
    await window.daemon.terminal.pasteFromClipboard(id)
    closeContextMenu()
    xtermRef.current?.focus()
  }, [closeContextMenu, id])

  const debouncedFit = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    resizeTimerRef.current = setTimeout(doFit, 60)
  }, [doFit])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      theme: {
        background: '#0a0a0a',
        foreground: '#ebebeb',
        cursor: '#ebebeb',
        selectionBackground: '#2a2a2a',
        black: '#0a0a0a',
        brightBlack: '#3d3d3d',
        red: '#8c4a4a',
        brightRed: '#a65c5c',
        green: '#4a8c62',
        brightGreen: '#5ca674',
        yellow: '#8c7a4a',
        brightYellow: '#a6925c',
        blue: '#4a6a8c',
        brightBlue: '#5c82a6',
        magenta: '#7a4a8c',
        brightMagenta: '#925ca6',
        cyan: '#4a8c8c',
        brightCyan: '#5ca6a6',
        white: '#ebebeb',
        brightWhite: '#ffffff',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    term.open(containerRef.current)
    xtermRef.current = term
    fitRef.current = fitAddon

    // Fit after layout settles
    setTimeout(() => {
      doFit()
      term.focus()
    }, 150)

    // Keystrokes -> PTY
    term.onData((data) => {
      if (data === '\u0012') {
        setHistorySearchOpen(true)
        setHistorySearchQuery('')
        setHistorySelectionIndex(0)
        return
      }

      if (interceptHistorySearchInput(data)) {
        return
      }

      if (data === '\x1b' && completionHintsRef.current.length > 0) {
        setCurrentInput('')
        return
      }

      if (data === '\t' && completionHintsRef.current.length > 0) {
        acceptHint(completionHintsRef.current[0])
        return
      }

      trackInputFromData(data)
      window.daemon.terminal.write(id, data)
    })

    // PTY -> xterm
    const cleanupData = window.daemon.terminal.onData((payload) => {
      if (payload.id === id) {
        term.write(payload.data)
      }
    })

    const cleanupExit = window.daemon.terminal.onExit((payload) => {
      if (payload.id === id) {
        term.write('\r\n[Process exited]\r\n')
      }
    })

    // Resize observer with debounce
    const resizeObserver = new ResizeObserver(debouncedFit)
    resizeObserver.observe(containerRef.current)

    return () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      resizeObserver.disconnect()
      cleanupData()
      cleanupExit()
      term.dispose()
    }
  }, [id, doFit, debouncedFit])

  useEffect(() => {
    if (!contextMenu.isOpen) return

    const handlePointerDown = () => closeContextMenu()
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [closeContextMenu, contextMenu.isOpen])

  // Re-fit + focus when tab becomes visible
  useEffect(() => {
    if (isVisible) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          doFit()
          xtermRef.current?.focus()
        }, 50)
      })
    }
  }, [isVisible, doFit])

  // Click to focus
  const handleClick = () => {
    xtermRef.current?.focus()
  }

  const setDragActive = (active: boolean) => {
    if (!containerRef.current) return
    containerRef.current.classList.toggle('drag-active', active)
  }

  const quotePath = (value: string) => {
    const escaped = value.replace(/"/g, '\\"')
    return `"${escaped}"`
  }

  const writeDroppedPaths = (paths: string[]) => {
    if (paths.length === 0) return
    const payload = paths.map(quotePath).join(' ') + ' '
    window.daemon.terminal.write(id, payload)
    xtermRef.current?.focus()
  }

  const extractDroppedPaths = (event: React.DragEvent<HTMLDivElement>) => {
    const filePaths = Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((value): value is string => Boolean(value))

    if (filePaths.length > 0) return filePaths

    const text = event.dataTransfer.getData('text/plain').trim()
    return text ? [text] : []
  }

  return (
    <div className="terminal-view-wrap">
      <div
        ref={containerRef}
        className="terminal-view"
        style={{ visibility: isVisible ? 'visible' : 'hidden' }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onDragEnter={(e) => {
          e.preventDefault()
          dragDepthRef.current += 1
          setDragActive(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={() => {
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
          if (dragDepthRef.current === 0) setDragActive(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          dragDepthRef.current = 0
          setDragActive(false)
          writeDroppedPaths(extractDroppedPaths(e))
        }}
      >
        {contextMenu.isOpen && (
          <div
            className="terminal-context-menu"
            style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button className="terminal-context-menu-item" onClick={() => void handlePasteFromContextMenu()}>
              Paste
            </button>
          </div>
        )}
      </div>

      {completionHints.length > 0 && !historySearchOpen && (
        <div className="terminal-overlay hints" onPointerDown={(e) => e.stopPropagation()}>
          <div className="terminal-overlay-header">
            <div className="terminal-overlay-title">Hints (Tab)</div>
            <button className="terminal-overlay-dismiss" onClick={() => setCurrentInput('')}>×</button>
          </div>
          {completionHints.slice(0, 5).map((hint) => (
            <button key={hint} className="terminal-overlay-item" onClick={() => acceptHint(hint)}>{hint}</button>
          ))}
        </div>
      )}

      {historySearchOpen && (
        <div className="terminal-overlay history-search">
          <div className="terminal-overlay-title">History Search (Ctrl+R)</div>
          <div className="terminal-history-query">{historySearchQuery || 'type to filter...'}</div>
          <div className="terminal-history-results">
            {historyMatches.slice(0, 8).map((match, index) => (
              <button
                key={`${match}-${index}`}
                className={`terminal-overlay-item ${index === historySelectionIndex ? 'active' : ''}`}
                onClick={() => {
                  setHistorySelectionIndex(index)
                  applyHistorySelection()
                  setHistorySearchOpen(false)
                  setHistorySearchQuery('')
                }}
              >
                {match}
              </button>
            ))}
            {historyMatches.length === 0 && (
              <div className="terminal-history-empty">No matching commands</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
