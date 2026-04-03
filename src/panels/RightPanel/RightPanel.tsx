import { useState, useEffect } from 'react'
import { useUIStore } from '../../store/ui'
import { ClaudePanel } from '../ClaudePanel/ClaudePanel'
import { DashboardMini } from '../Dashboard/DashboardMini'
import { SessionHistory } from '../SessionRegistry/SessionHistory'
import { AriaChat } from '../ClaudePanel/AriaChat'
import './RightPanel.css'

function useClaudeStatus(): 'live' | 'unknown' {
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    let cancelled = false

    const poll = () => {
      window.daemon.claude.status().then((res) => {
        if (!cancelled) {
          setIsLive(res.ok && !!res.data && res.data.indicator === 'none')
        }
      }).catch(() => {
        if (!cancelled) setIsLive(false)
      })
    }

    poll()
    const interval = setInterval(poll, 300_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return isLive ? 'live' : 'unknown'
}

export function RightPanel() {
  const rightPanelTab = useUIStore((s) => s.rightPanelTab)
  const setRightPanelTab = useUIStore((s) => s.setRightPanelTab)
  const claudeStatus = useClaudeStatus()

  return (
    <div className="right-panel-wrap">
      <div className="right-panel-tabs" role="tablist">
        <button
          className={`right-panel-tab${rightPanelTab === 'claude' ? ' active' : ''}`}
          role="tab"
          aria-selected={rightPanelTab === 'claude'}
          onClick={() => setRightPanelTab('claude')}
        >
          <span className={`right-panel-tab-dot${claudeStatus === 'live' ? ' live' : ''}`} />
          Claude
        </button>
        <button
          className={`right-panel-tab${rightPanelTab === 'dashboard' ? ' active' : ''}`}
          role="tab"
          aria-selected={rightPanelTab === 'dashboard'}
          onClick={() => setRightPanelTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`right-panel-tab${rightPanelTab === 'sessions' ? ' active' : ''}`}
          role="tab"
          aria-selected={rightPanelTab === 'sessions'}
          onClick={() => setRightPanelTab('sessions')}
        >
          Sessions
        </button>
      </div>

      <div className="right-panel-content">
        {rightPanelTab === 'claude' ? (
          <ClaudePanel />
        ) : rightPanelTab === 'sessions' ? (
          <SessionHistory />
        ) : (
          <DashboardMini />
        )}
      </div>

      <AriaChat />
    </div>
  )
}
