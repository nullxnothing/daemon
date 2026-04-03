import { useRef, useMemo, useState } from 'react'

const COMMAND_HINTS = [
  'anchor build',
  'anchor test',
  'anchor deploy',
  'solana balance',
  'solana airdrop 2',
  'pnpm run dev',
  'pnpm run build',
  'pnpm run test',
  'pnpm install',
  'git status',
  'git add .',
  'git commit -m ""',
  'git push',
  'npm run dev',
  'cargo build',
  'cargo test',
]

export function useTerminalInput(terminalId: string) {
  const [currentInput, setCurrentInputState] = useState('')
  const [commandHistory, setCommandHistoryState] = useState<string[]>([])
  const [historySearchOpen, setHistorySearchOpenState] = useState(false)
  const [historySearchQuery, setHistorySearchQueryState] = useState('')
  const [historySelectionIndex, setHistorySelectionIndexState] = useState(0)

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
    window.daemon.terminal.write(terminalId, '\u0003')
    window.setTimeout(() => {
      window.daemon.terminal.write(terminalId, selection)
    }, 10)
    setCurrentInput(selection)
  }

  const acceptHint = (hint: string) => {
    const existing = currentInputRef.current
    if (!existing) {
      window.daemon.terminal.write(terminalId, hint)
      setCurrentInput(hint)
      return
    }

    if (hint.toLowerCase().startsWith(existing.toLowerCase())) {
      const remainder = hint.slice(existing.length)
      window.daemon.terminal.write(terminalId, remainder)
      setCurrentInput(hint)
      return
    }

    window.daemon.terminal.write(terminalId, '\u0003')
    window.setTimeout(() => {
      window.daemon.terminal.write(terminalId, hint)
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

  /** Handle a keystroke from xterm onData. Returns true if the data was consumed internally. */
  const handleKeystroke = (data: string): boolean => {
    if (data === '\u0012') {
      setHistorySearchOpen(true)
      setHistorySearchQuery('')
      setHistorySelectionIndex(0)
      return true
    }

    if (interceptHistorySearchInput(data)) {
      return true
    }

    if (data === '\x1b' && completionHintsRef.current.length > 0) {
      setCurrentInput('')
      return true
    }

    if (data === '\t' && completionHintsRef.current.length > 0) {
      acceptHint(completionHintsRef.current[0])
      return true
    }

    trackInputFromData(data)
    return false
  }

  const dismissHints = () => setCurrentInput('')

  return {
    currentInput,
    historySearchOpen,
    historySearchQuery,
    historySelectionIndex,
    historyMatches,
    completionHints,
    handleKeystroke,
    acceptHint,
    applyHistorySelection,
    setHistorySelectionIndex,
    setHistorySearchOpen,
    setHistorySearchQuery,
    dismissHints,
  }
}
