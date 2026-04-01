import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useBrowserStore } from '../../store/browser'
import { useUIStore } from '../../store/ui'

// xterm.js API requires hex values — keep in sync with tokens.css
const XTERM_THEME = {
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
}

const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07/g, '')

interface BrowserAgentTerminalProps {
  onAgentNavigate?: (url: string) => void
}

export function BrowserAgentTerminal({ onAgentNavigate }: BrowserAgentTerminalProps) {
  const termContainerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const terminalIdRef = useRef<string | null>(null)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [inputValue, setInputValue] = useState('')
  const [agentStatus, setAgentStatus] = useState<'starting' | 'ready' | 'thinking' | 'offline'>('starting')

  const setAgentTerminalId = useBrowserStore((s) => s.setAgentTerminalId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)

  const doFit = useCallback(() => {
    const fit = fitRef.current
    const term = xtermRef.current
    if (!fit || !term || !termContainerRef.current) return
    const { clientWidth, clientHeight } = termContainerRef.current
    if (clientWidth === 0 || clientHeight === 0) return
    try {
      fit.fit()
      if (terminalIdRef.current) {
        window.daemon.terminal.resize(terminalIdRef.current, term.cols, term.rows)
      }
    } catch (err) {
      console.warn('[BrowserAgent] fit failed:', (err as Error).message)
    }
  }, [])

  const debouncedFit = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    resizeTimerRef.current = setTimeout(doFit, 60)
  }, [doFit])

  const sendMessage = useCallback((text: string) => {
    if (!text.trim() || !terminalIdRef.current) return
    window.daemon.terminal.write(terminalIdRef.current, text + '\r')
    setInputValue('')
    setAgentStatus('thinking')
  }, [])

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }, [inputValue, sendMessage])

  useEffect(() => {
    if (!termContainerRef.current) return

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      theme: XTERM_THEME,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(termContainerRef.current)
    xtermRef.current = term
    fitRef.current = fitAddon

    let cleanupData: (() => void) | null = null
    let cleanupExit: (() => void) | null = null

    const cwd = activeProjectPath || undefined

    window.daemon.terminal.create({ cwd }).then(async (res) => {
      if (!res.ok || !res.data) return
      const id = res.data.id
      terminalIdRef.current = id
      setAgentTerminalId(id)

      let outputBuffer = ''

      cleanupData = window.daemon.terminal.onData((payload) => {
        if (payload.id !== id) return
        term.write(payload.data)

        // Detect agent readiness from Claude CLI prompt indicator
        const clean = stripAnsi(payload.data)
        if (clean.includes('>') || clean.includes('$')) {
          setAgentStatus('ready')
        }

        // Scan for agent browser commands
        outputBuffer += clean
        if (outputBuffer.length > 2000) outputBuffer = outputBuffer.slice(-1000)

        const navMatch = outputBuffer.match(/\[NAVIGATE\]\s*(https?:\/\/[^\s\r\n]+)/)
        if (navMatch && onAgentNavigate) {
          const url = navMatch[1].replace(/[^a-zA-Z0-9/:.?&=#%_~@!$'()*+,;-]+$/, '')
          onAgentNavigate(url)
          outputBuffer = ''
        }
      })

      cleanupExit = window.daemon.terminal.onExit((payload) => {
        if (payload.id === id) {
          term.write('\r\n[Agent exited]\r\n')
          setAgentStatus('offline')
        }
      })

      // Also allow direct xterm input (clicking into terminal area)
      term.onData((data) => {
        window.daemon.terminal.write(id, data)
      })

      setTimeout(doFit, 150)

      try {
        const cmdRes = await window.daemon.browser.agentCommand()
        if (cmdRes.ok && cmdRes.data) {
          const { command } = cmdRes.data as { command: string }
          setTimeout(() => {
            window.daemon.terminal.write(id, command + '\r')
            setAgentStatus('starting')
          }, 500)
        }
      } catch (err) {
        console.warn('[BrowserAgent] failed to get agent command:', (err as Error).message)
        term.write('\r\n[Browser agent: Claude CLI not available]\r\n')
        setAgentStatus('offline')
      }
    })

    const resizeObserver = new ResizeObserver(debouncedFit)
    resizeObserver.observe(termContainerRef.current)

    return () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      resizeObserver.disconnect()
      cleanupData?.()
      cleanupExit?.()
      term.dispose()
      if (terminalIdRef.current) {
        window.daemon.terminal.kill(terminalIdRef.current)
        setAgentTerminalId(null)
      }
    }
  }, [doFit, debouncedFit, setAgentTerminalId, activeProjectPath, onAgentNavigate])

  const statusLabel = agentStatus === 'starting' ? 'Starting...'
    : agentStatus === 'thinking' ? 'Thinking...'
    : agentStatus === 'offline' ? 'Offline'
    : 'Ready'

  return (
    <div className="browser-agent">
      <div className="browser-agent__header">
        <div className="browser-agent__title">
          <div className={`browser-agent__dot browser-agent__dot--${agentStatus}`} />
          Browser Agent
        </div>
        <span className="browser-agent__status">{statusLabel}</span>
      </div>

      <div
        className="browser-agent__terminal"
        ref={termContainerRef}
        onClick={() => xtermRef.current?.focus()}
      />

      <div className="browser-agent__input-bar">
        <input
          ref={inputRef}
          className="browser-agent__input"
          placeholder="Ask the browser agent..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
        />
        <button
          className="browser-agent__send"
          onClick={() => sendMessage(inputValue)}
          disabled={!inputValue.trim() || agentStatus === 'offline'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
