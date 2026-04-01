import { useEffect, useRef, useCallback, useState } from 'react'
import { useBrowserStore } from '../../store/browser'

interface ChatMessage {
  id: string
  role: 'user' | 'agent' | 'system' | 'inspect'
  content: string
  timestamp: number
}

interface BrowserAgentTerminalProps {
  onAgentNavigate?: (url: string) => void
}

export function BrowserAgentTerminal({ onAgentNavigate }: BrowserAgentTerminalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [agentStatus, setAgentStatus] = useState<'ready' | 'thinking' | 'error'>('ready')

  const scrollRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef(`browser-${Date.now()}`)
  const lastInspectCountRef = useRef(0)

  const currentUrl = useBrowserStore((s) => s.currentUrl)
  const inspectorResults = useBrowserStore((s) => s.inspectorResults)

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isThinking])

  // Show new inspector results as chips in the chat
  useEffect(() => {
    if (inspectorResults.length > lastInspectCountRef.current) {
      const newResults = inspectorResults.slice(lastInspectCountRef.current)
      lastInspectCountRef.current = inspectorResults.length

      for (const r of newResults) {
        const styleSummary = r.styles
          ? ` | ${r.styles.fontSize} ${r.styles.fontWeight} | color: ${r.styles.color} | bg: ${r.styles.backgroundColor}`
          : ''
        const textPreview = r.text ? ` "${r.text.slice(0, 50)}"` : ''
        const content = `<${r.tagName}> ${r.selector}${textPreview}${styleSummary}`

        setMessages(prev => [...prev, {
          id: `inspect-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'inspect',
          content,
          timestamp: Date.now(),
        }])
      }
    }
  }, [inspectorResults])

  const addMessage = useCallback((role: ChatMessage['role'], content: string) => {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role,
      content: content.trim(),
      timestamp: Date.now(),
    }])
  }, [])

  // Build context from current page + recent inspections
  const buildContext = useCallback(() => {
    const parts: string[] = []
    if (currentUrl) parts.push(`Current URL: ${currentUrl}`)

    const recent = inspectorResults.slice(-5)
    if (recent.length > 0) {
      parts.push('\nInspected elements (Ctrl+clicked by user):')
      for (const r of recent) {
        let line = `  <${r.tagName}> ${r.selector}`
        if (r.text) line += ` text="${r.text.slice(0, 80)}"`
        if (r.styles) {
          const s = r.styles
          line += ` | ${s.display} ${s.position} | font: ${s.fontSize} ${s.fontWeight} | color: ${s.color} bg: ${s.backgroundColor} | size: ${s.width}x${s.height} | padding: ${s.padding} margin: ${s.margin}`
        }
        if (r.attributes) {
          const attrs = Object.entries(r.attributes)
            .filter(([k]) => k !== 'class' && k !== 'style')
            .map(([k, v]) => `${k}="${v}"`)
            .join(' ')
          if (attrs) line += ` | attrs: ${attrs}`
        }
        parts.push(line)
      }
    }

    return parts.length > 0 ? parts.join('\n') : undefined
  }, [currentUrl, inspectorResults])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isThinking) return

    const userText = text.trim()
    addMessage('user', userText)
    setInputValue('')
    setIsThinking(true)
    setAgentStatus('thinking')

    try {
      const context = buildContext()
      const res = await window.daemon.browser.chat(
        sessionIdRef.current,
        userText,
        context,
      )

      if (!res.ok) {
        throw new Error(res.error ?? 'Agent request failed')
      }

      const { text: responseText, navigateUrl } = res.data as { text: string; navigateUrl: string | null }

      if (responseText) {
        addMessage('agent', responseText)
      }

      if (navigateUrl && onAgentNavigate) {
        onAgentNavigate(navigateUrl)
        if (!responseText) {
          addMessage('agent', `Navigating to ${navigateUrl}`)
        }
      }

      setAgentStatus('ready')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addMessage('system', msg)
      setAgentStatus('error')
    } finally {
      setIsThinking(false)
    }
  }, [isThinking, addMessage, buildContext, onAgentNavigate])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage(inputValue)
    }
  }, [inputValue, sendMessage])

  // Cleanup conversation on unmount
  useEffect(() => {
    const sid = sessionIdRef.current
    return () => {
      window.daemon.browser.chatReset(sid).catch(() => {})
    }
  }, [])

  const statusDot = agentStatus === 'ready' ? 'browser-agent__dot--ready'
    : agentStatus === 'thinking' ? 'browser-agent__dot--thinking'
    : 'browser-agent__dot--offline'

  return (
    <div className="browser-agent">
      <div className="browser-agent__header">
        <div className="browser-agent__title">
          <div className={`browser-agent__dot ${statusDot}`} />
          Browser Agent
        </div>
        <span className="browser-agent__status">
          {agentStatus === 'thinking' ? 'Thinking...' : agentStatus === 'error' ? 'Error' : 'Ready'}
        </span>
      </div>

      <div className="browser-agent__messages" ref={scrollRef}>
        {messages.length === 0 && !isThinking && (
          <div className="browser-agent__empty">
            Ctrl+click elements to inspect. Ask the agent to navigate, debug, or explain.
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`browser-agent__msg browser-agent__msg--${msg.role}`}>
            {msg.role === 'agent' && <div className="browser-agent__msg-label">Agent</div>}
            {msg.role === 'system' && <div className="browser-agent__msg-label">System</div>}
            {msg.role === 'inspect' && <div className="browser-agent__msg-label">Inspected</div>}
            <div className="browser-agent__msg-text">{msg.content}</div>
          </div>
        ))}
        {isThinking && (
          <div className="browser-agent__msg browser-agent__msg--agent">
            <div className="browser-agent__msg-label">Agent</div>
            <div className="browser-agent__thinking-dots">
              <span /><span /><span />
            </div>
          </div>
        )}
      </div>

      <div className="browser-agent__input-bar">
        <input
          className="browser-agent__input"
          placeholder="Ask about inspected elements, or say where to navigate..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isThinking}
        />
        <button
          className="browser-agent__send"
          onClick={() => void sendMessage(inputValue)}
          disabled={!inputValue.trim() || isThinking}
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
