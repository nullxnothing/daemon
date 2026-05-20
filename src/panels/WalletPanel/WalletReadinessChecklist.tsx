import type { ReactNode } from 'react'
import type { SolanaRouteReadinessModel } from '../../lib/solanaReadiness'
import { Badge, Card, StatusDot } from '../../components/Panel'

interface WalletReadinessChecklistProps {
  readiness: SolanaRouteReadinessModel
  routeLabel: string
  actions: ReactNode
  activityDetail: string
  assetDetail: string
}

export function WalletReadinessChecklist({
  readiness,
  routeLabel,
  actions,
  activityDetail,
  assetDetail,
}: WalletReadinessChecklistProps) {
  const summaryItems = [
    ...readiness.items,
    { key: 'activity', label: 'Activity snapshot', ready: true, detail: activityDetail },
    { key: 'assets', label: 'Asset coverage', ready: true, detail: assetDetail },
  ]

  return (
    <div className="wallet-readiness-shell">
      <Card className="wallet-readiness-hero">
        <div className="wallet-readiness-heading">
          <span className="wallet-overview-label">Wallet readiness</span>
          <Badge tone={readiness.readyCount === readiness.totalCount ? 'success' : 'warning'}>
            {readiness.readyCount}/{readiness.totalCount} ready
          </Badge>
        </div>
        <strong>{readiness.headline}</strong>
        <p>{readiness.description}</p>
        <div className="wallet-readiness-progress">
          <span>{routeLabel}</span>
          <span>{readiness.signingPathLabel}</span>
        </div>
        <div className="wallet-actions wallet-actions-wrap">
          {actions}
        </div>
      </Card>

      <div className="wallet-readiness-grid">
        {summaryItems.map((item) => (
          <Card key={item.key} className="wallet-readiness-item">
            <StatusDot tone={item.ready ? 'success' : 'neutral'} label={`${item.label}: ${item.ready ? 'ready' : 'needs setup'}`} />
            <div>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
