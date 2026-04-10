import { useState, useEffect, useRef, useCallback } from 'react'
import { useAriaStore } from '../../store/aria'
import { useUIStore } from '../../store/ui'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { useBrowserStore } from '../../store/browser'
import { AriaPresence } from './AriaPresence'
import type { AriaAction, AriaMessage } from '../../../electron/shared/types'
import './AriaChat.css'

function AriaChamber({ isChatFocused }: { isChatFocused: boolean }) {
  return (
    <div className="aria-chamber">
      <div className="aria-chamber-face">
        <AriaPresence isChatFocused={isChatFocused} isChatExpanded={false} size="large" />
      </div>
      <span className="aria-chamber-label">aria</span>
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

const URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+)/g

function renderTextWithLinks(text: string, keyPrefix: string) {
  const segments = text.split(URL_PATTERN)
  return segments.map((seg, j) => {
    if (URL_PATTERN.test(seg)) {
      // Reset lastIndex after test() consumed it
      URL_PATTERN.lastIndex = 0
      return (
        <button
          key={`${keyPrefix}-link-${j}`}
          className="aria-link"
          onClick={() => {
            useBrowserStore.getState().setUrl(seg)
            useUIStore.getState().openBrowserTab()
          }}
          title={seg}
        >
          {seg}
        </button>
      )
    }
    URL_PATTERN.lastIndex = 0
    return seg ? <span key={`${keyPrefix}-text-${j}`}>{seg}</span> : null
  })
}

function renderContent(text: string) {
  const parts = text.split(/(```[\s\S]*?```)/g)
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const inner = part.slice(3, -3)
      const newlineIdx = inner.indexOf('\n')
      const code = newlineIdx >= 0 ? inner.slice(newlineIdx + 1) : inner
      return (
        <pre key={i} className="aria-code-block">
          <code>{code}</code>
        </pre>
      )
    }
    if (!part.trim()) return null
    return <span key={i}>{renderTextWithLinks(part, String(i))}</span>
  })
}

function ActionChip({ action, onExecute }: { action: AriaAction; onExecute: (a: AriaAction) => void }) {
  return (
    <button className="aria-action-chip" onClick={() => onExecute(action)}>
      <span className="aria-action-prefix">/</span>{action.label}
    </button>
  )
}

function MessageRow({ msg, onAction }: { msg: AriaMessage; onAction: (a: AriaAction) => void }) {
  const isUser = msg.role === 'user'
  let actions: AriaAction[] = []
  try {
    const meta = JSON.parse(msg.metadata)
    if (meta.actions) actions = meta.actions
  } catch { /* ignore */ }

  return (
    <div className={`aria-row ${isUser ? 'aria-row-user' : 'aria-row-assistant'}`}>
      <div className="aria-row-header">
        <span className={`aria-role ${isUser ? 'aria-role-user' : 'aria-role-assistant'}`}>
          {isUser ? 'you' : 'aria'}
        </span>
        <span className="aria-time">{formatTime(msg.created_at)}</span>
      </div>
      <div className="aria-content">{renderContent(msg.content)}</div>
      {actions.length > 0 && (
        <div className="aria-actions">
          {actions.map((a, i) => (
            <ActionChip key={i} action={a} onExecute={onAction} />
          ))}
        </div>
      )}
    </div>
  )
}

function LoadingIndicator() {
  return (
    <div className="aria-row aria-row-assistant">
      <div className="aria-row-header">
        <span className="aria-role aria-role-assistant">aria</span>
      </div>
      <div className="aria-loading">
        <span className="aria-dot" />
        <span className="aria-dot" />
        <span className="aria-dot" />
      </div>
    </div>
  )
}

export function AriaChat() {
  const messages = useAriaStore((s) => s.messages)
  const isLoading = useAriaStore((s) => s.isLoading)
  const sendMessage = useAriaStore((s) => s.sendMessage)
  const clearMessages = useAriaStore((s) => s.clearMessages)
  const loadHistory = useAriaStore((s) => s.loadHistory)
  const toggleDrawer = useWorkflowShellStore((s) => s.toggleDrawer)

  const [input, setInput] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [isChatFocused, setIsChatFocused] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  // Auto-expand when messages exist or loading
  useEffect(() => {
    if (messages.length > 0 || isLoading) {
      setIsExpanded(true)
    }
  }, [messages.length, isLoading])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    setInput('')
    setIsExpanded(true)
    if (textareaRef.current) {
      textareaRef.current.style.height = '28px'
    }
    await sendMessage(trimmed)
  }, [input, isLoading, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') {
      setIsExpanded(false)
      textareaRef.current?.blur()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = '28px'
    el.style.height = Math.min(el.scrollHeight, 80) + 'px'
  }

  const handleFocus = () => {
    setIsChatFocused(true)
    if (messages.length > 0 || isLoading) {
      setIsExpanded(true)
    }
  }

  const handleBlur = () => {
    setIsChatFocused(false)
  }

  const handleAction = useCallback((action: AriaAction) => {
    switch (action.type) {
      case 'switch_panel': {
        const ui = useUIStore.getState()
        const panel = action.value
        if (panel === 'claude') {
          ui.setRightPanelTab('claude')
          break
        }
        if (panel === 'tools') {
          toggleDrawer()
          break
        }
        if (panel === 'terminal') {
          ui.setCenterMode('canvas')
          ui.setBrowserTabActive(false)
          ui.setDashboardTabActive(false)
          ui.setActiveWorkspaceTool(null)
          break
        }

        const panelMap: Record<string, string> = {
          process: 'processes',
          images: 'image-editor',
        }
        ui.openWorkspaceTool(panelMap[panel] ?? panel)
        break
      }
      case 'open_file': {
        const activeProjectId = useUIStore.getState().activeProjectId
        if (activeProjectId) {
          window.daemon.fs.readFile(action.value).then((res) => {
            if (res.ok && res.data) {
              useUIStore.getState().openFile({
                path: res.data.path,
                name: action.value.split(/[\\/]/).pop() ?? 'file',
                content: res.data.content,
                projectId: activeProjectId,
              })
            }
          })
        }
        break
      }
      case 'spawn_agent': {
        const activeProjectId = useUIStore.getState().activeProjectId
        if (activeProjectId) {
          window.daemon.terminal.spawnAgent({
            agentId: action.value,
            projectId: activeProjectId,
          }).then((res) => {
            if (res.ok && res.data) {
              useUIStore.getState().addTerminal(
                activeProjectId,
                res.data.id,
                res.data.agentName ?? action.value,
                res.data.agentId,
              )
            }
          })
        }
        break
      }
    }
  }, [toggleDrawer])

  const hasMessages = messages.length > 0 || isLoading
  const showChamber = !hasMessages

  return (
    <div className={`aria-dock ${isExpanded && hasMessages ? 'aria-dock-expanded' : ''} ${showChamber ? 'aria-dock-chamber' : ''}`}>
      {showChamber && (
        <AriaChamber isChatFocused={isChatFocused} />
      )}
      {isExpanded && hasMessages && (
        <div className="aria-toolbar">
          <div className="aria-toolbar-identity">
            <AriaPresence isChatFocused={isChatFocused} isChatExpanded={isExpanded} />
            <span className="aria-toolbar-label">ARIA</span>
          </div>
          <div className="aria-toolbar-actions">
            <button className="aria-toolbar-btn" onClick={clearMessages} title="Clear history">
              clear
            </button>
            <button className="aria-toolbar-btn" onClick={() => setIsExpanded(false)} title="Collapse">
              &#x2013;
            </button>
          </div>
        </div>
      )}
      {!showChamber && isExpanded && hasMessages && (
        <div className="aria-messages" ref={scrollRef}>
          {messages.map((msg) => (
            <MessageRow key={msg.id} msg={msg} onAction={handleAction} />
          ))}
          {isLoading && <LoadingIndicator />}
        </div>
      )}
      <div className="aria-prompt">
        <span className="aria-prompt-caret">&gt;</span>
        <textarea
          ref={textareaRef}
          className="aria-input"
          placeholder="ask aria..."
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          rows={1}
        />
        {input.trim() && (
          <button
            className="aria-submit"
            onClick={handleSend}
            disabled={isLoading}
          >
            &crarr;
          </button>
        )}
      </div>
    </div>
  )
}
