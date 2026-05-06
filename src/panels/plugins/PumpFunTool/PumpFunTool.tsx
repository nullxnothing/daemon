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

  const loadWallets = useCallback(async () => {
    const res = await window.daemon.wallet.list()
    if (res.ok && res.data) {
      const list = res.data as Wallet[]
      setWallets(list)
      if (!walletId && list.length > 0) {
        const defaultWallet = list.find((w) => w.is_default) ?? list[0]
        setWalletId(defaultWallet.id)
      }
    }
  }, [walletId])

  useEffect(() => { loadWallets() }, [loadWallets])

  useEffect(() => {
    if (!walletId) { setHasKeypair(false); return }
    window.daemon.pumpfun.hasKeypair(walletId).then((res) => {
      if (res.ok) setHasKeypair(!!res.data)
    })
  }, [walletId])

  const handleImportKeypair = async () => {
    if (!walletId) return
    const res = await window.daemon.pumpfun.importKeypair(walletId)
    if (res.ok && res.data) setHasKeypair(true)
  }

  return (
    <div className="pf-panel">
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
        {!hasKeypair && walletId && (
          <div className="pf-result error" style={{ marginBottom: 10 }}>
            Import a keypair to use PumpFun features. Click "Import Key" above.
          </div>
        )}
        {tab === 'launch' && <LaunchTab walletId={hasKeypair ? walletId : null} />}
        {tab === 'trade' && <TradeTab walletId={hasKeypair ? walletId : null} />}
        {tab === 'fees' && <FeesTab walletId={hasKeypair ? walletId : null} />}
      </div>
    </div>
  )
}
