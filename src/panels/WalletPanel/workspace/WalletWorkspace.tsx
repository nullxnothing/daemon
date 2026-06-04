import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUIStore } from '../../../store/ui'
import { useWalletStore } from '../../../store/wallet'
import { useNotificationsStore } from '../../../store/notifications'
import { useWorkflowShellStore } from '../../../store/workflowShell'
import { Icon } from './icons'
import { StatusDot } from '../../../components/Panel/StatusDot'
import { fmtUsd, fmtUsdCompact, fmtPct, fmtAmount, shortAddr, TokGlyph } from './helpers'
import { SendSheet } from './sheets/SendSheet'
import { ReceiveSheet } from './sheets/ReceiveSheet'
import { SwapSheet } from './sheets/SwapSheet'
import { AddWalletSheet } from './sheets/AddWalletSheet'
import { ManageWalletSheet } from './sheets/ManageWalletSheet'
import { BuySheet } from './sheets/BuySheet'
import { getSolscanTxLabel, getSolscanTxUrl } from '../../../lib/solanaExplorer'
import styles from './WalletWorkspace.module.css'

type Scope = 'wallets' | 'agents'
type WorkTab = 'holdings' | 'activity'
type SheetState =
  | { type: 'send'; walletId: string }
  | { type: 'swap'; walletId: string }
  | { type: 'receive'; walletId: string }
  | { type: 'buy'; walletId: string }
  | { type: 'add' }
  | { type: 'manage'; walletId: string }
  | null

interface Props {
  onRefresh: () => Promise<void>
}

interface SidebarWallet {
  id: string
  name: string
  address: string
  totalUsd: number
  isDefault: boolean
  isAgent: boolean
}

export function WalletWorkspace({ onRefresh }: Props) {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const dashboard = useWalletStore((s) => s.dashboard)!
  const agentWallets = useWalletStore((s) => s.agentWallets)
  const transactions = useWalletStore((s) => s.transactions)
  const drawerFullscreen = useWorkflowShellStore((s) => s.drawerFullscreen)
  const toggleDrawerFullscreen = useWorkflowShellStore((s) => s.toggleDrawerFullscreen)
  const pushSuccess = useNotificationsStore((s) => s.pushSuccess)
  const pushError = useNotificationsStore((s) => s.pushError)

  const [scope, setScope] = useState<Scope>('wallets')
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<WorkTab>('holdings')
  const [sheet, setSheet] = useState<SheetState>(null)
  const [selectedId, setSelectedId] = useState<string | null>(dashboard.activeWallet?.id ?? null)
  const [keypairCache, setKeypairCache] = useState<Record<string, boolean>>({})
  const [cluster, setCluster] = useState<WalletInfrastructureSettings['cluster']>('devnet')
  const [executionMode, setExecutionMode] = useState<WalletInfrastructureSettings['executionMode']>('rpc')
  const executionLabel = executionMode === 'jito' ? 'Jito path' : 'Standard RPC'

  // Sidebar lists ------------------------------------------------------------
  const walletList = useMemo<SidebarWallet[]>(
    () =>
      dashboard.wallets.map((w) => ({
        id: w.id,
        name: w.name,
        address: w.address,
        totalUsd: w.totalUsd,
        isDefault: w.isDefault,
        isAgent: false,
      })),
    [dashboard.wallets],
  )

  const agentList = useMemo<SidebarWallet[]>(
    () =>
      (agentWallets ?? []).map((w) => {
        const meta = dashboard.wallets.find((dw) => dw.id === w.id)
        return {
          id: w.id,
          name: w.name,
          address: w.address,
          totalUsd: meta?.totalUsd ?? 0,
          isDefault: meta?.isDefault ?? false,
          isAgent: true,
        }
      }),
    [agentWallets, dashboard.wallets],
  )

  const activeList = scope === 'agents' ? agentList : walletList
  const filteredList = useMemo(
    () => activeList.filter((w) => w.name.toLowerCase().includes(query.toLowerCase())),
    [activeList, query],
  )
  const scopeTotal = filteredList.reduce((sum, w) => sum + w.totalUsd, 0)

  // Selected wallet resolution ----------------------------------------------
  const selectedMeta =
    dashboard.wallets.find((w) => w.id === selectedId) ?? null
  const selectedAgent = (agentWallets ?? []).find((w) => w.id === selectedId) ?? null
  const isSelectedActive = dashboard.activeWallet?.id === selectedId

  // Holdings come from the dashboard active wallet, or are fetched on demand
  // for any other selected wallet/agent.
  const [onDemandHoldings, setOnDemandHoldings] = useState<
    Record<string, Array<{ mint: string; symbol: string; name: string; amount: number; priceUsd: number; valueUsd: number; logoUri: string | null }>>
  >({})

  const holdings = isSelectedActive
    ? dashboard.activeWallet?.holdings ?? []
    : (selectedId ? onDemandHoldings[selectedId] ?? [] : [])

  const selectedName = selectedMeta?.name ?? selectedAgent?.name ?? 'No wallet selected'
  const selectedAddress = selectedMeta?.address ?? selectedAgent?.address ?? ''
  const selectedUsd = selectedMeta?.totalUsd ?? agentList.find((a) => a.id === selectedId)?.totalUsd ?? 0
  const selectedIsAgent = Boolean(selectedAgent)
  const selectedIsDefault = selectedMeta?.isDefault ?? false
  const canSign = selectedId ? keypairCache[selectedId] === true : false

  // Effects ------------------------------------------------------------------
  useEffect(() => {
    void window.daemon.settings.getWalletInfrastructureSettings().then((res) => {
      if (res.ok && res.data) {
        setCluster(res.data.cluster)
        setExecutionMode(res.data.executionMode)
      }
    }).catch(() => {})
  }, [])

  // Default selection follows the dashboard's active wallet, falling back to the
  // first tracked wallet (or agent) so the workspace shows a wallet whenever one
  // exists — even if none is marked active/default yet.
  useEffect(() => {
    if (selectedId) return
    const fallback = dashboard.activeWallet?.id ?? walletList[0]?.id ?? agentList[0]?.id ?? null
    if (fallback) setSelectedId(fallback)
  }, [dashboard.activeWallet?.id, selectedId, walletList, agentList])

  const walletIdsFingerprint = useMemo(
    () => [...walletList, ...agentList].map((w) => w.id).join('|'),
    [walletList, agentList],
  )

  useEffect(() => {
    let cancelled = false
    const ids = [...new Set([...walletList, ...agentList].map((w) => w.id))]
    void (async () => {
      const cache: Record<string, boolean> = {}
      for (const id of ids) {
        try {
          const res = await window.daemon.wallet.hasKeypair(id)
          cache[id] = res.ok && res.data === true
        } catch {
          cache[id] = false
        }
      }
      if (!cancelled) setKeypairCache(cache)
    })()
    return () => { cancelled = true }
  }, [walletIdsFingerprint])

  // Fetch holdings for a non-active selected wallet.
  useEffect(() => {
    if (!selectedId || isSelectedActive || onDemandHoldings[selectedId]) return
    let cancelled = false
    const id = selectedId
    void window.daemon.wallet.holdings(id).then((res) => {
      if (cancelled || !res.ok || !res.data) return
      const data = res.data
      setOnDemandHoldings((prev) => ({ ...prev, [id]: data }))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [selectedId, isSelectedActive, onDemandHoldings])

  // Reset to holdings tab when switching wallets.
  useEffect(() => { setTab('holdings') }, [selectedId])

  // When switching scope, select first item of that scope.
  useEffect(() => {
    if (filteredList.length === 0) return
    if (!filteredList.some((w) => w.id === selectedId)) {
      setSelectedId(filteredList[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  // Actions ------------------------------------------------------------------
  const copyAddress = useCallback(async (address: string, name: string) => {
    const res = await window.daemon.env.copyValue(address)
    if (res.ok) pushSuccess(`${name} address copied`, 'Wallet')
    else pushError(res.error ?? 'Failed to copy address', 'Wallet')
  }, [pushSuccess, pushError])

  const handleSetDefault = useCallback(async (walletId: string) => {
    const res = await window.daemon.wallet.setDefault(walletId)
    if (res.ok) { pushSuccess('Default wallet updated', 'Wallet'); await onRefresh() }
    else pushError(res.error ?? 'Failed to set default wallet', 'Wallet')
  }, [onRefresh, pushSuccess, pushError])

  const handleAssignProject = useCallback(async (walletId: string) => {
    if (!activeProjectId) return
    const res = await window.daemon.wallet.assignProject(activeProjectId, walletId)
    if (res.ok) { pushSuccess('Project wallet updated', 'Wallet'); await onRefresh() }
    else pushError(res.error ?? 'Failed to assign wallet', 'Wallet')
  }, [activeProjectId, onRefresh, pushSuccess, pushError])

  const handleDeleteWallet = useCallback(async (walletId: string) => {
    const res = await window.daemon.wallet.delete(walletId)
    if (res.ok) {
      pushSuccess('Wallet removed', 'Wallet')
      if (selectedId === walletId) setSelectedId(dashboard.activeWallet?.id ?? null)
      await onRefresh()
    } else pushError(res.error ?? 'Failed to remove wallet', 'Wallet')
  }, [dashboard.activeWallet?.id, onRefresh, pushError, pushSuccess, selectedId])

  const sheetWallet = useMemo(() => {
    const id = sheet && 'walletId' in sheet ? sheet.walletId : null
    if (!id) return null
    const meta = dashboard.wallets.find((w) => w.id === id)
    const agent = (agentWallets ?? []).find((w) => w.id === id)
    const name = meta?.name ?? agent?.name ?? 'Wallet'
    const address = meta?.address ?? agent?.address ?? ''
    const wHoldings = dashboard.activeWallet?.id === id
      ? dashboard.activeWallet.holdings
      : onDemandHoldings[id] ?? []
    return {
      id,
      name,
      address,
      totalUsd: meta?.totalUsd ?? agentList.find((a) => a.id === id)?.totalUsd ?? 0,
      isDefault: meta?.isDefault ?? false,
      isAgent: Boolean(agent),
      canSign: keypairCache[id] === true,
      holdings: wHoldings,
    }
  }, [sheet, dashboard, agentWallets, onDemandHoldings, agentList, keypairCache])

  // Render -------------------------------------------------------------------
  const delta = dashboard.portfolio.delta24hUsd
  const deltaPositive = delta >= 0

  return (
    <div className={styles.root}>
      <div className={styles.workspace}>
        {/* SIDEBAR */}
        <aside className={styles.sidebar}>
          <div className={styles.sideSeg}>
            <button
              className={`${styles.sideSegBtn}${scope === 'wallets' ? ' ' + styles.sideSegBtnOn : ''}`}
              onClick={() => setScope('wallets')}
            >
              Wallets <span className={`${styles.mono} ${styles.count}`}>{walletList.length}</span>
            </button>
            <button
              className={`${styles.sideSegBtn}${scope === 'agents' ? ' ' + styles.sideSegBtnOn : ''}`}
              onClick={() => setScope('agents')}
            >
              Agents <span className={`${styles.mono} ${styles.count}`}>{agentList.length}</span>
            </button>
          </div>

          <div className={styles.sideSearch}>
            <Icon name="search" size={14} style={{ color: 'var(--t3)' }} />
            <input
              placeholder={scope === 'agents' ? 'Find agent…' : 'Find wallet…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search wallets"
            />
          </div>

          <div className={styles.sideList}>
            {filteredList.map((w) => (
              <div
                key={w.id}
                className={`${styles.wcard}${w.id === selectedId ? ' ' + styles.wcardActive : ''}`}
                onClick={() => setSelectedId(w.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(w.id) } }}
              >
                <span className={styles.wcardBar} />
                <div className={styles.wcardMain}>
                  <div className={styles.wcardTop}>
                    <span className={styles.wcardName}>{w.name}</span>
                    {w.isDefault && <span className={`${styles.tag} ${styles.tagGreen}`}>MAIN</span>}
                    {w.isAgent && <span className={styles.tag}>AGENT</span>}
                  </div>
                  <div className={`${styles.wcardSub} ${styles.mono}`}>{shortAddr(w.address)}</div>
                </div>
                <div className={styles.wcardRight}>
                  <span className={`${styles.wcardBal} ${styles.mono}`}>{fmtUsdCompact(w.totalUsd)}</span>
                  <button
                    className={styles.wcardMore}
                    onClick={(e) => { e.stopPropagation(); setSheet({ type: 'manage', walletId: w.id }) }}
                    aria-label={`Manage ${w.name}`}
                  >
                    <Icon name="more" size={16} />
                  </button>
                </div>
              </div>
            ))}
            {filteredList.length === 0 && (
              <div className={`${styles.sideEmpty} ${styles.mono}`}>
                No {scope} {query ? `match “${query}”.` : 'yet.'}
              </div>
            )}
          </div>

          <div className={styles.sideFoot}>
            <div className={styles.sideTotal}>
              <span className={styles.label}>{scope === 'agents' ? 'Agent total' : 'Wallets total'}</span>
              <span className={`${styles.sideTotalV} ${styles.mono}`}>{fmtUsd(scopeTotal)}</span>
            </div>
            <button className={`${styles.btn} ${styles.addBtn}`} onClick={() => setSheet({ type: 'add' })}>
              <Icon name="plus" size={14} /> {scope === 'agents' ? 'Create agent wallet' : 'Add wallet'}
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main className={styles.main}>
          {selectedId ? (
            <>
              <div className={styles.hero} data-testid="wallet-hero">
                <div className={styles.heroTop}>
                  <div className={styles.heroId}>
                    <span className={`${styles.label} ${styles.heroEyebrow}`}>
                      {selectedIsAgent ? 'Agent wallet' : isSelectedActive ? 'Active wallet' : 'Wallet'}
                    </span>
                    <div className={styles.heroNameRow}>
                      <h1 className={styles.heroName}>{selectedName}</h1>
                      {selectedIsDefault && <span className={`${styles.tag} ${styles.tagGreen}`}>MAIN</span>}
                      {selectedIsAgent && <span className={styles.tag}>AGENT</span>}
                    </div>
                    <div className={styles.heroMeta}>
                      <button
                        className={`${styles.heroAddr} ${styles.mono}`}
                        onClick={() => void copyAddress(selectedAddress, selectedName)}
                        disabled={!selectedAddress}
                      >
                        {shortAddr(selectedAddress)} <Icon name="copy" size={12.5} />
                      </button>
                      <span className={styles.heroMetaSep}>·</span>
                      {canSign ? (
                        <span className={styles.cansign}><StatusDot tone="success" pulse />Can sign</span>
                      ) : (
                        <span className={`${styles.cansign} ${styles.cansignWatch}`}><StatusDot tone="neutral" />Watch only</span>
                      )}
                    </div>
                  </div>
                  <button
                    className={styles.iconbtn}
                    style={{ marginLeft: 'auto' }}
                    onClick={toggleDrawerFullscreen}
                    aria-label={drawerFullscreen ? 'Collapse panel' : 'Expand panel'}
                    title={drawerFullscreen ? 'Collapse' : 'Expand'}
                  >
                    <Icon name={drawerFullscreen ? 'chev' : 'arrowR'} size={16} />
                  </button>
                  {!isSelectedActive && !selectedIsAgent && (
                    <button className={`${styles.btn} ${styles.useProject}`} onClick={() => void handleSetDefault(selectedId)}>
                      Use for this project
                    </button>
                  )}
                </div>

                <div className={styles.heroBal}>
                  <div className={`${styles.heroNum} ${styles.mono}`}>
                    {fmtUsd(isSelectedActive ? dashboard.portfolio.totalUsd : selectedUsd)}
                  </div>
                  {isSelectedActive && (
                    <div className={`${styles.heroDelta} ${styles.mono}`}>
                      <span className={deltaPositive ? styles.up : styles.down}>
                        {deltaPositive ? '+' : '-'}{fmtUsd(Math.abs(delta))}
                      </span>
                      <span className={deltaPositive ? styles.up : styles.down}>
                        {fmtPct(dashboard.portfolio.delta24hPct)}
                      </span>
                      <span className={styles.when}>24H</span>
                    </div>
                  )}
                </div>

                <div className={styles.acts}>
                  <button className={styles.act} onClick={() => setSheet({ type: 'send', walletId: selectedId })} disabled={!canSign}>
                    <Icon name="send" size={17} /><span>Send</span>
                  </button>
                  <button className={styles.act} onClick={() => setSheet({ type: 'swap', walletId: selectedId })} disabled={!canSign}>
                    <Icon name="swap" size={17} /><span>Swap</span>
                  </button>
                  <button className={styles.act} onClick={() => setSheet({ type: 'receive', walletId: selectedId })}>
                    <Icon name="receive" size={17} /><span>Receive</span>
                  </button>
                  <button className={styles.act} onClick={() => setSheet({ type: 'buy', walletId: selectedId })}>
                    <Icon name="card" size={17} /><span>Buy SOL</span>
                  </button>
                </div>
              </div>

              <div className={styles.tabs} data-testid="wallet-tabs">
                <button className={`${styles.tab}${tab === 'holdings' ? ' ' + styles.tabOn : ''}`} onClick={() => setTab('holdings')}>
                  Holdings <span className={`${styles.mono} ${styles.tcount}`}>{holdings.length}</span>
                </button>
                <button className={`${styles.tab}${tab === 'activity' ? ' ' + styles.tabOn : ''}`} onClick={() => setTab('activity')}>
                  Activity <span className={`${styles.mono} ${styles.tcount}`}>{isSelectedActive ? (transactions?.length ?? 0) : 0}</span>
                </button>
                <div className={styles.tabsSpacer} />
                <span className={`${styles.feedNote} ${styles.mono}`}>Confirmed · {cluster}</span>
              </div>

              <div className={styles.content}>
                {tab === 'holdings' ? (
                  <div className={styles.hsec}>
                    {holdings.length === 0 ? (
                      <div className={`${styles.empty} ${styles.mono}`}>No tokens in this wallet yet.</div>
                    ) : (
                      holdings.map((h) => (
                        <div key={h.mint} className={styles.hrow}>
                          <TokGlyph symbol={h.symbol} logoUri={h.logoUri} />
                          <div className={styles.hrowId}>
                            <span className={styles.hrowSym}>{h.symbol}</span>
                            <span className={styles.hrowName}>{h.name}</span>
                          </div>
                          <div className={styles.hrowAmt}>
                            <span className={`${styles.mono} ${styles.num}`}>{fmtAmount(h.amount)}</span>
                            <span className={`${styles.mono} usd`}>{fmtUsd(h.valueUsd)}</span>
                          </div>
                          {canSign && (
                            <div className={styles.hrowActs}>
                              <button className={`${styles.btn} ${styles.ghost} ${styles.sm}`} onClick={() => setSheet({ type: 'swap', walletId: selectedId })}>Swap</button>
                              <button className={`${styles.btn} ${styles.ghost} ${styles.sm}`} onClick={() => setSheet({ type: 'send', walletId: selectedId })}>Send</button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <ActivityList walletId={selectedId} isActive={isSelectedActive} cluster={cluster} />
                )}
              </div>
            </>
          ) : (
            <div className={styles.statusWrap}>
              <div className={styles.statusInner}>
                <div className={styles.statusTitle}>No wallet selected</div>
                <div className={styles.statusCopy}>Add a signing wallet or track an address to get started.</div>
                <button className={`${styles.btn} ${styles.primary}`} onClick={() => setSheet({ type: 'add' })}>
                  <Icon name="plus" size={14} /> Add wallet
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* SHEETS */}
      {sheet?.type === 'send' && sheetWallet && (
        <SendSheet
          wallet={sheetWallet}
          recipients={dashboard.wallets.filter((w) => w.id !== sheetWallet.id)}
          cluster={cluster}
          executionLabel={executionLabel}
          onClose={() => setSheet(null)}
          onDone={onRefresh}
        />
      )}
      {sheet?.type === 'swap' && sheetWallet && (
        <SwapSheet
          wallet={sheetWallet}
          executionMode={executionMode}
          cluster={cluster}
          onClose={() => setSheet(null)}
          onDone={onRefresh}
        />
      )}
      {sheet?.type === 'receive' && sheetWallet && (
        <ReceiveSheet wallet={sheetWallet} onClose={() => setSheet(null)} />
      )}
      {sheet?.type === 'buy' && sheetWallet && (
        <BuySheet wallet={sheetWallet} onClose={() => setSheet(null)} />
      )}
      {sheet?.type === 'add' && (
        <AddWalletSheet
          scope={scope}
          agentWallets={agentWallets ?? []}
          onClose={() => setSheet(null)}
          onDone={onRefresh}
        />
      )}
      {sheet?.type === 'manage' && sheetWallet && (
        <ManageWalletSheet
          wallet={sheetWallet}
          canAssignProject={Boolean(activeProjectId)}
          onClose={() => setSheet(null)}
          onReceive={() => setSheet({ type: 'receive', walletId: sheetWallet.id })}
          onSetDefault={() => handleSetDefault(sheetWallet.id)}
          onAssignProject={() => handleAssignProject(sheetWallet.id)}
          onDelete={() => handleDeleteWallet(sheetWallet.id)}
        />
      )}
    </div>
  )
}

// ─── Activity ───
function ActivityList({ walletId, isActive, cluster }: { walletId: string; isActive: boolean; cluster: WalletInfrastructureSettings['cluster'] }) {
  const transactions = useWalletStore((s) => s.transactions)
  const dashboard = useWalletStore((s) => s.dashboard)

  useEffect(() => {
    if (isActive) void useWalletStore.getState().loadTransactions(walletId)
  }, [walletId, isActive])

  if (!isActive) {
    return <div className={`${styles.empty} ${styles.mono}`}>Select this wallet as active to load its activity.</div>
  }

  const items = transactions ?? []
  if (items.length === 0) {
    return <div className={`${styles.empty} ${styles.mono}`}>No recent activity for this wallet.</div>
  }

  const iconFor = (type: string) => (type === 'receive' || type === 'deposit' ? 'receive' : type === 'swap' ? 'swap' : 'send')

  return (
    <div className={styles.asec}>
      {items.map((tx) => {
        const isReceive = tx.type === 'receive' || tx.type === 'deposit'
        const label = tx.type ? tx.type.charAt(0).toUpperCase() + tx.type.slice(1) : 'Transaction'
        const when = tx.created_at ? relativeTime(tx.created_at) : ''
        const href = tx.signature ? getSolscanTxUrl(tx.signature, cluster) : null
        return (
          <div key={tx.id} className={styles.arow}>
            <span className={`${styles.arowIc}${isReceive ? ' ' + styles.arowIcReceive : ''}`}>
              <Icon name={iconFor(tx.type)} size={15} />
            </span>
            <div className={styles.arowId}>
              <span className={styles.arowLabel}>{label}</span>
              <span className={`${styles.arowSub} ${styles.mono}`}>{shortAddr(tx.to_address || tx.from_address)}</span>
            </div>
            <div className={styles.arowAmt}>
              <span className={`${styles.mono} ${styles.num}${isReceive ? ' ' + styles.up : ''}`}>
                {isReceive ? '+' : '-'}{fmtAmount(Math.abs(tx.amount))}
              </span>
              {href && (
                <button className={styles.linkbtn} onClick={() => void window.daemon.shell.openExternal(href)}>
                  {getSolscanTxLabel(cluster)}
                </button>
              )}
            </div>
            <span className={`${styles.arowWhen} ${styles.mono}`}>{when}</span>
          </div>
        )
      })}
      {dashboard && dashboard.feed.length > 0 && (
        <div style={{ padding: '12px 32px 4px' }}>
          <span className={styles.label}>Live feed</span>
        </div>
      )}
    </div>
  )
}

function relativeTime(ts: number): string {
  const ms = Date.now() - ts
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  return `${Math.floor(hr / 24)}d`
}
