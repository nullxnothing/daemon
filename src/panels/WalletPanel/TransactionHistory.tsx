import './WalletPanel.css'

interface WalletTransaction {
  id: string
  type: string
  signature: string | null
  from_address: string
  to_address: string
  amount: number
  mint: string | null
  status: string
  created_at: number
}

interface TransactionHistoryProps {
  transactions: WalletTransaction[]
}

export function TransactionHistory({ transactions }: TransactionHistoryProps) {
  if (transactions.length === 0) return null

  return (
    <section className="wallet-section">
      <div className="wallet-section-title">Transaction History</div>
      {transactions.slice(0, 10).map((tx) => (
        <div key={tx.id} className="wallet-tx-row">
          <div>
            <div className="wallet-label">{tx.type}</div>
            <div className="wallet-caption">
              {shortAddress(tx.from_address)} → {shortAddress(tx.to_address)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="wallet-label">{tx.amount}{tx.mint ? '' : ' SOL'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
              <span className={`wallet-tx-status ${tx.status}`}>{tx.status}</span>
              <span className="wallet-caption">{relativeTime(tx.created_at)}</span>
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}

function shortAddress(value: string): string {
  return `${value.slice(0, 4)}...${value.slice(-4)}`
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
