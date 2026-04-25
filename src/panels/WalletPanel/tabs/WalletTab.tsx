import { useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore } from '../../../store/ui'
import { useWalletStore } from '../../../store/wallet'
import { useNotificationsStore } from '../../../store/notifications'
import { WalletSettings } from '../WalletSettings'
import { WalletExportKey } from '../WalletExportKey'
import { TransactionHistory } from '../TransactionHistory'
import { WalletReceiveView } from '../WalletReceiveView'
import { WalletSwapForm } from '../WalletSwapForm'
import { VaultSection } from '../VaultSection'
import { PnlHoldings } from '../PnlHoldings'
import { WalletSendForm } from '../WalletSendForm'
import { buildSolanaRouteReadiness } from '../../../lib/solanaReadiness'

interface Props {
  onRefresh: () => Promise<void>
}

type ManageCreateTab = 'import' | 'generate'

export function WalletTab({ onRefresh }: Props) {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const dashboard = useWalletStore((s) => s.dashboard)!
  const showMarketTape = useWalletStore((s) => s.showMarketTape)
  const showTitlebarWallet = useWalletStore((s) => s.showTitlebarWallet)
  const transactions = useWalletStore((s) => s.transactions)
  const setStoreShowMarketTape = useWalletStore((s) => s.setShowMarketTape)
  const setStoreShowTitlebarWallet = useWalletStore((s) => s.setShowTitlebarWallet)
  const activeView = useWalletStore((s) => s.activeView)
  const setActiveView = useWalletStore((s) => s.setActiveView)
  const pushSuccess = useNotificationsStore((s) => s.pushSuccess)
  const pushError = useNotificationsStore((s) => s.pushError)

  const [showInfrastructure, setShowInfrastructure] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [genSuccess, setGenSuccess] = useState<string | null>(null)
  const [jupiterConfigured, setJupiterConfigured] = useState(false)
  const [walletInfrastructure, setWalletInfrastructure] = useState<WalletInfrastructureSettings>({
    rpcProvider: 'helius',
    quicknodeRpcUrl: '',
    customRpcUrl: '',
    swapProvider: 'jupiter',
    preferredWallet: 'phantom',
    executionMode: 'rpc',
    jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
  })

  const [createTab, setCreateTab] = useState<ManageCreateTab>('import')
  const [walletName, setWalletName] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [genName, setGenName] = useState('')

  const [sendWalletId, setSendWalletId] = useState<string | null>(null)
  const [sendMode, setSendMode] = useState<'sol' | 'token' | null>(null)
  const [sendDest, setSendDest] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [sendMint, setSendMint] = useState('')
  const [sendMax, setSendMax] = useState(false)
  const [selectedRecipientWalletId, setSelectedRecipientWalletId] = useState('')
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({})
  const [walletTokenOptions, setWalletTokenOptions] = useState<Record<string, Array<{ mint: string; symbol: string; amount: number }>>>({})
  const [sendLoading, setSendLoading] = useState(false)
  const [sendResult, setSendResult] = useState<WalletExecutionResult | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [keypairCache, setKeypairCache] = useState<Record<string, boolean>>({})
  const [revealKeyId, setRevealKeyId] = useState<string | null>(null)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [exportConfirmId, setExportConfirmId] = useState<string | null>(null)
  const [exportConfirmText, setExportConfirmText] = useState('')
  const [preferredSwapMint, setPreferredSwapMint] = useState<string | null>(null)
  const sendLockRef = useRef(false)
  const [pendingSend, setPendingSend] = useState<{
    walletId: string; mode: 'sol' | 'token'; dest: string; amount?: number; sendMax?: boolean; mint?: string
  } | null>(null)

  const activeWallet = dashboard.activeWallet
  const activeWalletMeta = dashboard.wallets.find((w) => w.id === activeWallet?.id)
  const hasKeypair = activeWalletMeta ? keypairCache[activeWalletMeta.id] === true : false
  const trackedWallets = dashboard.wallets
  const holdingsPreview = activeWallet?.holdings.slice(0, 4) ?? []
  const executionLabel = walletInfrastructure.executionMode === 'jito' ? 'Jito path' : 'Standard RPC'

  useEffect(() => {
    void Promise.all([
      window.daemon.wallet.hasJupiterKey(),
      window.daemon.settings.getWalletInfrastructureSettings(),
    ]).then(([jupiterRes, infraRes]) => {
      if (jupiterRes.ok) setJupiterConfigured(jupiterRes.data === true)
      if (infraRes.ok && infraRes.data) setWalletInfrastructure(infraRes.data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!dashboard.wallets) return
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
  }, [dashboard.wallets])

  useEffect(() => {
    if ((activeView === 'move' || activeView === 'overview') && activeWallet && !sendWalletId) {
      setSendWalletId(activeWallet.id)
      setSendMode('sol')
    }
  }, [activeView, activeWallet, sendWalletId])

  useEffect(() => {
    if (!sendWalletId) return
    const walletId = sendWalletId
    window.daemon.wallet.balance(sendWalletId).then((res) => {
      const data = res.data
      if (res.ok && data) {
        setWalletBalances((prev) => ({ ...prev, [walletId]: data.sol }))
      }
    }).catch(() => {})
  }, [sendWalletId, dashboard.wallets])

  useEffect(() => {
    if (!sendWalletId || sendMode !== 'token') return
    const existing = walletTokenOptions[sendWalletId]
    if (existing) {
      if (!sendMint) {
        const firstToken = existing.find((holding) => holding.amount > 0)
        if (firstToken) setSendMint(firstToken.mint)
      }
      return
    }

    let cancelled = false
    void window.daemon.wallet.holdings(sendWalletId).then((res) => {
      if (!res.ok || !res.data || cancelled) return
      const holdings = res.data
        .filter((holding) => holding.amount > 0 && holding.symbol !== 'SOL')
        .map((holding) => ({ mint: holding.mint, symbol: holding.symbol, amount: holding.amount }))
      setWalletTokenOptions((prev) => ({ ...prev, [sendWalletId]: holdings }))
      if (!sendMint) {
        const firstToken = holdings[0]
        if (firstToken) setSendMint(firstToken.mint)
      }
    }).catch(() => {})

    return () => { cancelled = true }
  }, [sendWalletId, sendMode, sendMint, walletTokenOptions])

  useEffect(() => {
    if (sendMode !== 'token') return
    if (sendMint) return
    const tokenOptions = sendWalletId && walletTokenOptions[sendWalletId]
      ? walletTokenOptions[sendWalletId]
      : sendWalletId === dashboard.activeWallet?.id
        ? dashboard.activeWallet.holdings
          .filter((holding) => holding.amount > 0 && holding.symbol !== 'SOL')
          .map((holding) => ({ mint: holding.mint, symbol: holding.symbol, amount: holding.amount }))
        : []
    const firstToken = tokenOptions.find((holding) => holding.amount > 0)
    if (firstToken) setSendMint(firstToken.mint)
  }, [sendMode, sendMint, sendWalletId, dashboard.activeWallet, walletTokenOptions])

  const walletActionCards = useMemo(() => {
    if (!activeWallet) return []
    return [
      { label: 'Active wallet', value: activeWallet.name, meta: truncateAddress(activeWallet.address) },
      { label: 'Execution', value: executionLabel, meta: dashboard.heliusConfigured ? 'Helius connected' : 'Local mode' },
      { label: 'Can sign', value: hasKeypair ? 'Ready' : 'Watch-only', meta: hasKeypair ? 'Send, swap, export, receive' : 'Import or generate a signer to act' },
    ]
  }, [activeWallet, dashboard.heliusConfigured, executionLabel, hasKeypair])

  const resetSendState = () => {
    setSendDest('')
    setSendAmount('')
    setSendMint('')
    setSendMax(false)
    setSelectedRecipientWalletId('')
  }

  const openSend = (walletId: string, mode: 'sol' | 'token') => {
    setSendWalletId(walletId)
    setSendMode(mode)
    resetSendState()
    setSendResult(null)
    setSendError(null)
    setActiveView('move')
  }

  const closeSend = () => {
    setSendWalletId(activeWallet?.id ?? null)
    setSendMode('sol')
    resetSendState()
  }

  const handleAddWallet = async (name: string, address: string) => {
    setError(null)
    const res = await window.daemon.wallet.create({ name, address })
    if (res.ok) {
      pushSuccess('Wallet added', 'Wallet')
      setWalletName('')
      setWalletAddress('')
      await onRefresh()
      return
    }
    setError(res.error ?? 'Failed to add wallet')
  }

  const handleGenerate = async (name: string) => {
    setError(null)
    setGenSuccess(null)
    const res = await window.daemon.wallet.generate({ name })
    if (res.ok && res.data) {
      setGenSuccess(res.data.address)
      setGenName('')
      pushSuccess('Signing wallet generated', 'Wallet')
      await onRefresh()
      return
    }
    setError(res.error ?? 'Failed to generate wallet')
  }

  const handleSaveHelius = async (key: string) => {
    setError(null)
    const res = await window.daemon.wallet.storeHeliusKey(key)
    if (res.ok) {
      await onRefresh()
      pushSuccess('Helius key saved', 'Wallet')
      return
    }
    setError(res.error ?? 'Failed to save Helius key')
  }

  const handleDeleteHelius = async () => {
    setError(null)
    const res = await window.daemon.wallet.deleteHeliusKey()
    if (res.ok) {
      await onRefresh()
      pushSuccess('Helius key removed', 'Wallet')
      return
    }
    setError(res.error ?? 'Failed to delete Helius key')
  }

  const handleSaveJupiter = async (key: string) => {
    setError(null)
    const res = await window.daemon.wallet.storeJupiterKey(key)
    if (res.ok) {
      setJupiterConfigured(true)
      pushSuccess('Jupiter key saved', 'Wallet')
      return
    }
    setError(res.error ?? 'Failed to save Jupiter key')
  }

  const handleDeleteJupiter = async () => {
    setError(null)
    const res = await window.daemon.wallet.deleteJupiterKey()
    if (res.ok) {
      setJupiterConfigured(false)
      pushSuccess('Jupiter key removed', 'Wallet')
      return
    }
    setError(res.error ?? 'Failed to delete Jupiter key')
  }

  const handleSaveInfrastructure = async (settings: WalletInfrastructureSettings) => {
    setError(null)
    const res = await window.daemon.settings.setWalletInfrastructureSettings(settings)
    if (res.ok) {
      setWalletInfrastructure(settings)
      await onRefresh()
      pushSuccess('Wallet infrastructure updated', 'Wallet')
      return
    }
    setError(res.error ?? 'Failed to save wallet infrastructure settings')
  }

  const handleSetDefault = async (walletId: string) => {
    setError(null)
    const res = await window.daemon.wallet.setDefault(walletId)
    if (res.ok) {
      pushSuccess('Default wallet updated', 'Wallet')
      await onRefresh()
    } else {
      setError(res.error ?? 'Failed to set default wallet')
    }
  }

  const handleAssignProject = async (walletId: string) => {
    if (!activeProjectId) return
    setError(null)
    const res = await window.daemon.wallet.assignProject(activeProjectId, walletId)
    if (res.ok) {
      pushSuccess('Project wallet updated', 'Wallet')
      await onRefresh()
    } else {
      setError(res.error ?? 'Failed to assign wallet to project')
    }
  }

  const handleDeleteWallet = async (walletId: string) => {
    setError(null)
    const res = await window.daemon.wallet.delete(walletId)
    if (res.ok) {
      pushSuccess('Wallet removed', 'Wallet')
      await onRefresh()
    } else {
      setError(res.error ?? 'Failed to remove wallet')
    }
  }

  const handleConfirmSend = (fromWalletId: string) => {
    setSendError(null)
    setSendResult(null)
    const amount = parseFloat(sendAmount)
    if (sendMode === 'sol') {
      if (!sendDest.trim() || (!sendMax && (isNaN(amount) || amount <= 0))) {
        setSendError('Invalid destination or amount')
        return
      }
      setPendingSend({ walletId: fromWalletId, mode: 'sol', dest: sendDest.trim(), amount: sendMax ? undefined : amount, sendMax })
    } else {
      if (!sendDest.trim() || !sendMint.trim() || (!sendMax && (isNaN(amount) || amount <= 0))) {
        setSendError('Invalid destination, mint, or amount')
        return
      }
      setPendingSend({ walletId: fromWalletId, mode: 'token', dest: sendDest.trim(), amount: sendMax ? undefined : amount, sendMax, mint: sendMint.trim() })
    }
  }

  const handleExecuteSend = async () => {
    if (!pendingSend || sendLockRef.current) return
    sendLockRef.current = true
    const activity = useNotificationsStore.getState()
    activity.addActivity({
      kind: 'info',
      context: 'Wallet',
      message: `Sending ${pendingSend.sendMax ? 'max' : pendingSend.amount} ${pendingSend.mode === 'sol' ? 'SOL' : 'token'} to ${pendingSend.dest}`,
    })
    setSendLoading(true)
    setSendError(null)
    try {
      if (pendingSend.mode === 'sol') {
        const res = await window.daemon.wallet.sendSol({ fromWalletId: pendingSend.walletId, toAddress: pendingSend.dest, amountSol: pendingSend.amount, sendMax: pendingSend.sendMax })
        setPendingSend(null)
        if (res.ok && res.data) {
          setSendResult(res.data)
          activity.addActivity({
            kind: 'success',
            context: 'Wallet',
            message: `SOL send confirmed via ${res.data.transport.toUpperCase()} with signature ${res.data.signature}`,
          })
          resetSendState()
          await onRefresh()
        } else {
          activity.addActivity({
            kind: 'error',
            context: 'Wallet',
            message: res.error ?? 'SOL send failed',
          })
          setSendError(res.error ?? 'Send failed')
        }
      } else {
        const res = await window.daemon.wallet.sendToken({ fromWalletId: pendingSend.walletId, toAddress: pendingSend.dest, mint: pendingSend.mint!, amount: pendingSend.amount, sendMax: pendingSend.sendMax })
        setPendingSend(null)
        if (res.ok && res.data) {
          setSendResult(res.data)
          activity.addActivity({
            kind: 'success',
            context: 'Wallet',
            message: `Token send confirmed via ${res.data.transport.toUpperCase()} with signature ${res.data.signature}`,
          })
          resetSendState()
          await onRefresh()
        } else {
          activity.addActivity({
            kind: 'error',
            context: 'Wallet',
            message: res.error ?? 'Token send failed',
          })
          setSendError(res.error ?? 'Send failed')
        }
      }
    } finally {
      setSendLoading(false)
      sendLockRef.current = false
    }
  }

  const handleCancelSend = () => setPendingSend(null)

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
      setExportConfirmId(null)
      setExportConfirmText('')
      pushSuccess('Private key copied to clipboard for 30 seconds', 'Wallet')
    } else {
      setError(res.error ?? 'Failed to export key')
      setExportConfirmId(null)
      setExportConfirmText('')
    }
  }

  const handleRecipientWalletChange = (walletId: string) => {
    setSelectedRecipientWalletId(walletId)
    const next = dashboard.wallets.find((wallet) => wallet.id === walletId)
    setSendDest(next?.address ?? '')
  }

  const toggleSendMax = () => {
    setSendMax((current) => {
      const next = !current
      if (!next) setSendAmount('')
      return next
    })
  }

  const handleCopyWalletAddress = async (address: string, name: string) => {
    const res = await window.daemon.env.copyValue(address)
    if (res.ok) pushSuccess(`${name} address copied`, 'Wallet')
    else pushError(res.error ?? 'Failed to copy wallet address', 'Wallet')
  }

  const handleCopyMint = async (mint: string, symbol: string) => {
    const res = await window.daemon.env.copyValue(mint)
    if (res.ok) pushSuccess(`${symbol} mint copied`, 'Wallet')
    else pushError(res.error ?? 'Failed to copy mint', 'Wallet')
  }

  const handleSwapHolding = (mint: string) => {
    setPreferredSwapMint(mint)
    setActiveView('swap')
  }

  const renderWalletInline = (walletId: string) => (
    <WalletExportKey
      walletId={walletId}
      exportConfirmId={exportConfirmId}
      exportConfirmText={exportConfirmText}
      revealKeyId={revealKeyId}
      revealedKey={revealedKey}
      onConfirmTextChange={setExportConfirmText}
      onConfirm={handleExportKeyConfirm}
      onCancel={() => { setExportConfirmId(null); setExportConfirmText('') }}
    />
  )

  const rpcProviderLabel = walletInfrastructure.rpcProvider === 'helius'
    ? 'Helius RPC'
    : walletInfrastructure.rpcProvider === 'quicknode'
      ? 'QuickNode RPC'
      : walletInfrastructure.rpcProvider === 'custom'
        ? 'Custom RPC'
        : 'Public RPC'
  const rpcReady = walletInfrastructure.rpcProvider === 'helius'
    ? dashboard.heliusConfigured
    : walletInfrastructure.rpcProvider === 'quicknode'
      ? walletInfrastructure.quicknodeRpcUrl.trim().length > 0
      : walletInfrastructure.rpcProvider === 'custom'
        ? walletInfrastructure.customRpcUrl.trim().length > 0
        : true
  const walletReadiness = buildSolanaRouteReadiness({
    walletPresent: Boolean(activeWallet),
    walletName: activeWallet?.name,
    walletAddress: activeWallet?.address,
    isMainWallet: Boolean(activeWalletMeta?.isDefault),
    signerReady: hasKeypair,
    hasActiveProject: Boolean(activeProjectId),
    projectAssigned: activeProjectId ? Boolean(activeWalletMeta?.assignedProjectIds.includes(activeProjectId)) : true,
    preferredWallet: walletInfrastructure.preferredWallet,
    executionMode: walletInfrastructure.executionMode,
    rpcLabel: rpcProviderLabel,
    rpcReady,
  })
  const walletPrimaryAction = walletReadiness.nextAction.id === 'open-wallet'
    ? {
      label: activeWallet ? 'Add signer' : 'Create wallet',
      onClick: () => setActiveView('manage'),
    }
    : walletReadiness.nextAction.id === 'assign-project' && activeWallet
      ? { label: 'Use for current project', onClick: () => void handleAssignProject(activeWallet.id) }
      : walletReadiness.nextAction.id === 'set-main-wallet' && activeWallet
        ? { label: 'Make main wallet', onClick: () => void handleSetDefault(activeWallet.id) }
        : walletReadiness.nextAction.id === 'open-infrastructure'
          ? { label: 'Finish infrastructure', onClick: () => setShowInfrastructure(true) }
          : activeWallet
            ? {
              label: walletReadiness.nextAction.id === 'transact' ? 'Send SOL' : walletReadiness.nextAction.label,
              onClick: () => openSend(activeWallet.id, 'sol'),
            }
            : null
  const walletSecondaryAction = hasKeypair
    ? { label: 'Open holdings', onClick: () => setActiveView('holdings') }
    : { label: 'Receive', onClick: () => setActiveView('receive') }

  if (activeView === 'vault') return <VaultSection onBack={() => setActiveView('overview')} />

  if (activeView === 'receive' && activeWallet) {
    return <WalletReceiveView address={activeWallet.address} walletName={activeWallet.name} onBack={() => setActiveView('overview')} />
  }

  if (activeView === 'swap' && activeWallet && hasKeypair) {
    return (
      <WalletSwapForm
        walletId={activeWallet.id}
        walletName={activeWallet.name}
        holdings={activeWallet.holdings}
        executionMode={walletInfrastructure.executionMode}
        initialInputMint={preferredSwapMint ?? undefined}
        initialOutputMint={preferredSwapMint ? 'So11111111111111111111111111111111111111112' : undefined}
        onBack={() => {
          setPreferredSwapMint(null)
          setActiveView('overview')
        }}
        onRefresh={onRefresh}
      />
    )
  }

  return (
    <>
      <section className="wallet-section">
        <div className="wallet-portfolio-hero">
          <div className="wallet-portfolio-primary">
            <div className="wallet-total">${formatUsd(dashboard.portfolio.totalUsd)}</div>
            <div className={`wallet-delta ${dashboard.portfolio.delta24hUsd >= 0 ? 'up' : 'down'}`}>
              {dashboard.portfolio.delta24hUsd >= 0 ? '+' : '-'}${formatUsd(Math.abs(dashboard.portfolio.delta24hUsd))} · {formatPct(dashboard.portfolio.delta24hPct)}
              <span className="wallet-delta-timeframe">24h</span>
            </div>
            <div className="wallet-caption">{dashboard.portfolio.walletCount} wallet{dashboard.portfolio.walletCount !== 1 ? 's' : ''} tracked</div>
          </div>
          <div className="wallet-portfolio-grid">
            {walletActionCards.map((card) => (
              <div key={card.label} className="wallet-portfolio-card">
                <span className="wallet-portfolio-label">{card.label}</span>
                <strong className="wallet-portfolio-value">{card.value}</strong>
                <span className="wallet-portfolio-meta">{card.meta}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="wallet-quick-actions">
          <button className={`wallet-action-btn${activeView === 'overview' ? ' active' : ''}`} onClick={() => setActiveView('overview')}>Overview</button>
          <button className={`wallet-action-btn${activeView === 'holdings' ? ' active' : ''}`} onClick={() => setActiveView('holdings')}>Holdings</button>
          <button className={`wallet-action-btn${activeView === 'move' ? ' active' : ''}`} onClick={() => {
            if (activeWallet && hasKeypair) openSend(activeWallet.id, sendMode ?? 'sol')
            else setActiveView('move')
          }}>Move</button>
          <button className={`wallet-action-btn${activeView === 'manage' ? ' active' : ''}`} onClick={() => setActiveView('manage')}>Manage</button>
          <button className={`wallet-action-btn${activeView === 'history' ? ' active' : ''}`} onClick={() => setActiveView('history')}>History</button>
          <button className={`wallet-action-btn${showInfrastructure ? ' active' : ''}`} onClick={() => setShowInfrastructure((v) => !v)}>Infra</button>
        </div>
      </section>

      {showInfrastructure && (
        <WalletSettings
          showMarketTape={showMarketTape}
          showTitlebarWallet={showTitlebarWallet}
          heliusConfigured={dashboard.heliusConfigured}
          jupiterConfigured={jupiterConfigured}
          infrastructure={walletInfrastructure}
          error={error}
          onToggleTape={async (checked) => { await setStoreShowMarketTape(checked) }}
          onToggleTitlebarWallet={async (checked) => { await setStoreShowTitlebarWallet(checked) }}
          onSaveHelius={handleSaveHelius}
          onDeleteHelius={handleDeleteHelius}
          onSaveJupiter={handleSaveJupiter}
          onDeleteJupiter={handleDeleteJupiter}
          onSaveInfrastructure={handleSaveInfrastructure}
        />
      )}

      {activeView === 'overview' && activeWallet && (
        <>
          <section className="wallet-section">
            <div className="wallet-section-header">
              <div>
                <div className="wallet-section-title">Active wallet</div>
                <div className="wallet-caption">{activeWallet.name} · {truncateAddress(activeWallet.address)}</div>
              </div>
              <div className="wallet-actions wallet-actions-wrap">
                <button className="wallet-btn" onClick={() => void handleCopyWalletAddress(activeWallet.address, activeWallet.name)}>Copy address</button>
                <button className="wallet-btn" onClick={() => setActiveView('receive')}>Receive</button>
                {hasKeypair && <button className="wallet-btn primary-soft" onClick={() => handleExportKeyStart(activeWallet.id)}>Export key</button>}
              </div>
            </div>
            <div className="wallet-readiness-shell">
              <div className="wallet-readiness-hero">
                <span className="wallet-overview-label">Wallet readiness</span>
                <strong>{walletReadiness.headline}</strong>
                <p>{walletReadiness.description}</p>
                <div className="wallet-readiness-progress">
                  <span>{walletReadiness.readyCount}/{walletReadiness.totalCount} checks ready</span>
                  <span>{activeProjectId ? 'Project-aware route' : 'Workspace route'}</span>
                </div>
                <div className="wallet-actions wallet-actions-wrap">
                  {walletPrimaryAction ? (
                    <button className="wallet-btn primary" onClick={walletPrimaryAction.onClick}>{walletPrimaryAction.label}</button>
                  ) : null}
                  <button className="wallet-btn" onClick={walletSecondaryAction.onClick}>{walletSecondaryAction.label}</button>
                </div>
              </div>
              <div className="wallet-readiness-grid">
                {walletReadiness.items.map((item) => (
                  <div key={item.label} className={`wallet-readiness-item${item.ready ? ' ready' : ''}`}>
                    <span className={`wallet-readiness-dot${item.ready ? ' ready' : ''}`} />
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </div>
                ))}
                <div className="wallet-readiness-item">
                  <span className="wallet-readiness-dot ready" />
                  <div>
                    <strong>Activity snapshot</strong>
                    <p>{transactions?.length ? `${transactions.length} recent transaction${transactions.length === 1 ? '' : 's'} loaded.` : 'No recent transactions loaded yet.'}</p>
                  </div>
                </div>
                <div className="wallet-readiness-item">
                  <span className="wallet-readiness-dot ready" />
                  <div>
                    <strong>Asset coverage</strong>
                    <p>{activeWallet.holdings.length} asset{activeWallet.holdings.length === 1 ? '' : 's'} tracked for this wallet.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {holdingsPreview.length > 0 && (
            <section className="wallet-section">
              <div className="wallet-section-header">
                <div className="wallet-section-title">Holdings preview</div>
                <button className="wallet-icon-btn" onClick={() => setActiveView('holdings')}>See all</button>
              </div>
              <div className="wallet-holdings">
                {holdingsPreview.map((holding) => (
                  <div key={holding.mint} className="wallet-holding-row">
                    <div className="wallet-holding-main">
                      <div className="wallet-label">{holding.symbol}</div>
                      <div className="wallet-caption">{holding.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                    </div>
                    <div className="wallet-actions wallet-actions-wrap">
                      {hasKeypair && holding.symbol !== 'SOL' && (
                        <button className="wallet-inline-link" onClick={() => handleSwapHolding(holding.mint)}>Sell</button>
                      )}
                      <button className="wallet-inline-link" onClick={() => void handleCopyMint(holding.mint, holding.symbol)}>Copy mint</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {activeView === 'holdings' && activeWallet && activeWalletMeta && (
        <PnlHoldings
          walletAddress={activeWalletMeta.address}
          holdings={activeWallet.holdings}
          onSwapHolding={hasKeypair ? handleSwapHolding : undefined}
          onCopyMint={(mint, symbol) => { void handleCopyMint(mint, symbol) }}
        />
      )}

      {activeView === 'move' && activeWallet && (
        <section className="wallet-section">
          <div className="wallet-section-header">
            <div>
              <div className="wallet-section-title">Move funds</div>
              <div className="wallet-caption">Transfer between your wallets, send out, or jump into swap mode without leaving this workspace.</div>
            </div>
            <div className="wallet-actions wallet-actions-wrap">
              <button className={`wallet-btn ${sendMode === 'sol' ? 'primary' : ''}`} onClick={() => openSend(activeWallet.id, 'sol')}>Send SOL</button>
              <button className={`wallet-btn ${sendMode === 'token' ? 'primary' : ''}`} onClick={() => openSend(activeWallet.id, 'token')}>Send token</button>
              <button className="wallet-btn" onClick={() => setActiveView('swap')} disabled={!hasKeypair}>Swap</button>
            </div>
          </div>
          <div className="wallet-move-grid">
            <div className="wallet-move-card">
              <span className="wallet-overview-label">From</span>
              <strong>{activeWallet.name}</strong>
              <p>{truncateAddress(activeWallet.address)}</p>
            </div>
            <div className="wallet-move-card">
              <span className="wallet-overview-label">Recommended</span>
              <strong>{dashboard.wallets.length > 1 ? 'Transfer between tracked wallets first' : 'Paste an external destination'}</strong>
              <p>{dashboard.wallets.length > 1 ? 'Use the tracked wallet picker to move funds safely inside your own wallet set.' : 'You only have one tracked wallet right now, so this acts like a send form.'}</p>
            </div>
          </div>
          {hasKeypair ? (
            sendWalletId === activeWallet.id && sendMode && (
              <WalletSendForm
                walletId={activeWallet.id}
                walletName={activeWallet.name}
                sendMode={sendMode}
                sendDest={sendDest}
                sendAmount={sendAmount}
                sendMint={sendMint}
                sendMax={sendMax}
                selectedRecipientWalletId={selectedRecipientWalletId}
                recipientWallets={dashboard.wallets.filter((wallet) => wallet.id !== activeWallet.id).map((wallet) => ({ id: wallet.id, name: wallet.name, address: wallet.address }))}
                tokenOptions={sendMode === 'token' ? (walletTokenOptions[activeWallet.id] ?? activeWallet.holdings.filter((holding) => holding.amount > 0 && holding.symbol !== 'SOL').map((holding) => ({ mint: holding.mint, symbol: holding.symbol, amount: holding.amount }))) : []}
                walletBalanceSol={walletBalances[activeWallet.id] ?? null}
                executionMode={walletInfrastructure.executionMode}
                sendLoading={sendLoading}
                sendError={sendError}
                sendResult={sendResult}
                pendingSend={pendingSend}
                onRecipientWalletChange={handleRecipientWalletChange}
                onDestChange={setSendDest}
                onAmountChange={setSendAmount}
                onMintChange={setSendMint}
                onToggleSendMax={toggleSendMax}
                onConfirmSend={handleConfirmSend}
                onExecuteSend={handleExecuteSend}
                onCancelSend={handleCancelSend}
                onClose={closeSend}
              />
            )
          ) : (
            <div className="wallet-empty">This wallet is watch-only. Open Manage to import or generate a signing wallet before sending or swapping.</div>
          )}
        </section>
      )}

      {activeView === 'manage' && (
        <>
          <section className="wallet-section">
            <div className="wallet-section-header">
              <div>
                <div className="wallet-section-title">Create or import</div>
                <div className="wallet-caption">Bring in tracked wallets, create fresh signers, and choose which wallet should act by default.</div>
              </div>
            </div>
            <div className="wallet-tab-group wallet-create-tabs">
              <button className={`wallet-tab ${createTab === 'import' ? 'active' : ''}`} onClick={() => { setCreateTab('import'); setGenSuccess(null) }}>Import</button>
              <button className={`wallet-tab ${createTab === 'generate' ? 'active' : ''}`} onClick={() => { setCreateTab('generate'); setGenSuccess(null) }}>Generate</button>
            </div>
            {createTab === 'import' && (
              <div className="wallet-form wallet-create-grid">
                <input className="wallet-input" value={walletName} onChange={(e) => setWalletName(e.target.value)} placeholder="Wallet name" />
                <input className="wallet-input" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="Solana address" />
                <button className="wallet-btn primary wallet-btn-wide" onClick={() => void handleAddWallet(walletName.trim(), walletAddress.trim())}>Add Wallet</button>
              </div>
            )}
            {createTab === 'generate' && (
              <div className="wallet-form wallet-create-grid">
                <input className="wallet-input" value={genName} onChange={(e) => setGenName(e.target.value)} placeholder="Wallet name" />
                <button className="wallet-btn primary wallet-btn-wide" onClick={() => void handleGenerate(genName.trim())}>Generate Wallet</button>
                {genSuccess && <div className="wallet-success-msg">Generated: {truncateAddress(genSuccess)}</div>}
              </div>
            )}
          </section>

          <section className="wallet-section">
            <div className="wallet-section-header">
              <div>
                <div className="wallet-section-title">Wallets</div>
                <div className="wallet-caption">Set your main wallet, assign one to the current project, export keys, copy addresses, and move funds between them.</div>
              </div>
            </div>
            <div className="wallet-list wallet-list-cards">
              {trackedWallets.map((wallet) => (
                <div key={wallet.id} className="wallet-row wallet-row-card">
                  <div className="wallet-row-main wallet-row-main-top">
                    <div className="wallet-row-identity">
                      <div className="wallet-name">{wallet.name}</div>
                      <div className="wallet-row-sub wallet-row-subtle wallet-row-chipline">
                        {wallet.isDefault && <span className="wallet-badge">default</span>}
                        <span className={`wallet-pill ${keypairCache[wallet.id] ? 'live' : 'muted'}`}>{keypairCache[wallet.id] ? 'Signer' : 'Watch-only'}</span>
                        <span className="wallet-pill">{truncateAddress(wallet.address)}</span>
                        <span className="wallet-pill">{wallet.tokenCount} assets</span>
                      </div>
                    </div>
                    <div className="wallet-value wallet-value-strong">${formatUsd(wallet.totalUsd)}</div>
                  </div>
                  <div className="wallet-actions-card">
                    <div className="wallet-actions wallet-actions-wrap wallet-actions-card-main">
                      {!wallet.isDefault && <button className="wallet-btn" onClick={() => void handleSetDefault(wallet.id)}>Make main wallet</button>}
                      {activeProjectId && <button className="wallet-btn primary-soft" onClick={() => void handleAssignProject(wallet.id)}>Use for project</button>}
                      <button className="wallet-btn" onClick={() => void handleCopyWalletAddress(wallet.address, wallet.name)}>Copy address</button>
                      {keypairCache[wallet.id] && <button className="wallet-btn primary" onClick={() => openSend(wallet.id, 'sol')}>Move funds</button>}
                    </div>
                    <div className="wallet-actions wallet-actions-wrap wallet-actions-card-utility">
                      {keypairCache[wallet.id] && <button className="wallet-btn subtle" onClick={() => handleExportKeyStart(wallet.id)}>Export key</button>}
                      <button className="wallet-btn danger" onClick={() => void handleDeleteWallet(wallet.id)}>Remove</button>
                    </div>
                  </div>
                  {renderWalletInline(wallet.id)}
                </div>
              ))}
              {trackedWallets.length === 0 && <div className="wallet-empty">No wallets configured</div>}
            </div>
          </section>
        </>
      )}

      {activeView === 'history' && (
        <section className="wallet-section">
          <div className="wallet-section-header">
            <div>
              <div className="wallet-section-title">History</div>
              <div className="wallet-caption">Recent confirmed transactions for the active wallet.</div>
            </div>
          </div>
          {transactions && transactions.length > 0 ? <TransactionHistory transactions={transactions} /> : <div className="wallet-empty">No recent transactions for the active wallet yet.</div>}
        </section>
      )}

      {activeView === 'overview' && dashboard.feed.length > 0 && (
        <section className="wallet-section">
          <div className="wallet-section-title">Live feed</div>
          {dashboard.feed.slice(0, 8).map((entry) => (
            <div key={entry.walletId} className="wallet-feed-row">
              <span className="wallet-feed-name">{entry.walletName}</span>
              <span className={`wallet-feed-delta ${entry.deltaUsd >= 0 ? 'up' : 'down'}`}>
                {entry.deltaUsd >= 0 ? '+' : '-'}${formatUsd(Math.abs(entry.deltaUsd))}
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  )
}

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: value >= 1000 ? 0 : 2, maximumFractionDigits: 2 })
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '-'
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}
