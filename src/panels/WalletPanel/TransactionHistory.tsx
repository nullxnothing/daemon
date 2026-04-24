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
  activity?: SolanaActivityEntry[]
}

export function TransactionHistory({ transactions, activity = [] }: TransactionHistoryProps) {
  if (transactions.length === 0 && activity.length === 0) return null

  return (
    <section className="wallet-section">
      <div className="wallet-section-title">Solana Activity</div>
      {activity.slice(0, 10).map((entry) => (
        <div key={entry.id} className="wallet-tx-row">
          <div>
            <div className="wallet-label">{entry.title}</div>
            <div className="wallet-caption">
              {entry.toAddress
                ? `${shortAddress(entry.fromAddress)} → ${shortAddress(entry.toAddress)}`
                : shortAddress(entry.fromAddress)}
            </div>
            <div className="wallet-caption">{entry.detail}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="wallet-label">{formatActivityAmount(entry)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
              <span className={`wallet-tx-status ${entry.status}`}>{entry.status}</span>
              <span className="wallet-caption">{relativeTime(entry.createdAt)}</span>
            </div>
            {entry.signature && <div className="wallet-caption">Sig {shortSignature(entry.signature)}</div>}
            {entry.error && <div className="wallet-tx-error">{entry.error}</div>}
          </div>
        </div>
      ))}
      {activity.length === 0 && transactions.slice(0, 10).map((tx) => (
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

function shortSignature(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-6)}`
}

function formatActivityAmount(entry: SolanaActivityEntry): string {
  if (entry.kind === 'validator-start' || entry.kind === 'validator-stop' || entry.kind === 'validator-error' || entry.kind === 'runtime-warning' || entry.kind === 'setup-action') {
    return entry.kind.replace(/-/g, ' ')
  }

  if (entry.kind === 'swap') {
    const input = entry.inputAmount != null ? `${entry.inputAmount} ${entry.inputSymbol ?? shortAddress(entry.inputMint ?? 'input')}` : entry.inputSymbol ?? 'Swap'
    const output = entry.outputAmount != null ? `${entry.outputAmount} ${entry.outputSymbol ?? shortAddress(entry.outputMint ?? 'output')}` : entry.outputSymbol ?? 'output'
    return `${input} -> ${output}`
  }

  if (entry.inputAmount == null) return entry.inputSymbol ?? entry.kind
  return `${entry.inputAmount}${entry.inputSymbol ? ` ${entry.inputSymbol}` : ''}`
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
