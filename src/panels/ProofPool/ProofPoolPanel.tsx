import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowClockwise,
  ArrowSquareOut,
  Coins,
  DownloadSimple,
  ImageSquare,
  Key,
  Lightning,
  ShieldCheck,
  UploadSimple,
  Wallet,
} from '@phosphor-icons/react'
import { Button } from '../../components/Button'
import { Badge, MetricCard, PanelHeader } from '../../components/Panel'
import { canOpenSolscan, getSolscanAddressUrl, getSolscanTxUrl, type SolanaExplorerCluster } from '../../lib/solanaExplorer'
import { useNotificationsStore } from '../../store/notifications'
import type {
  CreateProofPoolInput,
  CreateProofPartnerSessionInput,
  ProofBacking,
  ProofEscrowStatus,
  ProofPartnerCredentialStatus,
  ProofPartnerSession,
  ProofPool,
  ProofPoolDetail,
} from '../../../electron/shared/types'
import './ProofPoolPanel.css'

interface CreateFormState {
  name: string
  symbol: string
  description: string
  imagePath: string
  twitter: string
  telegram: string
  website: string
  creatorWallet: string
  totalSlots: string
  minBackingSol: string
  backingDays: string
}

interface BackingFormState {
  backerWallet: string
  amountSol: string
  depositSignature: string
}

interface HostedFormState {
  name: string
  symbol: string
  description: string
  imageUrl: string
  creatorWallet: string
  totalSlots: string
  minBackingSol: string
  twitter: string
  website: string
  telegram: string
  returnUrl: string
}

type PoolFilter = ProofPool['status'] | 'all'

const EMPTY_CREATE_FORM: CreateFormState = {
  name: '',
  symbol: '',
  description: '',
  imagePath: '',
  twitter: '',
  telegram: '',
  website: '',
  creatorWallet: '',
  totalSlots: '4',
  minBackingSol: '0.05',
  backingDays: '3',
}

const EMPTY_BACKING_FORM: BackingFormState = {
  backerWallet: '',
  amountSol: '0.05',
  depositSignature: '',
}

const EMPTY_HOSTED_FORM: HostedFormState = {
  name: '',
  symbol: '',
  description: '',
  imageUrl: '',
  creatorWallet: '',
  totalSlots: '4',
  minBackingSol: '0.1',
  twitter: '',
  website: '',
  telegram: '',
  returnUrl: 'https://daemonide.tech/launch-complete',
}

const POOL_FILTERS: PoolFilter[] = ['all', 'backing', 'funded', 'refunding', 'live', 'distributed', 'failed']

function unwrap<T>(res: IpcResponse<T>): T {
  if (!res.ok) throw new Error(res.error ?? 'Request failed')
  return res.data as T
}

function shortAddress(value: string | null | undefined): string {
  if (!value) return 'None'
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

function formatSol(value: number | null | undefined): string {
  if (!value) return '0'
  return value >= 10 ? value.toFixed(2) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

function formatBaseUnits(value: string | null | undefined): string {
  if (!value) return '0'
  const tokens = Number(BigInt(value)) / 1_000_000
  if (!Number.isFinite(tokens)) return value
  if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(2)}B`
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(2)}K`
  return tokens.toFixed(2)
}

function formatDate(value: number | null | undefined): string {
  if (!value) return 'None'
  return new Date(value).toLocaleString()
}

function statusTone(status: ProofPool['status']): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (status === 'live' || status === 'distributed') return 'success'
  if (status === 'funded' || status === 'launching') return 'warning'
  if (status === 'failed') return 'danger'
  return 'info'
}

function statusLabel(status: ProofPool['status']): string {
  return status.replace(/_/g, ' ').toUpperCase()
}

function partnerStatusTone(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  const normalized = status.toLowerCase()
  if (['submitted', 'complete', 'completed', 'live'].includes(normalized)) return 'success'
  if (['created', 'pending', 'signing'].includes(normalized)) return 'info'
  if (['failed', 'expired', 'cancelled', 'canceled'].includes(normalized)) return 'danger'
  return 'warning'
}

function parseEventMetadata(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function ProofPoolPanel() {
  const notify = useNotificationsStore()
  const [escrow, setEscrow] = useState<ProofEscrowStatus | null>(null)
  const [partnerConfig, setPartnerConfig] = useState<ProofPartnerCredentialStatus | null>(null)
  const [pools, setPools] = useState<ProofPool[]>([])
  const [partnerSessions, setPartnerSessions] = useState<ProofPartnerSession[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProofPoolDetail | null>(null)
  const [hostedForm, setHostedForm] = useState<HostedFormState>(EMPTY_HOSTED_FORM)
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM)
  const [backingForm, setBackingForm] = useState<BackingFormState>(EMPTY_BACKING_FORM)
  const [partnerApiKey, setPartnerApiKey] = useState('')
  const [partnerWebhookSecret, setPartnerWebhookSecret] = useState('')
  const [escrowKey, setEscrowKey] = useState('')
  const [vanityKey, setVanityKey] = useState('')
  const [poolFilter, setPoolFilter] = useState<PoolFilter>('all')
  const [cluster, setCluster] = useState<SolanaExplorerCluster>('devnet')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedPool = detail?.pool ?? pools.find((pool) => pool.id === selectedId) ?? null
  const filledSlots = detail?.backings.filter((backing) => ['confirmed', 'distributing', 'distributed', 'refunding'].includes(backing.status)).length ?? 0
  const progress = selectedPool ? Math.min(100, (filledSlots / selectedPool.total_slots) * 100) : 0
  const canLaunch = selectedPool?.status === 'funded' && escrow?.configured && cluster === 'mainnet-beta'
  const canDistribute = selectedPool?.status === 'live'
  const canRefund = !!selectedPool && ['backing', 'funded'].includes(selectedPool.status) && Date.now() >= selectedPool.backing_deadline

  const sortedPools = useMemo(() => [...pools].sort((a, b) => b.created_at - a.created_at), [pools])
  const visiblePools = useMemo(() => (
    poolFilter === 'all' ? sortedPools : sortedPools.filter((pool) => pool.status === poolFilter)
  ), [poolFilter, sortedPools])

  const refresh = useCallback(async (nextSelectedId?: string | null) => {
    setError(null)
    const [escrowRes, poolsRes, partnerConfigRes, partnerSessionsRes, infraRes] = await Promise.all([
      window.daemon.proof.escrowStatus(),
      window.daemon.proof.listPools(),
      window.daemon.proof.partnerConfigStatus(),
      window.daemon.proof.listPartnerSessions(),
      window.daemon.settings.getWalletInfrastructureSettings(),
    ])
    const escrowStatus = unwrap(escrowRes)
    const nextPools = unwrap(poolsRes)
    setEscrow(escrowStatus)
    setPools(nextPools)
    setPartnerConfig(unwrap(partnerConfigRes))
    setPartnerSessions(unwrap(partnerSessionsRes))
    if (infraRes.ok && infraRes.data?.cluster) setCluster(infraRes.data.cluster)
    const nextId = nextSelectedId ?? selectedId ?? nextPools[0]?.id ?? null
    setSelectedId(nextId)
    if (nextId) {
      setDetail(unwrap(await window.daemon.proof.getPool(nextId)))
    } else {
      setDetail(null)
    }
  }, [selectedId])

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  async function runAction<T>(label: string, fn: () => Promise<T>, nextSelectedId?: string | null): Promise<T | null> {
    setBusy(label)
    setError(null)
    try {
      const result = await fn()
      await refresh(nextSelectedId ?? selectedId)
      notify.pushSuccess(`${label} complete`, 'Proof Pool')
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      notify.pushError(err, 'Proof Pool')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function configurePartnerCredentials() {
    if (!partnerApiKey.trim() && !partnerWebhookSecret.trim()) return
    await runAction('Store ProofLaunch credentials', async () => {
      const result = unwrap(await window.daemon.proof.configurePartnerCredentials({
        apiKey: partnerApiKey.trim() || null,
        webhookSecret: partnerWebhookSecret.trim() || null,
      }))
      setPartnerApiKey('')
      setPartnerWebhookSecret('')
      setPartnerConfig(result)
      return result
    })
  }

  async function createHostedSession() {
    const metadata = {
      twitter: hostedForm.twitter || null,
      website: hostedForm.website || null,
      telegram: hostedForm.telegram || null,
    }
    const input: CreateProofPartnerSessionInput = {
      name: hostedForm.name,
      symbol: hostedForm.symbol,
      description: hostedForm.description,
      imageUrl: hostedForm.imageUrl || null,
      creatorWallet: hostedForm.creatorWallet,
      totalSlots: Number(hostedForm.totalSlots),
      minBackingSol: Number(hostedForm.minBackingSol),
      metadata,
      returnUrl: hostedForm.returnUrl || null,
    }
    const session = await runAction('Create hosted session', async () => unwrap(await window.daemon.proof.createPartnerSession(input)))
    if (!session) return
    setHostedForm(EMPTY_HOSTED_FORM)
    if (session.checkout_url) {
      await window.daemon.shell.openExternal(session.checkout_url).catch(() => {})
    }
  }

  async function pollPartnerSession(sessionId: string) {
    await runAction('Poll ProofLaunch session', async () => unwrap(await window.daemon.proof.pollPartnerSession(sessionId)))
  }

  async function copyPartnerPrefill(sessionId: string) {
    await runAction('Copy ProofLaunch prefill', async () => {
      const payload = unwrap(await window.daemon.proof.partnerPrefill(sessionId))
      unwrap(await window.daemon.env.copyValue(JSON.stringify(payload, null, 2)))
      return payload
    })
  }

  function openExternalUrl(url: string | null | undefined) {
    if (!url) return
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
    window.daemon.shell.openExternal(href).catch(() => {})
  }

  async function createPool() {
    const input: CreateProofPoolInput = {
      name: createForm.name,
      symbol: createForm.symbol,
      description: createForm.description,
      imagePath: createForm.imagePath || null,
      twitter: createForm.twitter || null,
      telegram: createForm.telegram || null,
      website: createForm.website || null,
      creatorWallet: createForm.creatorWallet,
      totalSlots: Number(createForm.totalSlots),
      minBackingSol: Number(createForm.minBackingSol),
      backingDays: Number(createForm.backingDays),
    }
    const created = await runAction('Create pool', async () => unwrap(await window.daemon.proof.createPool(input)), null)
    if (created) {
      setCreateForm(EMPTY_CREATE_FORM)
      setSelectedId(created.pool.id)
      await refresh(created.pool.id)
    }
  }

  async function pickImage() {
    const path = unwrap(await window.daemon.proof.pickImage())
    if (path) setCreateForm((state) => ({ ...state, imagePath: path }))
  }

  async function configureEscrow(generate = false) {
    if (generate && !window.confirm('Generate a new Proof platform escrow key? Back it up before funding.')) return
    await runAction('Configure escrow', async () => {
      const input = generate || !escrowKey.trim() ? undefined : { privateKeyBase58: escrowKey.trim() }
      const result = unwrap(await window.daemon.proof.configureEscrow(input))
      setEscrowKey('')
      return result
    })
  }

  async function exportEscrow() {
    await runAction('Export escrow', async () => unwrap(await window.daemon.proof.exportEscrow()))
  }

  async function exportAudit() {
    if (!detail) return
    const payload = {
      exportedAt: new Date().toISOString(),
      cluster,
      pool: detail.pool,
      backings: detail.backings,
      events: detail.events.map((event) => ({
        ...event,
        metadata: parseEventMetadata(event.metadata_json),
      })),
    }
    const res = await window.daemon.env.copyValue(JSON.stringify(payload, null, 2))
    unwrap(res)
    notify.pushSuccess('Audit copied', 'Proof Pool')
  }

  async function importVanityMint() {
    if (!vanityKey.trim()) return
    await runAction('Import vanity mint', async () => {
      const result = unwrap(await window.daemon.proof.importVanityMint({ privateKeyBase58: vanityKey.trim() }))
      setVanityKey('')
      return result
    })
  }

  async function verifyBacking() {
    if (!selectedPool) return
    await runAction('Verify backing', async () => unwrap(await window.daemon.proof.verifyBacking({
      poolId: selectedPool.id,
      backerWallet: backingForm.backerWallet,
      amountSol: Number(backingForm.amountSol),
      depositSignature: backingForm.depositSignature,
    })))
    setBackingForm(EMPTY_BACKING_FORM)
  }

  function openSignature(signature: string | null | undefined) {
    if (!signature) return
    if (canOpenSolscan(cluster)) {
      window.daemon.shell.openExternal(getSolscanTxUrl(signature, cluster)).catch(() => {})
      return
    }
    window.daemon.env.copyValue(signature).catch(() => {})
  }

  function openAddress(address: string | null | undefined) {
    if (!address) return
    if (canOpenSolscan(cluster)) {
      window.daemon.shell.openExternal(getSolscanAddressUrl(address, cluster)).catch(() => {})
      return
    }
    window.daemon.env.copyValue(address).catch(() => {})
  }

  return (
    <div className="proof-pool-panel">
      <PanelHeader
        kicker="DAEMON PROOF"
        title="ProofLaunch"
        subtitle="Hosted partner launches and advanced Proof Pool custody"
        actions={(
          <div className="proof-pool-header-actions">
            <Badge tone={partnerConfig?.apiKeyConfigured ? 'success' : 'warning'}>{partnerConfig?.apiKeyConfigured ? 'PARTNER READY' : 'PARTNER OFF'}</Badge>
            <Badge tone={escrow?.configured ? 'success' : 'warning'}>{escrow?.configured ? `${shortAddress(escrow.address)} / ${formatSol(escrow.balanceSol)} SOL` : 'ESCROW OFF'}</Badge>
            <Badge tone={cluster === 'mainnet-beta' ? 'warning' : 'neutral'}>{cluster.toUpperCase()}</Badge>
            <Button onClick={() => void exportAudit()} disabled={!detail || !!busy}><DownloadSimple size={14} /> Audit</Button>
            <Button onClick={() => refresh()} disabled={!!busy}><ArrowClockwise size={14} /> Refresh</Button>
          </div>
        )}
      />

      {error ? <div className="proof-pool-alert">{error}</div> : null}

      <div className="proof-pool-grid">
        <section className="proof-pool-sidebar" aria-label="Proof pools">
          <div className="proof-pool-section">
            <div className="proof-pool-section__header">
              <h2>Pools</h2>
              <Badge tone="info">{pools.length}</Badge>
            </div>
            <div className="proof-pool-filters" aria-label="Pool status filter">
              {POOL_FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={poolFilter === filter ? 'is-active' : ''}
                  onClick={() => setPoolFilter(filter)}
                >
                  {filter === 'all' ? 'All' : statusLabel(filter)}
                </button>
              ))}
            </div>
            <div className="proof-pool-list">
              {visiblePools.length === 0 ? (
                <div className="proof-pool-empty">No pools</div>
              ) : visiblePools.map((pool) => (
                <button
                  key={pool.id}
                  className={`proof-pool-list-item${selectedId === pool.id ? ' is-selected' : ''}`}
                  onClick={() => {
                    setSelectedId(pool.id)
                    refresh(pool.id).catch((err) => setError(err instanceof Error ? err.message : String(err)))
                  }}
                >
                  <span>
                    <strong>{pool.symbol}</strong>
                    <small>{pool.name}</small>
                  </span>
                  <Badge tone={statusTone(pool.status)}>{statusLabel(pool.status)}</Badge>
                </button>
              ))}
            </div>
          </div>

          <form className="proof-pool-section proof-pool-form" onSubmit={(event) => { event.preventDefault(); void createPool() }}>
            <div className="proof-pool-section__header">
              <h2>New Pool</h2>
              <ShieldCheck size={18} />
            </div>
            <label>Name<input value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} /></label>
            <label>Symbol<input value={createForm.symbol} maxLength={10} onChange={(event) => setCreateForm({ ...createForm, symbol: event.target.value.toUpperCase() })} /></label>
            <label>Description<textarea value={createForm.description} rows={3} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} /></label>
            <div className="proof-pool-form-row">
              <label>Slots<input type="number" min="2" max="24" value={createForm.totalSlots} onChange={(event) => setCreateForm({ ...createForm, totalSlots: event.target.value })} /></label>
              <label>Min SOL<input type="number" min="0.05" step="0.01" value={createForm.minBackingSol} onChange={(event) => setCreateForm({ ...createForm, minBackingSol: event.target.value })} /></label>
              <label>Days<input type="number" min="1" max="30" value={createForm.backingDays} onChange={(event) => setCreateForm({ ...createForm, backingDays: event.target.value })} /></label>
            </div>
            <label>Creator wallet<input value={createForm.creatorWallet} onChange={(event) => setCreateForm({ ...createForm, creatorWallet: event.target.value })} /></label>
            <div className="proof-pool-image-row">
              <input value={createForm.imagePath} readOnly placeholder="Image path" />
              <Button onClick={pickImage}><ImageSquare size={14} /> Pick</Button>
            </div>
            <div className="proof-pool-form-row">
              <label>X<input value={createForm.twitter} onChange={(event) => setCreateForm({ ...createForm, twitter: event.target.value })} /></label>
              <label>Telegram<input value={createForm.telegram} onChange={(event) => setCreateForm({ ...createForm, telegram: event.target.value })} /></label>
            </div>
            <label>Website<input value={createForm.website} onChange={(event) => setCreateForm({ ...createForm, website: event.target.value })} /></label>
            <Button variant="primary" type="submit" disabled={!!busy}>Create Pool</Button>
          </form>
        </section>

        <main className="proof-pool-main">
          <section className="proof-pool-section">
            <div className="proof-pool-section__header">
              <h2>ProofLaunch Partner</h2>
              <div className="proof-pool-badges">
                <Badge tone={partnerConfig?.apiKeyConfigured ? 'success' : 'warning'}>{partnerConfig?.apiKeyConfigured ? 'API READY' : 'API MISSING'}</Badge>
                <Badge tone={partnerConfig?.webhookSecretConfigured ? 'success' : 'neutral'}>{partnerConfig?.webhookSecretConfigured ? 'WEBHOOK READY' : 'WEBHOOK OFF'}</Badge>
              </div>
            </div>

            <div className="proof-pool-partner-grid">
              <form className="proof-pool-form" onSubmit={(event) => { event.preventDefault(); void configurePartnerCredentials() }}>
                <div className="proof-pool-form-row">
                  <label>API key<input type="password" value={partnerApiKey} onChange={(event) => setPartnerApiKey(event.target.value)} placeholder={partnerConfig?.apiKeyConfigured ? 'Stored' : 'pl_test...'} /></label>
                  <label>Webhook secret<input type="password" value={partnerWebhookSecret} onChange={(event) => setPartnerWebhookSecret(event.target.value)} placeholder={partnerConfig?.webhookSecretConfigured ? 'Stored' : 'HMAC secret'} /></label>
                </div>
                <Button variant="primary" type="submit" disabled={!!busy || (!partnerApiKey.trim() && !partnerWebhookSecret.trim())}>Store Credentials</Button>
              </form>

              <form className="proof-pool-form" onSubmit={(event) => { event.preventDefault(); void createHostedSession() }}>
                <div className="proof-pool-section__header">
                  <h2>Hosted Checkout</h2>
                  <Badge tone="info">{partnerConfig?.partnerSlug ?? 'daemon'}</Badge>
                </div>
                <div className="proof-pool-form-row">
                  <label>Name<input value={hostedForm.name} onChange={(event) => setHostedForm({ ...hostedForm, name: event.target.value })} /></label>
                  <label>Symbol<input value={hostedForm.symbol} maxLength={10} onChange={(event) => setHostedForm({ ...hostedForm, symbol: event.target.value.toUpperCase() })} /></label>
                </div>
                <label>Description<textarea value={hostedForm.description} rows={3} onChange={(event) => setHostedForm({ ...hostedForm, description: event.target.value })} /></label>
                <label>Creator wallet<input value={hostedForm.creatorWallet} onChange={(event) => setHostedForm({ ...hostedForm, creatorWallet: event.target.value })} /></label>
                <div className="proof-pool-form-row">
                  <label>Slots<input type="number" min="2" max="24" value={hostedForm.totalSlots} onChange={(event) => setHostedForm({ ...hostedForm, totalSlots: event.target.value })} /></label>
                  <label>Min SOL<input type="number" min="0.05" step="0.01" value={hostedForm.minBackingSol} onChange={(event) => setHostedForm({ ...hostedForm, minBackingSol: event.target.value })} /></label>
                </div>
                <label>Image URL<input value={hostedForm.imageUrl} onChange={(event) => setHostedForm({ ...hostedForm, imageUrl: event.target.value })} /></label>
                <div className="proof-pool-form-row">
                  <label>X<input value={hostedForm.twitter} onChange={(event) => setHostedForm({ ...hostedForm, twitter: event.target.value })} /></label>
                  <label>Website<input value={hostedForm.website} onChange={(event) => setHostedForm({ ...hostedForm, website: event.target.value })} /></label>
                  <label>Telegram<input value={hostedForm.telegram} onChange={(event) => setHostedForm({ ...hostedForm, telegram: event.target.value })} /></label>
                </div>
                <label>Return URL<input value={hostedForm.returnUrl} onChange={(event) => setHostedForm({ ...hostedForm, returnUrl: event.target.value })} /></label>
                <Button variant="primary" type="submit" disabled={!partnerConfig?.apiKeyConfigured || !!busy}>Create Session</Button>
              </form>
            </div>
          </section>

          <section className="proof-pool-section">
            <div className="proof-pool-section__header">
              <h2>Partner Sessions</h2>
              <Badge tone="info">{partnerSessions.length}</Badge>
            </div>
            <div className="proof-pool-session-list">
              {partnerSessions.length === 0 ? (
                <div className="proof-pool-empty">No sessions</div>
              ) : partnerSessions.map((session) => (
                <div className="proof-pool-session-item" key={session.id}>
                  <span>
                    <strong>{session.symbol}</strong>
                    <small>{session.name}</small>
                  </span>
                  <Badge tone={partnerStatusTone(session.status)}>{session.status.toUpperCase()}</Badge>
                  <small>{session.meme_id ? `Meme ${shortAddress(session.meme_id)}` : `Session ${shortAddress(session.id)}`}</small>
                  <div className="proof-pool-row-actions">
                    <Button size="sm" onClick={() => openExternalUrl(session.checkout_url)} disabled={!session.checkout_url || !!busy}><ArrowSquareOut size={12} /> Open</Button>
                    <Button size="sm" onClick={() => void pollPartnerSession(session.id)} disabled={!!busy}><ArrowClockwise size={12} /> Poll</Button>
                    <Button size="sm" onClick={() => void copyPartnerPrefill(session.id)} disabled={!!busy}>Prefill</Button>
                    <Button size="sm" onClick={() => openExternalUrl(session.meme_url)} disabled={!session.meme_url || !!busy}>Meme</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="proof-pool-section">
            <div className="proof-pool-section__header">
              <h2>{selectedPool ? `${selectedPool.name} / ${selectedPool.symbol}` : 'No Pool Selected'}</h2>
              {selectedPool ? <Badge tone={statusTone(selectedPool.status)}>{statusLabel(selectedPool.status)}</Badge> : null}
            </div>

            {selectedPool ? (
              <>
                <div className="proof-pool-metrics">
                  <MetricCard label="Backing" value={`${formatSol(selectedPool.current_backing_lamports ? selectedPool.current_backing_lamports / 1_000_000_000 : selectedPool.current_backing_sol)} SOL`} detail={`${filledSlots}/${selectedPool.total_slots} slots`} tone="info" />
                  <MetricCard label="Pool Wallet" value={shortAddress(selectedPool.pool_wallet)} detail="Deposit target" />
                  <MetricCard label="Creator Sub-Escrow" value={shortAddress(selectedPool.creator_subescrow)} detail="Fee vault" />
                  <MetricCard label="Mint" value={shortAddress(selectedPool.mint)} detail={selectedPool.proof_level ?? 'Pending launch'} tone={selectedPool.mint ? 'success' : 'default'} />
                </div>

                <div className="proof-pool-progress" aria-label="Backing progress">
                  <span style={{ width: `${progress}%` }} />
                </div>

                <div className="proof-pool-actions">
                  <Button variant="primary" onClick={() => runAction('Launch pool', async () => unwrap(await window.daemon.proof.launchPool(selectedPool.id)))} disabled={!canLaunch || !!busy}>
                    <Lightning size={14} /> Launch
                  </Button>
                  <Button onClick={() => runAction('Distribute tokens', async () => unwrap(await window.daemon.proof.distributePool(selectedPool.id)))} disabled={!canDistribute || !!busy}>
                    <Coins size={14} /> Distribute
                  </Button>
                  <Button onClick={() => runAction('Collect fees', async () => {
                    const result = unwrap(await window.daemon.proof.collectFees(selectedPool.id))
                    if (!result.ok) throw new Error(result.error ?? 'Fee collection failed')
                    return result
                  })} disabled={selectedPool.status !== 'distributed' || !!busy}>
                    <Wallet size={14} /> Collect Fees
                  </Button>
                  <Button variant="destructive" onClick={() => runAction('Refund pool', async () => unwrap(await window.daemon.proof.refundPool(selectedPool.id)))} disabled={!canRefund || !!busy}>
                    Refund
                  </Button>
                </div>

                <div className="proof-pool-addresses">
                  <button onClick={() => openAddress(selectedPool.pool_wallet)}><ArrowSquareOut size={12} /> Pool {shortAddress(selectedPool.pool_wallet)}</button>
                  <button onClick={() => openAddress(selectedPool.creator_subescrow)}><ArrowSquareOut size={12} /> Vault {shortAddress(selectedPool.creator_subescrow)}</button>
                  {selectedPool.mint ? <button onClick={() => openAddress(selectedPool.mint)}><ArrowSquareOut size={12} /> Mint {shortAddress(selectedPool.mint)}</button> : null}
                  <button onClick={() => openSignature(selectedPool.launch_signature)}><ArrowSquareOut size={12} /> Launch {shortAddress(selectedPool.launch_signature)}</button>
                  <span>Deadline {formatDate(selectedPool.backing_deadline)}</span>
                  <span>Tokens {formatBaseUnits(selectedPool.pool_token_balance)}</span>
                </div>
              </>
            ) : (
              <div className="proof-pool-empty">Create or select a pool</div>
            )}
          </section>

          {selectedPool ? (
            <section className="proof-pool-section">
              <div className="proof-pool-section__header">
                <h2>Backing Slots</h2>
                <Badge tone="feature">{filledSlots}/{selectedPool.total_slots}</Badge>
              </div>

              <form className="proof-pool-backing-form" onSubmit={(event) => { event.preventDefault(); void verifyBacking() }}>
                <input placeholder="Backer wallet" value={backingForm.backerWallet} onChange={(event) => setBackingForm({ ...backingForm, backerWallet: event.target.value })} />
                <input placeholder="SOL" type="number" min="0.05" step="0.01" value={backingForm.amountSol} onChange={(event) => setBackingForm({ ...backingForm, amountSol: event.target.value })} />
                <input placeholder="Deposit signature" value={backingForm.depositSignature} onChange={(event) => setBackingForm({ ...backingForm, depositSignature: event.target.value })} />
                <Button variant="primary" type="submit" disabled={selectedPool.status !== 'backing' || !!busy}>Verify</Button>
              </form>

              <div className="proof-pool-table">
                <div className="proof-pool-table-row is-head">
                  <span>Slot</span><span>Backer</span><span>Backing</span><span>Tokens</span><span>Fees</span><span>Status</span><span>Actions</span>
                </div>
                {detail?.backings.length ? detail.backings.map((backing) => (
                  <BackingRow
                    key={backing.id}
                    backing={backing}
                    busy={!!busy}
                    canDistribute={['live', 'distributed'].includes(selectedPool.status)}
                    canRefund={canRefund || selectedPool.status === 'refunding' || selectedPool.status === 'failed'}
                    onClaim={() => runAction('Claim fees', async () => unwrap(await window.daemon.proof.claimFees({ backingId: backing.id })))}
                    onDistribute={() => runAction('Distribute slot', async () => unwrap(await window.daemon.proof.distributeBacking({ backingId: backing.id })))}
                    onRefund={() => runAction('Refund slot', async () => unwrap(await window.daemon.proof.refundBacking({ backingId: backing.id })))}
                    onOpenTx={openSignature}
                  />
                )) : <div className="proof-pool-empty">No backings</div>}
              </div>
            </section>
          ) : null}

          <div className="proof-pool-bottom-grid">
            <section className="proof-pool-section proof-pool-form">
              <div className="proof-pool-section__header">
                <h2>Escrow</h2>
                <Badge tone={escrow?.configured ? 'success' : 'warning'}>{escrow?.configured ? 'READY' : 'MISSING'}</Badge>
              </div>
              <input value={escrowKey} onChange={(event) => setEscrowKey(event.target.value)} placeholder="Base58 private key" />
              <div className="proof-pool-actions">
                <Button onClick={() => configureEscrow(false)} disabled={!!busy || escrow?.configured}>Import</Button>
                <Button variant="primary" onClick={() => configureEscrow(true)} disabled={!!busy || escrow?.configured}>Generate</Button>
                <Button onClick={exportEscrow} disabled={!escrow?.configured || !!busy}><Key size={14} /> Backup</Button>
              </div>
            </section>

            <section className="proof-pool-section proof-pool-form">
              <div className="proof-pool-section__header">
                <h2>Vanity Mint</h2>
                <UploadSimple size={18} />
              </div>
              <input value={vanityKey} onChange={(event) => setVanityKey(event.target.value)} placeholder="...pooL mint private key" />
              <Button onClick={importVanityMint} disabled={!vanityKey.trim() || !!busy}>Import Mint</Button>
            </section>
          </div>

          {detail?.events.length ? (
            <section className="proof-pool-section">
              <div className="proof-pool-section__header">
                <h2>Events</h2>
                <Badge tone="neutral">{detail.events.length}</Badge>
              </div>
              <div className="proof-pool-events">
                {detail.events.map((event) => (
                  <button key={event.id} onClick={() => openSignature(event.signature)} disabled={!event.signature}>
                    <span>{event.kind}</span>
                    <strong>{event.message}</strong>
                    <small>{formatDate(event.created_at)}</small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  )
}

function BackingRow({
  backing,
  busy,
  canDistribute,
  canRefund,
  onClaim,
  onDistribute,
  onRefund,
  onOpenTx,
}: {
  backing: ProofBacking
  busy: boolean
  canDistribute: boolean
  canRefund: boolean
  onClaim: () => void
  onDistribute: () => void
  onRefund: () => void
  onOpenTx: (signature: string | null | undefined) => void
}) {
  const claimable = backing.claimable_fees_lamports ? backing.claimable_fees_lamports / 1_000_000_000 : Number(backing.claimable_fees_sol || 0)
  const canClaim = claimable > 0.000005
  return (
    <div className="proof-pool-table-row">
      <span>#{backing.slot_number}</span>
      <button onClick={() => onOpenTx(backing.deposit_signature)}>{shortAddress(backing.backer_wallet)}</button>
      <span>{formatSol(backing.amount_sol)} SOL</span>
      <span>{formatBaseUnits(backing.tokens_allocated)}</span>
      <span>{formatSol(claimable)} SOL</span>
      <Badge tone={backing.status === 'distributed' ? 'success' : backing.status === 'refunded' ? 'danger' : 'info'}>{backing.status.toUpperCase()}</Badge>
      <span className="proof-pool-row-actions">
        <Button size="sm" onClick={onDistribute} disabled={busy || !canDistribute || backing.status !== 'confirmed'}>Send</Button>
        <Button size="sm" onClick={onClaim} disabled={busy || !canClaim}>Claim</Button>
        <Button size="sm" variant="destructive" onClick={onRefund} disabled={busy || !canRefund || backing.status !== 'confirmed'}>Refund</Button>
      </span>
    </div>
  )
}

export default ProofPoolPanel
