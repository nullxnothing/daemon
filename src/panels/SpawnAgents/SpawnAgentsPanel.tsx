import { useState, useEffect, useCallback, useRef } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useWalletStore } from '../../store/wallet'
import { useUIStore } from '../../store/ui'
import type { WalletDashboard } from '../../types/daemon'
import type {
  SpawnAgentRecord,
  SpawnAgentDna,
  SpawnDepositInstruction,
  SpawnStatusResult,
  SpawnTrade,
  SpawnAgentPositions,
  SpawnAgentPublicProfile,
  SpawnAgentPublicPortfolio,
  SpawnEvent,
} from '../../../electron/services/SpawnAgentsService'
import { setSidebarAgentWidgetAgent } from '../RightPanel/sidebarAgentWidgetConfig'
import './SpawnAgentsPanel.css'

// ------------------------------------------------------------------ helpers --

const EMPTY_WALLETS: WalletDashboard['wallets'] = []
const KILL_COOLDOWN_MS = 24 * 60 * 60 * 1000
const CHILD_ACTIVITY_GATE_TRADES = 10
const CHILD_ACTIVITY_GATE_MS = 7 * 24 * 60 * 60 * 1000

function computeGate(agent: SpawnAgentRecord) {
  const out = { can_kill: true, can_withdraw: true, kill_reason: '', withdraw_reason: '' }
  if (agent.status !== 'alive') {
    return { can_kill: false, can_withdraw: false, kill_reason: 'Agent is dead', withdraw_reason: 'Agent is dead' }
  }
  const bornMs = Date.parse(agent.born_at.replace(' ', 'T') + 'Z')
  if (Number.isFinite(bornMs) && Date.now() - bornMs < KILL_COOLDOWN_MS) {
    out.can_kill = false
    const hoursLeft = Math.ceil((KILL_COOLDOWN_MS - (Date.now() - bornMs)) / (60 * 60 * 1000))
    out.kill_reason = `24h post-spawn cooldown — ${hoursLeft}h left`
  }
  if (agent.parent_id) {
    const ageOk = Number.isFinite(bornMs) && Date.now() - bornMs >= CHILD_ACTIVITY_GATE_MS
    const tradesOk = agent.total_trades >= CHILD_ACTIVITY_GATE_TRADES
    if (!ageOk && !tradesOk) {
      const reason = `Child needs ${CHILD_ACTIVITY_GATE_TRADES} trades or 7 days (${agent.total_trades}/${CHILD_ACTIVITY_GATE_TRADES})`
      out.can_withdraw = false
      out.withdraw_reason = reason
      if (out.can_kill) {
        out.can_kill = false
        out.kill_reason = reason
      }
    }
  }
  return out
}

function pnlColor(val: number) {
  if (val > 0) return 'var(--sa-green)'
  if (val < 0) return 'var(--sa-red)'
  return 'var(--sa-muted)'
}

function fmt(val: number, decimals = 4) {
  return val.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })
}

function truncate(addr: string, len = 6) {
  return addr ? `${addr.slice(0, len)}…${addr.slice(-4)}` : ''
}

function filenameFromPath(filePath: string) {
  return filePath.split(/[/\\]/).pop() ?? filePath
}

function agentProfileUrl(agentId: string) {
  return `https://spawnagents.fun/agent?id=${encodeURIComponent(agentId)}`
}

function solscanAccountUrl(address: string) {
  return `https://solscan.io/account/${encodeURIComponent(address)}`
}

function ageLabel(bornAt: string) {
  const bornMs = Date.parse(bornAt.replace(' ', 'T') + 'Z')
  if (!Number.isFinite(bornMs)) return '--'
  const days = Math.max(0, Math.floor((Date.now() - bornMs) / (24 * 60 * 60 * 1000)))
  return `${days}d`
}

function dnaModeLabel(dna: SpawnAgentDna) {
  if (dna.trades_prediction && dna.trades_memecoins) return 'Hybrid'
  if (dna.trades_prediction) return 'Prediction'
  if (dna.trades_memecoins) return 'Memecoin'
  return 'Agent'
}

async function squareAvatarDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const maxDim = 400
      canvas.width = maxDim
      canvas.height = maxDim
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not prepare avatar preview'))
        return
      }
      const size = Math.min(img.width, img.height)
      const sx = (img.width - size) / 2
      const sy = (img.height - size) / 2
      ctx.drawImage(img, sx, sy, size, size, 0, 0, maxDim, maxDim)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => reject(new Error('Could not load selected image'))
    img.src = dataUrl
  })
}

// ----------------------------------------------------------------- AgentCard --

function AgentCard({ agent, selected, onClick }: { agent: SpawnAgentRecord; selected: boolean; onClick: () => void }) {
  const pnl = agent.total_pnl_sol
  return (
    <button className={`sa-agent-card${selected ? ' selected' : ''}${agent.status === 'dead' ? ' dead' : ''}`} onClick={onClick}>
      <div className="sa-card-header">
        <span className="sa-card-name">{agent.name}</span>
        <span className={`sa-card-status ${agent.status}`}>{agent.status}</span>
      </div>
      <div className="sa-card-meta">
        <span className="sa-card-gen">gen {agent.generation}</span>
        {agent.parent_id && <span className="sa-card-lineage">child</span>}
      </div>
      <div className="sa-card-pnl" style={{ color: pnlColor(pnl) }}>
        {pnl >= 0 ? '+' : ''}{fmt(pnl)} SOL
      </div>
      <div className="sa-card-trades">{agent.total_trades} trades</div>
    </button>
  )
}

// ---------------------------------------------------------------- DNA editor --

const DEFAULT_DNA: SpawnAgentDna = {
  trades_memecoins: true,
  trades_prediction: false,
  aggression: 0.5,
  patience: 0.5,
  risk_tolerance: 0.5,
  sell_profit_pct: 100,
  sell_loss_pct: 25,
  max_position_pct: 20,
  sniper: false,
  reproduction_cost_sol: 0.3,
  royalty_pct: 0.05,
  pm_categories: ['crypto'],
  pm_edge_threshold: 5,
  pm_max_position_pct: 10,
  pm_max_positions: 10,
}

function normalizeSpawnDna(dna: SpawnAgentDna): SpawnAgentDna {
  const next: SpawnAgentDna = {
    ...dna,
    trades_memecoins: !!dna.trades_memecoins,
    trades_prediction: !!dna.trades_prediction,
  }

  if (next.trades_prediction) {
    const categories = Array.isArray(next.pm_categories) && next.pm_categories.length > 0
      ? next.pm_categories
      : ['crypto']
    next.pm_categories = categories
    next.pm_edge_threshold = clampNumber(next.pm_edge_threshold ?? 5, 0, 50)
    next.pm_max_position_pct = clampNumber(next.pm_max_position_pct ?? 10, 1, 50)
    next.pm_max_positions = Math.round(clampNumber(next.pm_max_positions ?? 10, 1, 100))
  } else {
    delete next.pm_categories
    delete next.pm_edge_threshold
    delete next.pm_max_position_pct
    delete next.pm_max_positions
  }

  return next
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function DnaSlider({ label, field, value, min, max, step = 0.01, onChange }: {
  label: string; field: keyof SpawnAgentDna; value: number; min: number; max: number; step?: number; onChange: (v: number) => void
}) {
  return (
    <div className="sa-dna-row">
      <label className="sa-dna-label">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="sa-dna-slider"
      />
      <span className="sa-dna-val">{value}</span>
    </div>
  )
}

// --------------------------------------------------------------- Spawn form --

interface SpawnFormProps {
  ownerWallet: string
  walletId: string | null
  walletCanSign: boolean
  onCancel: () => void
  onDeposit: (instr: SpawnDepositInstruction) => void
  onFunded: () => void
}

function SpawnForm({ ownerWallet, walletId, walletCanSign, onCancel, onDeposit, onFunded }: SpawnFormProps) {
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [solAmount, setSolAmount] = useState(0.5)
  const [dna, setDna] = useState<SpawnAgentDna>(DEFAULT_DNA)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setDnaField<K extends keyof SpawnAgentDna>(k: K, v: SpawnAgentDna[K]) {
    setDna((prev) => ({ ...prev, [k]: v }))
  }

  function validate(): boolean {
    if (!name.trim()) { setError('Name is required'); return false }
    if (solAmount < 0.2) { setError('Minimum deposit is 0.2 SOL'); return false }
    return true
  }

  function buildInput() {
    const meta = {
      avatar: avatarPreview ?? undefined,
      bio: bio.trim() || undefined,
    }
    return {
      owner_wallet: ownerWallet,
      name: name.trim(),
      sol_amount: solAmount,
      dna: normalizeSpawnDna(dna),
      ...(meta.avatar || meta.bio ? { meta } : {}),
    }
  }

  async function handlePickAvatar() {
    setError(null)
    const res = await daemon.launch.pickImage()
    if (!res.ok || !res.data) {
      if (res.error) setError(res.error)
      return
    }

    const filePath = res.data
    const imgRes = await daemon.fs.readPickedImageBase64(filePath)
    if (!imgRes.ok || !imgRes.data?.dataUrl) {
      setError(imgRes.error ?? 'Could not read selected image')
      return
    }

    try {
      setAvatarPreview(await squareAvatarDataUrl(imgRes.data.dataUrl))
      setAvatarPath(filePath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare selected image')
    }
  }

  function handleClearAvatar() {
    setAvatarPath(null)
    setAvatarPreview(null)
  }

  async function handleSpawn() {
    if (!validate()) return
    setBusy(true)
    setError(null)
    const res = await daemon.spawnAgents.initiateSpawn(buildInput())
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'Spawn failed'); return }
    onDeposit(res.data!)
  }

  async function handleSpawnAndFund() {
    if (!validate()) return
    if (!walletId) { setError('No DAEMON wallet with a keypair available'); return }
    if (!walletCanSign) { setError('Selected wallet is watch-only. Import its private key before funding a spawn.'); return }
    setBusy(true)
    setError(null)
    const res = await daemon.spawnAgents.spawnAndFund(walletId, buildInput())
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'Spawn-and-fund failed'); return }
    onFunded()
  }

  return (
    <div className="sa-spawn-form">
      <div className="sa-form-heading">
        <div>
          <div className="sa-form-eyebrow">New agent</div>
          <div className="sa-form-title">Configure identity, bankroll, and DNA</div>
        </div>
        <span className="sa-owner-pill">{truncate(ownerWallet, 7)}</span>
      </div>

      <div className="sa-spawn-layout">
        <div className="sa-spawn-main">
          <section className="sa-form-panel">
            <div className="sa-panel-title">Identity</div>
            <div className="sa-identity-grid">
              <div className="sa-avatar-box">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" />
                ) : (
                  <span>No image</span>
                )}
              </div>
              <div className="sa-avatar-controls">
                <button type="button" className="sa-btn-ghost" onClick={handlePickAvatar} disabled={busy}>
                  {avatarPath ? 'Change image' : 'Upload image'}
                </button>
                {avatarPath && (
                  <button type="button" className="sa-btn-subtle" onClick={handleClearAvatar} disabled={busy}>
                    Remove
                  </button>
                )}
                {avatarPath && <div className="sa-file-name" title={avatarPath}>{filenameFromPath(avatarPath)}</div>}
              </div>
            </div>

            <div className="sa-form-field">
              <label>Name</label>
              <input className="sa-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" maxLength={32} />
            </div>

            <div className="sa-form-field">
              <label>Bio / motto</label>
              <textarea className="sa-input sa-textarea" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short trading thesis or personality" maxLength={180} />
            </div>
          </section>

          <section className="sa-form-panel">
            <div className="sa-panel-title">Funding</div>
            <div className="sa-form-field">
              <label>Deposit (SOL)</label>
              <input className="sa-input" type="number" min={0.2} step={0.1} value={solAmount} onChange={(e) => setSolAmount(parseFloat(e.target.value))} />
              <span className="sa-field-hint">Minimum 0.2 SOL · goes 100% to agent wallet</span>
            </div>
          </section>

          <section className="sa-dna-section">
            <div className="sa-panel-title">DNA</div>

            <div className="sa-dna-modes">
              <label className="sa-check">
                <input type="checkbox" checked={!!dna.trades_memecoins} onChange={(e) => setDnaField('trades_memecoins', e.target.checked)} />
                Memecoins
              </label>
              <label className="sa-check">
                <input type="checkbox" checked={!!dna.trades_prediction} onChange={(e) => setDnaField('trades_prediction', e.target.checked)} />
                Prediction markets
              </label>
            </div>

            {dna.trades_memecoins && (
              <>
                <DnaSlider label="Aggression" field="aggression" value={dna.aggression ?? 0.5} min={0} max={1} onChange={(v) => setDnaField('aggression', v)} />
                <DnaSlider label="Patience" field="patience" value={dna.patience ?? 0.5} min={0} max={1} onChange={(v) => setDnaField('patience', v)} />
                <DnaSlider label="Risk tolerance" field="risk_tolerance" value={dna.risk_tolerance ?? 0.5} min={0} max={1} onChange={(v) => setDnaField('risk_tolerance', v)} />
                <DnaSlider label="Take-profit %" field="sell_profit_pct" value={dna.sell_profit_pct ?? 100} min={10} max={1000} step={5} onChange={(v) => setDnaField('sell_profit_pct', v)} />
                <DnaSlider label="Stop-loss %" field="sell_loss_pct" value={dna.sell_loss_pct ?? 25} min={5} max={100} step={1} onChange={(v) => setDnaField('sell_loss_pct', v)} />
                <DnaSlider label="Max position %" field="max_position_pct" value={dna.max_position_pct ?? 20} min={10} max={90} step={5} onChange={(v) => setDnaField('max_position_pct', v)} />
                <label className="sa-check">
                  <input type="checkbox" checked={!!dna.sniper} onChange={(e) => setDnaField('sniper', e.target.checked)} />
                  Sniper mode
                </label>
              </>
            )}

            {dna.trades_prediction && (
              <>
                <DnaSlider label="Edge threshold %" field="pm_edge_threshold" value={dna.pm_edge_threshold ?? 5} min={0} max={50} step={1} onChange={(v) => setDnaField('pm_edge_threshold', v)} />
                <DnaSlider label="Max position %" field="pm_max_position_pct" value={dna.pm_max_position_pct ?? 10} min={1} max={50} step={1} onChange={(v) => setDnaField('pm_max_position_pct', v)} />
                <DnaSlider label="Max PM positions" field="pm_max_positions" value={dna.pm_max_positions ?? 10} min={1} max={100} step={1} onChange={(v) => setDnaField('pm_max_positions', Math.round(v))} />
              </>
            )}
          </section>
        </div>

        <aside className="sa-spawn-preview">
          <div className="sa-preview-avatar">
            {avatarPreview ? <img src={avatarPreview} alt="" /> : <span>No image</span>}
          </div>
          <div className="sa-preview-name">{name.trim() || 'Unnamed Agent'}</div>
          <div className="sa-preview-bio">{bio.trim() || 'Autonomous Solana trading agent'}</div>
          <div className="sa-preview-modes">
            {dna.trades_memecoins && <span>Memecoins</span>}
            {dna.trades_prediction && <span>Prediction</span>}
          </div>
          <div className="sa-preview-stats">
            <div><span>Deposit</span><strong>{fmt(solAmount || 0, 2)} SOL</strong></div>
            <div><span>Aggression</span><strong>{dna.aggression ?? 0.5}</strong></div>
            <div><span>Risk</span><strong>{dna.risk_tolerance ?? 0.5}</strong></div>
            <div><span>Stop loss</span><strong>{dna.sell_loss_pct ?? 25}%</strong></div>
          </div>
        </aside>
      </div>

      {error && <div className="sa-error">{error}</div>}

      <div className="sa-form-actions">
        <button className="sa-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="sa-btn-ghost" onClick={handleSpawn} disabled={busy}>
          {busy ? 'Requesting…' : 'Get deposit address'}
        </button>
        <button className="sa-btn-primary" onClick={handleSpawnAndFund} disabled={busy || !walletId || !walletCanSign} title={!walletCanSign ? 'Selected wallet is watch-only' : !walletId ? 'Requires a DAEMON wallet with a keypair' : ''}>
          {busy ? 'Spawning…' : 'Spawn & fund from wallet'}
        </button>
      </div>
    </div>
  )
}

// --------------------------------------------------------- Deposit flow step --

function DepositStep({ instr, onDone, onCancel }: { instr: SpawnDepositInstruction; onDone: () => void; onCancel: () => void }) {
  const [status, setStatus] = useState<SpawnStatusResult['status'] | 'polling'>('polling')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = useCallback(async () => {
    const res = await daemon.spawnAgents.spawnStatus(instr.reference)
    if (!res.ok) return
    setStatus(res.data!.status)
    if (res.data!.status === 'confirmed' || res.data!.status === 'funding_failed' || res.data!.status === 'expired') {
      if (pollRef.current) clearInterval(pollRef.current)
      if (res.data!.status === 'confirmed') onDone()
    }
  }, [instr.reference, onDone])

  useEffect(() => {
    pollRef.current = setInterval(poll, 4000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [poll])

  async function copyAddress() {
    await navigator.clipboard.writeText(instr.recipient)
  }

  return (
    <div className="sa-deposit-step">
      <div className="sa-form-title">Fund your agent</div>
      <p className="sa-deposit-copy">Send exactly <strong>{fmt(instr.amount, 6)} SOL</strong> to the address below from your owner wallet. DAEMON will poll for confirmation.</p>

      <div className="sa-deposit-addr-row">
        <span className="sa-deposit-addr">{instr.recipient}</span>
        <button className="sa-btn-ghost sa-copy-btn" onClick={copyAddress}>Copy</button>
      </div>

      <div className="sa-deposit-meta">
        <span>Agent: <strong>{instr.agent_name}</strong></span>
        <span>Ref: <code>{truncate(instr.reference, 8)}</code></span>
      </div>

      <div className={`sa-deposit-status ${status}`}>
        {status === 'polling' && '⏳ Waiting for deposit…'}
        {status === 'pending' && '⏳ Deposit seen, awaiting confirmation…'}
        {status === 'confirmed' && '✓ Confirmed — agent is alive'}
        {status === 'funding_failed' && '✗ Funding failed'}
        {status === 'expired' && '✗ Expired — start a new spawn'}
      </div>

      {(status === 'funding_failed' || status === 'expired') && (
        <button className="sa-btn-ghost" onClick={onCancel}>Back</button>
      )}
    </div>
  )
}

// ---------------------------------------------------------- Agent detail tab --

function AgentDetail({ agent, walletId, onRefresh }: { agent: SpawnAgentRecord; walletId: string | null; onRefresh: () => void }) {
  const [tab, setTab] = useState<'positions' | 'trades'>('positions')
  const [positions, setPositions] = useState<SpawnAgentPositions | null>(null)
  const [trades, setTrades] = useState<SpawnTrade[] | null>(null)
  const [publicProfile, setPublicProfile] = useState<SpawnAgentPublicProfile | null>(null)
  const [publicPortfolio, setPublicPortfolio] = useState<SpawnAgentPublicPortfolio | null>(null)
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmKill, setConfirmKill] = useState(false)

  useEffect(() => {
    if (tab === 'positions') {
      daemon.spawnAgents.positions(agent.id).then((r) => { if (r.ok) setPositions(r.data!) })
    } else {
      daemon.spawnAgents.trades(agent.id).then((r) => { if (r.ok) setTrades(r.data!.trades) })
    }
  }, [agent.id, tab])

  useEffect(() => {
    let cancelled = false
    setPublicProfile(null)
    setPublicPortfolio(null)

    void daemon.spawnAgents.publicProfile(agent.id).then((res) => {
      if (!cancelled && res.ok && res.data) setPublicProfile(res.data)
    }).catch(() => {})

    void daemon.spawnAgents.publicPortfolio(agent.id).then((res) => {
      if (!cancelled && res.ok && res.data) setPublicPortfolio(res.data)
    }).catch(() => {})

    return () => { cancelled = true }
  }, [agent.id])

  async function handleWithdraw() {
    if (!walletId) { setMsg('No DAEMON wallet with keypair selected'); return }
    const amt = parseFloat(withdrawAmt)
    if (!amt || amt <= 0) { setMsg('Enter a valid amount'); return }
    setBusy(true)
    setMsg(null)
    const res = await daemon.spawnAgents.withdraw(agent.id, walletId, amt)
    setBusy(false)
    if (!res.ok) { setMsg(res.error ?? 'Withdraw failed'); return }
    setMsg(`✓ Withdrawn ${fmt(res.data!.amount_sol)} SOL — new balance: ${fmt(res.data!.new_balance_sol)}`)
    setWithdrawAmt('')
    onRefresh()
  }

  async function handleKill() {
    if (!walletId) { setMsg('No DAEMON wallet with keypair selected'); return }
    setBusy(true)
    setMsg(null)
    const res = await daemon.spawnAgents.kill(agent.id, walletId)
    setBusy(false)
    if (!res.ok) { setMsg(res.error ?? 'Kill failed'); return }
    setMsg(`✓ Agent killed · ${fmt(res.data!.refund_sol)} SOL refunded`)
    setConfirmKill(false)
    onRefresh()
  }

  const profileAgent = publicProfile?.agent
  const displayDna = profileAgent?.dna ?? agent.dna
  const avatar = agent.avatar ?? profileAgent?.avatar ?? profileAgent?.meta?.avatar ?? null
  const totalPredictions = (publicProfile?.predictionOpen.length ?? 0) + (publicProfile?.predictionClosed.length ?? 0)
  const winRate = publicProfile?.winRate ?? 0
  const totalBalanceSol = publicPortfolio?.sol_balance ?? (agent.initial_capital_sol + agent.total_pnl_sol - agent.total_withdrawn_sol)
  const tokenValueSol = publicPortfolio && publicPortfolio.sol_price > 0
    ? Math.max(0, (publicPortfolio.total_value_usd - publicPortfolio.sol_value_usd) / publicPortfolio.sol_price)
    : positions?.memecoin.reduce((sum, pos) => sum + pos.value_sol, 0) ?? 0
  const openPredictions = publicProfile?.predictionOpen ?? positions?.prediction ?? []

  return (
    <div className="sa-detail">
      <div className="sa-detail-header">
        <div className="sa-detail-title-row">
          <div className="sa-detail-avatar">
            {avatar ? <img src={avatar} alt="" /> : <span />}
          </div>
          <div>
            <div className="sa-detail-name">{agent.name}</div>
            <div className="sa-detail-sub">
              <span className={`sa-card-status ${agent.status}`}>{agent.status}</span>
              <span>gen {agent.generation}</span>
              <span>{dnaModeLabel(displayDna)}</span>
              <button className="sa-inline-link" type="button" onClick={() => void window.daemon.shell.openExternal(solscanAccountUrl(agent.agent_wallet))}>
                {truncate(agent.agent_wallet)}
              </button>
            </div>
            <div className="sa-detail-links">
              <button className="sa-btn-ghost" type="button" onClick={() => void window.daemon.shell.openExternal(agentProfileUrl(agent.id))}>
                Open Spawn profile
              </button>
              <button className="sa-btn-ghost" type="button" onClick={() => setSidebarAgentWidgetAgent(agent.id)}>
                Add sidebar widget
              </button>
              {agent.metaplex_asset_address && (
                <button className="sa-btn-ghost" type="button" onClick={() => void window.daemon.shell.openExternal(solscanAccountUrl(agent.metaplex_asset_address))}>
                  View asset
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="sa-detail-pnl" style={{ color: pnlColor(agent.total_pnl_sol) }}>
          {agent.total_pnl_sol >= 0 ? '+' : ''}{fmt(agent.total_pnl_sol)} SOL
        </div>
      </div>

      <div className="sa-detail-stats">
        <div className="sa-stat"><span>Initial</span><strong>{fmt(agent.initial_capital_sol)} SOL</strong></div>
        <div className="sa-stat"><span>Predictions</span><strong>{totalPredictions}</strong></div>
        <div className="sa-stat"><span>Age</span><strong>{ageLabel(agent.born_at)}</strong></div>
        <div className="sa-stat"><span>Trades</span><strong>{agent.total_trades}</strong></div>
        <div className="sa-stat"><span>Win rate</span><strong>{Math.round(winRate)}%</strong></div>
        <div className="sa-stat"><span>Withdrawn</span><strong>{fmt(agent.total_withdrawn_sol)} SOL</strong></div>
      </div>

      <div className="sa-public-grid">
        <section className="sa-public-section">
          <div className="sa-section-label">Agent mind</div>
          <div className="sa-public-card">
            {publicProfile ? 'No brain data yet - waiting for next scan cycle' : 'Loading public profile...'}
          </div>
        </section>
        <section className="sa-public-section">
          <div className="sa-section-label">Portfolio</div>
          <div className="sa-public-stats">
            <div><span>Total balance</span><strong>{fmt(totalBalanceSol)} SOL</strong></div>
            <div><span>SOL balance</span><strong>{fmt(publicPortfolio?.native_sol ?? totalBalanceSol)} SOL</strong></div>
            <div><span>Token value</span><strong>{fmt(tokenValueSol)} SOL</strong></div>
          </div>
          {publicPortfolio && publicPortfolio.tokens.length === 0 && (
            <div className="sa-public-card">No token holdings</div>
          )}
          {publicPortfolio && publicPortfolio.tokens.length > 0 && (
            <div className="sa-token-list">
              {publicPortfolio.tokens.slice(0, 8).map((token, idx) => (
                <div key={`${token.mint ?? token.symbol ?? 'token'}-${idx}`} className="sa-token-row">
                  <span>{token.symbol ?? token.name ?? truncate(token.mint ?? '')}</span>
                  <strong>{fmt(token.value_sol ?? 0)} SOL</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="sa-public-section">
        <div className="sa-section-label">DNA profile</div>
        <div className="sa-dna-readout">
          <div><span>Mode</span><strong>{dnaModeLabel(displayDna)}</strong></div>
          {displayDna.trades_memecoins && (
            <>
              <div><span>Aggression</span><strong>{displayDna.aggression ?? '--'}</strong></div>
              <div><span>Patience</span><strong>{displayDna.patience ?? '--'}</strong></div>
              <div><span>Risk</span><strong>{displayDna.risk_tolerance ?? '--'}</strong></div>
            </>
          )}
          {displayDna.trades_prediction && (
            <>
              <div><span>PM categories</span><strong>{displayDna.pm_categories?.join(', ') ?? 'crypto'}</strong></div>
              <div><span>PM edge</span><strong>{displayDna.pm_edge_threshold ?? '--'}%</strong></div>
              <div><span>PM strategy</span><strong>{displayDna.pm_sell_strategy ?? 'hold'}</strong></div>
            </>
          )}
        </div>
      </section>

      {agent.status === 'alive' && (() => {
        const gate = computeGate(agent)
        return (
          <div className="sa-actions-row">
            <div className="sa-withdraw-row">
              <input className="sa-input sa-input-sm" type="number" placeholder="SOL" min={0.003} step={0.01} value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} disabled={!gate.can_withdraw} />
              <button className="sa-btn-ghost" disabled={busy || !gate.can_withdraw} onClick={handleWithdraw} title={gate.withdraw_reason}>Withdraw</button>
            </div>
            {!confirmKill
              ? <button className="sa-btn-danger" disabled={busy || !gate.can_kill} onClick={() => setConfirmKill(true)} title={gate.kill_reason}>Kill agent</button>
              : (
                <div className="sa-confirm-kill">
                  <span>Kill {agent.name}? This liquidates all positions.</span>
                  <button className="sa-btn-ghost" onClick={() => setConfirmKill(false)}>Cancel</button>
                  <button className="sa-btn-danger" disabled={busy} onClick={handleKill}>Confirm kill</button>
                </div>
              )
            }
            {(gate.kill_reason || gate.withdraw_reason) && (
              <div className="sa-gate-hint">{gate.kill_reason || gate.withdraw_reason}</div>
            )}
          </div>
        )
      })()}

      {msg && <div className="sa-msg">{msg}</div>}

      <div className="sa-tabs">
        <button className={tab === 'positions' ? 'active' : ''} onClick={() => setTab('positions')}>Positions</button>
        <button className={tab === 'trades' ? 'active' : ''} onClick={() => setTab('trades')}>Trades</button>
      </div>

      {tab === 'positions' && positions && (
        <div className="sa-pos-list">
          {positions.memecoin.length === 0 && positions.prediction.length === 0 && (
            <div className="sa-empty">No open positions</div>
          )}
          {positions.memecoin.map((p) => (
            <div key={p.token_address} className="sa-pos-row">
              <span className="sa-pos-sym">{p.symbol || truncate(p.token_address)}</span>
              <span className="sa-pos-val">{fmt(p.value_sol)} SOL</span>
              <span style={{ color: pnlColor(p.unrealized_pnl_sol) }}>{p.unrealized_pnl_pct >= 0 ? '+' : ''}{p.unrealized_pnl_pct.toFixed(1)}%</span>
            </div>
          ))}
          {positions.prediction.map((p) => (
            <div key={p.id} className="sa-pos-row">
              <span className="sa-pos-sym">{p.event_title}</span>
              <span className="sa-pos-side">{p.side}</span>
              <span>{p.contracts_remaining} contracts</span>
            </div>
          ))}
          {positions.prediction.length === 0 && openPredictions.length > 0 && openPredictions.map((p) => (
            <div key={p.id} className="sa-pos-row">
              <span className="sa-pos-sym">{p.event_title}</span>
              <span className="sa-pos-side">{p.side}</span>
              <span>{p.contracts_remaining} contracts</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'trades' && trades && (
        <div className="sa-trades-list">
          {trades.length === 0 && <div className="sa-empty">No trades yet</div>}
          {trades.map((t) => (
            <div key={t.id} className={`sa-trade-row ${t.action}`}>
              <span className="sa-trade-action">{t.action.toUpperCase()}</span>
              <span className="sa-trade-addr">{truncate(t.token_address)}</span>
              <span>{fmt(t.amount_sol)} SOL</span>
              {t.pnl_sol != null && (
                <span style={{ color: pnlColor(t.pnl_sol) }}>{t.pnl_sol >= 0 ? '+' : ''}{fmt(t.pnl_sol)}</span>
              )}
              <span className="sa-trade-time">{new Date(t.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Event feed --

function EventFeed({ agentId }: { agentId?: string }) {
  const [events, setEvents] = useState<SpawnEvent[]>([])

  useEffect(() => {
    const unsubscribe = daemon.spawnAgents.onEvent((ev: SpawnEvent) => {
      if (agentId && ev.agent_id !== agentId) return
      setEvents((prev) => [ev, ...prev].slice(0, 100))
    })
    return () => { unsubscribe?.() }
  }, [agentId])

  if (events.length === 0) return <div className="sa-empty">Waiting for events…</div>

  return (
    <div className="sa-event-feed">
      {events.map((e) => (
        <div key={e.id} className={`sa-event-row sa-event-${e.type}`}>
          <span className="sa-event-type">{e.type}</span>
          <span className="sa-event-agent">{e.agent_id}</span>
          <span className="sa-event-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ Main panel --

type View = 'list' | 'spawn' | 'deposit' | 'detail' | 'events'

export function SpawnAgentsPanel() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const wallets = useWalletStore((s) => s.dashboard?.wallets ?? EMPTY_WALLETS)
  const walletLoading = useWalletStore((s) => s.loading)
  const walletError = useWalletStore((s) => s.error)
  const defaultWallet = wallets.find((w) => w.isDefault) ?? wallets[0] ?? null
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(defaultWallet?.id ?? null)
  const [walletKeypairs, setWalletKeypairs] = useState<Record<string, boolean>>({})
  const [agents, setAgents] = useState<SpawnAgentRecord[]>([])
  const [selected, setSelected] = useState<SpawnAgentRecord | null>(null)
  const [view, setView] = useState<View>('list')
  const [depositInstr, setDepositInstr] = useState<SpawnDepositInstruction | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void useWalletStore.getState().refresh(activeProjectId)
  }, [activeProjectId])

  useEffect(() => {
    if (wallets.length === 0) {
      setSelectedWalletId(null)
      return
    }
    if (!selectedWalletId || !wallets.some((wallet) => wallet.id === selectedWalletId)) {
      setSelectedWalletId(defaultWallet?.id ?? wallets[0].id)
    }
  }, [defaultWallet?.id, selectedWalletId, wallets])

  useEffect(() => {
    let cancelled = false
    async function loadKeypairState() {
      const entries = await Promise.all(wallets.map(async (wallet) => {
        try {
          const res = await daemon.wallet.hasKeypair(wallet.id)
          return [wallet.id, res.ok && res.data === true] as const
        } catch {
          return [wallet.id, false] as const
        }
      }))
      if (!cancelled) setWalletKeypairs(Object.fromEntries(entries))
    }
    void loadKeypairState()
    return () => { cancelled = true }
  }, [wallets])

  const selectedWallet = wallets.find((wallet) => wallet.id === selectedWalletId) ?? defaultWallet ?? null
  const ownerWallet = selectedWallet?.address ?? null
  const selectedWalletCanSign = selectedWallet ? walletKeypairs[selectedWallet.id] === true : false

  const loadAgents = useCallback(async () => {
    if (!ownerWallet) return
    setLoading(true)
    setError(null)
    const res = await daemon.spawnAgents.list(ownerWallet)
    setLoading(false)
    if (!res.ok) { setError(res.error ?? 'Failed to load agents'); return }
    setAgents(res.data!)
  }, [ownerWallet])

  useEffect(() => { void loadAgents() }, [loadAgents])

  function selectAgent(agent: SpawnAgentRecord) {
    setSelected(agent)
    setView('detail')
  }

  function handleDeposit(instr: SpawnDepositInstruction) {
    setDepositInstr(instr)
    setView('deposit')
  }

  function handleDepositDone() {
    void loadAgents()
    setView('list')
    setDepositInstr(null)
  }

  if (!ownerWallet) {
    return (
      <div className="sa-root sa-no-wallet">
        <div className="sa-no-wallet-msg">
          <div className="sa-no-wallet-title">{walletLoading ? 'Loading wallets' : 'No wallet connected'}</div>
          <p>
            {walletLoading
              ? 'Preparing DAEMON wallets before loading SpawnAgents.'
              : walletError ?? 'Set a default DAEMON wallet with a keypair to use SpawnAgents. The keypair is needed to sign agent actions (withdraw, kill, spawn-child).'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="sa-root">
      <div className="sa-topbar">
        <div className="sa-topbar-left">
          <span className="sa-brand">SpawnAgents</span>
          <span className="sa-owner">{truncate(ownerWallet)}</span>
        </div>
        <div className="sa-topbar-right">
          {wallets.length > 0 && (
            <label className="sa-wallet-select-wrap">
              <span>Wallet</span>
              <select
                className="sa-wallet-select"
                value={selectedWallet?.id ?? ''}
                onChange={(e) => {
                  setSelected(null)
                  setView('list')
                  setSelectedWalletId(e.target.value)
                }}
              >
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name}{wallet.isDefault ? ' (default)' : ''} · {walletKeypairs[wallet.id] ? 'signer' : 'watch'} · {truncate(wallet.address)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className={`sa-tab-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>Agents</button>
          <button className={`sa-tab-btn${view === 'events' ? ' active' : ''}`} onClick={() => setView('events')}>Events</button>
          {view !== 'spawn' && (
            <button className="sa-btn-primary sa-spawn-btn" onClick={() => setView('spawn')}>+ Spawn</button>
          )}
        </div>
      </div>

      <div className="sa-body">
        {view === 'list' && (
          <>
            {loading && <div className="sa-loading">Loading agents…</div>}
            {error && <div className="sa-error">{error}</div>}
            {!loading && !error && agents.length === 0 && (
              <div className="sa-empty-state">
                <div className="sa-empty-title">No agents yet</div>
                <p>Spawn your first autonomous Solana trading agent.</p>
                <button className="sa-btn-primary" onClick={() => setView('spawn')}>Spawn agent</button>
              </div>
            )}
            <div className="sa-agent-grid">
              {agents.map((a) => (
                <AgentCard key={a.id} agent={a} selected={selected?.id === a.id} onClick={() => selectAgent(a)} />
              ))}
            </div>
          </>
        )}

        {view === 'spawn' && (
          <SpawnForm
            ownerWallet={ownerWallet}
            walletId={selectedWallet?.id ?? null}
            walletCanSign={selectedWalletCanSign}
            onCancel={() => setView('list')}
            onDeposit={handleDeposit}
            onFunded={() => {
              void loadAgents()
              setView('list')
            }}
          />
        )}

        {view === 'deposit' && depositInstr && (
          <DepositStep
            instr={depositInstr}
            onDone={handleDepositDone}
            onCancel={() => setView('spawn')}
          />
        )}

        {view === 'events' && (
          <div className="sa-events-view">
            <div className="sa-events-header">
              Live event feed
              {selected && <span className="sa-events-scope"> · {selected.name}</span>}
            </div>
            <EventFeed agentId={selected?.id} />
          </div>
        )}

        {view === 'detail' && selected && (
          <>
            <button className="sa-back-btn" onClick={() => setView('list')}>← All agents</button>
            <AgentDetail
              agent={selected}
              walletId={selectedWalletCanSign ? selectedWallet?.id ?? null : null}
              onRefresh={() => {
                void loadAgents()
                daemon.spawnAgents.get(selected.id).then((r) => { if (r.ok) setSelected(r.data!) })
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}

export default SpawnAgentsPanel
