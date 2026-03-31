import { useRecoveryStore } from '../../store/recovery'

export function RecoveryStatsBar() {
  const walletCount = useRecoveryStore((s) => s.wallets.length)
  const scanned = useRecoveryStore((s) => s.scanned)
  const withFunds = useRecoveryStore((s) => s.withFunds)
  const processing = useRecoveryStore((s) => s.processing)
  const completed = useRecoveryStore((s) => s.completed)
  const failed = useRecoveryStore((s) => s.failed)
  const totalRecovered = useRecoveryStore((s) => s.totalRecovered)

  return (
    <div className="recovery-stats-bar">
      <Stat label="Wallets" value={walletCount} />
      <Stat label="Scanned" value={scanned} />
      <Stat label="With Funds" value={withFunds} />
      <Stat label="Processing" value={processing} />
      <Stat label="Completed" value={completed} />
      <Stat label="Failed" value={failed} className={failed > 0 ? 'red' : ''} />
      <div className="recovery-stat recovery-stat-sol">
        <span className="recovery-stat-label">Recovered</span>
        <span className="recovery-stat-value green">{totalRecovered.toFixed(6)} SOL</span>
      </div>
    </div>
  )
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="recovery-stat">
      <span className="recovery-stat-label">{label}</span>
      <span className={`recovery-stat-value ${className ?? ''}`}>{value}</span>
    </div>
  )
}
