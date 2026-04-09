import { useCallback, useEffect } from 'react'
import { useUIStore } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { WalletTab } from './tabs/WalletTab'
import { AgentsTab } from './tabs/AgentsTab'
import './WalletPanel.css'

export function WalletPanel() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const dashboard = useWalletStore((s) => s.dashboard)
  const loading = useWalletStore((s) => s.loading)
  const activeTab = useWalletStore((s) => s.activeTab)
  const setActiveTab = useWalletStore((s) => s.setActiveTab)
  const drawerFullscreen = useWorkflowShellStore((s) => s.drawerFullscreen)
  const toggleDrawerFullscreen = useWorkflowShellStore((s) => s.toggleDrawerFullscreen)

  const load = useCallback(async () => {
    await useWalletStore.getState().refresh(activeProjectId)
  }, [activeProjectId])

  useEffect(() => { void load() }, [load])
  useEffect(() => useWalletStore.getState().subscribeFastPoll(), [])
  useEffect(() => { void useWalletStore.getState().loadAgentWallets() }, [])

  useEffect(() => {
    if (dashboard?.activeWallet) {
      void useWalletStore.getState().loadTransactions(dashboard.activeWallet.id ?? '')
    }
  }, [dashboard?.activeWallet])

  if (!dashboard && loading) {
    return (
      <div className="wallet-panel">
        <div className="wallet-panel-header">
          <span className="wallet-panel-title">Wallet</span>
        </div>
        <div className="wallet-empty">Loading wallet data...</div>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="wallet-panel">
        <div className="wallet-panel-header">
          <span className="wallet-panel-title">Wallet</span>
        </div>
        <div className="wallet-empty">
          <div style={{ marginBottom: 12 }}>Wallet data couldn't load.</div>
          <button
            onClick={() => void load()}
            style={{
              padding: '6px 14px', fontSize: 12,
              background: 'var(--s3)', color: 'var(--t1)',
              border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="wallet-panel">
      {/* Tab bar */}
      <div className="wallet-tabs">
        <button
          className={`wallet-tab${activeTab === 'wallet' ? ' wallet-tab--active' : ''}`}
          onClick={() => setActiveTab('wallet')}
        >
          Wallet
        </button>
        <button
          className={`wallet-tab${activeTab === 'agents' ? ' wallet-tab--active' : ''}`}
          onClick={() => setActiveTab('agents')}
        >
          Agents
        </button>
        <button
          className="wallet-expand-btn"
          onClick={toggleDrawerFullscreen}
          title={drawerFullscreen ? 'Collapse' : 'Expand'}
          aria-label={drawerFullscreen ? 'Collapse wallet panel' : 'Expand wallet panel'}
        >
          {drawerFullscreen ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
              <line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="wallet-tab-content">
        {activeTab === 'wallet' ? (
          <WalletTab onRefresh={load} />
        ) : (
          <AgentsTab />
        )}
      </div>
    </div>
  )
}
