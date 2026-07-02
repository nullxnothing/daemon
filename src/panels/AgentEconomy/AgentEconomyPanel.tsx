import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowClockwise, CheckCircle, Coin, IdentificationBadge, Play, Receipt, ShieldCheck } from '@phosphor-icons/react'
import { daemon } from '../../lib/daemonBridge'
import { runIpc } from '../../lib/runIpc'
import { useUIStore } from '../../store/ui'
import './AgentEconomyPanel.css'

type Tab = 'profiles' | 'policy' | 'resources' | 'receipts' | 'registry'
type Tone = 'good' | 'warn' | 'bad' | 'neutral'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'profiles', label: 'Profiles' },
  { id: 'policy', label: 'Spend Policy' },
  { id: 'resources', label: 'Paid Resources' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'registry', label: 'Devnet Registry' },
]

const DEFAULT_NETWORK = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'

function shortId(value?: string | null, left = 5, right = 4) {
  if (!value) return '--'
  return value.length <= left + right + 3 ? value : `${value.slice(0, left)}…${value.slice(-right)}`
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 })
}

function timeLabel(value?: number | null) {
  return value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'
}

function statusTone(status: string): Tone {
  if (status === 'settled' || status === 'available') return 'good'
  if (status === 'blocked' || status === 'degraded') return 'warn'
  if (status === 'failed' || status === 'disabled') return 'bad'
  return 'neutral'
}

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function domainFromEndpoint(endpoint?: string | null) {
  if (!endpoint) return ''
  try {
    return new URL(endpoint).hostname
  } catch {
    return ''
  }
}

export function AgentEconomyPanel() {
  const activeProjectId = useUIStore((state) => state.activeProjectId)
  const [tab, setTab] = useState<Tab>('profiles')
  const [profiles, setProfiles] = useState<AgentEconomyProfile[]>([])
  const [resources, setResources] = useState<IdleResource[]>([])
  const [receipts, setReceipts] = useState<IdlePaidCallReceipt[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')
  const [selectedResourceId, setSelectedResourceId] = useState<string>('')
  const [check, setCheck] = useState<AgentEconomyPolicyCheckResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profileForm, setProfileForm] = useState({ name: 'DAEMON operator', agentId: '', walletId: '', walletAddress: '', serviceUrl: '', capabilities: 'x402,metaplex,solana' })
  const [policyForm, setPolicyForm] = useState({ asset: 'USDC', network: DEFAULT_NETWORK, allowedDomains: '', allowedPayees: '', maxPerCallUsdc: '0.05', maxPerDayUsdc: '1', enabled: true })
  const [callForm, setCallForm] = useState({ taskId: '', requestBody: '{}', paymentSignature: '', approvedBy: '' })
  // acknowledgement starts EMPTY — the exact gate string is shown as a placeholder only, so the
  // typed confirmation is a deliberate act, not a pre-satisfied one-click mint.
  const [registryForm, setRegistryForm] = useState({ rpcUrl: 'https://api.devnet.solana.com', uri: '', description: '', priceUsdc: '0.01', acknowledgement: '' })

  const selectedProfile = useMemo(() => profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? null, [profiles, selectedProfileId])
  const selectedResource = useMemo(() => resources.find((resource) => resource.id === selectedResourceId) ?? resources[0] ?? null, [resources, selectedResourceId])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [nextProfiles, nextResources, nextReceipts] = await Promise.all([
      runIpc(daemon.agentEconomy.listProfiles(activeProjectId ?? null), { context: 'Agent Economy', silent: true }),
      runIpc(daemon.idle.listResources(50), { context: 'IDLE resources', silent: true }),
      runIpc(daemon.agentEconomy.listReceipts({ projectId: activeProjectId ?? null, limit: 50 }), { context: 'Agent receipts', silent: true }),
    ])
    // A failed list must not masquerade as an empty state — runIpc returns null on error, so if
    // the primary profiles load failed, surface it with a retry instead of showing "No profiles".
    if (nextProfiles === null) {
      setError('Could not load the agent economy. Check the connection and retry.')
      setLoading(false)
      return
    }
    setProfiles(nextProfiles)
    if (nextResources) setResources(nextResources)
    if (nextReceipts) setReceipts(nextReceipts)
    setSelectedProfileId((current) => current || nextProfiles?.[0]?.id || '')
    setSelectedResourceId((current) => current || nextResources?.[0]?.id || '')
    setLoading(false)
  }, [activeProjectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!selectedProfile?.policy) return
    setPolicyForm({
      asset: selectedProfile.policy.asset,
      network: selectedProfile.policy.network,
      allowedDomains: selectedProfile.policy.allowedDomains.join(', '),
      allowedPayees: selectedProfile.policy.allowedPayees.join(', '),
      maxPerCallUsdc: String(selectedProfile.policy.maxPerCallUsdc),
      maxPerDayUsdc: String(selectedProfile.policy.maxPerDayUsdc),
      enabled: selectedProfile.policy.enabled,
    })
  }, [selectedProfile?.id])

  // Browsing resources must NOT silently expand the spend-policy allowlist — that is a security
  // control the user edits deliberately in the Policy tab. (Previously selecting a resource
  // auto-appended its host here, so a later "Save policy" persisted domains never typed.)

  async function loadProfile(profileId: string) {
    const profile = await runIpc(daemon.agentEconomy.getProfile(profileId), { context: 'Agent profile', silent: true })
    if (!profile) return
    setProfiles((current) => current.some((item) => item.id === profile.id)
      ? current.map((item) => item.id === profile.id ? profile : item)
      : [profile, ...current])
    setSelectedProfileId(profile.id)
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    const profile = await runIpc(daemon.agentEconomy.upsertProfile({
      id: selectedProfile?.id ?? null,
      projectId: activeProjectId ?? '',
      name: profileForm.name,
      agentId: profileForm.agentId || '',
      walletId: profileForm.walletId || null,
      walletAddress: profileForm.walletAddress || null,
      serviceUrl: profileForm.serviceUrl || null,
      capabilities: splitList(profileForm.capabilities),
    }), { context: 'Agent profile' })
    if (!profile) return
    setSelectedProfileId(profile.id)
    await refresh()
  }

  async function savePolicy(event: FormEvent) {
    event.preventDefault()
    if (!selectedProfile) return
    const policy = await runIpc(daemon.agentEconomy.setPolicy({
      profileId: selectedProfile.id,
      asset: policyForm.asset,
      network: policyForm.network,
      allowedDomains: splitList(policyForm.allowedDomains),
      allowedPayees: splitList(policyForm.allowedPayees),
      maxPerCallUsdc: Number(policyForm.maxPerCallUsdc),
      maxPerDayUsdc: Number(policyForm.maxPerDayUsdc),
      enabled: policyForm.enabled,
    }), { context: 'Spend policy' })
    if (!policy) return
    await refresh()
  }

  async function checkPolicy() {
    if (!selectedProfile || !selectedResource) return
    const result = await runIpc(daemon.agentEconomy.checkPolicy({
      profileId: selectedProfile.id,
      resourceId: selectedResource.id,
      taskId: callForm.taskId || null,
    }), { context: 'Policy check' })
    if (result) setCheck(result)
  }

  async function executePaidCall() {
    if (!selectedProfile || !selectedResource) return
    let requestBody: unknown = {}
    try {
      requestBody = callForm.requestBody.trim() ? JSON.parse(callForm.requestBody) : {}
    } catch {
      setError('Request body must be valid JSON.')
      return
    }
    const result = await runIpc(daemon.agentEconomy.executePaidCall({
      profileId: selectedProfile.id,
      resourceId: selectedResource.id,
      taskId: callForm.taskId || null,
      requestBody,
      paymentSignature: callForm.paymentSignature || null,
      approvedBy: callForm.approvedBy || null,
    }), { context: 'Paid call' })
    if (!result) return
    setCheck(result.check)
    await refresh()
    setTab('receipts')
  }

  async function registerDevnetAgent(event: FormEvent) {
    event.preventDefault()
    if (!selectedProfile) return
    const profile = await runIpc(daemon.agentEconomy.registerDevnetAgent({
      profileId: selectedProfile.id,
      walletId: profileForm.walletId || selectedProfile.walletId || '',
      rpcUrl: registryForm.rpcUrl,
      name: profileForm.name || selectedProfile.name,
      description: registryForm.description || selectedProfile.name,
      uri: registryForm.uri,
      serviceUrl: profileForm.serviceUrl || selectedProfile.serviceUrl || '',
      priceUsdc: registryForm.priceUsdc,
      confirmedAt: Date.now(),
      acknowledgement: registryForm.acknowledgement,
    }), { context: 'Agent Registry' })
    if (!profile) return
    setSelectedProfileId(profile.id)
    await refresh()
  }

  async function readIdentity() {
    if (!selectedProfile?.registryAsset) return
    await runIpc(daemon.agentEconomy.readAgentIdentity({
      profileId: selectedProfile.id,
      network: 'devnet',
      rpcUrl: registryForm.rpcUrl,
      assetAddress: selectedProfile.registryAsset,
    }), { context: 'Agent identity' })
    await refresh()
  }

  return (
    <section className="agent-economy-panel">
      <header className="agent-economy-toolbar">
        <div>
          <div className="agent-economy-kicker">Agent Economy</div>
          <h2>Control Tower</h2>
        </div>
        <button className="agent-economy-icon-button" type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh agent economy">
          <ArrowClockwise size={16} />
        </button>
      </header>

      <nav className="agent-economy-tabs" aria-label="Agent economy views">
        {TABS.map((item) => (
          <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </nav>

      {error && (
        <div className="agent-economy-alert">
          <span>{error}</span>
          <button type="button" className="agent-economy-button" onClick={() => void refresh()}>Retry</button>
        </div>
      )}
      {loading && <div className="agent-economy-loading">Loading…</div>}

      {/* When the load failed and nothing is loaded yet, the alert is the whole surface — never
          render the grid's "No profiles" empty state, which would read as a genuine zero. */}
      {error && profiles.length === 0 ? null : (
      <div className="agent-economy-grid">
        <aside className="agent-economy-sidebar">
          <div className="agent-economy-section-head">
            <span>Profiles</span>
            <strong>{profiles.length}</strong>
          </div>
          {profiles.length === 0 ? <p className="agent-economy-empty">No profiles</p> : profiles.map((profile) => (
            <button key={profile.id} type="button" className={`agent-economy-profile ${selectedProfile?.id === profile.id ? 'active' : ''}`} onClick={() => void loadProfile(profile.id)}>
              <span>{profile.name}</span>
              <em>{shortId(profile.walletAddress ?? profile.walletId)}</em>
            </button>
          ))}
        </aside>

        <main className="agent-economy-main">
          {tab === 'profiles' && (
            <form className="agent-economy-form" onSubmit={saveProfile}>
              <PanelTitle icon={<IdentificationBadge size={16} />} title="Agent profile" detail={selectedProfile ? shortId(selectedProfile.id) : 'new'} />
              <Field label="Name" value={profileForm.name} onChange={(value) => setProfileForm((current) => ({ ...current, name: value }))} />
              <Field label="Agent ID" value={profileForm.agentId} onChange={(value) => setProfileForm((current) => ({ ...current, agentId: value }))} />
              <Field label="Wallet ID" value={profileForm.walletId} onChange={(value) => setProfileForm((current) => ({ ...current, walletId: value }))} />
              <Field label="Wallet address" value={profileForm.walletAddress} onChange={(value) => setProfileForm((current) => ({ ...current, walletAddress: value }))} />
              <Field label="Service URL" value={profileForm.serviceUrl} onChange={(value) => setProfileForm((current) => ({ ...current, serviceUrl: value }))} />
              <Field label="Capabilities" value={profileForm.capabilities} onChange={(value) => setProfileForm((current) => ({ ...current, capabilities: value }))} />
              <button className="agent-economy-button primary" type="submit">Save profile</button>
            </form>
          )}

          {tab === 'policy' && (
            <form className="agent-economy-form" onSubmit={savePolicy}>
              <PanelTitle icon={<ShieldCheck size={16} />} title="Spend policy" detail={selectedProfile?.policy?.enabled ? 'enabled' : 'disabled'} />
              <Field label="Asset" value={policyForm.asset} onChange={(value) => setPolicyForm((current) => ({ ...current, asset: value }))} />
              <Field label="Network" value={policyForm.network} onChange={(value) => setPolicyForm((current) => ({ ...current, network: value }))} />
              <Field label="Allowed domains" value={policyForm.allowedDomains} onChange={(value) => setPolicyForm((current) => ({ ...current, allowedDomains: value }))} />
              <Field label="Allowed payees" value={policyForm.allowedPayees} onChange={(value) => setPolicyForm((current) => ({ ...current, allowedPayees: value }))} />
              <Field label="Max per call" value={policyForm.maxPerCallUsdc} onChange={(value) => setPolicyForm((current) => ({ ...current, maxPerCallUsdc: value }))} />
              <Field label="Max per day" value={policyForm.maxPerDayUsdc} onChange={(value) => setPolicyForm((current) => ({ ...current, maxPerDayUsdc: value }))} />
              <label className="agent-economy-check"><input type="checkbox" checked={policyForm.enabled} onChange={(event) => setPolicyForm((current) => ({ ...current, enabled: event.target.checked }))} /> Enabled</label>
              <button className="agent-economy-button primary" type="submit" disabled={!selectedProfile}>Save policy</button>
            </form>
          )}

          {tab === 'resources' && (
            <section className="agent-economy-stack">
              <PanelTitle icon={<Coin size={16} />} title="Paid resources" detail={`${resources.length} cached`} />
              <div className="agent-economy-resource-list">
                {resources.length === 0 ? <p className="agent-economy-empty">No paid resources</p> : resources.map((resource) => (
                  <button key={resource.id} type="button" className={`agent-economy-resource ${selectedResource?.id === resource.id ? 'active' : ''}`} onClick={() => setSelectedResourceId(resource.id)}>
                    <span><i className={`tone-${statusTone(resource.status)}`} />{resource.name}</span>
                    <em>{money(resource.priceUsdc)} · {domainFromEndpoint(resource.endpoint)}</em>
                  </button>
                ))}
              </div>
              <div className="agent-economy-callbox">
                <Field label="Task ID" value={callForm.taskId} onChange={(value) => setCallForm((current) => ({ ...current, taskId: value }))} />
                <Field label="Approved by" value={callForm.approvedBy} onChange={(value) => setCallForm((current) => ({ ...current, approvedBy: value }))} />
                <Field label="Payment signature" value={callForm.paymentSignature} onChange={(value) => setCallForm((current) => ({ ...current, paymentSignature: value }))} />
                <label>
                  <span>Request JSON</span>
                  <textarea value={callForm.requestBody} onChange={(event) => setCallForm((current) => ({ ...current, requestBody: event.target.value }))} />
                </label>
                <div className="agent-economy-actions">
                  <button className="agent-economy-button" type="button" onClick={() => void checkPolicy()} disabled={!selectedProfile || !selectedResource}><CheckCircle size={14} />Check</button>
                  <button className="agent-economy-button primary" type="button" onClick={() => void executePaidCall()} disabled={!selectedProfile || !selectedResource}><Play size={14} />Execute</button>
                </div>
                {check && <PolicyResult check={check} />}
              </div>
            </section>
          )}

          {tab === 'receipts' && (
            <section className="agent-economy-stack">
              <PanelTitle icon={<Receipt size={16} />} title="Receipts" detail={`${receipts.length} latest`} />
              {receipts.length === 0 ? <p className="agent-economy-empty">No receipts</p> : receipts.map((receipt) => <ReceiptRow key={receipt.id} receipt={receipt} />)}
            </section>
          )}

          {tab === 'registry' && (
            <form className="agent-economy-form" onSubmit={registerDevnetAgent}>
              <PanelTitle icon={<IdentificationBadge size={16} />} title="Devnet registry" detail={shortId(selectedProfile?.registryAsset)} />
              <Field label="RPC URL" value={registryForm.rpcUrl} onChange={(value) => setRegistryForm((current) => ({ ...current, rpcUrl: value }))} />
              <Field label="Metadata URI" value={registryForm.uri} onChange={(value) => setRegistryForm((current) => ({ ...current, uri: value }))} />
              <Field label="Description" value={registryForm.description} onChange={(value) => setRegistryForm((current) => ({ ...current, description: value }))} />
              <Field label="Price USDC" value={registryForm.priceUsdc} onChange={(value) => setRegistryForm((current) => ({ ...current, priceUsdc: value }))} />
              <Field label="Acknowledgement" value={registryForm.acknowledgement} placeholder="Type MINT REGISTERED AGENT to confirm" onChange={(value) => setRegistryForm((current) => ({ ...current, acknowledgement: value }))} />
              <div className="agent-economy-actions">
                <button className="agent-economy-button primary" type="submit" disabled={!selectedProfile || registryForm.acknowledgement.trim() !== 'MINT REGISTERED AGENT'}>Register</button>
                <button className="agent-economy-button" type="button" onClick={() => void readIdentity()} disabled={!selectedProfile?.registryAsset}>Read identity</button>
              </div>
            </form>
          )}
        </main>
      </div>
      )}
    </section>
  )
}

function PanelTitle({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="agent-economy-title">{icon}<strong>{title}</strong><span>{detail}</span></div>
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label>
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function PolicyResult({ check }: { check: AgentEconomyPolicyCheckResult }) {
  return (
    <div className={`agent-economy-result ${check.allowed ? 'allowed' : 'blocked'}`}>
      <strong>{check.allowed ? 'Allowed' : 'Blocked'}</strong>
      <span>{check.resource ? `${check.resource.name} · ${money(check.resource.priceUsdc)}` : 'No resource'}</span>
      {check.reasons.length > 0 && <p>{check.reasons.join(' ')}</p>}
    </div>
  )
}

function ReceiptRow({ receipt }: { receipt: IdlePaidCallReceipt }) {
  return (
    <div className="agent-economy-receipt">
      <div><i className={`tone-${statusTone(receipt.status)}`} /><strong>{receipt.status}</strong><span>{receipt.resourceId}</span></div>
      <div><span>{money(receipt.amountUsdc)}</span><em>{timeLabel(receipt.createdAt)}</em></div>
    </div>
  )
}
