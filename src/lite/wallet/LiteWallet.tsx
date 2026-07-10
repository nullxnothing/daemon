import { useCallback, useEffect, useState } from 'react'
import { Plus, Wallet as WalletIcon, ArrowClockwise } from '@phosphor-icons/react'
import type { WalletDashboard } from '../../../electron/shared/types'
import { LiteToolHeader } from '../components/LiteToolHeader'
import styles from './LiteWallet.module.css'

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr
}

function usd(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Base58 sanity check — full validation happens main-side in ValidationService.
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

interface LiteWalletProps {
  onAskAria: (prompt: string) => void
}

export function LiteWallet({ onAskAria }: LiteWalletProps) {
  const [dashboard, setDashboard] = useState<WalletDashboard | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [addr, setAddr] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await window.daemon.wallet.dashboard(null)
    if (res.ok && res.data) {
      const data = res.data
      setDashboard(data)
      setActiveId((prev) => prev ?? data.wallets[0]?.id ?? null)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!activeId) return
    // getDashboard resolves the active wallet's holdings from its default;
    // switch by setting the default so holdings reflect the selection.
    void window.daemon.wallet.setDefault(activeId).then(() => refresh())
  }, [activeId, refresh])

  const addWatch = async () => {
    const address = addr.trim()
    if (!BASE58_RE.test(address)) {
      setError('That does not look like a Solana address.')
      return
    }
    const res = await window.daemon.wallet.create({ name: name.trim() || shortAddr(address), address })
    if (!res.ok) {
      setError(res.error ?? 'Could not add the wallet.')
      return
    }
    setAdding(false); setAddr(''); setName(''); setError(null)
    await refresh()
  }

  const active = dashboard?.activeWallet ?? null

  return (
    <div className={styles.wallet}>
      <LiteToolHeader
        icon={WalletIcon}
        title="Wallet"
        subtitle="Watch balances and holdings. Read-only unless you create a wallet."
        action={
          <button type="button" className={styles.iconBtn} title="Refresh" aria-label="Refresh" onClick={() => void refresh()}>
            <ArrowClockwise size={15} aria-hidden="true" />
          </button>
        }
      />

      {!dashboard?.heliusConfigured ? (
        <div className={styles.notice}>
          Add a Helius API key in Settings to load live balances.
        </div>
      ) : null}

      <div className={styles.body}>
        <div className={styles.walletList}>
          <div className={styles.listHead}>
            <span>Wallets</span>
            <button type="button" className={styles.addBtn} onClick={() => setAdding((v) => !v)}>
              <Plus size={13} aria-hidden="true" /> Watch
            </button>
          </div>

          {adding ? (
            <div className={styles.addForm}>
              <input className={styles.input} placeholder="Address (base58)" value={addr} onChange={(e) => setAddr(e.currentTarget.value)} />
              <input className={styles.input} placeholder="Label (optional)" value={name} onChange={(e) => setName(e.currentTarget.value)} />
              {error ? <div className={styles.error}>{error}</div> : null}
              <button type="button" className={styles.primaryBtn} onClick={() => void addWatch()}>Add watch wallet</button>
            </div>
          ) : null}

          {loading && !dashboard ? (
            <div className={styles.empty}>Loading…</div>
          ) : dashboard && dashboard.wallets.length === 0 ? (
            <div className={styles.empty}>No wallets yet. Add one to watch its balance.</div>
          ) : (
            dashboard?.wallets.map((w) => (
              <button
                key={w.id}
                type="button"
                className={`${styles.walletRow}${w.id === activeId ? ` ${styles.walletActive}` : ''}`}
                onClick={() => setActiveId(w.id)}
              >
                <span className={styles.walletName}>{w.name}</span>
                <span className={styles.walletAddr}>{shortAddr(w.address)}</span>
                <span className={styles.walletUsd}>{usd(w.totalUsd)}</span>
              </button>
            ))
          )}
        </div>

        <div className={styles.holdings}>
          {active ? (
            <>
              <div className={styles.holdingsHead}>
                <div>
                  <div className={styles.holdingsName}>{active.name}</div>
                  <div className={styles.holdingsAddr}>{active.address}</div>
                </div>
                <button
                  type="button"
                  className={styles.askBtn}
                  onClick={() => onAskAria(`Tell me about this wallet: ${active.address}`)}
                >
                  Ask ARIA
                </button>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr><th>Token</th><th>Amount</th><th>Price</th><th>Value</th></tr>
                </thead>
                <tbody>
                  {active.holdings.length === 0 ? (
                    <tr><td colSpan={4} className={styles.tableEmpty}>No tokens found.</td></tr>
                  ) : (
                    active.holdings.map((h) => (
                      <tr key={h.mint}>
                        <td>{h.symbol || shortAddr(h.mint)}</td>
                        <td>{h.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                        <td>{h.priceUsd ? usd(h.priceUsd) : '—'}</td>
                        <td>{usd(h.valueUsd)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          ) : (
            <div className={styles.empty}>Select a wallet to see its holdings.</div>
          )}
        </div>
      </div>
    </div>
  )
}
