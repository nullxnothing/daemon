import { useEffect, useState, useMemo } from 'react'
import { useWalletStore } from '../../store/wallet'
import { useProStore } from '../../store/pro'
import { ArenaView } from './ArenaView'
import './ProPanel.css'

/**
 * Daemon Pro — subscription, arena, and Pro feature hub.
 *
 * Layout:
 *   Header         — Pro badge, subscription state, sign out
 *   Tabs           — Overview | Arena | Skills | Sync
 *   Overview tab   — subscribe flow OR subscription details + quota
 *   Arena tab      — community submissions (ArenaView)
 *   Skills tab     — Pro skill pack list + install button
 *   Sync tab       — MCP config push/pull
 *
 * Free users see the Overview tab by default with the subscribe CTA front-and-center.
 * Pro users see Overview with subscription details + quota, and all tabs are enabled.
 */

type ProTab = 'overview' | 'arena' | 'skills' | 'sync'

export function ProPanel() {
  const subscription = useProStore((s) => s.subscription)
  const price = useProStore((s) => s.price)
  const subscribing = useProStore((s) => s.subscribing)
  const refreshStatus = useProStore((s) => s.refreshStatus)
  const fetchPrice = useProStore((s) => s.fetchPrice)
  const subscribe = useProStore((s) => s.subscribe)
  const signOut = useProStore((s) => s.signOut)
  const error = useProStore((s) => s.error)
  const clearError = useProStore((s) => s.clearError)
  const quota = useProStore((s) => s.quota)
  const loadQuota = useProStore((s) => s.loadQuota)

  const wallets = useWalletStore((s) => s.dashboard?.wallets ?? [])

  const [activeTab, setActiveTab] = useState<ProTab>('overview')
  const [selectedWalletId, setSelectedWalletId] = useState<string>('')

  useEffect(() => {
    void refreshStatus()
    void fetchPrice()
  }, [refreshStatus, fetchPrice])

  useEffect(() => {
    if (subscription.active && !quota) {
      void loadQuota()
    }
  }, [subscription.active, quota, loadQuota])

  // Default the wallet selector to the default wallet, or the first wallet
  useEffect(() => {
    if (selectedWalletId || wallets.length === 0) return
    const def = wallets.find((w) => w.isDefault) ?? wallets[0]
    setSelectedWalletId(def.id)
  }, [wallets, selectedWalletId])

  const daysRemaining = useMemo(() => {
    if (!subscription.expiresAt) return null
    const diffMs = subscription.expiresAt - Date.now()
    if (diffMs <= 0) return 0
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000))
  }, [subscription.expiresAt])

  const handleSubscribe = async () => {
    if (!selectedWalletId) return
    const ok = await subscribe(selectedWalletId)
    if (ok) {
      await loadQuota()
    }
  }

  const isActive = subscription.active

  return (
    <section className="pro-panel">
      <header className="pro-panel-header">
        <div className="pro-panel-title-group">
          <div className="pro-badge">DAEMON PRO</div>
          <div className="pro-panel-title">
            {isActive ? 'Subscription active' : 'Unlock the full IDE'}
          </div>
          {isActive && daysRemaining !== null && (
            <div className="pro-panel-subtitle">
              {daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining
            </div>
          )}
        </div>
        {isActive && (
          <button className="pro-btn" onClick={() => signOut()}>
            Sign out
          </button>
        )}
      </header>

      {error && (
        <div className="pro-error">
          {error}
          <button className="pro-error-dismiss" onClick={clearError}>×</button>
        </div>
      )}

      <nav className="pro-tabs">
        <button
          className={`pro-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`pro-tab ${activeTab === 'arena' ? 'active' : ''}`}
          onClick={() => setActiveTab('arena')}
          disabled={!isActive}
          title={!isActive ? 'Requires Daemon Pro' : undefined}
        >
          Arena
        </button>
        <button
          className={`pro-tab ${activeTab === 'skills' ? 'active' : ''}`}
          onClick={() => setActiveTab('skills')}
          disabled={!isActive}
          title={!isActive ? 'Requires Daemon Pro' : undefined}
        >
          Skills
        </button>
        <button
          className={`pro-tab ${activeTab === 'sync' ? 'active' : ''}`}
          onClick={() => setActiveTab('sync')}
          disabled={!isActive}
          title={!isActive ? 'Requires Daemon Pro' : undefined}
        >
          MCP Sync
        </button>
      </nav>

      <div className="pro-panel-body">
        {activeTab === 'overview' && !isActive && (
          <OverviewSubscribe
            price={price}
            wallets={wallets}
            selectedWalletId={selectedWalletId}
            onSelectWallet={setSelectedWalletId}
            subscribing={subscribing}
            onSubscribe={handleSubscribe}
          />
        )}
        {activeTab === 'overview' && isActive && (
          <OverviewActive
            expiresAt={subscription.expiresAt}
            walletAddress={subscription.walletAddress}
            features={subscription.features}
            quota={quota}
          />
        )}
        {activeTab === 'arena' && isActive && <ArenaView />}
        {activeTab === 'skills' && isActive && <SkillsView />}
        {activeTab === 'sync' && isActive && <SyncView />}
      </div>

      <footer className="pro-panel-footer">
        <div className="pro-disclaimer">
          Daemon Pro is a hosted service built on top of DAEMON. The IDE, wallet, and all
          security-critical code remain MIT-licensed and open source. Pro provides curated
          content, hosted sync, and priority endpoints — nothing in this panel requires
          Pro to use DAEMON itself.
        </div>
      </footer>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Overview — free user subscribe flow
// ---------------------------------------------------------------------------

function OverviewSubscribe({
  price,
  wallets,
  selectedWalletId,
  onSelectWallet,
  subscribing,
  onSubscribe,
}: {
  price: ProPriceInfo | null
  wallets: Array<{ id: string; name: string; address: string; isDefault: boolean }>
  selectedWalletId: string
  onSelectWallet: (id: string) => void
  subscribing: boolean
  onSubscribe: () => void
}) {
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
        <div className="pro-hero-subtitle">Paid in USDC via x402. No account, no card, no subscription dashboard.</div>
      </div>

      <div className="pro-features-grid">
        <FeatureCard
          title="Arena"
          description="Submit your tools, vote on community submissions, and see what ships next. Winners get bundled in DAEMON and tweeted by the main account."
        />
        <FeatureCard
          title="Pro skill pack"
          description="Curated agents, audit pipelines, Codama templates, and grind recipes updated monthly. Installed to your local skill directory."
        />
        <FeatureCard
          title="Hosted MCP sync"
          description="One MCP config, every machine. Push from one install, pull on the next. Last-write-wins with local backups."
        />
        <FeatureCard
          title="Priority API quota"
          description="500 calls/month to the paid AI endpoints (explain-tx, audit-idl, repo-context) without per-call charges."
        />
      </div>

      <div className="pro-subscribe-box">
        <div className="pro-subscribe-title">Subscribe</div>
        {wallets.length === 0 ? (
          <div className="pro-subscribe-empty">
            You need a wallet to subscribe. Create one from the Wallet panel first.
          </div>
        ) : (
          <>
            <div className="pro-form-row">
              <label className="pro-form-label">Pay from wallet</label>
              <select
                className="pro-form-input"
                value={selectedWalletId}
                onChange={(e) => onSelectWallet(e.target.value)}
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.address.slice(0, 4)}…{w.address.slice(-4)})
                    {w.isDefault ? ' — default' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="pro-btn pro-btn-primary pro-btn-full"
              disabled={subscribing || !selectedWalletId || !price}
              onClick={onSubscribe}
            >
              {subscribing ? 'Signing payment…' : `Subscribe for $${price?.priceUsdc ?? '—'} USDC`}
            </button>
            <div className="pro-subscribe-caption">
              The selected wallet will sign a one-time USDC payment for {price?.durationDays ?? 30} days of access.
              The charge is line-itemed before you confirm.
            </div>
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

// ---------------------------------------------------------------------------
// Overview — active subscriber
// ---------------------------------------------------------------------------

function OverviewActive({
  expiresAt,
  walletAddress,
  features,
  quota,
}: {
  expiresAt: number | null
  walletAddress: string | null
  features: Array<'arena' | 'pro-skills' | 'mcp-sync' | 'priority-api'>
  quota: { quota: number; used: number; remaining: number } | null
}) {
  return (
    <div className="pro-overview">
      <div className="pro-active-grid">
        <div className="pro-stat-card">
          <div className="pro-stat-label">Expires</div>
          <div className="pro-stat-value">
            {expiresAt ? new Date(expiresAt).toLocaleDateString() : '—'}
          </div>
        </div>
        <div className="pro-stat-card">
          <div className="pro-stat-label">Wallet</div>
          <div className="pro-stat-value pro-stat-mono">
            {walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-6)}` : '—'}
          </div>
        </div>
        <div className="pro-stat-card">
          <div className="pro-stat-label">Features</div>
          <div className="pro-stat-value">{features.length} unlocked</div>
        </div>
        <div className="pro-stat-card">
          <div className="pro-stat-label">Priority API</div>
          <div className="pro-stat-value">
            {quota ? `${quota.used} / ${quota.quota}` : '—'}
          </div>
        </div>
      </div>

      <div className="pro-active-features">
        {features.map((f) => (
          <div key={f} className="pro-active-feature">
            <span className="pro-active-check">✓</span> {featureLabel(f)}
          </div>
        ))}
      </div>
    </div>
  )
}

function featureLabel(feature: string): string {
  switch (feature) {
    case 'arena': return 'Arena access (submit, view, vote)'
    case 'pro-skills': return 'Pro skill pack (curated agents + templates)'
    case 'mcp-sync': return 'Hosted MCP sync across machines'
    case 'priority-api': return 'Priority API quota (500 calls / month)'
    default: return feature
  }
}

// ---------------------------------------------------------------------------
// Skills view
// ---------------------------------------------------------------------------

function SkillsView() {
  const syncSkills = useProStore((s) => s.syncSkills)
  const syncingSkills = useProStore((s) => s.syncingSkills)
  const [lastResult, setLastResult] = useState<{ installed: string[]; skipped: string[] } | null>(null)

  const handleSync = async () => {
    const result = await syncSkills()
    if (result) setLastResult(result)
  }

  return (
    <div className="pro-skills">
      <div className="pro-section-title">Pro skill pack</div>
      <div className="pro-section-caption">
        Curated agents, audit pipelines, and templates. Click Sync to download the
        latest pack into your local skill directory.
      </div>

      <button
        className="pro-btn pro-btn-primary"
        disabled={syncingSkills}
        onClick={handleSync}
      >
        {syncingSkills ? 'Syncing…' : 'Sync skill pack'}
      </button>

      {lastResult && (
        <div className="pro-skills-result">
          <div>
            <span className="pro-skills-stat">{lastResult.installed.length}</span> installed
            {' · '}
            <span className="pro-skills-stat">{lastResult.skipped.length}</span> unchanged
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

// ---------------------------------------------------------------------------
// MCP sync view
// ---------------------------------------------------------------------------

function SyncView() {
  const pushMcp = useProStore((s) => s.pushMcp)
  const pullMcp = useProStore((s) => s.pullMcp)
  const syncingMcp = useProStore((s) => s.syncingMcp)
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
      <div className="pro-section-caption">
        Push your current MCP config to the server, pull it on another machine.
        Server-side state is last-write-wins — the last machine to push owns the config.
      </div>

      <div className="pro-sync-actions">
        <button className="pro-btn pro-btn-primary" disabled={syncingMcp} onClick={handlePush}>
          {syncingMcp ? 'Pushing…' : 'Push local → server'}
        </button>
        <button className="pro-btn" disabled={syncingMcp} onClick={handlePull}>
          {syncingMcp ? 'Pulling…' : 'Pull server → local'}
        </button>
      </div>

      {lastAction && <div className="pro-sync-result">{lastAction}</div>}
    </div>
  )
}
