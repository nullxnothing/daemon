import { useState, useEffect } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useUIStore } from '../../store/ui'
import { ClaudePanel } from '../ClaudePanel/ClaudePanel'
import { CodexPanel } from '../CodexPanel/CodexPanel'
import { AriaChat } from '../ClaudePanel/AriaChat'
import { MeterflowPanel } from '../Meterflow/MeterflowPanel'
import { RightSidebarWidgets } from './RightSidebarWidgets'
import { PanelHeader } from '../../components/Panel'
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

function useMeterflowStatus(): 'live' | 'unknown' {
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      daemon.meterflow.status().then((res) => {
        if (cancelled) return
        setIsLive(Boolean(res.ok && res.data?.executionReady))
      }).catch(() => { if (!cancelled) setIsLive(false) })
    }

    refresh()
    const interval = window.setInterval(refresh, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  return isLive ? 'live' : 'unknown'
}

function rightPanelContent(tab: 'claude' | 'codex' | 'meterflow') {
  if (tab === 'codex') return <CodexPanel />
  if (tab === 'meterflow') return <MeterflowPanel />
  return <ClaudePanel />
}

export function RightPanel() {
  const rightPanelTab = useUIStore((s) => s.rightPanelTab)
  const setRightPanelTab = useUIStore((s) => s.setRightPanelTab)
  const [panelOpen, setPanelOpen] = useState(true)
  const claudeStatus = useClaudeStatus()
  const codexStatus = useCodexStatus()
  const meterflowStatus = useMeterflowStatus()

  const togglePanel = (tab: 'claude' | 'codex' | 'meterflow') => {
    if (rightPanelTab === tab) {
      setPanelOpen((open) => !open)
      return
    }
    setRightPanelTab(tab)
    setPanelOpen(true)
  }

  return (
    <div className="right-panel-wrap">
      <PanelHeader
        className="right-panel-header"
        kicker="Console"
        title="Agents"
      />

      <div className="right-panel-tabs" role="tablist">
        <button
          className={`right-panel-tab${rightPanelTab === 'claude' && panelOpen ? ' active' : ''}`}
          role="tab"
          aria-selected={rightPanelTab === 'claude' && panelOpen}
          onClick={() => togglePanel('claude')}
          aria-label="Claude"
          title={rightPanelTab === 'claude' && panelOpen ? 'Close Claude' : 'Open Claude'}
        >
          <span className={`right-panel-tab-dot${claudeStatus === 'live' ? ' live' : ''}`} />
          <img src="./claude-logo.png" alt="" width={14} height={14} style={{ display: 'block' }} />
          <span className="right-panel-tab-label">Claude</span>
        </button>
        <button
          className={`right-panel-tab${rightPanelTab === 'codex' && panelOpen ? ' active' : ''}`}
          role="tab"
          aria-selected={rightPanelTab === 'codex' && panelOpen}
          onClick={() => togglePanel('codex')}
          aria-label="Codex"
          title={rightPanelTab === 'codex' && panelOpen ? 'Close Codex' : 'Open Codex'}
        >
          <span className={`right-panel-tab-dot${codexStatus === 'live' ? ' live' : ''}`} />
          <img src="./codex-logo.png" alt="" width={14} height={14} style={{ display: 'block' }} />
          <span className="right-panel-tab-label">Codex</span>
        </button>
        <button
          className={`right-panel-tab${rightPanelTab === 'meterflow' && panelOpen ? ' active' : ''}`}
          role="tab"
          aria-selected={rightPanelTab === 'meterflow' && panelOpen}
          onClick={() => togglePanel('meterflow')}
          aria-label="Meterflow"
          title={rightPanelTab === 'meterflow' && panelOpen ? 'Close Meterflow' : 'Open Meterflow'}
        >
          <span className={`right-panel-tab-dot${meterflowStatus === 'live' ? ' live' : ''}`} />
          <img src="./meterflow-mark.svg" alt="" width={14} height={14} />
          <span className="right-panel-tab-label">Meter</span>
        </button>
      </div>

      <RightSidebarWidgets />

      <div className={`right-panel-content${panelOpen ? '' : ' right-panel-content--closed'}`} aria-hidden={!panelOpen}>
        {panelOpen && rightPanelContent(rightPanelTab)}
      </div>

      <AriaChat />
    </div>
  )
}
