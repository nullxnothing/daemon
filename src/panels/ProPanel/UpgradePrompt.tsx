import { useProStore } from '../../store/pro'
import daemonProBadge from '../../assets/daemon-pro-badge.png'
import './ProPanel.css'

/**
 * Reusable gate component shown anywhere a Pro feature is invoked without
 * an active subscription. Free users see the feature description + a
 * "Subscribe" button that jumps them to the Pro panel.
 *
 * Drop it in as a fallback wherever a Pro feature renders:
 *
 *   const isPro = useProStore((s) => s.subscription.active)
 *   if (!isPro) return <UpgradePrompt reason="Arena access requires Daemon Pro" />
 *   return <ArenaView />
 */

interface UpgradePromptProps {
  reason: string
  onOpenProPanel?: () => void
}

export function UpgradePrompt({ reason, onOpenProPanel }: UpgradePromptProps) {
  const price = useProStore((s) => s.price)
  const fetchPrice = useProStore((s) => s.fetchPrice)

  // Lazy-fetch the price on first mount so the prompt shows actual numbers
  if (!price) {
    void fetchPrice()
  }

  return (
    <div className="pro-upgrade-prompt">
      <img src={daemonProBadge} alt="" className="pro-badge-image pro-upgrade-badge-image" draggable={false} />
      <div className="pro-upgrade-title">Upgrade to unlock</div>
      <div className="pro-upgrade-reason">{reason}</div>
      {price && (
        <div className="pro-upgrade-price">
          <span className="pro-upgrade-price-amount">${price.priceUsdc}</span>
          <span className="pro-upgrade-price-period">/ {price.durationDays} days</span>
        </div>
      )}
      <div className="pro-upgrade-features">
        <div>Arena access — submit, vote, view community tools</div>
        <div>Pro skill pack — curated agents, audit pipelines, and templates</div>
        <div>Hosted MCP sync — one config, every machine</div>
        <div>Priority API quota — 500 calls/month to the paid AI endpoints</div>
      </div>
      {onOpenProPanel && (
        <button className="pro-upgrade-cta" onClick={onOpenProPanel}>
          Open Daemon Pro
        </button>
      )}
    </div>
  )
}
