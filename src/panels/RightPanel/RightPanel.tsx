import { useState, useEffect } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useUIStore } from '../../store/ui'
import { ClaudePanel } from '../ClaudePanel/ClaudePanel'
import { CodexPanel } from '../CodexPanel/CodexPanel'
import { AriaChat } from '../ClaudePanel/AriaChat'
import { RightSidebarWidgets } from './RightSidebarWidgets'
import './RightPanel.css'

function useClaudeStatus(): 'live' | 'unknown' {
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    let cancelled = false

    const refresh = () => {
      daemon.claude.status().then((res) => {
        if (!cancelled) {
          setIsLive(res.ok && !!res.data && res.data.indicator === 'none')
        }
      }).catch(() => { if (!cancelled) setIsLive(false) })
    }

    refresh()
    const unsubscribe = daemon.events.on('auth:changed', (payload) => {
      const p = payload as { providerId?: string } | undefined
      if (!p || p.providerId === 'claude') refresh()
    })
    return () => { cancelled = true; unsubscribe() }
  }, [])

  return isLive ? 'live' : 'unknown'
}

function useCodexStatus(): 'live' | 'unknown' {
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      daemon.codex.verifyConnection().then((res) => {
        if (cancelled) return
        setIsLive(res.ok && !!res.data && (res.data.isAuthenticated || res.data.authMode !== 'none'))
      }).catch(() => { if (!cancelled) setIsLive(false) })
    }

    refresh()
    const unsubscribe = daemon.events.on('auth:changed', (payload) => {
      const p = payload as { providerId?: string } | undefined
      if (!p || p.providerId === 'codex') refresh()
    })
    return () => { cancelled = true; unsubscribe() }
  }, [])

  return isLive ? 'live' : 'unknown'
}

export function RightPanel() {
  const rightPanelTab = useUIStore((s) => s.rightPanelTab)
  const setRightPanelTab = useUIStore((s) => s.setRightPanelTab)
  const [assistantOpen, setAssistantOpen] = useState(true)
  const claudeStatus = useClaudeStatus()
  const codexStatus = useCodexStatus()

  const toggleAssistant = (tab: 'claude' | 'codex') => {
    if (rightPanelTab === tab) {
      setAssistantOpen((open) => !open)
      return
    }
    setRightPanelTab(tab)
    setAssistantOpen(true)
  }

  return (
    <div className="right-panel-wrap">
      <div className="right-panel-header" aria-hidden="true">
        <div className="right-panel-header-copy">
          <span className="right-panel-kicker">Assistants</span>
        </div>
      </div>

      <div className="right-panel-tabs" role="tablist">
        <button
          className={`right-panel-tab${rightPanelTab === 'claude' && assistantOpen ? ' active' : ''}`}
          role="tab"
          aria-selected={rightPanelTab === 'claude' && assistantOpen}
          onClick={() => toggleAssistant('claude')}
          aria-label="Claude"
          title={rightPanelTab === 'claude' && assistantOpen ? 'Close Claude' : 'Open Claude'}
        >
          <span className={`right-panel-tab-dot${claudeStatus === 'live' ? ' live' : ''}`} />
          <img src="./claude-logo.png" alt="" width={14} height={14} style={{ display: 'block' }} />
          <span className="right-panel-tab-label">Claude</span>
        </button>
        <button
          className={`right-panel-tab${rightPanelTab === 'codex' && assistantOpen ? ' active' : ''}`}
          role="tab"
          aria-selected={rightPanelTab === 'codex' && assistantOpen}
          onClick={() => toggleAssistant('codex')}
          aria-label="Codex"
          title={rightPanelTab === 'codex' && assistantOpen ? 'Close Codex' : 'Open Codex'}
        >
          <span className={`right-panel-tab-dot${codexStatus === 'live' ? ' live' : ''}`} />
          <img src="./codex-logo.png" alt="" width={14} height={14} style={{ display: 'block' }} />
          <span className="right-panel-tab-label">Codex</span>
        </button>
      </div>

      <RightSidebarWidgets />

      <div className={`right-panel-content${assistantOpen ? '' : ' right-panel-content--closed'}`} aria-hidden={!assistantOpen}>
        {assistantOpen && (rightPanelTab === 'codex' ? <CodexPanel /> : <ClaudePanel />)}
      </div>

      <AriaChat />
    </div>
  )
}
