import { useEffect, useRef, useState } from 'react'
import { useAriaStore } from '../../store/aria'
import { useUIStore } from '../../store/ui'
import { Composer, ModelDropdown } from '../../components/Panel'
import { getAriaChips, setAriaChips } from '../../lib/ariaContext'
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

export function AgentWorkbench() {
  const turns = useAriaStore((s) => s.turns)
  const isLoading = useAriaStore((s) => s.isLoading)
  const sendMessage = useAriaStore((s) => s.sendMessage)
  const newChat = useAriaStore((s) => s.newChat)
  const subscribe = useAriaStore((s) => s.subscribe)
  const initSessions = useAriaStore((s) => s.initSessions)
  const loadSessions = useAriaStore((s) => s.loadSessions)
  const loadModels = useAriaStore((s) => s.loadModels)
  const activeProjectId = useUIStore((s) => s.activeProjectId)

  const [input, setInput] = useState('')
  const [chips, setChips] = useState(getAriaChips())
  const [view, setView] = useState<'chat' | 'swarms'>('chat')

  useEffect(() => {
    void loadModels()
    return subscribe()
  }, [subscribe, loadModels])

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

  const handleSend = () => {
    const value = input.trim()
    if (!value || isLoading) return
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
          <button type="button" className={`agent-wb-tab${view === 'chat' ? ' active' : ''}`} onClick={() => setView('chat')}>Chat</button>
          <button type="button" className={`agent-wb-tab${view === 'swarms' ? ' active' : ''}`} onClick={() => setView('swarms')}>Swarms</button>
        </div>
        <span className="agent-wb-spacer" />
        {view === 'chat' ? (
          <button type="button" className="agent-wb-newchat" onClick={() => void newChat()}>+ New Chat</button>
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

          <Composer
            className="agent-wb-composer"
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={isLoading}
            placeholder="Ask Claude to build, refactor, or explain…"
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
