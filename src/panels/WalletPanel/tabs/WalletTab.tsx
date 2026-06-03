import { useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore } from '../../../store/ui'
import { useWalletStore } from '../../../store/wallet'
import { useNotificationsStore } from '../../../store/notifications'
import { WalletSettings } from '../WalletSettings'
import { WalletExportKey } from '../WalletExportKey'
import { TransactionHistory } from '../TransactionHistory'
import { WalletReceiveView } from '../WalletReceiveView'
import { WalletOnramp } from '../WalletOnramp'
import { WalletSwapForm } from '../WalletSwapForm'
import { VaultSection } from '../VaultSection'
import { PnlHoldings } from '../PnlHoldings'
import { WalletSendForm } from '../WalletSendForm'
import { WalletReadinessChecklist } from '../WalletReadinessChecklist'
import { buildSolanaRouteReadiness } from '../../../lib/solanaReadiness'
import { getSolscanTxLabel, getSolscanTxUrl } from '../../../lib/solanaExplorer'
import {
  getSolflareState,
  subscribeSolflareWallet,
  type SolflareConnectionState,
} from '../../../lib/solflareWallet'
import {
  getActiveProvider,
  getProvider,
  getWalletAdapterState,
  subscribeWalletAdapter,
  type WalletAdapterState,
} from '../../../lib/walletAdapter'
import { describeWalletActionError } from '../walletCopy'
import { compactAddress } from '../../../utils/textDisplay'
import { KpiGrid, DataRow, Badge, Surface, SegmentedControl, type SegmentItem } from '../../../components/Panel'
import '../../_solana/solanaSurface.css'

interface Props {
  onRefresh: () => Promise<void>
}

type WalletPrimaryView = 'overview' | 'holdings' | 'move' | 'history' | 'manage'
type ManageCreateTab = 'import' | 'generate' | 'keypair'
const SOL_MINT = 'So11111111111111111111111111111111111111112'

export function WalletTab({ onRefresh }: Props) {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectName = useUIStore((s) => (
    s.activeProjectId ? s.projects.find((project) => project.id === s.activeProjectId)?.name ?? null : null
  ))
  const dashboard = useWalletStore((s) => s.dashboard)!
  const showMarketTape = useWalletStore((s) => s.showMarketTape)
  const showTitlebarWallet = useWalletStore((s) => s.showTitlebarWallet)
  const transactions = useWalletStore((s) => s.transactions)
  const setStoreShowMarketTape = useWalletStore((s) => s.setShowMarketTape)
  const setStoreShowTitlebarWallet = useWalletStore((s) => s.setShowTitlebarWallet)
  const activeView = useWalletStore((s) => s.activeView)
  const setActiveView = useWalletStore((s) => s.setActiveView)
  const preferredSwap = useWalletStore((s) => s.preferredSwap)
  const setPreferredSwap = useWalletStore((s) => s.setPreferredSwap)
  const pushSuccess = useNotificationsStore((s) => s.pushSuccess)
  const pushError = useNotificationsStore((s) => s.pushError)

  const [showInfrastructure, setShowInfrastructure] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [genSuccess, setGenSuccess] = useState<string | null>(null)
  const [jupiterConfigured, setJupiterConfigured] = useState(false)
  const [moonpayStatus, setMoonpayStatus] = useState<MoonpayStatus>({
    configured: false,
    environment: null,
    publishableKeyHint: null,
  })
  const [solflareConnection, setSolflareConnection] = useState<SolflareConnectionState>(getSolflareState())
  const [walletAdapter, setWalletAdapter] = useState<WalletAdapterState>(getWalletAdapterState())
  const [walletInfrastructure, setWalletInfrastructure] = useState<WalletInfrastructureSettings>({
    cluster: 'devnet',
    rpcProvider: 'helius',
    quicknodeRpcUrl: '',
    customRpcUrl: '',
    swapProvider: 'jupiter',
    preferredWallet: 'phantom',
    executionMode: 'rpc',
    jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
  })

  const [createTab, setCreateTab] = useState<ManageCreateTab>('generate')
  const [walletName, setWalletName] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [genName, setGenName] = useState('')
  const [importKeyName, setImportKeyName] = useState('')
  const [importPrivateKey, setImportPrivateKey] = useState('')
  const [attachSignerWalletId, setAttachSignerWalletId] = useState<string | null>(null)
  const [attachSignerPrivateKey, setAttachSignerPrivateKey] = useState('')

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
  const sendLockRef = useRef(false)
  const [pendingSend, setPendingSend] = useState<{
    walletId: string; mode: 'sol' | 'token'; dest: string; amount?: number; sendMax?: boolean; mint?: string
  } | null>(null)

  const activeWallet = dashboard.activeWallet
  const activeWalletMeta = dashboard.wallets.find((w) => w.id === activeWallet?.id)
  const hasKeypair = activeWalletMeta ? keypairCache[activeWalletMeta.id] === true : false
  // Legacy Solflare-only path keys off the Solflare SDK state; the new Daemon
  // Wallet Adapter path keys off the active adapter provider. Either can satisfy
  // an external send so long as the connected pubkey matches the active wallet.
  const canSolflareSign = walletInfrastructure.preferredWallet === 'solflare'
    && solflareConnection.status === 'connected'
    && Boolean(activeWallet?.address)
    && solflareConnection.publicKey === activeWallet?.address
    && walletInfrastructure.cluster !== 'localnet'
  const canAdapterSign = walletInfrastructure.preferredWallet === 'wallet-standard'
    && walletAdapter.status === 'connected'
    && Boolean(activeWallet?.address)
    && walletAdapter.publicKey === activeWallet?.address
    && walletInfrastructure.cluster !== 'localnet'
  const canExternalSign = canSolflareSign || canAdapterSign
  const canSendSol = hasKeypair || canExternalSign
  const trackedWallets = dashboard.wallets
  const walletIdsFingerprint = useMemo(() => trackedWallets.map((wallet) => wallet.id).join('|'), [trackedWallets])
  const holdingsPreview = activeWallet?.holdings.slice(0, 4) ?? []
  const executionLabel = walletInfrastructure.executionMode === 'jito' ? 'Jito path' : 'Standard RPC'
  const explorerCluster = walletInfrastructure.cluster
  const recipientWalletOptions = useMemo(() => (
    activeWallet
      ? dashboard.wallets
        .filter((wallet) => wallet.id !== activeWallet.id)
        .map((wallet) => ({ id: wallet.id, name: wallet.name, address: wallet.address }))
      : []
  ), [activeWallet, dashboard.wallets])
  const activeWalletTokenOptions = useMemo(() => (
    activeWallet
      ? activeWallet.holdings
        .filter((holding) => holding.amount > 0 && holding.symbol !== 'SOL')
        .map((holding) => ({ mint: holding.mint, symbol: holding.symbol, amount: holding.amount }))
      : []
  ), [activeWallet])

  useEffect(() => {
    return subscribeSolflareWallet(setSolflareConnection)
  }, [])

  useEffect(() => {
    return subscribeWalletAdapter(setWalletAdapter)
  }, [])

  useEffect(() => {
    if (trackedWallets.length === 0 && activeView === 'overview') {
      setActiveView('manage')
      setCreateTab('generate')
    }
  }, [activeView, setActiveView, trackedWallets.length])

  useEffect(() => {
    void Promise.all([
      window.daemon.wallet.hasJupiterKey(),
      window.daemon.wallet.moonpayStatus(),
      window.daemon.settings.getWalletInfrastructureSettings(),
    ]).then(([jupiterRes, moonpayRes, infraRes]) => {
      if (jupiterRes.ok) setJupiterConfigured(jupiterRes.data === true)
      if (moonpayRes.ok && moonpayRes.data) setMoonpayStatus(moonpayRes.data)
      if (infraRes.ok && infraRes.data) setWalletInfrastructure(infraRes.data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!trackedWallets) return
    const check = async () => {
      const cache: Record<string, boolean> = {}
      for (const w of trackedWallets) {
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
  }, [walletIdsFingerprint])

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
  }, [sendWalletId])

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
      { label: 'Execution', value: executionLabel, meta: dashboard.heliusConfigured ? 'Helius connected' : 'Helius key missing' },
      { label: 'Can sign', value: canSolflareSign ? 'Solflare' : hasKeypair ? 'Ready' : 'Watch-only', meta: canSolflareSign ? 'External SOL approvals' : hasKeypair ? 'Send, swap, export, receive' : 'Import, generate, or connect Solflare to act' },
    ]
  }, [activeWallet, canSolflareSign, dashboard.heliusConfigured, executionLabel, hasKeypair])

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

  const handleImportSigningWallet = async (name: string, privateKey?: string) => {
    setError(null)
    setGenSuccess(null)
    const res = await window.daemon.wallet.importSigningWallet({ name, privateKey })
    if (res.ok) {
      if (res.data) {
        setGenSuccess(res.data.address)
        setImportKeyName('')
        setImportPrivateKey('')
        pushSuccess('Signing wallet imported', 'Wallet')
        await onRefresh()
      }
      return
    }
    setError(res.error ?? 'Failed to import signing wallet')
  }

  const handleImportKeypairForWallet = async (walletId: string, privateKey?: string) => {
    setError(null)
    const res = await window.daemon.wallet.importKeypair(walletId, privateKey)
    if (res.ok) {
      if (res.data) {
        pushSuccess('Signer added to wallet', 'Wallet')
        setKeypairCache((prev) => ({ ...prev, [walletId]: true }))
        setAttachSignerWalletId(null)
        setAttachSignerPrivateKey('')
        await onRefresh()
      }
      return
    }
    setError(res.error ?? 'Failed to import keypair')
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

  const handleSaveMoonpayKeys = async (publishableKey: string, secretKey: string) => {
    setError(null)
    const res = await window.daemon.wallet.storeMoonpayKeys({ publishableKey, secretKey })
    if (res.ok && res.data) {
      setMoonpayStatus(res.data)
      pushSuccess('MoonPay keys saved', 'Wallet')
      return
    }
    setError(res.error ?? 'Failed to save MoonPay keys')
  }

  const handleDeleteMoonpayKeys = async () => {
    setError(null)
    const res = await window.daemon.wallet.deleteMoonpayKeys()
    if (res.ok) {
      setMoonpayStatus({ configured: false, environment: null, publishableKeyHint: null })
      pushSuccess('MoonPay keys removed', 'Wallet')
      return
    }
    setError(res.error ?? 'Failed to delete MoonPay keys')
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

  const handleTrackSolflareWallet = async (address: string) => {
    setError(null)
    const existing = dashboard.wallets.find((wallet) => wallet.address === address)
    if (existing) {
      pushSuccess('Solflare wallet already tracked', 'Wallet')
      return
    }

    const res = await window.daemon.wallet.create({ name: 'Solflare Wallet', address })
    if (res.ok) {
      pushSuccess('Solflare wallet tracked', 'Wallet')
      await onRefresh()
      return
    }

    const message = res.error ?? 'Failed to track Solflare wallet'
    setError(message)
    pushError(message, 'Wallet')
    throw new Error(message)
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
        setSendError('Enter a destination address and a SOL amount before review.')
        return
      }
      setPendingSend({ walletId: fromWalletId, mode: 'sol', dest: sendDest.trim(), amount: sendMax ? undefined : amount, sendMax })
    } else {
      if (!sendDest.trim() || !sendMint.trim() || (!sendMax && (isNaN(amount) || amount <= 0))) {
        setSendError('Enter a destination address, token mint, and amount before review.')
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
      projectId: activeProjectId,
      projectName: activeProjectName,
    })
    setSendLoading(true)
    setSendError(null)
    try {
      if (pendingSend.mode === 'sol') {
        const res = canExternalSign
          ? await signAndSubmitExternalSend(pendingSend)
          : await window.daemon.wallet.sendSol({ fromWalletId: pendingSend.walletId, toAddress: pendingSend.dest, amountSol: pendingSend.amount, sendMax: pendingSend.sendMax })
        if (res.ok && res.data) {
          setPendingSend(null)
          setSendResult(res.data)
          activity.addActivity({
            kind: 'success',
            context: 'Wallet',
            message: `SOL send confirmed via ${res.data.transport.toUpperCase()} with signature ${res.data.signature}`,
            projectId: activeProjectId,
            projectName: activeProjectName,
            artifacts: [{
              type: 'transaction',
              label: getSolscanTxLabel(explorerCluster),
              value: res.data.signature,
              href: getSolscanTxUrl(res.data.signature, explorerCluster),
            }],
          })
          resetSendState()
          await onRefresh()
        } else {
          const message = describeWalletActionError(res.error, 'SOL send failed. Nothing was submitted.')
          activity.addActivity({
            kind: 'error',
            context: 'Wallet',
            message,
            projectId: activeProjectId,
            projectName: activeProjectName,
          })
          setSendError(message)
        }
      } else {
        const res = await window.daemon.wallet.sendToken({ fromWalletId: pendingSend.walletId, toAddress: pendingSend.dest, mint: pendingSend.mint!, amount: pendingSend.amount, sendMax: pendingSend.sendMax })
        if (res.ok && res.data) {
          setPendingSend(null)
          setSendResult(res.data)
          activity.addActivity({
            kind: 'success',
            context: 'Wallet',
            message: `Token send confirmed via ${res.data.transport.toUpperCase()} with signature ${res.data.signature}`,
            projectId: activeProjectId,
            projectName: activeProjectName,
            artifacts: [{
              type: 'transaction',
              label: getSolscanTxLabel(explorerCluster),
              value: res.data.signature,
              href: getSolscanTxUrl(res.data.signature, explorerCluster),
            }],
          })
          resetSendState()
          await onRefresh()
        } else {
          const message = describeWalletActionError(res.error, 'Token send failed. Nothing was submitted.')
          activity.addActivity({
            kind: 'error',
            context: 'Wallet',
            message,
            projectId: activeProjectId,
            projectName: activeProjectName,
          })
          setSendError(message)
        }
      }
    } catch (err) {
      const message = describeWalletActionError(err instanceof Error ? err.message : null, 'Send failed. Nothing was submitted.')
      activity.addActivity({
        kind: 'error',
        context: 'Wallet',
        message,
        projectId: activeProjectId,
        projectName: activeProjectName,
      })
      setSendError(message)
    } finally {
      setSendLoading(false)
      sendLockRef.current = false
    }
  }

  const handleCancelSend = () => setPendingSend(null)

  const signAndSubmitExternalSend = async (send: NonNullable<typeof pendingSend>) => {
    // wallet-standard preference signs through the active adapter provider;
    // legacy solflare preference has no active adapter, so resolve the Solflare
    // provider directly. Both expose the same signSerializedTransaction shape.
    const provider = canAdapterSign ? getActiveProvider() : getProvider('solflare')
    if (!provider) return { ok: false, error: 'Connect a wallet before signing' }
    const signerProvider = provider.id
    const draft = await window.daemon.wallet.prepareExternalSolTransfer({
      fromWalletId: send.walletId,
      toAddress: send.dest,
      amountSol: send.amount,
      sendMax: send.sendMax,
    })
    if (!draft.ok || !draft.data) return { ok: false, error: draft.error ?? 'Failed to prepare external transfer' }

    try {
      const signed = await provider.signSerializedTransaction(draft.data.transactionBase64)
      return await window.daemon.wallet.submitExternalSignedTransaction({
        id: draft.data.id,
        publicKey: signed.publicKey,
        signedTransactionBase64: signed.signedTransactionBase64,
        signerProvider,
      })
    } catch (error) {
      await window.daemon.wallet.cancelExternalTransaction(
        draft.data.id,
        error instanceof Error ? error.message : 'External wallet signing was cancelled',
      )
      throw error
    }
  }

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
    setPreferredSwap({ inputMint: mint, outputMint: SOL_MINT })
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
    signerReady: canSendSol,
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

  if (activeView === 'onramp' && activeWallet) {
    return (
      <WalletOnramp
        walletId={activeWallet.id}
        walletName={activeWallet.name}
        walletAddress={activeWallet.address}
        moonpayStatus={moonpayStatus}
        onBack={() => setActiveView('overview')}
        onConfigure={() => {
          setShowInfrastructure(true)
          setActiveView('overview')
        }}
      />
    )
  }

  if (activeView === 'swap' && activeWallet && hasKeypair) {
    return (
      <WalletSwapForm
        walletId={activeWallet.id}
        walletName={activeWallet.name}
        holdings={activeWallet.holdings}
        executionMode={walletInfrastructure.executionMode}
        cluster={walletInfrastructure.cluster}
        initialInputMint={preferredSwap?.inputMint}
        initialOutputMint={preferredSwap?.outputMint}
        onBack={() => {
          setPreferredSwap(null)
          setActiveView('overview')
        }}
        onRefresh={onRefresh}
      />
    )
  }

  const primaryViews: Array<SegmentItem<WalletPrimaryView>> = [
    { id: 'overview', label: 'Overview' },
    { id: 'holdings', label: 'Holdings' },
    { id: 'move', label: 'Move' },
    { id: 'history', label: 'History' },
    { id: 'manage', label: trackedWallets.length === 0 ? 'Create' : 'Wallets' },
  ]

  const handlePrimaryView = (next: WalletPrimaryView) => {
    if (next === 'move' && activeWallet && canSendSol) {
      openSend(activeWallet.id, sendMode === 'token' && !hasKeypair ? 'sol' : sendMode ?? 'sol')
      return
    }
    setActiveView(next)
  }

  const PRIMARY_VIEW_IDS: WalletPrimaryView[] = ['overview', 'holdings', 'move', 'history', 'manage']
  const currentPrimaryView: WalletPrimaryView = PRIMARY_VIEW_IDS.includes(activeView as WalletPrimaryView)
    ? (activeView as WalletPrimaryView)
    : 'overview'

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
            <div className="wallet-caption">
              {dashboard.portfolio.walletCount} wallet{dashboard.portfolio.walletCount !== 1 ? 's' : ''} tracked · Cluster: {walletInfrastructure.cluster}
            </div>
          </div>
          {walletActionCards.length > 0 && (
            <KpiGrid
              className="wallet-portfolio-grid"
              cells={walletActionCards.map((card) => ({ label: card.label, value: card.value, meta: card.meta }))}
            />
          )}
        </div>

        <div className="wallet-nav-row">
          <SegmentedControl
            className="wallet-nav-seg"
            items={primaryViews}
            value={currentPrimaryView}
            onChange={handlePrimaryView}
            ariaLabel="Wallet views"
          />
          <div className="sol-actions">
            <button type="button" className="solx-btn solx-btn--sm" onClick={() => setActiveView('onramp')} disabled={!activeWallet}>Buy SOL</button>
            <button type="button" className={`solx-btn solx-btn--sm${showInfrastructure ? ' solx-btn--primary' : ''}`} onClick={() => setShowInfrastructure((v) => !v)}>Infra</button>
          </div>
        </div>
      </section>

      {showInfrastructure && (
        <WalletSettings
          showMarketTape={showMarketTape}
          showTitlebarWallet={showTitlebarWallet}
          heliusConfigured={dashboard.heliusConfigured}
          jupiterConfigured={jupiterConfigured}
          moonpayStatus={moonpayStatus}
          infrastructure={walletInfrastructure}
          error={error}
          onToggleTape={async (checked) => { await setStoreShowMarketTape(checked) }}
          onToggleTitlebarWallet={async (checked) => { await setStoreShowTitlebarWallet(checked) }}
          onSaveHelius={handleSaveHelius}
          onDeleteHelius={handleDeleteHelius}
          onSaveJupiter={handleSaveJupiter}
          onDeleteJupiter={handleDeleteJupiter}
          onSaveMoonpayKeys={handleSaveMoonpayKeys}
          onDeleteMoonpayKeys={handleDeleteMoonpayKeys}
          onSaveInfrastructure={handleSaveInfrastructure}
          onTrackSolflareWallet={handleTrackSolflareWallet}
        />
      )}

      {activeView === 'overview' && !activeWallet && (
        <section className="wallet-section wallet-empty-route">
          <div>
            <div className="wallet-section-title">First wallet</div>
            <div className="wallet-first-run-title">Create a signing wallet to start</div>
            <p className="wallet-first-run-copy">Generate a wallet if DAEMON should sign sends, swaps, launches, and transaction previews. Track an address only for read-only portfolio monitoring.</p>
          </div>
          <div className="wallet-actions wallet-actions-wrap">
            <button type="button" className="wallet-btn primary" onClick={() => { setCreateTab('generate'); setActiveView('manage') }}>Generate signing wallet</button>
            <button type="button" className="wallet-btn" onClick={() => { setCreateTab('keypair'); setActiveView('manage') }}>Import signing wallet</button>
            <button type="button" className="wallet-btn" onClick={() => { setCreateTab('import'); setActiveView('manage') }}>Track existing address</button>
          </div>
        </section>
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
                <button type="button" className="wallet-btn" onClick={() => void handleCopyWalletAddress(activeWallet.address, activeWallet.name)}>Copy address</button>
                <button type="button" className="wallet-btn primary" onClick={() => setActiveView('onramp')}>Buy SOL</button>
                <button type="button" className="wallet-btn" onClick={() => setActiveView('receive')}>Receive</button>
                {hasKeypair && <button type="button" className="wallet-btn primary-soft" onClick={() => handleExportKeyStart(activeWallet.id)}>Export key</button>}
              </div>
            </div>
            <WalletReadinessChecklist
              readiness={walletReadiness}
              routeLabel={activeProjectId ? 'Project-aware route' : 'Workspace route'}
              activityDetail={transactions?.length ? `${transactions.length} recent transaction${transactions.length === 1 ? '' : 's'} loaded.` : 'No recent transactions loaded yet.'}
              assetDetail={`${activeWallet.holdings.length} asset${activeWallet.holdings.length === 1 ? '' : 's'} tracked for this wallet.`}
              actions={(
                <>
                  {walletPrimaryAction ? (
                    <button type="button" className="wallet-btn primary" onClick={walletPrimaryAction.onClick}>{walletPrimaryAction.label}</button>
                  ) : null}
                  <button type="button" className="wallet-btn" onClick={walletSecondaryAction.onClick}>{walletSecondaryAction.label}</button>
                </>
              )}
            />
          </section>

          {holdingsPreview.length > 0 && (
            <section className="wallet-section">
              <div className="wallet-section-header">
                <div className="wallet-section-title">Holdings preview</div>
                <button type="button" className="wallet-icon-btn" onClick={() => setActiveView('holdings')}>See all</button>
              </div>
              <div className="sol-list">
                {holdingsPreview.map((holding) => (
                  <DataRow
                    key={holding.mint}
                    flush
                    title={holding.symbol}
                    meta={holding.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    actions={(
                      <>
                        {hasKeypair && holding.symbol !== 'SOL' && (
                          <button type="button" className="sol-link" onClick={() => handleSwapHolding(holding.mint)}>Sell</button>
                        )}
                        <button type="button" className="sol-link" onClick={() => void handleCopyMint(holding.mint, holding.symbol)}>Copy mint</button>
                      </>
                    )}
                  />
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
              <button type="button" className={`wallet-btn ${sendMode === 'sol' ? 'primary' : ''}`} onClick={() => openSend(activeWallet.id, 'sol')}>Send SOL</button>
              <button type="button" className={`wallet-btn ${sendMode === 'token' ? 'primary' : ''}`} onClick={() => openSend(activeWallet.id, 'token')} disabled={!hasKeypair}>Send token</button>
              <button type="button" className="wallet-btn" onClick={() => setActiveView('swap')} disabled={!hasKeypair}>Swap</button>
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
          {canSendSol ? (
            sendWalletId === activeWallet.id && sendMode && (sendMode === 'sol' || hasKeypair) && (
              <WalletSendForm
                walletId={activeWallet.id}
                walletName={activeWallet.name}
                sendMode={sendMode}
                sendDest={sendDest}
                sendAmount={sendAmount}
                sendMint={sendMint}
                sendMax={sendMax}
                selectedRecipientWalletId={selectedRecipientWalletId}
                recipientWallets={recipientWalletOptions}
                tokenOptions={sendMode === 'token' ? (walletTokenOptions[activeWallet.id] ?? activeWalletTokenOptions) : []}
                walletBalanceSol={walletBalances[activeWallet.id] ?? null}
                executionMode={walletInfrastructure.executionMode}
                cluster={walletInfrastructure.cluster}
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
            <div className="wallet-empty">This wallet is watch-only. Import or generate a signing wallet, or connect the matching Solflare address before sending.</div>
          )}
        </section>
      )}

      {activeView === 'manage' && (
        <>
          {trackedWallets.length === 0 && (
            <section className="wallet-section wallet-first-run">
              <div>
                <div className="wallet-section-title">First wallet</div>
                <div className="wallet-first-run-title">Create a signing wallet to start</div>
                <p className="wallet-first-run-copy">Generate a wallet if DAEMON should sign sends, swaps, launches, and transaction previews. Track an address only for read-only portfolio monitoring.</p>
              </div>
              <div className="wallet-first-run-actions">
                <button type="button" className="wallet-btn primary" onClick={() => { setCreateTab('generate'); setGenSuccess(null) }}>Generate signing wallet</button>
                <button type="button" className="wallet-btn" onClick={() => { setCreateTab('keypair'); setGenSuccess(null) }}>Import signing wallet</button>
                <button type="button" className="wallet-btn" onClick={() => { setCreateTab('import'); setGenSuccess(null) }}>Track existing address</button>
              </div>
            </section>
          )}

          <section className="wallet-section">
            <div className="wallet-section-header">
              <div>
                <div className="wallet-section-title">{trackedWallets.length === 0 ? 'Create your first wallet' : 'Create, import, or track wallet'}</div>
                <div className="wallet-caption">Import a Solana keypair or generate a signing wallet for transactions. Track an address only for read-only monitoring.</div>
              </div>
            </div>
            <div className="wallet-tab-group wallet-create-tabs">
              <button type="button" className={`wallet-tab ${createTab === 'generate' ? 'active' : ''}`} onClick={() => { setCreateTab('generate'); setGenSuccess(null) }}>Generate</button>
              <button type="button" className={`wallet-tab ${createTab === 'keypair' ? 'active' : ''}`} onClick={() => { setCreateTab('keypair'); setGenSuccess(null) }}>Import keypair</button>
              <button type="button" className={`wallet-tab ${createTab === 'import' ? 'active' : ''}`} onClick={() => { setCreateTab('import'); setGenSuccess(null) }}>Track address</button>
            </div>
            {error && <div className="wallet-error-msg">{error}</div>}
            {createTab === 'keypair' && (
              <div className="wallet-form wallet-create-grid">
                <div className="wallet-create-note">Paste a private key or Solana keypair JSON. DAEMON stores the signer encrypted for transactions.</div>
                <input className="wallet-input" value={importKeyName} onChange={(e) => setImportKeyName(e.target.value)} placeholder="Wallet name (optional)" />
                <textarea
                  className="wallet-input wallet-private-key-input"
                  value={importPrivateKey}
                  onChange={(e) => setImportPrivateKey(e.target.value)}
                  placeholder="Private key, seed, JSON array, base58, base64, or hex"
                  spellCheck={false}
                />
                <div className="wallet-actions wallet-actions-wrap">
                  <button type="button" className="wallet-btn primary" onClick={() => void handleImportSigningWallet(importKeyName.trim(), importPrivateKey.trim())}>Import signing wallet</button>
                  <button type="button" className="wallet-btn" onClick={() => void handleImportSigningWallet(importKeyName.trim())}>Choose keypair JSON</button>
                </div>
                {genSuccess && <div className="wallet-success-msg">Imported: {truncateAddress(genSuccess)}</div>}
              </div>
            )}
            {createTab === 'import' && (
              <div className="wallet-form wallet-create-grid">
                <div className="wallet-create-note">Watch-only. DAEMON will not be able to sign from this address.</div>
                <input className="wallet-input" value={walletName} onChange={(e) => setWalletName(e.target.value)} placeholder="Wallet name (Treasury watch)" />
                <input className="wallet-input" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="Solana address to track" />
                <button type="button" className="wallet-btn primary wallet-btn-wide" onClick={() => void handleAddWallet(walletName.trim(), walletAddress.trim())}>Track address</button>
              </div>
            )}
            {createTab === 'generate' && (
              <div className="wallet-form wallet-create-grid">
                <div className="wallet-create-note">Creates a local keypair DAEMON can use for signing.</div>
                <input className="wallet-input" value={genName} onChange={(e) => setGenName(e.target.value)} placeholder="Wallet name (Main wallet)" />
                <button type="button" className="wallet-btn primary wallet-btn-wide" onClick={() => void handleGenerate(genName.trim())}>Generate signing wallet</button>
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
                <Surface key={wallet.id} padding="md" className="wallet-row-card">
                  <DataRow
                    flush
                    title={wallet.name}
                    detail={(
                      <>
                        {wallet.isDefault && <Badge tone="feature">default</Badge>}
                        <Badge tone={keypairCache[wallet.id] ? 'success' : 'neutral'}>{keypairCache[wallet.id] ? 'Signer' : 'Watch-only'}</Badge>
                        <span>{truncateAddress(wallet.address)}</span>
                        <span>{wallet.tokenCount} assets</span>
                      </>
                    )}
                    actions={<span className="wallet-value wallet-value-strong">${formatUsd(wallet.totalUsd)}</span>}
                  />
                  <div className="wallet-actions-card">
                    <div className="sol-actions">
                      {!wallet.isDefault && <button type="button" className="solx-btn solx-btn--sm" onClick={() => void handleSetDefault(wallet.id)}>Make main wallet</button>}
                      {activeProjectId && <button type="button" className="solx-btn solx-btn--sm" onClick={() => void handleAssignProject(wallet.id)}>Use for project</button>}
                      <button type="button" className="solx-btn solx-btn--sm" onClick={() => void handleCopyWalletAddress(wallet.address, wallet.name)}>Copy address</button>
                      {keypairCache[wallet.id] && <button type="button" className="solx-btn solx-btn--sm solx-btn--primary" onClick={() => openSend(wallet.id, 'sol')}>Move funds</button>}
                      {!keypairCache[wallet.id] && <button type="button" className="solx-btn solx-btn--sm solx-btn--primary" onClick={() => { setAttachSignerWalletId(wallet.id); setAttachSignerPrivateKey('') }}>Add signer</button>}
                      {keypairCache[wallet.id] && <button type="button" className="solx-btn solx-btn--sm" onClick={() => handleExportKeyStart(wallet.id)}>Export key</button>}
                      <button type="button" className="solx-btn solx-btn--sm solx-btn--danger" onClick={() => void handleDeleteWallet(wallet.id)}>Remove</button>
                    </div>
                  </div>
                  {attachSignerWalletId === wallet.id && (
                    <div className="wallet-form wallet-create-grid wallet-signer-import">
                      <textarea
                        className="sol-input"
                        value={attachSignerPrivateKey}
                        onChange={(e) => setAttachSignerPrivateKey(e.target.value)}
                        placeholder="Private key for this address"
                        spellCheck={false}
                      />
                      <div className="sol-actions">
                        <button type="button" className="solx-btn solx-btn--primary" onClick={() => void handleImportKeypairForWallet(wallet.id, attachSignerPrivateKey.trim())}>Import signer</button>
                        <button type="button" className="solx-btn" onClick={() => { setAttachSignerWalletId(null); setAttachSignerPrivateKey('') }}>Cancel</button>
                      </div>
                    </div>
                  )}
                  {renderWalletInline(wallet.id)}
                </Surface>
              ))}
              {trackedWallets.length === 0 && <div className="sol-empty">No wallets yet. Generate a signing wallet or track an address above.</div>}
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
          {transactions && transactions.length > 0 ? <TransactionHistory transactions={transactions} cluster={walletInfrastructure.cluster} /> : <div className="sol-empty">No recent transactions for the active wallet yet.</div>}

          {dashboard.feed.length > 0 && (
            <>
              <div className="sol-section-head" style={{ marginTop: 'var(--space-lg)' }}>
                <div className="sol-section-title">Live feed</div>
              </div>
              <div className="sol-list">
                {dashboard.feed.slice(0, 8).map((entry) => (
                  <DataRow
                    key={entry.walletId}
                    flush
                    title={entry.walletName}
                    actions={(
                      <span className={`wallet-feed-delta ${entry.deltaUsd >= 0 ? 'up' : 'down'}`}>
                        {entry.deltaUsd >= 0 ? '+' : '-'}${formatUsd(Math.abs(entry.deltaUsd))}
                      </span>
                    )}
                  />
                ))}
              </div>
            </>
          )}
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
  return compactAddress(address)
}
