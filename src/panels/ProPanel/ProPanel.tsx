import { useEffect, useMemo, useState } from 'react'
import { useProStore } from '../../store/pro'
import { useWalletStore } from '../../store/wallet'
import type { ProFeature, ProSubscriptionState, ProPriceInfo } from '../../../electron/shared/types'
import { Banner, Stat, TabPill, TabPillRow } from '../../components/Panel'
import { ArenaView } from './ArenaView'
import './ProPanel.css'

type ProTab = 'overview' | 'staking' | 'arena' | 'skills' | 'sync'

interface StakingTier {
  id: string
  label: string
  threshold: string
  status: 'live' | 'planned'
  unlocks: string[]
}

const STAKING_TIERS: StakingTier[] = [
  {
    id: 'signal',
    label: 'Signal',
    threshold: '25K staked',
    status: 'planned',
    unlocks: [
      'Staker badge in DAEMON',
      'Early feature notes and release windows',
      'Priority waitlist for new Solana modules',
    ],
  },
  {
    id: 'builder',
    label: 'Builder',
    threshold: '100K staked',
    status: 'planned',
    unlocks: [
      'Higher concurrent agent caps',
      'Premium project scaffolds and workflow packs',
      'Priority execution queue for hosted actions',
    ],
  },
  {
    id: 'operator',
    label: 'Operator',
    threshold: '250K staked',
    status: 'planned',
    unlocks: [
      'Launch addon access across supported protocols',
      'Higher MCP sync and priority API allowances',
      'Expanded arena voting weight and beta surfaces',
    ],
  },
]

export function ProPanel() {
  const subscription = useProStore((state) => state.subscription)
  const price = useProStore((state) => state.price)
  const subscribing = useProStore((state) => state.subscribing)
  const refreshStatus = useProStore((state) => state.refreshStatus)
  const fetchPrice = useProStore((state) => state.fetchPrice)
  const subscribe = useProStore((state) => state.subscribe)
  const claimHolderAccess = useProStore((state) => state.claimHolderAccess)
  const signOut = useProStore((state) => state.signOut)
  const error = useProStore((state) => state.error)
  const clearError = useProStore((state) => state.clearError)
  const quota = useProStore((state) => state.quota)
  const loadQuota = useProStore((state) => state.loadQuota)
  const wallets = useWalletStore((state) => state.dashboard?.wallets ?? [])

  const [activeTab, setActiveTab] = useState<ProTab>('overview')
  const [selectedWalletId, setSelectedWalletId] = useState('')
  const selectedWallet = wallets.find((wallet) => wallet.id === selectedWalletId) ?? null

  useEffect(() => {
    void refreshStatus()
    void fetchPrice()
  }, [refreshStatus, fetchPrice])

  useEffect(() => {
    if (!selectedWallet?.address) return
    void refreshStatus(selectedWallet.address)
  }, [refreshStatus, selectedWallet?.address])

  useEffect(() => {
    if (subscription.active && !quota) {
      void loadQuota()
    }
  }, [subscription.active, quota, loadQuota])

  useEffect(() => {
    if (selectedWalletId || wallets.length === 0) return
    const next = wallets.find((wallet) => wallet.isDefault) ?? wallets[0]
    setSelectedWalletId(next.id)
  }, [wallets, selectedWalletId])

  const daysRemaining = useMemo(() => {
    if (!subscription.expiresAt) return null
    const diff = subscription.expiresAt - Date.now()
    if (diff <= 0) return 0
    return Math.ceil(diff / (24 * 60 * 60 * 1000))
  }, [subscription.expiresAt])

  const handleSubscribe = async () => {
    if (!selectedWalletId) return
    const ok = await subscribe(selectedWalletId)
    if (ok) await loadQuota()
  }

  const handleClaimHolderAccess = async () => {
    if (!selectedWalletId) return
    const ok = await claimHolderAccess(selectedWalletId)
    if (ok) await loadQuota()
  }

  const isActive = subscription.active

  return (
    <section className="pro-panel">
      <header className="pro-panel-header">
        <div className="pro-panel-title-group">
          <div className="pro-panel-kicker">DAEMON PRO</div>
          <div className="pro-panel-title">{isActive ? 'Subscription active' : 'Unlock the full IDE'}</div>
          {isActive && daysRemaining !== null && (
            <div className="pro-panel-subtitle">{daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining</div>
          )}
        </div>
        {isActive && <button className="pro-btn" onClick={() => { void signOut() }}>Sign out</button>}
      </header>

      {error && (
        <div className="pro-error">
          {error}
          <button className="pro-error-dismiss" onClick={clearError}>×</button>
        </div>
      )}

      <TabPillRow variant="underline" className="pro-tabs" aria-label="Pro panel views">
        <TabPill variant="underline" size="md" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>Overview</TabPill>
        <TabPill variant="underline" size="md" active={activeTab === 'staking'} onClick={() => setActiveTab('staking')}>Staking</TabPill>
        <TabPill variant="underline" size="md" active={activeTab === 'arena'} onClick={() => setActiveTab('arena')}>Arena</TabPill>
        <TabPill variant="underline" size="md" active={activeTab === 'skills'} onClick={() => setActiveTab('skills')} disabled={!isActive}>Skills</TabPill>
        <TabPill variant="underline" size="md" active={activeTab === 'sync'} onClick={() => setActiveTab('sync')} disabled={!isActive}>MCP Sync</TabPill>
      </TabPillRow>

      <div className="pro-panel-body">
        {activeTab === 'overview' && !isActive && (
          <OverviewSubscribe
            price={price}
            wallets={wallets}
            selectedWalletId={selectedWalletId}
            onSelectWallet={setSelectedWalletId}
            subscribing={subscribing}
            onSubscribe={handleSubscribe}
            onClaimHolderAccess={handleClaimHolderAccess}
            holderStatus={subscription.holderStatus}
            accessSource={subscription.accessSource}
          />
        )}
        {activeTab === 'overview' && isActive && (
          <OverviewActive
            expiresAt={subscription.expiresAt}
            walletAddress={subscription.walletAddress}
            features={subscription.features}
            quota={quota}
            accessSource={subscription.accessSource}
          />
        )}
        {activeTab === 'staking' && (
          <StakingView
            selectedWalletLabel={selectedWallet ? `${selectedWallet.name} (${selectedWallet.address.slice(0, 4)}…${selectedWallet.address.slice(-4)})` : null}
            hasWallet={wallets.length > 0}
            holderStatus={subscription.holderStatus}
            accessSource={subscription.accessSource}
            onRefreshSelectedWallet={() => {
              if (!selectedWallet?.address) return
              void refreshStatus(selectedWallet.address)
            }}
            onClaimHolderAccess={handleClaimHolderAccess}
            selectedWalletId={selectedWalletId}
            subscribing={subscribing}
          />
        )}
        {activeTab === 'arena' && (isActive ? <ArenaView /> : <ArenaStatusLocked />)}
        {activeTab === 'skills' && isActive && <SkillsView />}
        {activeTab === 'sync' && isActive && <SyncView />}
      </div>

      <footer className="pro-panel-footer">
        <div className="pro-disclaimer">
          DAEMON stays open source. Pro adds curated content, hosted sync, and priority endpoints on top of the IDE.
        </div>
      </footer>
    </section>
  )
}

function StakingView({
  selectedWalletLabel,
  hasWallet,
  holderStatus,
  accessSource,
  onRefreshSelectedWallet,
  onClaimHolderAccess,
  selectedWalletId,
  subscribing,
}: {
  selectedWalletLabel: string | null
  hasWallet: boolean
  holderStatus: ProSubscriptionState['holderStatus']
  accessSource: ProSubscriptionState['accessSource']
  onRefreshSelectedWallet: () => void
  onClaimHolderAccess: () => void
  selectedWalletId: string
  subscribing: boolean
}) {
  const currentAmount = holderStatus.currentAmount ?? 0
  const minAmount = holderStatus.minAmount ?? 0
  const eligible = holderStatus.enabled && holderStatus.eligible

  return (
    <div className="pro-staking">
      <section className="pro-staking-hero">
        <div>
          <div className="pro-section-title">DAEMON staking utility</div>
          <div className="pro-section-caption">
            Current wallet-gated access is live now. Staking tiers below define how DAEMON can unlock more of the
            workspace over time without turning the token into a detached vanity asset.
          </div>
        </div>
        <div className="pro-staking-pill-group">
          <span className={`pro-staking-pill ${eligible ? 'eligible' : ''}`}>
            {eligible ? 'Holder access available' : 'Access not yet unlocked'}
          </span>
          {accessSource && <span className="pro-staking-pill pro-staking-pill-live">Live source: {accessSource === 'holder' ? 'holder' : 'payment'}</span>}
        </div>
      </section>

      <section className="pro-staking-status-grid">
        <ProStat label="Selected wallet" value={selectedWalletLabel ?? 'No wallet selected'} mono={Boolean(selectedWalletLabel)} />
        <ProStat label="Current DAEMON" value={currentAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
        <ProStat label="Live access threshold" value={holderStatus.enabled ? minAmount.toLocaleString() : 'Not configured'} />
        <ProStat label="Current path" value={accessSource === 'holder' ? 'Holder access active' : accessSource === 'payment' ? 'Paid access active' : 'No active access'} />
      </section>

      <section className="pro-staking-actions-card">
        <div>
          <div className="pro-subscribe-title">Current wallet check</div>
          <div className="pro-section-caption">
            Use this to refresh holder eligibility on the selected wallet. If live access is already unlocked, activate it on this device directly from here.
          </div>
        </div>
        {!hasWallet ? (
          <div className="pro-subscribe-empty">Create or import a wallet first so DAEMON can verify current access.</div>
        ) : (
          <div className="pro-staking-action-row">
            <button className="pro-btn" onClick={onRefreshSelectedWallet} disabled={!selectedWalletId || subscribing}>
              Refresh wallet status
            </button>
            <button className="pro-btn pro-btn-primary" onClick={onClaimHolderAccess} disabled={!eligible || !selectedWalletId || subscribing}>
              {subscribing ? 'Activating…' : 'Activate holder access'}
            </button>
          </div>
        )}
      </section>

      <section className="pro-staking-tier-grid">
        {STAKING_TIERS.map((tier) => (
          <div key={tier.id} className="pro-staking-tier-card">
            <div className="pro-staking-tier-head">
              <div>
                <div className="pro-feature-title">{tier.label}</div>
                <div className="pro-section-caption">{tier.threshold}</div>
              </div>
              <span className={`pro-staking-pill ${tier.status === 'live' ? 'live' : 'planned'}`}>{tier.status}</span>
            </div>
            <div className="pro-staking-unlocks">
              {tier.unlocks.map((unlock) => (
                <div key={unlock} className="pro-active-feature">
                  <span className="pro-active-check">+</span> {unlock}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

function ArenaStatusLocked() {
  return (
    <div className="pro-arena pro-arena-locked">
      <section className="pro-arena-contest">
        <div className="pro-arena-contest-copy">
          <div className="pro-arena-kicker">Arena status</div>
          <h2 className="pro-arena-contest-title">Arena submission is not active on this install.</h2>
          <p className="pro-arena-contest-body">
            The panel is reachable, but submission, voting, and the live leaderboard require Pro access or the local
            development bypass.
          </p>
        </div>
        <div className="pro-arena-prize-card">
          <div className="pro-arena-prize-label">Local dev</div>
          <div className="pro-arena-prize-value">DAEMON_PRO_DEV_BYPASS=1</div>
          <div className="pro-arena-prize-note">Restart DAEMON with this env var to test Arena locally.</div>
        </div>
      </section>
      <div className="pro-subscribe-box">
        <div className="pro-subscribe-title">Current status</div>
        <div className="pro-subscribe-empty">
          Arena is locked because no active Pro entitlement was found. Use the Overview tab to subscribe or claim
          holder access.
        </div>
      </div>
    </div>
  )
}

function OverviewSubscribe({
  price,
  wallets,
  selectedWalletId,
  onSelectWallet,
  subscribing,
  onSubscribe,
  onClaimHolderAccess,
  holderStatus,
  accessSource,
}: {
  price: ProPriceInfo | null
  wallets: Array<{ id: string; name: string; address: string; isDefault: boolean }>
  selectedWalletId: string
  onSelectWallet: (walletId: string) => void
  subscribing: boolean
  onSubscribe: () => void
  onClaimHolderAccess: () => void
  holderStatus: ProSubscriptionState['holderStatus']
  accessSource: ProSubscriptionState['accessSource']
}) {
  const isHolderEligible = holderStatus.enabled && holderStatus.eligible
  const currentAmount = holderStatus.currentAmount ?? 0
  const minAmount = holderStatus.minAmount ?? 0

  return (
    <div className="pro-overview">
      <div className="pro-hero">
        <div className="pro-hero-price">
          {price ? (
            <>
              <span className="pro-hero-price-amount">${price.priceUsdc}</span>
              <span className="pro-hero-price-period">/ {price.durationDays} days</span>
            </>
          ) : (
            <span className="pro-hero-price-loading">…</span>
          )}
        </div>
        <div className="pro-hero-subtitle">Pay in USDC via x402. No separate dashboard, no separate account, no card flow.</div>
      </div>

      <div className="pro-features-grid">
        <FeatureCard title="Arena" description="Submit your tools, vote on community submissions, and see what ships next." />
        <FeatureCard title="Pro skill pack" description="Curated agents, audit pipelines, and templates updated monthly." />
        <FeatureCard title="Hosted MCP sync" description="One MCP config, every machine. Push from one install, pull on the next." />
        <FeatureCard title="Priority API quota" description="500 calls / month to the paid AI endpoints without per-call charges." />
      </div>

      {holderStatus.enabled && (
        <Banner className={`pro-holder-banner ${isHolderEligible ? 'eligible' : ''}`} tone={isHolderEligible ? 'success' : 'warn'}>
          <div className="pro-holder-banner-title">{isHolderEligible ? 'Holder access available' : 'DAEMON holder access'}</div>
          <div className="pro-holder-banner-copy">
            Hold {minAmount.toLocaleString()}+ DAEMON to unlock Pro. Current selected wallet: {currentAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} DAEMON.
            {accessSource === 'holder' ? ' Holder access is currently active on this device.' : ''}
          </div>
        </Banner>
      )}

      <div className="pro-subscribe-box">
        <div className="pro-subscribe-title">{isHolderEligible ? 'Claim access' : 'Subscribe'}</div>
        {wallets.length === 0 ? (
          <div className="pro-subscribe-empty">You need a wallet to subscribe. Create one from the Wallet panel first.</div>
        ) : (
          <>
            <div className="pro-form-row">
              <label className="pro-form-label">Pay from wallet</label>
              <select className="pro-form-input" value={selectedWalletId} onChange={(e) => onSelectWallet(e.target.value)}>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name} ({wallet.address.slice(0, 4)}…{wallet.address.slice(-4)}){wallet.isDefault ? ' — default' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button className="pro-btn pro-btn-primary pro-btn-full" disabled={subscribing || !selectedWalletId || !price} onClick={isHolderEligible ? onClaimHolderAccess : onSubscribe}>
              {subscribing
                ? (isHolderEligible ? 'Verifying holder wallet…' : 'Signing payment…')
                : (isHolderEligible ? 'Activate holder access' : `Subscribe for $${price?.priceUsdc ?? '—'} USDC`)}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="pro-feature-card">
      <div className="pro-feature-title">{title}</div>
      <div className="pro-feature-description">{description}</div>
    </div>
  )
}

function OverviewActive({
  expiresAt,
  walletAddress,
  features,
  quota,
  accessSource,
}: {
  expiresAt: number | null
  walletAddress: string | null
  features: ProFeature[]
  quota: { quota: number; used: number; remaining: number } | null
  accessSource: ProSubscriptionState['accessSource']
}) {
  return (
    <div className="pro-overview">
      <div className="pro-active-grid">
        <ProStat label="Expires" value={expiresAt ? new Date(expiresAt).toLocaleDateString() : '—'} />
        <ProStat label="Wallet" value={walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-6)}` : '—'} mono />
        <ProStat label="Features" value={`${features.length} unlocked`} />
        <ProStat label="Access" value={accessSource === 'holder' ? 'Holder' : 'Paid'} />
        <ProStat label="Priority API" value={quota ? `${quota.used} / ${quota.quota}` : '—'} />
      </div>
      <div className="pro-active-features">
        {features.map((feature) => (
          <div key={feature} className="pro-active-feature">
            <span className="pro-active-check">✓</span> {featureLabel(feature)}
          </div>
        ))}
      </div>
    </div>
  )
}

function ProStat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <Stat
      className="pro-stat-card"
      label={label}
      labelClassName="pro-stat-label"
      value={value}
      valueClassName={`pro-stat-value${mono ? ' pro-stat-mono' : ''}`}
    />
  )
}

function featureLabel(feature: ProFeature) {
  switch (feature) {
    case 'arena':
      return 'Arena access'
    case 'pro-skills':
      return 'Pro skill pack'
    case 'mcp-sync':
      return 'Hosted MCP sync'
    case 'priority-api':
      return 'Priority API quota'
    default:
      return feature
  }
}

function SkillsView() {
  const syncSkills = useProStore((state) => state.syncSkills)
  const syncingSkills = useProStore((state) => state.syncingSkills)
  const [lastResult, setLastResult] = useState<{ installed: string[]; skipped: string[] } | null>(null)

  const handleSync = async () => {
    const result = await syncSkills()
    if (result) setLastResult(result)
  }

  return (
    <div className="pro-skills">
      <div className="pro-section-title">Pro skill pack</div>
      <div className="pro-section-caption">Curated agents, audit pipelines, and templates. Sync downloads the latest pack into your local skill directory.</div>
      <button className="pro-btn pro-btn-primary" disabled={syncingSkills} onClick={() => { void handleSync() }}>
        {syncingSkills ? 'Syncing…' : 'Sync skill pack'}
      </button>
      {lastResult && (
        <div className="pro-skills-result">
          <div>
            <span className="pro-skills-stat">{lastResult.installed.length}</span> installed · <span className="pro-skills-stat">{lastResult.skipped.length}</span> unchanged
          </div>
          {lastResult.installed.length > 0 && (
            <ul className="pro-skills-list">
              {lastResult.installed.map((id) => <li key={id}>{id}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function SyncView() {
  const pushMcp = useProStore((state) => state.pushMcp)
  const pullMcp = useProStore((state) => state.pullMcp)
  const syncingMcp = useProStore((state) => state.syncingMcp)
  const [lastAction, setLastAction] = useState<string | null>(null)

  const handlePush = async () => {
    const count = await pushMcp()
    if (count !== null) setLastAction(`Pushed ${count} MCP servers`)
  }

  const handlePull = async () => {
    const count = await pullMcp()
    if (count !== null) setLastAction(`Pulled ${count} MCP servers`)
  }

  return (
    <div className="pro-sync">
      <div className="pro-section-title">MCP sync</div>
      <div className="pro-section-caption">Push your current MCP config to the server, then pull it on another machine. Server state is last-write-wins.</div>
      <div className="pro-sync-actions">
        <button className="pro-btn pro-btn-primary" disabled={syncingMcp} onClick={() => { void handlePush() }}>
          {syncingMcp ? 'Pushing…' : 'Push local → server'}
        </button>
        <button className="pro-btn" disabled={syncingMcp} onClick={() => { void handlePull() }}>
          {syncingMcp ? 'Pulling…' : 'Pull server → local'}
        </button>
      </div>
      {lastAction && <div className="pro-sync-result">{lastAction}</div>}
    </div>
  )
}
