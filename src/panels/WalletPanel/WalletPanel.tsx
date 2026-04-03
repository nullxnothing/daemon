import { useCallback, useEffect, useRef, useState } from 'react'
import { useUIStore } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import { WalletSettings } from './WalletSettings'
import { WalletSendForm } from './WalletSendForm'
import { WalletExportKey } from './WalletExportKey'
import { AgentWalletSection } from './AgentWalletSection'
import { TransactionHistory } from './TransactionHistory'
import { WalletReceiveView } from './WalletReceiveView'
import { WalletSwapForm } from './WalletSwapForm'
import './WalletPanel.css'

export function WalletPanel() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const dashboard = useWalletStore((s) => s.dashboard)
  const showMarketTape = useWalletStore((s) => s.showMarketTape)
  const showTitlebarWallet = useWalletStore((s) => s.showTitlebarWallet)
  const loading = useWalletStore((s) => s.loading)
  const agentWallets = useWalletStore((s) => s.agentWallets)
  const transactions = useWalletStore((s) => s.transactions)
  const setStoreShowMarketTape = useWalletStore((s) => s.setShowMarketTape)
  const setStoreShowTitlebarWallet = useWalletStore((s) => s.setShowTitlebarWallet)
  const activeView = useWalletStore((s) => s.activeView)
  const setActiveView = useWalletStore((s) => s.setActiveView)

  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [genSuccess, setGenSuccess] = useState<string | null>(null)

  // Send form state
  const [sendWalletId, setSendWalletId] = useState<string | null>(null)
  const [sendMode, setSendMode] = useState<'sol' | 'token' | null>(null)
  const [sendDest, setSendDest] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [sendMint, setSendMint] = useState('')
  const [sendLoading, setSendLoading] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  // Keypair cache: walletId -> boolean
  const [keypairCache, setKeypairCache] = useState<Record<string, boolean>>({})

  // Export key state
  const [revealKeyId, setRevealKeyId] = useState<string | null>(null)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [exportConfirmId, setExportConfirmId] = useState<string | null>(null)
  const [exportConfirmText, setExportConfirmText] = useState('')

  // Ref-based mutex for send — prevents double-submit across rapid clicks
  const sendLockRef = useRef(false)

  // Send confirmation state
  const [pendingSend, setPendingSend] = useState<{
    walletId: string
    mode: 'sol' | 'token'
    dest: string
    amount: number
    mint?: string
  } | null>(null)

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

  // Auto-open send form when navigating from QuickView
  useEffect(() => {
    if (activeView === 'send' && dashboard?.activeWallet && !sendWalletId) {
      const walletId = dashboard.activeWallet.id
      setSendWalletId(walletId)
      setSendMode('sol')
      setSendDest('')
      setSendAmount('')
      setSendMint('')
      setSendResult(null)
      setSendError(null)
    }
  }, [activeView, dashboard?.activeWallet, sendWalletId])

  useEffect(() => {
    if (!dashboard?.wallets) return
    const check = async () => {
      const cache: Record<string, boolean> = {}
      for (const w of dashboard.wallets) {
        try {
          const res = await window.daemon.wallet.hasKeypair(w.id)
          cache[w.id] = res.ok && res.data === true
        } catch {
          cache[w.id] = false
        }
      }
      setKeypairCache(cache)
    }
    void check()
  }, [dashboard?.wallets])

  // --- IPC handlers ---

  const handleAddWallet = async (name: string, address: string) => {
    setError(null)
    const res = await window.daemon.wallet.create({ name, address })
    if (res.ok) { await load(); return }
    setError(res.error ?? 'Failed to add wallet')
  }

  const handleGenerate = async (name: string) => {
    setError(null)
    setGenSuccess(null)
    const res = await window.daemon.wallet.generate({ name })
    if (res.ok && res.data) { setGenSuccess(res.data.address); await load(); return }
    setError(res.error ?? 'Failed to generate wallet')
  }

  const handleSaveHelius = async (key: string) => {
    setError(null)
    const res = await window.daemon.wallet.storeHeliusKey(key)
    if (res.ok) { await load(); return }
    setError(res.error ?? 'Failed to save Helius key')
  }

  const handleDeleteHelius = async () => {
    setError(null)
    const res = await window.daemon.wallet.deleteHeliusKey()
    if (res.ok) { await load(); return }
    setError(res.error ?? 'Failed to delete Helius key')
  }

  const handleSetDefault = async (walletId: string) => {
    setError(null)
    const res = await window.daemon.wallet.setDefault(walletId)
    if (res.ok) await load()
    else setError(res.error ?? 'Failed to set default wallet')
  }

  const handleAssignProject = async (walletId: string) => {
    if (!activeProjectId) return
    setError(null)
    const res = await window.daemon.wallet.assignProject(activeProjectId, walletId)
    if (res.ok) await load()
    else setError(res.error ?? 'Failed to assign wallet to project')
  }

  const handleDeleteWallet = async (walletId: string) => {
    setError(null)
    const res = await window.daemon.wallet.delete(walletId)
    if (res.ok) await load()
    else setError(res.error ?? 'Failed to remove wallet')
  }

  const handleToggleTape = async (checked: boolean) => {
    await setStoreShowMarketTape(checked)
  }

  const handleToggleTitlebarWallet = async (checked: boolean) => {
    await setStoreShowTitlebarWallet(checked)
  }

  const handleConfirmSend = (fromWalletId: string) => {
    setSendError(null)
    setSendResult(null)
    const amount = parseFloat(sendAmount)
    if (sendMode === 'sol') {
      if (!sendDest.trim() || isNaN(amount) || amount <= 0) { setSendError('Invalid destination or amount'); return }
      setPendingSend({ walletId: fromWalletId, mode: 'sol', dest: sendDest.trim(), amount })
    } else {
      if (!sendDest.trim() || !sendMint.trim() || isNaN(amount) || amount <= 0) { setSendError('Invalid destination, mint, or amount'); return }
      setPendingSend({ walletId: fromWalletId, mode: 'token', dest: sendDest.trim(), amount, mint: sendMint.trim() })
    }
  }

  const handleExecuteSend = async () => {
    if (!pendingSend) return
    if (sendLockRef.current) return
    sendLockRef.current = true
    setSendLoading(true)
    setSendError(null)

    try {
      if (pendingSend.mode === 'sol') {
        const res = await window.daemon.wallet.sendSol({ fromWalletId: pendingSend.walletId, toAddress: pendingSend.dest, amountSol: pendingSend.amount })
        setPendingSend(null)
        if (res.ok && res.data) { setSendResult(res.data.signature); setSendDest(''); setSendAmount(''); await load() }
        else { setSendError(res.error ?? 'Send failed') }
      } else {
        const res = await window.daemon.wallet.sendToken({ fromWalletId: pendingSend.walletId, toAddress: pendingSend.dest, mint: pendingSend.mint!, amount: pendingSend.amount })
        setPendingSend(null)
        if (res.ok && res.data) { setSendResult(res.data.signature); setSendDest(''); setSendAmount(''); setSendMint(''); await load() }
        else { setSendError(res.error ?? 'Send failed') }
      }
    } finally {
      setSendLoading(false)
      sendLockRef.current = false
    }
  }

  const handleCancelSend = () => { setPendingSend(null) }

  const handleExportKeyStart = (walletId: string) => {
    setExportConfirmId(walletId)
    setExportConfirmText('')
    setRevealKeyId(null)
    setRevealedKey(null)
  }

  const handleExportKeyConfirm = async () => {
    if (!exportConfirmId || exportConfirmText !== 'EXPORT') return
    const res = await window.daemon.wallet.exportPrivateKey(exportConfirmId)
    if (res.ok && res.data) {
      setRevealKeyId(exportConfirmId)
      setRevealedKey(res.data)
      setExportConfirmId(null)
      setExportConfirmText('')
      setTimeout(() => { setRevealKeyId(null); setRevealedKey(null) }, 5_000)
    } else {
      setError(res.error ?? 'Failed to export key')
      setExportConfirmId(null)
      setExportConfirmText('')
    }
  }

  const handleExportCancel = () => {
    setExportConfirmId(null)
    setExportConfirmText('')
  }

  const openSend = (walletId: string, mode: 'sol' | 'token') => {
    setSendWalletId(walletId)
    setSendMode(mode)
    setSendDest('')
    setSendAmount('')
    setSendMint('')
    setSendResult(null)
    setSendError(null)
  }

  const closeSend = () => {
    setSendWalletId(null)
    setSendMode(null)
    if (activeView === 'send') setActiveView('overview')
  }

  const handleFundAgent = (agentWalletAddress: string) => {
    const defaultWallet = dashboard?.wallets.find((w) => w.isDefault)
    if (!defaultWallet) return
    setSendWalletId(defaultWallet.id)
    setSendMode('sol')
    setSendDest(agentWalletAddress)
    setSendAmount('')
    setSendResult(null)
    setSendError(null)
  }

  const handleCreateAgentWallet = async (agentId: string, name: string) => {
    setError(null)
    const res = await window.daemon.wallet.createAgentWallet(agentId, name)
    if (res.ok) { await useWalletStore.getState().loadAgentWallets() }
    else { setError(res.error ?? 'Failed to create agent wallet') }
  }

  const handleLoadAgents = async (): Promise<Array<{ id: string; name: string }>> => {
    try {
      const res = await window.daemon.agents.list()
      if (res.ok && res.data) return res.data.map((a) => ({ id: a.id, name: a.name }))
    } catch { /* ignore */ }
    return []
  }

  /** Renders export key + send form inline within a wallet row */
  const renderWalletInline = (walletId: string) => (
    <>
      <WalletExportKey
        walletId={walletId}
        exportConfirmId={exportConfirmId}
        exportConfirmText={exportConfirmText}
        revealKeyId={revealKeyId}
        revealedKey={revealedKey}
        onConfirmTextChange={setExportConfirmText}
        onConfirm={handleExportKeyConfirm}
        onCancel={handleExportCancel}
      />
      {sendWalletId === walletId && sendMode && (
        <WalletSendForm
          walletId={walletId}
          sendMode={sendMode}
          sendDest={sendDest}
          sendAmount={sendAmount}
          sendMint={sendMint}
          sendLoading={sendLoading}
          sendError={sendError}
          sendResult={sendResult}
          pendingSend={pendingSend}
          onDestChange={setSendDest}
          onAmountChange={setSendAmount}
          onMintChange={setSendMint}
          onConfirmSend={handleConfirmSend}
          onExecuteSend={handleExecuteSend}
          onCancelSend={handleCancelSend}
          onClose={closeSend}
        />
      )}
    </>
  )

  // --- Loading / empty states ---

  if (!dashboard && loading) {
    return (
      <div className="wallet-panel">
        <div className="panel-header">Wallet</div>
        <div className="wallet-empty">Loading wallet data...</div>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="wallet-panel">
        <div className="panel-header">Wallet</div>
        <div className="wallet-empty">Wallet data unavailable</div>
      </div>
    )
  }

  // Resolve the active wallet for sub-views
  const activeWallet = dashboard.activeWallet
  const activeWalletMeta = dashboard.wallets.find((w) => w.id === activeWallet?.id)
  const hasKeypair = activeWalletMeta ? keypairCache[activeWalletMeta.id] === true : false

  // Render sub-views (send, swap, receive) when activeView is set
  if (activeView === 'receive' && activeWallet) {
    return (
      <div className="wallet-panel">
        <div className="panel-header wallet-panel-header">
          <span>Wallet</span>
        </div>
        <WalletReceiveView
          address={activeWallet.address}
          walletName={activeWallet.name}
          onBack={() => setActiveView('overview')}
        />
      </div>
    )
  }

  if (activeView === 'swap' && activeWallet && hasKeypair) {
    return (
      <div className="wallet-panel">
        <div className="panel-header wallet-panel-header">
          <span>Wallet</span>
        </div>
        <WalletSwapForm
          walletId={activeWallet.id}
          walletName={activeWallet.name}
          holdings={activeWallet.holdings}
          onBack={() => setActiveView('overview')}
          onRefresh={load}
        />
      </div>
    )
  }

  // When navigating to send view from QuickView, auto-open the inline send form
  // for the active wallet. The send form renders inline in the overview below.
  // We use useEffect-style guard: the button handler already calls openSend + setActiveView.

  return (
    <div className="wallet-panel">
      <div className="panel-header wallet-panel-header">
        <span>Wallet</span>
        <button className="wallet-icon-btn" onClick={() => setShowSettings((value) => !value)}>
          {showSettings ? 'Close' : 'Settings'}
        </button>
      </div>

      <section className="wallet-section">
        <div className="wallet-section-title">Portfolio</div>
        <div className="wallet-total">${formatUsd(dashboard.portfolio.totalUsd)}</div>
        <div className={`wallet-delta ${dashboard.portfolio.delta24hUsd >= 0 ? 'up' : 'down'}`}>
          {dashboard.portfolio.delta24hUsd >= 0 ? '+' : '-'}${formatUsd(Math.abs(dashboard.portfolio.delta24hUsd))} · {formatPct(dashboard.portfolio.delta24hPct)}
          <span className="wallet-delta-timeframe">24h</span>
        </div>
        <div className="wallet-caption">{dashboard.portfolio.walletCount} wallet{dashboard.portfolio.walletCount !== 1 ? 's' : ''} tracked</div>

        {/* Quick action buttons */}
        {activeWallet && (
          <div className="wallet-quick-actions">
            <button
              className={`wallet-action-btn ${activeView === 'send' ? 'active' : ''}`}
              onClick={() => {
                if (hasKeypair) {
                  openSend(activeWallet.id, 'sol')
                  setActiveView('send')
                }
              }}
              disabled={!hasKeypair}
              title={hasKeypair ? 'Send SOL or tokens' : 'No keypair — watch-only wallet'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
              Send
            </button>
            <button
              className={`wallet-action-btn ${activeView === 'swap' ? 'active' : ''}`}
              onClick={() => { if (hasKeypair) setActiveView('swap') }}
              disabled={!hasKeypair}
              title={hasKeypair ? 'Swap tokens via Jupiter' : 'No keypair — watch-only wallet'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
              Swap
            </button>
            <button
              className="wallet-action-btn"
              onClick={() => setActiveView('receive')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
              Receive
            </button>
          </div>
        )}
      </section>

      {/* Inline send form when triggered from quick actions */}
      {activeView === 'send' && activeWallet && hasKeypair && (
        <section className="wallet-section">
          <div className="wallet-view-header">
            <div className="wallet-section-title" style={{ margin: 0 }}>Send from {activeWallet.name}</div>
          </div>
          <div className="wallet-swap-field" style={{ marginBottom: 6 }}>
            <label className="wallet-caption">Mode</label>
            <div className="wallet-actions">
              <button
                className={`wallet-btn ${sendMode === 'sol' ? 'primary' : ''}`}
                onClick={() => openSend(activeWallet.id, 'sol')}
              >SOL</button>
              <button
                className={`wallet-btn ${sendMode === 'token' ? 'primary' : ''}`}
                onClick={() => openSend(activeWallet.id, 'token')}
              >Token</button>
            </div>
          </div>
          {sendWalletId === activeWallet.id && sendMode && (
            <WalletSendForm
              walletId={activeWallet.id}
              sendMode={sendMode}
              sendDest={sendDest}
              sendAmount={sendAmount}
              sendMint={sendMint}
              sendLoading={sendLoading}
              sendError={sendError}
              sendResult={sendResult}
              pendingSend={pendingSend}
              onDestChange={setSendDest}
              onAmountChange={setSendAmount}
              onMintChange={setSendMint}
              onConfirmSend={handleConfirmSend}
              onExecuteSend={handleExecuteSend}
              onCancelSend={handleCancelSend}
              onClose={closeSend}
            />
          )}
        </section>
      )}

      {showSettings && (
        <WalletSettings
          showMarketTape={showMarketTape}
          showTitlebarWallet={showTitlebarWallet}
          heliusConfigured={dashboard.heliusConfigured}
          wallets={dashboard.wallets}
          keypairCache={keypairCache}
          activeProjectId={activeProjectId}
          error={error}
          genSuccess={genSuccess}
          onToggleTape={handleToggleTape}
          onToggleTitlebarWallet={handleToggleTitlebarWallet}
          onSaveHelius={handleSaveHelius}
          onDeleteHelius={handleDeleteHelius}
          onAddWallet={handleAddWallet}
          onGenerateWallet={handleGenerate}
          onClearGenSuccess={() => setGenSuccess(null)}
          onSetDefault={handleSetDefault}
          onAssignProject={handleAssignProject}
          onDeleteWallet={handleDeleteWallet}
          onOpenSend={openSend}
          onExportKeyStart={handleExportKeyStart}
          renderWalletInline={renderWalletInline}
        />
      )}

      <AgentWalletSection
        agentWallets={agentWallets}
        sendWalletId={sendWalletId}
        sendMode={sendMode}
        sendDest={sendDest}
        sendAmount={sendAmount}
        sendLoading={sendLoading}
        sendError={sendError}
        sendResult={sendResult}
        pendingSend={pendingSend}
        showSettings={showSettings}
        onFundAgent={handleFundAgent}
        onAmountChange={setSendAmount}
        onConfirmSend={handleConfirmSend}
        onExecuteSend={handleExecuteSend}
        onCancelSend={handleCancelSend}
        onCloseSend={closeSend}
        onCreateAgentWallet={handleCreateAgentWallet}
        onLoadAgents={handleLoadAgents}
      />

      {dashboard.feed.length > 0 && (
        <section className="wallet-section">
          <div className="wallet-section-title">Live Feed</div>
          {dashboard.feed.slice(0, 5).map((entry) => (
            <div key={entry.walletId} className="wallet-feed-row">
              <span className="wallet-feed-name">{entry.walletName}</span>
              <span className={`wallet-feed-delta ${entry.deltaUsd >= 0 ? 'up' : 'down'}`}>
                {entry.deltaUsd >= 0 ? '+' : '-'}${formatUsd(Math.abs(entry.deltaUsd))}
              </span>
            </div>
          ))}
        </section>
      )}

      {dashboard.activeWallet && (
        <section className="wallet-section">
          <div className="wallet-section-title">{dashboard.activeWallet.name}</div>
          <div className="wallet-holdings">
            {dashboard.activeWallet.holdings.map((holding) => (
              <div key={holding.mint} className="wallet-holding-row">
                <div>
                  <div className="wallet-label">{holding.symbol}</div>
                  <div className="wallet-caption">{holding.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                </div>
                <div className="wallet-holding-value">
                  <div>${formatUsd(holding.valueUsd)}</div>
                  {holding.priceUsd >= 0.01 ? (
                    <div className="wallet-caption">${formatUsd(holding.priceUsd)}</div>
                  ) : holding.priceUsd > 0 ? (
                    <div className="wallet-caption">${formatMicroPrice(holding.priceUsd)}</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {transactions && transactions.length > 0 && (
        <TransactionHistory transactions={transactions} />
      )}

      {dashboard.recentActivity.length > 0 && (
        <section className="wallet-section">
          <div className="wallet-section-title">Recent Activity</div>
          {dashboard.recentActivity.slice(0, 6).map((event) => (
            <div key={event.signature} className="wallet-activity-row">
              <div className="wallet-label">{event.type ?? 'Transaction'}</div>
              <div className="wallet-caption">{event.description ?? shortSignature(event.signature)}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: value >= 1000 ? 0 : 2, maximumFractionDigits: 2 })
}

function formatMicroPrice(value: number): string {
  if (value === 0) return '0'
  // Show enough decimals so the first non-zero digit is visible
  const decimals = Math.max(2, -Math.floor(Math.log10(Math.abs(value))) + 2)
  return value.toFixed(Math.min(decimals, 10))
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '-'
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

function shortSignature(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-8)}`
}
