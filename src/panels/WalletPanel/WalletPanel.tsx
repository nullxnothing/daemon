import { useCallback, useEffect, useState, lazy, Suspense } from 'react'
import { useUIStore } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { PackHostShell } from '../../components/PackHostShell/PackHostShell'
import { WalletWorkspace } from './workspace/WalletWorkspace'
import workspaceStyles from './workspace/WalletWorkspace.module.css'
import './WalletPanel.css'

const DashboardCanvas = lazy(() => import('../Dashboard/DashboardCanvas').then((m) => ({ default: m.DashboardCanvas })))
const RicoMapsPanel = lazy(() => import('../RicoMaps/RicoMapsPanel').then((m) => ({ default: m.RicoMapsPanel })))

const WALLET_TABS = [
  { id: 'wallet', label: 'Wallet' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'forensics', label: 'Forensics' },
] as const
type WalletView = (typeof WALLET_TABS)[number]['id']

export function WalletPanel() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const dashboard = useWalletStore((s) => s.dashboard)
  const loading = useWalletStore((s) => s.loading)
  const pendingSubView = useUIStore((s) => s.pendingSubView)
  const setPendingSubView = useUIStore((s) => s.setPendingSubView)
  const [view, setView] = useState<WalletView>('wallet')

  useEffect(() => {
    if (!pendingSubView) return
    if (WALLET_TABS.some((t) => t.id === pendingSubView)) {
      setView(pendingSubView as WalletView)
      setPendingSubView(null)
    }
  }, [pendingSubView, setPendingSubView])

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

  const walletContent = () => {
    if (!dashboard && loading) {
      return (
        <div className={workspaceStyles.statusWrap}>
          <div className={workspaceStyles.statusInner}>
            <div className={workspaceStyles.statusTitle}>Loading wallet data…</div>
            <div className={workspaceStyles.statusCopy}>Fetching balances, holdings, and activity.</div>
          </div>
        </div>
      )
    }
    if (!dashboard) {
      return (
        <EmptyState
          title="Failed to load wallet data"
          description="Check your network connection and Helius configuration."
          action={<Button size="sm" onClick={() => void load()}>Retry</Button>}
        />
      )
    }
    return <WalletWorkspace onRefresh={load} />
  }

  return (
    <PackHostShell
      kicker="Wallet pack"
      title="Wallet"
      subtitle="Wallets, portfolio, and on-chain forensics."
      tabs={WALLET_TABS.map((t) => ({ id: t.id, label: t.label }))}
      activeId={view}
      onChange={setView}
    >
      <div className="wallet-panel">
        {view === 'wallet' && walletContent()}
        {view === 'portfolio' && (
          <Suspense fallback={<div className={workspaceStyles.statusWrap}><div className={workspaceStyles.statusInner}><div className={workspaceStyles.statusTitle}>Loading portfolio…</div></div></div>}>
            <DashboardCanvas />
          </Suspense>
        )}
        {view === 'forensics' && (
          <Suspense fallback={<div className={workspaceStyles.statusWrap}><div className={workspaceStyles.statusInner}><div className={workspaceStyles.statusTitle}>Loading forensics…</div></div></div>}>
            <RicoMapsPanel />
          </Suspense>
        )}
      </div>
    </PackHostShell>
  )
}
