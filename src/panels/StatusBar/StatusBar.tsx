import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import './StatusBar.css'

const EMPTY_MARKET: MarketTickerEntry[] = []

function formatCompactUsd(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: value >= 1000 ? 0 : 2 })
}

export function StatusBar() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <span className="statusbar-item">DAEMON v0.1.0</span>
        <GitBranch />
        <TerminalCount />
      </div>
      <div className="statusbar-center">
        <MarketTape />
      </div>
      <div className="statusbar-right">
        <ClaudeStatus />
        {activeProjectPath && (
          <span className="statusbar-item statusbar-path">{activeProjectPath}</span>
        )}
      </div>
    </div>
  )
}

function TerminalCount() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const count = useUIStore((s) => s.terminals.filter((t) => t.projectId === activeProjectId).length)
  return <span className="statusbar-item">{count} terminal{count !== 1 ? 's' : ''}</span>
}

function GitBranch() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const [branch, setBranch] = useState<string | null>(null)

  useEffect(() => {
    if (!activeProjectPath) { setBranch(null); return }
    window.daemon.git.branch(activeProjectPath).then((res) => {
      setBranch(res.ok ? res.data as string : null)
    })
  }, [activeProjectPath])

  if (!branch) return null
  return <span className="statusbar-item statusbar-branch">{branch}</span>
}

function ClaudeStatus() {
  const [authMode, setAuthMode] = useState<string | null>(null)
  const setShowOnboarding = useUIStore((s) => s.setShowOnboarding)

  useEffect(() => {
    window.daemon.claude.getConnection().then((res) => {
      setAuthMode(res.ok && res.data ? res.data.authMode : 'none')
    })
  }, [])

  const isConnected = authMode === 'cli' || authMode === 'both' || authMode === 'api'
  const dotColor = isConnected ? 'var(--green)' : 'var(--red)'
  const label = isConnected ? 'Claude connected' : 'Claude disconnected'

  return (
    <span
      className="statusbar-item"
      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
      onClick={() => !isConnected && setShowOnboarding(true)}
      title={label}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <span style={{ fontSize: 10 }}>Claude</span>
    </span>
  )
}

function MarketTape() {
  const visible = useWalletStore((s) => s.showMarketTape)
  const dashboard = useWalletStore((s) => s.dashboard)
  const items = dashboard?.market ?? EMPTY_MARKET

  if (!visible || items.length === 0) return null

  return (
    <div className="market-tape">
      {items.map((item) => (
        <span key={item.symbol} className="market-tape-item">
          <span className="market-symbol">{item.symbol}</span>
          <span className="market-price">${formatCompactUsd(item.priceUsd)}</span>
          <span className={`market-change ${item.change24hPct >= 0 ? 'up' : 'down'}`}>
            {item.change24hPct >= 0 ? '+' : '-'}{Math.abs(item.change24hPct).toFixed(2)}%
          </span>
        </span>
      ))}
    </div>
  )
}
