import type { SolanaProjectInfo } from '../../store/solanaToolbox'

const FRAMEWORK_LABELS: Record<string, string> = {
  anchor: 'Anchor',
  native: 'Native Solana',
  'client-only': 'Solana Client',
}

export function ProjectStatusSection({ info }: { info: SolanaProjectInfo | null }) {
  if (!info || !info.isSolanaProject) {
    return (
      <div className="solana-section">
        <div className="solana-section-title">Project</div>
        <div className="solana-empty">No Solana project detected</div>
      </div>
    )
  }

  return (
    <div className="solana-section">
      <div className="solana-section-title">Project</div>
      <div className="solana-project-info">
        <div className="solana-project-framework">
          <span className="solana-dot green" style={{ display: 'inline-block', marginRight: 6 }} />
          {FRAMEWORK_LABELS[info.framework ?? ''] ?? 'Solana'} project detected
        </div>
        {info.indicators.map((ind) => (
          <div key={ind} className="solana-project-indicator">{ind}</div>
        ))}
      </div>
    </div>
  )
}
