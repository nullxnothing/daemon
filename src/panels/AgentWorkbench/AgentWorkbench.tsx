import { useEffect, useMemo, useRef, useState } from 'react'
import { useAriaStore } from '../../store/aria'
import { useUIStore } from '../../store/ui'
import { useMemoryStore } from '../../store/memory'
import { Composer, ModelDropdown } from '../../components/Panel'
import { getAriaChips, setAriaChips } from '../../lib/ariaContext'
import { getConsoleSuggestions, resolveConsoleCommand, isConsoleCommandInput, type ConsoleCommand } from '../../lib/console/consoleCommands'
import { AgentTranscript } from './AgentTranscript'
import { AriaSessionList } from './AriaSessionList'
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

  useEffect(() => {
    void loadModels()
    return subscribe()
  }, [subscribe, loadModels])

  // Keep the brain count fresh — reload when the project changes or a turn settles.
  useEffect(() => { void loadKnowledge(activeProjectId) }, [activeProjectId, loadKnowledge, turns.length])

  // Sessions are per-project: re-init the list whenever the active project changes.
  useEffect(() => {
    void initSessions()
  }, [initSessions, activeProjectId])

  const scrollRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [turns])

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
      <header className="agent-wb-head">
        <div className="agent-wb-tabs">
          <button type="button" className={`agent-wb-tab${view === 'chat' ? ' active' : ''}`} onClick={() => setView('chat')}>Console</button>
          <button type="button" className={`agent-wb-tab${view === 'swarms' ? ' active' : ''}`} onClick={() => setView('swarms')}>Swarms</button>
        </div>
        <span className="agent-wb-spacer" />
        <button
          type="button"
          className="agent-wb-dock-btn"
          onClick={toggleConsoleDock}
          title={consoleDock === 'right' ? 'Move Console to bottom panel' : 'Move Console to right rail'}
          aria-label={consoleDock === 'right' ? 'Move Console to bottom panel' : 'Move Console to right rail'}
        >
          {consoleDock === 'right' ? '↓' : '→'}
        </button>
        {view === 'chat' ? (
          <button type="button" className="agent-wb-newchat" onClick={() => void newChat()} title="New chat" aria-label="New chat">+</button>
        ) : null}
      </header>

      {view === 'swarms' ? (
        <div className="agent-wb-swarms">
          <SwarmMonitor />
        </div>
      ) : (
        <>
          <AriaSessionList />

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
            placeholder="Ask the operator, or type / for commands…"
            sendIcon
            model={<ModelDropdown />}
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
