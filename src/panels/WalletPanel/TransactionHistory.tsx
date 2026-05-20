import './WalletPanel.css'
import { canOpenSolscan, getSolscanTxLabel, getSolscanTxUrl } from '../../lib/solanaExplorer'
import { compactAddress } from '../../utils/textDisplay'

interface WalletTransaction {
  id: string
  type: string
  signature: string | null
  from_address: string
  to_address: string
  amount: number
  mint: string | null
  status: string
  error?: string | null
  created_at: number
}

interface TransactionHistoryProps {
  transactions: WalletTransaction[]
  cluster: WalletInfrastructureSettings['cluster']
}

export function TransactionHistory({ transactions, cluster }: TransactionHistoryProps) {
  if (transactions.length === 0) return null

  return (
    <section className="wallet-section">
      <div className="wallet-section-title">Transaction History</div>
      {transactions.slice(0, 10).map((tx) => (
        <div key={tx.id} className="wallet-tx-row">
          <div className="wallet-tx-main">
            <div className="wallet-label">{tx.type}</div>
            <div className="wallet-caption">
              {shortAddress(tx.from_address)} → {shortAddress(tx.to_address)}
            </div>
            {tx.error && <div className="wallet-caption wallet-tx-error">{tx.error}</div>}
          </div>
          <div className="wallet-tx-side">
            <div className="wallet-label">{tx.amount}{tx.mint ? '' : ' SOL'}</div>
            <div className="wallet-tx-meta">
              <span className={`wallet-tx-status ${tx.status}`}>{tx.status}</span>
              <span className="wallet-caption">{relativeTime(tx.created_at)}</span>
              {tx.signature && (
                <button
                  type="button"
                  className="wallet-tx-link"
                  onClick={() => {
                    if (canOpenSolscan(cluster)) {
                      void window.daemon.shell.openExternal(getSolscanTxUrl(tx.signature!, cluster))
                    } else {
                      void window.daemon.env.copyValue(tx.signature!)
                    }
                  }}
                >
                  {getSolscanTxLabel(cluster)}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}

function shortAddress(value: string): string {
  return compactAddress(value)
}

function relativeTime(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
