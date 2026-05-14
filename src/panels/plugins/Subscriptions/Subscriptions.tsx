import { useEffect, useMemo } from 'react'
import type { DaemonPlanId, ProSubscriptionState } from '../../../../electron/shared/types'
import { useProStore } from '../../../store/pro'
import { useUIStore } from '../../../store/ui'
import '../plugin.css'
import './Subscriptions.css'

type LaneId = 'standard' | 'reasoning' | 'premium'

interface TierDefinition {
  id: DaemonPlanId
  name: string
  price: string
  cadence: string
  status: 'live' | 'planned' | 'contact'
  credits: string
  lane: string
  bestFor: string
  features: string[]
}

const TIERS: TierDefinition[] = [
  {
    id: 'light',
    name: 'Light',
    price: 'Free',
    cadence: 'local',
    status: 'live',
    credits: 'BYOK',
    lane: 'Local and BYOK',
    bestFor: 'Local builders',
    features: ['Editor, terminal, git, wallet, and local projects', 'Bring-your-own-key agents', 'Basic docs and templates'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$20',
    cadence: 'monthly',
    status: 'live',
    credits: '2,000',
    lane: 'Standard hosted lane',
    bestFor: 'Individual builders',
    features: ['DAEMON AI hosted usage', 'Pro Skills, Arena, MCP sync', 'Basic App Factory and Shipline flows'],
  },
  {
    id: 'operator',
    name: 'Operator',
    price: '$60',
    cadence: 'monthly',
    status: 'planned',
    credits: '7,500',
    lane: 'Reasoning lane',
    bestFor: 'Daily agent users',
    features: ['Higher AI allowance', 'Cloud/background agents', 'Advanced ship/deploy workflows'],
  },
  {
    id: 'ultra',
    name: 'Ultra',
    price: '$200',
    cadence: 'monthly',
    status: 'planned',
    credits: '30,000',
    lane: 'Premium hosted lane',
    bestFor: 'Power users',
    features: ['Maximum individual usage', 'Priority model access', 'Early features and advanced automation'],
  },
  {
    id: 'team',
    name: 'Teams',
    price: '$49',
    cadence: 'user/month',
    status: 'planned',
    credits: 'Pooled',
    lane: 'Team hosted lanes',
    bestFor: 'Studios and teams',
    features: ['Shared workspaces', 'Team billing and pooled usage', 'Admin controls and usage reporting'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'contract',
    status: 'contact',
    credits: 'Custom',
    lane: 'Private routing',
    bestFor: 'Funds, labs, agencies',
    features: ['Private deployments', 'Custom limits and support', 'Compliance, invoicing, and SSO path'],
  },
]

const LANES: Array<{
  id: LaneId
  label: string
  requiredPlan: DaemonPlanId
  description: string
}> = [
  {
    id: 'standard',
    label: 'Standard',
    requiredPlan: 'pro',
    description: 'Hosted DAEMON AI chat, project-aware help, and standard workflow calls.',
  },
  {
    id: 'reasoning',
    label: 'Reasoning',
    requiredPlan: 'operator',
    description: 'Architecture, deep debugging, longer multi-step work, and heavier agent planning.',
  },
  {
    id: 'premium',
    label: 'Premium',
    requiredPlan: 'ultra',
    description: 'Highest-priority models and the most expensive automation paths.',
  },
]

const HOLDER_TIERS = [
  { label: 'Holder Pro', threshold: '1M DAEMON', status: 'live', benefit: 'Claim Pro with included monthly AI usage.' },
  { label: 'Holder Operator', threshold: '5M DAEMON', status: 'planned', benefit: 'Higher allowance or Operator discount path.' },
  { label: 'Holder Ultra', threshold: '10M DAEMON', status: 'planned', benefit: 'Ultra discount, priority, and private beta path.' },
]

const PLAN_RANK: Record<DaemonPlanId, number> = {
  light: 0,
  pro: 1,
  operator: 2,
  team: 2,
  ultra: 3,
  enterprise: 4,
}

function isPlanAtLeast(plan: DaemonPlanId, required: DaemonPlanId) {
  return (PLAN_RANK[plan] ?? 0) >= (PLAN_RANK[required] ?? 0)
}

function formatDate(timestamp: number | null) {
  if (!timestamp) return 'No renewal date'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(timestamp)
}

function formatHolderAmount(holderStatus: ProSubscriptionState['holderStatus']) {
  if (holderStatus.currentAmount === null || holderStatus.currentAmount === undefined) return 'Not checked'
  return `${holderStatus.currentAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${holderStatus.symbol}`
}

function getUsagePercent(quota: { quota: number; used: number; remaining: number } | null) {
  if (!quota?.quota) return 0
  return Math.min(100, Math.max(0, (quota.used / quota.quota) * 100))
}

export default function Subscriptions() {
  const subscription = useProStore((state) => state.subscription)
  const price = useProStore((state) => state.price)
  const quota = useProStore((state) => state.quota)
  const loadingQuota = useProStore((state) => state.loadingQuota)
  const error = useProStore((state) => state.error)
  const refreshStatus = useProStore((state) => state.refreshStatus)
  const fetchPrice = useProStore((state) => state.fetchPrice)
  const loadQuota = useProStore((state) => state.loadQuota)
  const openWorkspaceTool = useUIStore((state) => state.openWorkspaceTool)

  useEffect(() => {
    void refreshStatus()
    void fetchPrice()
  }, [fetchPrice, refreshStatus])

  useEffect(() => {
    if (subscription.active) void loadQuota()
  }, [loadQuota, subscription.active, subscription.plan])

  const activeTier = useMemo(
    () => TIERS.find((tier) => tier.id === subscription.plan) ?? TIERS[0],
    [subscription.plan],
  )
  const holderStatus = subscription.holderStatus
  const usagePercent = getUsagePercent(quota)
  const billingLabel = price ? `${price.priceUsdc} USDC / ${price.durationDays} days` : 'Not configured'
  const accessSource = subscription.accessSource === 'holder'
    ? 'Holder claim'
    : subscription.accessSource === 'payment'
      ? 'Paid subscription'
      : subscription.accessSource === 'dev_bypass'
        ? 'Developer bypass'
        : subscription.accessSource === 'trial'
          ? 'Trial'
          : subscription.active
            ? 'Admin grant'
            : 'Free'

  return (
    <div className="plugin-panel subscriptions-panel">
      <header className="subscriptions-header">
        <div>
          <div className="panel-header">SUBSCRIPTIONS</div>
          <h2 className="subscriptions-title">DAEMON access and hosted AI lanes</h2>
        </div>
        <div className={`subscriptions-status ${subscription.active ? 'subscriptions-status--active' : ''}`}>
          {subscription.active ? 'Active' : 'Light'}
        </div>
      </header>

      {error && <div className="subscriptions-alert">{error}</div>}

      <section className="subscriptions-summary">
        <div className="subscriptions-summary-main">
          <span className="subscriptions-eyebrow">Current plan</span>
          <strong>{activeTier.name}</strong>
          <span>{accessSource}</span>
        </div>
        <div className="subscriptions-summary-grid">
          <SummaryStat label="Renewal" value={formatDate(subscription.expiresAt)} />
          <SummaryStat label="Hosted credits" value={quota ? quota.quota.toLocaleString() : activeTier.credits} />
          <SummaryStat label="Used" value={quota ? quota.used.toLocaleString() : loadingQuota ? 'Loading' : 'No usage yet'} />
          <SummaryStat label="Price rail" value={billingLabel} />
        </div>
        <div className="subscriptions-usage" aria-label="Monthly DAEMON AI usage">
          <div className="subscriptions-usage-row">
            <span>Monthly DAEMON AI usage</span>
            <strong>{quota ? `${Math.round(usagePercent)}%` : 'Pending'}</strong>
          </div>
          <div className="subscriptions-usage-track">
            <div className="subscriptions-usage-fill" style={{ width: `${usagePercent}%` }} />
          </div>
        </div>
      </section>

      <section className="subscriptions-section">
        <div className="subscriptions-section-head">
          <h3>Plans</h3>
          <button type="button" className="subscriptions-link-button" onClick={() => openWorkspaceTool('pro')}>
            Open Pro and holder access
          </button>
        </div>
        <div className="subscriptions-tier-grid">
          {TIERS.map((tier) => (
            <TierCard key={tier.id} tier={tier} current={tier.id === subscription.plan} />
          ))}
        </div>
      </section>

      <section className="subscriptions-section">
        <div className="subscriptions-section-head">
          <h3>Hosted model lanes</h3>
          <button type="button" className="subscriptions-link-button" onClick={() => openWorkspaceTool('daemon-ai')}>
            Open DAEMON AI
          </button>
        </div>
        <div className="subscriptions-lane-list">
          {LANES.map((lane) => {
            const unlocked = subscription.active && isPlanAtLeast(subscription.plan, lane.requiredPlan)
            return (
              <div key={lane.id} className={`subscriptions-lane ${unlocked ? 'subscriptions-lane--unlocked' : ''}`}>
                <div>
                  <strong>{lane.label}</strong>
                  <span>{lane.description}</span>
                </div>
                <div className="subscriptions-lane-meta">
                  <span>{lane.requiredPlan}+ required</span>
                  <b>{unlocked ? 'Unlocked' : 'Locked'}</b>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="subscriptions-section subscriptions-holder">
        <div className="subscriptions-section-head">
          <h3>Holder access</h3>
          <button type="button" className="subscriptions-link-button" onClick={() => openWorkspaceTool('docs')}>
            Open docs
          </button>
        </div>
        <div className="subscriptions-holder-status">
          <SummaryStat label="Wallet balance" value={formatHolderAmount(holderStatus)} />
          <SummaryStat label="Live threshold" value={holderStatus.minAmount ? `${holderStatus.minAmount.toLocaleString()} ${holderStatus.symbol}` : 'Not configured'} />
          <SummaryStat label="Eligibility" value={holderStatus.enabled ? holderStatus.eligible ? 'Eligible' : 'Not eligible' : 'Disabled'} />
        </div>
        <div className="subscriptions-holder-grid">
          {HOLDER_TIERS.map((tier) => (
            <div key={tier.label} className="subscriptions-holder-tier">
              <div>
                <strong>{tier.label}</strong>
                <span>{tier.threshold}</span>
              </div>
              <p>{tier.benefit}</p>
              <small className={`subscriptions-plan-badge ${tier.status === 'live' ? 'subscriptions-plan-badge--live' : ''}`}>
                {tier.status}
              </small>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="subscriptions-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function TierCard({ tier, current }: { tier: TierDefinition; current: boolean }) {
  return (
    <article className={`subscriptions-tier ${current ? 'subscriptions-tier--current' : ''}`}>
      <div className="subscriptions-tier-top">
        <div>
          <strong>{tier.name}</strong>
          <span>{tier.bestFor}</span>
        </div>
        <small className={`subscriptions-plan-badge subscriptions-plan-badge--${tier.status}`}>{tier.status}</small>
      </div>
      <div className="subscriptions-price">
        <span>{tier.price}</span>
        <small>{tier.cadence}</small>
      </div>
      <div className="subscriptions-tier-meta">
        <span>{tier.credits} credits</span>
        <span>{tier.lane}</span>
      </div>
      <ul>
        {tier.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      {current && <div className="subscriptions-current-marker">Current plan</div>}
    </article>
  )
}
