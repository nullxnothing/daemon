import { useCallback, useEffect } from 'react'
import { useUIStore } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { WalletWorkspace } from './workspace/WalletWorkspace'
import workspaceStyles from './workspace/WalletWorkspace.module.css'
import './WalletPanel.css'

export function WalletPanel() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const dashboard = useWalletStore((s) => s.dashboard)
  const loading = useWalletStore((s) => s.loading)

  const load = useCallback(async () => {
    await useWalletStore.getState().refresh(activeProjectId)
  }, [activeProjectId])

  const activeWalletId = dashboard?.activeWallet?.id ?? null

  useEffect(() => { void load() }, [load])
  useEffect(() => useWalletStore.getState().subscribeFastPoll(), [])
  useEffect(() => { void useWalletStore.getState().loadAgentWallets() }, [])

  useEffect(() => {
    if (activeWalletId) {
      void useWalletStore.getState().loadTransactions(activeWalletId)
    }
  }, [activeWalletId])

  if (!dashboard && loading) {
    return (
      <div className="wallet-panel">
        <div className={workspaceStyles.statusWrap}>
          <div className={workspaceStyles.statusInner}>
            <div className={workspaceStyles.statusTitle}>Loading wallet data…</div>
            <div className={workspaceStyles.statusCopy}>Fetching balances, holdings, and activity.</div>
          </div>
        </div>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="wallet-panel">
        <EmptyState
          title="Failed to load wallet data"
          description="Check your network connection and Helius configuration."
          action={<Button size="sm" onClick={() => void load()}>Retry</Button>}
        />
      </div>
    )
  }

  return (
    <div className="wallet-panel">
      <WalletWorkspace onRefresh={load} />
    </div>
  )
}
