import { useState, useEffect } from 'react'
import { useUIStore } from '../../store/ui'
import { ClaudePanel } from '../ClaudePanel/ClaudePanel'
import { DashboardMini } from '../Dashboard/DashboardMini'
import { SessionHistory } from '../SessionRegistry/SessionHistory'
import { AriaChat } from '../ClaudePanel/AriaChat'
import { HackathonPanel } from '../Colosseum/HackathonPanel'
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
        <button
          className={`right-panel-tab${rightPanelTab === 'hackathon' ? ' active' : ''}`}
          role="tab"
          aria-selected={rightPanelTab === 'hackathon'}
          onClick={() => setRightPanelTab('hackathon')}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ marginRight: 4 }}>
            <path d="M2 12V6a6 6 0 0 1 12 0v6" strokeLinecap="round"/>
            <line x1="2" y1="12" x2="14" y2="12" strokeLinecap="round"/>
            <line x1="5" y1="12" x2="5" y2="7"/>
            <line x1="8" y1="12" x2="8" y2="5"/>
            <line x1="11" y1="12" x2="11" y2="7"/>
          </svg>
          Hackathon
        </button>
      </div>

      <div className="right-panel-content">
        {rightPanelTab === 'claude' ? (
          <ClaudePanel />
        ) : rightPanelTab === 'sessions' ? (
          <SessionHistory />
        ) : rightPanelTab === 'hackathon' ? (
          <HackathonPanel />
        ) : (
          <DashboardMini />
        )}
      </div>

      <AriaChat />
    </div>
  )
}
