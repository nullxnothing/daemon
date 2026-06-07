import { useState, useEffect, useCallback } from 'react'
import { LaunchTab } from './LaunchTab'
import { TradeTab } from './TradeTab'
import { FeesTab } from './FeesTab'
import '../plugin.css'
import './PumpFunTool.css'

type Tab = 'launch' | 'trade' | 'fees'

interface Wallet {
  id: string
  name: string
  address: string
  is_default: number
}

export default function PumpFunTool() {
  const [tab, setTab] = useState<Tab>('launch')
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [walletId, setWalletId] = useState<string | null>(null)
  const [hasKeypair, setHasKeypair] = useState(false)
  const [cluster, setCluster] = useState<WalletInfrastructureSettings['cluster']>('devnet')
  const [walletError, setWalletError] = useState<string | null>(null)

  const loadWallets = useCallback(async () => {
    setWalletError(null)
    try {
      const [walletRes, infraRes] = await Promise.all([
        window.daemon.wallet.list(),
        window.daemon.settings.getWalletInfrastructureSettings(),
      ])
      if (infraRes.ok && infraRes.data) {
        setCluster(infraRes.data.cluster)
      }
      if (walletRes.ok && walletRes.data) {
        const list = walletRes.data as Wallet[]
        setWallets(list)
        if (!walletId && list.length > 0) {
          const defaultWallet = list.find((w) => w.is_default) ?? list[0]
          setWalletId(defaultWallet.id)
        }
        return
      }
      setWalletError(walletRes.error ?? 'Could not load wallets for PumpFun.')
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : 'Could not load wallets for PumpFun.')
    }
  }, [walletId])

  useEffect(() => { loadWallets() }, [loadWallets])

  useEffect(() => {
    let cancelled = false
    if (!walletId) { setHasKeypair(false); return }
    setHasKeypair(false)
    window.daemon.pumpfun.hasKeypair(walletId).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setHasKeypair(!!res.data)
      } else {
        setHasKeypair(false)
        setWalletError(res.error ?? 'Could not check whether this wallet has a PumpFun keypair.')
      }
    }).catch((error) => {
      if (cancelled) return
      setHasKeypair(false)
      setWalletError(error instanceof Error ? error.message : 'Could not check whether this wallet has a PumpFun keypair.')
    })
    return () => { cancelled = true }
  }, [walletId])

  const handleImportKeypair = async () => {
    if (!walletId) return
    setWalletError(null)
    try {
      const res = await window.daemon.pumpfun.importKeypair(walletId)
      if (res.ok && res.data) {
        setHasKeypair(true)
      } else {
        setWalletError(res.error ?? 'Could not import the PumpFun keypair for this wallet.')
      }
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : 'Could not import the PumpFun keypair for this wallet.')
    }
  }

  return (
    <div className="pf-panel">
      <header className="pf-plugin-head">
        <span className="label">ClawPump</span>
        <span className="pf-plugin-badge">Plugin</span>
      </header>
      <div className="pf-wallet-bar">
        <span className="pf-wallet-dot" style={{ background: hasKeypair ? 'var(--green)' : 'var(--red)' }} />
        <select
          className="pf-wallet-select"
          value={walletId ?? ''}
          onChange={(e) => setWalletId(e.target.value || null)}
        >
          {wallets.length === 0 && <option value="">No wallets</option>}
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>{w.name} ({w.address.slice(0, 6)}...)</option>
          ))}
        </select>
        {!hasKeypair && walletId && (
          <button type="button" className="pf-import-btn" onClick={handleImportKeypair}>Import Key</button>
        )}
      </div>

      <div className="pf-tabs">
        <button type="button" className={`pf-tab ${tab === 'launch' ? 'active' : ''}`} onClick={() => setTab('launch')}>Launch</button>
        <button type="button" className={`pf-tab ${tab === 'trade' ? 'active' : ''}`} onClick={() => setTab('trade')}>Trade</button>
        <button type="button" className={`pf-tab ${tab === 'fees' ? 'active' : ''}`} onClick={() => setTab('fees')}>Fees</button>
      </div>

      <div className="pf-content">
        {walletError && (
          <div className="pf-result error" style={{ marginBottom: 10 }}>
            {walletError}
          </div>
        )}
        {wallets.length === 0 && !walletError && (
          <div className="pf-result warning" style={{ marginBottom: 10 }}>
            Create or import a wallet in Wallet before using PumpFun launch, trade, or fee actions.
          </div>
        )}
        {!hasKeypair && walletId && (
          <div className="pf-result error" style={{ marginBottom: 10 }}>
            Import a keypair before signing PumpFun launch, trade, or fee transactions.
          </div>
        )}
        {tab === 'launch' && <LaunchTab walletId={hasKeypair ? walletId : null} cluster={cluster} />}
        {tab === 'trade' && <TradeTab walletId={hasKeypair ? walletId : null} cluster={cluster} />}
        {tab === 'fees' && <FeesTab walletId={hasKeypair ? walletId : null} cluster={cluster} />}
      </div>
    </div>
  )
}
