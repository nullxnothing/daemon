import { canOpenSolscan, getSolscanTxLabel, getSolscanTxUrl } from '../../lib/solanaExplorer'
import { compactAddress } from '../../utils/textDisplay'
import { DataRow, Badge, StatusDot } from '../../components/Panel'
import '../_solana/solanaSurface.css'

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

function statusTone(status: string): 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'confirmed' || status === 'success') return 'success'
  if (status === 'failed' || status === 'error') return 'danger'
  if (status === 'pending') return 'warning'
  return 'neutral'
}

export function TransactionHistory({ transactions, cluster }: TransactionHistoryProps) {
  if (transactions.length === 0) return null

  return (
    <div className="sol-list">
      {transactions.slice(0, 10).map((tx) => {
        const tone = statusTone(tx.status)
        return (
          <DataRow
            key={tx.id}
            flush
            leading={<StatusDot tone={tone} pulse={tx.status === 'pending'} />}
            title={tx.type}
            meta={(
              <>
                <span>{tx.amount}{tx.mint ? '' : ' SOL'}</span>
                <Badge tone={tone}>{tx.status}</Badge>
              </>
            )}
            detail={(
              <>
                <span>{shortAddress(tx.from_address)} → {shortAddress(tx.to_address)}</span>
                <span>{relativeTime(tx.created_at)}</span>
                {tx.error && <span style={{ color: 'var(--red)' }}>{tx.error}</span>}
              </>
            )}
            actions={tx.signature && (
              <button
                type="button"
                className="solx-btn solx-btn--sm"
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
          />
        )
      })}
    </div>
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
