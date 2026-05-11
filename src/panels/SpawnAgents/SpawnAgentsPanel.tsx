import { useState, useEffect, useCallback, useRef } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useWalletStore } from '../../store/wallet'
import type {
  SpawnAgentRecord,
  SpawnAgentDna,
  SpawnDepositInstruction,
  SpawnStatusResult,
  SpawnTrade,
  SpawnAgentPositions,
  SpawnEvent,
} from '../../../electron/services/SpawnAgentsService'
import './SpawnAgentsPanel.css'

// ------------------------------------------------------------------ helpers --

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
  onCancel: () => void
  onDeposit: (instr: SpawnDepositInstruction) => void
  onFunded: () => void
}

function SpawnForm({ ownerWallet, walletId, onCancel, onDeposit, onFunded }: SpawnFormProps) {
  const [name, setName] = useState('')
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

  async function handleSpawn() {
    if (!validate()) return
    setBusy(true)
    setError(null)
    const res = await daemon.spawnAgents.initiateSpawn({ owner_wallet: ownerWallet, name: name.trim(), sol_amount: solAmount, dna })
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'Spawn failed'); return }
    onDeposit(res.data!)
  }

  async function handleSpawnAndFund() {
    if (!validate()) return
    if (!walletId) { setError('No DAEMON wallet with a keypair available'); return }
    setBusy(true)
    setError(null)
    const res = await daemon.spawnAgents.spawnAndFund(walletId, { owner_wallet: ownerWallet, name: name.trim(), sol_amount: solAmount, dna })
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'Spawn-and-fund failed'); return }
    onFunded()
  }

  return (
    <div className="sa-spawn-form">
      <div className="sa-form-title">Spawn new agent</div>

      <div className="sa-form-field">
        <label>Name</label>
        <input className="sa-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" maxLength={32} />
      </div>

      <div className="sa-form-field">
        <label>Deposit (SOL)</label>
        <input className="sa-input" type="number" min={0.2} step={0.1} value={solAmount} onChange={(e) => setSolAmount(parseFloat(e.target.value))} />
        <span className="sa-field-hint">Minimum 0.2 SOL · goes 100% to agent wallet</span>
      </div>

      <div className="sa-dna-section">
        <div className="sa-dna-title">DNA</div>

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
              Sniper mode (pump.fun graduations)
            </label>
          </>
        )}

        {dna.trades_prediction && (
          <>
            <DnaSlider label="Edge threshold %" field="pm_edge_threshold" value={dna.pm_edge_threshold ?? 5} min={1} max={50} step={1} onChange={(v) => setDnaField('pm_edge_threshold', v)} />
            <DnaSlider label="Max position %" field="pm_max_position_pct" value={dna.pm_max_position_pct ?? 10} min={1} max={50} step={1} onChange={(v) => setDnaField('pm_max_position_pct', v)} />
          </>
        )}
      </div>

      {error && <div className="sa-error">{error}</div>}

      <div className="sa-form-actions">
        <button className="sa-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="sa-btn-ghost" onClick={handleSpawn} disabled={busy}>
          {busy ? 'Requesting…' : 'Get deposit address'}
        </button>
        <button className="sa-btn-primary" onClick={handleSpawnAndFund} disabled={busy || !walletId} title={!walletId ? 'Requires a DAEMON wallet with a keypair' : ''}>
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

  return (
    <div className="sa-detail">
      <div className="sa-detail-header">
        <div>
          <div className="sa-detail-name">{agent.name}</div>
          <div className="sa-detail-sub">
            <span className={`sa-card-status ${agent.status}`}>{agent.status}</span>
            <span>gen {agent.generation}</span>
            <span>wallet: <code>{truncate(agent.agent_wallet)}</code></span>
          </div>
        </div>
        <div className="sa-detail-pnl" style={{ color: pnlColor(agent.total_pnl_sol) }}>
          {agent.total_pnl_sol >= 0 ? '+' : ''}{fmt(agent.total_pnl_sol)} SOL
        </div>
      </div>

      <div className="sa-detail-stats">
        <div className="sa-stat"><span>Initial</span><strong>{fmt(agent.initial_capital_sol)} SOL</strong></div>
        <div className="sa-stat"><span>Trades</span><strong>{agent.total_trades}</strong></div>
        <div className="sa-stat"><span>Withdrawn</span><strong>{fmt(agent.total_withdrawn_sol)} SOL</strong></div>
      </div>

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
  const defaultWallet = useWalletStore((s) => {
    const wallets = s.dashboard?.wallets ?? []
    return wallets.find((w) => w.isDefault) ?? wallets[0] ?? null
  })
  const [agents, setAgents] = useState<SpawnAgentRecord[]>([])
  const [selected, setSelected] = useState<SpawnAgentRecord | null>(null)
  const [view, setView] = useState<View>('list')
  const [depositInstr, setDepositInstr] = useState<SpawnDepositInstruction | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ownerWallet = defaultWallet?.address ?? null

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
          <div className="sa-no-wallet-title">No wallet connected</div>
          <p>Set a default DAEMON wallet with a keypair to use SpawnAgents. The keypair is needed to sign agent actions (withdraw, kill, spawn-child).</p>
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
            walletId={defaultWallet?.id ?? null}
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

        {view === 'detail' && selected && (
          <>
            <button className="sa-back-btn" onClick={() => setView('list')}>← All agents</button>
            <AgentDetail
              agent={selected}
              walletId={defaultWallet?.id ?? null}
              onRefresh={() => {
                void loadAgents()
                daemon.spawnAgents.get(selected.id).then((r) => { if (r.ok) setSelected(r.data!) })
              }}
            />
          </>
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
      </div>
    </div>
  )
}

export default SpawnAgentsPanel
