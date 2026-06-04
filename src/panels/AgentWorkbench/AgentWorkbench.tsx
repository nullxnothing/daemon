import { useEffect, useRef, useState } from 'react'
import { useAriaStore } from '../../store/aria'
import { Composer, ModelDropdown } from '../../components/Panel'
import { getAriaChips, setAriaChips } from '../../lib/ariaContext'
import { AgentTranscript } from './AgentTranscript'
import './AgentWorkbench.css'

type ChipId = keyof ReturnType<typeof getAriaChips>

const CONTEXT_CHIPS: { id: ChipId; label: string }[] = [
  { id: 'activeFile', label: 'Active file' },
  { id: 'projectTree', label: 'Project tree' },
  { id: 'gitDiff', label: 'Git diff' },
  { id: 'terminalLogs', label: 'Terminal logs' },
  { id: 'walletContext', label: 'Wallet context' },
]

export function AgentWorkbench() {
  const turns = useAriaStore((s) => s.turns)
  const isLoading = useAriaStore((s) => s.isLoading)
  const sendMessage = useAriaStore((s) => s.sendMessage)
  const clearMessages = useAriaStore((s) => s.clearMessages)
  const subscribe = useAriaStore((s) => s.subscribe)
  const loadHistory = useAriaStore((s) => s.loadHistory)
  const loadModels = useAriaStore((s) => s.loadModels)

  const [input, setInput] = useState('')
  const [chips, setChips] = useState(getAriaChips())

  useEffect(() => {
    void loadHistory()
    void loadModels()
    return subscribe()
  }, [subscribe, loadHistory, loadModels])

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
    void sendMessage(value)
  }

  // Enabled chips show as removable context items; "+ Add context" re-enables the next one.
  const activeContext = CONTEXT_CHIPS.filter((c) => chips[c.id]).map((c) => ({ id: c.id, label: c.label }))
  const nextDisabled = CONTEXT_CHIPS.find((c) => !chips[c.id])

  const hasTurns = turns.length > 0

  return (
    <div className="agent-workbench">
      <header className="agent-wb-head">
        <span className="agent-wb-kicker">Agent</span>
        <span className="agent-wb-spacer" />
        <ModelDropdown className="agent-wb-model" />
        {hasTurns ? (
          <button type="button" className="agent-wb-clear" onClick={clearMessages}>Clear</button>
        ) : null}
      </header>

      <div className="agent-wb-transcript" ref={scrollRef}>
        {hasTurns ? (
          <AgentTranscript turns={turns} isLoading={isLoading} />
        ) : (
          <div className="agent-wb-empty">
            Ask Claude to build, refactor, or explain. It has the whole workspace.
          </div>
        )}
      </div>

      <Composer
        className="agent-wb-composer"
        value={input}
        onChange={setInput}
        onSend={handleSend}
        disabled={isLoading}
        placeholder="Ask Claude to build, refactor, or explain. It has the whole workspace."
        sendLabel="Send"
        model={<ModelDropdown />}
        context={activeContext}
        onRemoveContext={(id) => setChip(id as ChipId, false)}
        onAddContext={nextDisabled ? () => setChip(nextDisabled.id, true) : undefined}
      />
    </div>
  )
}
