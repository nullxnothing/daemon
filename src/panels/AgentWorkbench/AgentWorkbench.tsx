import { useEffect, useMemo, useRef, useState } from 'react'
import { useAriaStore } from '../../store/aria'
import { useUIStore } from '../../store/ui'
import { useMemoryStore } from '../../store/memory'
import { Composer, ModelDropdown } from '../../components/Panel'
import { useStickyScroll } from '../../hooks/useStickyScroll'
import { getAriaChips, setAriaChips } from '../../lib/ariaContext'
import { getConsoleSuggestions, resolveConsoleCommand, isConsoleCommandInput, type ConsoleCommand } from '../../lib/console/consoleCommands'
import { AgentTranscript } from './AgentTranscript'
import { AriaSessionStrip, SessionHistoryPopover } from './AriaSessionList'
import { SwarmMonitor } from './SwarmMonitor'
import './AgentWorkbench.css'

type ChipId = keyof ReturnType<typeof getAriaChips>

const CONTEXT_CHIPS: { id: ChipId; label: string }[] = [
  { id: 'activeFile', label: 'Active file' },
  { id: 'projectTree', label: 'Project tree' },
  { id: 'gitDiff', label: 'Git diff' },
  { id: 'terminalLogs', label: 'Terminal logs' },
  { id: 'walletContext', label: 'Wallet context' },
  { id: 'projectMemory', label: 'Project Memory' },
]

// Monochrome "knowledge" mark for the brain count — a lightbulb/spark, not an emoji
// (UI chrome stays emoji-free; the glyph inherits currentColor like the rest of the row).
export function MemoryKnowledgeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 1.5a4 4 0 0 0-2.4 7.2c.3.25.5.6.5 1v.3h3.8v-.3c0-.4.2-.75.5-1A4 4 0 0 0 7 1.5Z" />
      <path d="M5.4 12.2h3.2M6 13.2h2" />
    </svg>
  )
}

/** Build · Plan segment for the composer foot row. Plan mode makes ARIA present
 *  a plan and wait for one approval before writing. Default Build. */
function PlanToggle() {
  const planMode = useAriaStore((s) => s.planMode)
  const setPlanMode = useAriaStore((s) => s.setPlanMode)
  return (
    <div className="agent-wb-mode" role="group" aria-label="Execution mode">
      <button
        type="button"
        className={`agent-wb-mode-seg${planMode ? '' : ' active'}`}
        aria-pressed={!planMode}
        onClick={() => setPlanMode(false)}
        title="Build — act immediately"
      >Build</button>
      <button
        type="button"
        className={`agent-wb-mode-seg${planMode ? ' active' : ''}`}
        aria-pressed={planMode}
        onClick={() => setPlanMode(true)}
        title="Plan — present a plan and wait for approval before writing"
      >Plan</button>
    </div>
  )
}

// History affordance — a clock glyph (UI chrome stays emoji-free).
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="5.25" />
      <path d="M7 4.2V7l1.9 1.1" />
    </svg>
  )
}

export function AgentWorkbench() {
  const turns = useAriaStore((s) => s.turns)
  const isLoading = useAriaStore((s) => s.isLoading)
  const sendMessage = useAriaStore((s) => s.sendMessage)
  const pushLocalTurn = useAriaStore((s) => s.pushLocalTurn)
  const newChat = useAriaStore((s) => s.newChat)
  const subscribe = useAriaStore((s) => s.subscribe)
  const initSessions = useAriaStore((s) => s.initSessions)
  const loadSessions = useAriaStore((s) => s.loadSessions)
  const loadModels = useAriaStore((s) => s.loadModels)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const consoleDock = useUIStore((s) => s.consoleDock)
  const toggleConsoleDock = useUIStore((s) => s.toggleConsoleDock)
  const loadKnowledge = useMemoryStore((s) => s.loadKnowledge)

  const [input, setInput] = useState('')
  const [chips, setChips] = useState(getAriaChips())
  const [view, setView] = useState<'chat' | 'swarms'>('chat')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const headRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    void loadModels()
    return subscribe()
  }, [subscribe, loadModels])

  // Dismiss the header history popover / overflow menu on outside click.
  useEffect(() => {
    if (!historyOpen && !menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (headRef.current && !headRef.current.contains(e.target as Node)) {
        setHistoryOpen(false)
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [historyOpen, menuOpen])

  // Keep the brain count fresh — reload when the project changes or a turn settles.
  useEffect(() => { void loadKnowledge(activeProjectId) }, [activeProjectId, loadKnowledge, turns.length])

  // Sessions are per-project: re-init the list whenever the active project changes.
  useEffect(() => {
    void initSessions()
  }, [initSessions, activeProjectId])

  const scrollRef = useRef<HTMLDivElement | null>(null)
  useStickyScroll(scrollRef, [turns.length, isLoading])

  const setChip = (id: ChipId, on: boolean) => {
    const next = { ...chips, [id]: on }
    setChips(next)
    setAriaChips({ [id]: on })
  }

  // `> @ /` accelerators. Chat-first: plain text falls through to ARIA; only a
  // leading `>` or `/` surfaces the structured command list.
  const suggestions = useMemo(() => getConsoleSuggestions(input), [input])
  const showSuggestions = suggestions.length > 0

  // Run a console command: navigation runs inline; result commands echo the
  // command into the transcript and append the read-only result.
  const executeCommand = (cmd: ConsoleCommand, raw: string) => {
    setInput('')
    if (cmd.result) {
      const token = `${cmd.trigger}${cmd.id}`
      void cmd.result()
        .then((text) => pushLocalTurn(token, text))
        .catch((err) => pushLocalTurn(token, `Error: ${(err as Error).message}`))
      return
    }
    cmd.run?.()
  }

  const runSuggestion = (cmd: ConsoleCommand) => {
    executeCommand(cmd, `${cmd.trigger}${cmd.id}`)
  }

  const handleSend = () => {
    const value = input.trim()
    if (!value || isLoading) return
    // A `>` or `/` command runs locally and never hits the agent.
    if (isConsoleCommandInput(value)) {
      const cmd = resolveConsoleCommand(value)
      if (cmd) {
        executeCommand(cmd, value)
        return
      }
    }
    setInput('')
    // Refresh the session list after the turn so an auto-titled session and its
    // updated_at ordering show up in the switcher.
    void sendMessage(value).then(() => loadSessions())
  }

  // Enabled chips show as removable context items; the "+" menu toggles all options.
  const activeContext = CONTEXT_CHIPS.filter((c) => chips[c.id]).map((c) => ({ id: c.id, label: c.label }))

  const hasTurns = turns.length > 0

  return (
    <div className="agent-workbench">
      <header className="agent-wb-head" ref={headRef}>
        <div className="agent-wb-tabs">
          <button type="button" className={`agent-wb-tab${view === 'chat' ? ' active' : ''}`} onClick={() => setView('chat')}>Console</button>
          <button type="button" className={`agent-wb-tab${view === 'swarms' ? ' active' : ''}`} onClick={() => setView('swarms')}>Swarms</button>
        </div>
        <span className="agent-wb-spacer" />
        <div className="agent-wb-actions">
          {view === 'chat' ? (
            <>
              <button type="button" className="agent-wb-iconbtn" onClick={() => void newChat()} title="New chat" aria-label="New chat">+</button>
              <div className="agent-wb-history">
                <button
                  type="button"
                  className={`agent-wb-iconbtn${historyOpen ? ' active' : ''}`}
                  onClick={() => { setHistoryOpen((v) => !v); setMenuOpen(false) }}
                  title="Chat history"
                  aria-label="Chat history"
                  aria-haspopup="menu"
                  aria-expanded={historyOpen}
                >
                  <ClockIcon />
                </button>
                {historyOpen ? <SessionHistoryPopover onClose={() => setHistoryOpen(false)} /> : null}
              </div>
            </>
          ) : null}
          <div className="agent-wb-more">
            <button
              type="button"
              className={`agent-wb-iconbtn${menuOpen ? ' active' : ''}`}
              onClick={() => { setMenuOpen((v) => !v); setHistoryOpen(false) }}
              title="More"
              aria-label="More"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >⋯</button>
            {menuOpen ? (
              <div className="agent-wb-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="agent-wb-menu-item"
                  onClick={() => { toggleConsoleDock(); setMenuOpen(false) }}
                >
                  {consoleDock === 'right' ? 'Move to bottom panel' : 'Move to right rail'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {view === 'swarms' ? (
        <div className="agent-wb-swarms">
          <SwarmMonitor />
        </div>
      ) : (
        <>
          <AriaSessionStrip />

          <div className="agent-wb-transcript" ref={scrollRef}>
            {hasTurns ? (
              <AgentTranscript turns={turns} isLoading={isLoading} />
            ) : (
              <div className="agent-wb-empty">
                Start a chat — the operator can drive the whole workspace.
              </div>
            )}
          </div>

          {showSuggestions && (
            <div className="agent-wb-suggest" role="listbox" aria-label="Console commands">
              {suggestions.slice(0, 8).map((cmd) => (
                <button
                  key={`${cmd.trigger}${cmd.id}`}
                  type="button"
                  className="agent-wb-suggest-item"
                  role="option"
                  aria-selected={false}
                  onClick={() => runSuggestion(cmd)}
                >
                  <span className="agent-wb-suggest-token">{cmd.trigger}{cmd.id}</span>
                  <span className="agent-wb-suggest-label">{cmd.label}</span>
                  {cmd.hint && <span className="agent-wb-suggest-hint">{cmd.hint}</span>}
                </button>
              ))}
            </div>
          )}

          <Composer
            className="agent-wb-composer"
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={isLoading}
            placeholder="Ask the operator, or / for commands…"
            sendIcon
            model={<><PlanToggle /><ModelDropdown /></>}
            context={activeContext}
            onRemoveContext={(id) => setChip(id as ChipId, false)}
            contextMenu={CONTEXT_CHIPS.map((c) => ({ id: c.id, label: c.label, active: chips[c.id] ?? false }))}
            onToggleContext={(id, active) => setChip(id as ChipId, active)}
          />
        </>
      )}
    </div>
  )
}
