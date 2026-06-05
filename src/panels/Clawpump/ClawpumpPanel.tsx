import { type RefObject, useState, useEffect, useCallback, useRef } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { LiveRegion } from '../../components/LiveRegion'
import { PanelHeader } from '../../components/Panel'
import { ProductSurfaceStrip } from '../../components/ProductSurfaceStrip'
import { ClawpumpGlyph } from '../../lib/ClawpumpGlyph'
import { TokenLauncher } from '../../components/TokenLauncher/TokenLauncher'
import type { ClawpumpAgent, ClawpumpSkill, ClawpumpMessage } from '../../../electron/services/ClawpumpService'
import './ClawpumpPanel.css'

const STRATEGY_PRESETS = ['momentum', 'sniper', 'value', 'arbitrage', 'balanced'] as const
const DOCS_URL = 'https://clawpump.tech/developers'

function statusClass(status: string | undefined): string {
  const s = (status ?? '').toLowerCase()
  if (s === 'running' || s === 'active' || s === 'alive') return 'cp-status--live'
  if (s === 'stopped' || s === 'paused' || s === 'idle') return 'cp-status--idle'
  return 'cp-status--unknown'
}

function statusDot(status: string | undefined): string {
  const s = (status ?? '').toLowerCase()
  if (s === 'running' || s === 'active' || s === 'alive') return 'live'
  return 'idle'
}

export function ClawpumpPanel() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [announce, setAnnounce] = useState('')
  const keyInputRef = useRef<HTMLInputElement>(null)

  const checkConfigured = useCallback(async () => {
    const res = await daemon.clawpump.isConfigured()
    setConfigured(res.ok ? Boolean(res.data) : false)
  }, [])

  const focusKeyInput = useCallback(() => {
    keyInputRef.current?.focus()
  }, [])

  useEffect(() => { void checkConfigured() }, [checkConfigured])

  if (configured === null) {
    return <div className="cp-panel cp-panel--loading">Loading ClawPump…</div>
  }

  return (
    <div className="cp-panel" data-brand="clawpump">
      <PanelHeader
        kicker="ClawPump"
        title="Hosted AI trading agents"
        subtitle="Create, run, and chat with hosted ClawPump agents on Solana."
        actions={
          <>
            <ClawpumpGlyph size={20} />
            <a className="cp-docs-link" href={DOCS_URL} target="_blank" rel="noreferrer">Developer docs ↗</a>
          </>
        }
      />

      <LiveRegion message={announce} />

      <ProductSurfaceStrip
        surfaceId="clawpump"
        stateLabel={configured ? 'Connected' : 'Needs key'}
        setupLabel={configured ? 'Agent lane ready' : 'API key required'}
        tone={configured ? 'success' : 'warning'}
        primaryLabel={configured ? 'Agent console' : 'Paste key'}
        onPrimary={configured ? undefined : focusKeyInput}
      />

      {configured
        ? <AgentConsole onAnnounce={setAnnounce} onResetKey={() => { setConfigured(false) }} />
        : <SetupGate inputRef={keyInputRef} onSaved={() => { void checkConfigured() }} onAnnounce={setAnnounce} />}
    </div>
  )
}

// ------------------------------------------------------------- setup gate ---

function SetupGate({
  inputRef,
  onSaved,
  onAnnounce,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  onSaved: () => void
  onAnnounce: (m: string) => void
}) {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = useCallback(async () => {
    const trimmed = key.trim()
    if (!trimmed) { setError('Enter your ClawPump API key.'); return }
    setSaving(true)
    setError('')
    const res = await daemon.clawpump.storeKey(trimmed)
    setSaving(false)
    if (!res.ok) { setError(res.error ?? 'Failed to store key.'); return }
    setKey('')
    onAnnounce('ClawPump API key saved.')
    onSaved()
  }, [key, onSaved, onAnnounce])

  return (
    <div className="cp-setup-wrap">
      <section className="cp-setup">
        <h2 className="cp-section-title">Connect ClawPump</h2>
        <p className="cp-setup-copy">
          Paste your ClawPump API key (starts with <code>cpk_</code>). It is encrypted with your OS keyring and
          never leaves this machine except as a Bearer token to the ClawPump API.
        </p>
        <div className="cp-setup-row">
          <input
            ref={inputRef}
            className="cp-input"
            type="password"
            placeholder="cpk_…"
            value={key}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void save() }}
          />
          <button className="cp-btn cp-btn--primary" type="button" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save key'}
          </button>
        </div>
        {error && <p className="cp-error">{error}</p>}
        <a className="cp-setup-getkey" href="https://agents.clawpump.tech/dashboard/api" target="_blank" rel="noreferrer">
          Don't have a key? Get one ↗
        </a>
      </section>
    </div>
  )
}

// ---------------------------------------------------------- agent console ---

function AgentConsole({ onAnnounce, onResetKey }: { onAnnounce: (m: string) => void; onResetKey: () => void }) {
  const [agents, setAgents] = useState<ClawpumpAgent[]>([])
  const [skills, setSkills] = useState<ClawpumpSkill[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadAgents = useCallback(async () => {
    setLoading(true)
    setListError('')
    const res = await daemon.clawpump.list()
    setLoading(false)
    if (!res.ok) { setListError(res.error ?? 'Failed to load agents.'); setAgents([]); return }
    setAgents(res.data ?? [])
  }, [])

  const loadSkills = useCallback(async () => {
    const res = await daemon.clawpump.skills()
    if (res.ok) setSkills(res.data ?? [])
  }, [])

  useEffect(() => { void loadAgents(); void loadSkills() }, [loadAgents, loadSkills])

  const runLifecycle = useCallback(async (
    agentId: string,
    action: 'start' | 'stop' | 'delete',
  ) => {
    if (action === 'delete' && !window.confirm('Delete this agent permanently?')) return
    setBusyId(agentId)
    const res = await daemon.clawpump[action](agentId)
    setBusyId(null)
    if (!res.ok) { onAnnounce(res.error ?? `Failed to ${action} agent.`); return }
    onAnnounce(`Agent ${action === 'delete' ? 'deleted' : action + 'ed'}.`)
    if (action === 'delete' && selectedId === agentId) setSelectedId(null)
    void loadAgents()
  }, [loadAgents, onAnnounce, selectedId])

  const clearKey = useCallback(async () => {
    if (!window.confirm('Disconnect ClawPump and remove the stored API key?')) return
    const res = await daemon.clawpump.clearKey()
    if (res.ok) { onAnnounce('ClawPump disconnected.'); onResetKey() }
  }, [onAnnounce, onResetKey])

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null

  return (
    <div className="cp-console">
      <div className="cp-console-main">
        <CreateAgentForm skills={skills} onCreated={() => { onAnnounce('Agent created.'); void loadAgents() }} onAnnounce={onAnnounce} />

        <section className="cp-agents">
          <div className="cp-agents-head">
            <h2 className="cp-section-title">Your agents</h2>
            <div className="cp-agents-actions">
              <button className="cp-btn cp-btn--ghost" type="button" onClick={() => void loadAgents()}>Refresh</button>
              <button className="cp-btn cp-btn--ghost" type="button" onClick={() => void clearKey()}>Disconnect</button>
            </div>
          </div>

          {loading && <p className="cp-muted">Loading agents…</p>}
          {listError && <p className="cp-error">{listError}</p>}
          {!loading && !listError && agents.length === 0 && (
            <p className="cp-muted">No agents yet. Create one above to get started.</p>
          )}

          <ul className="cp-agent-list">
            {agents.map((agent) => (
              <li
                key={agent.id}
                className={`cp-agent-card${selectedId === agent.id ? ' cp-agent-card--active' : ''}`}
              >
                <button className="cp-agent-pick" type="button" onClick={() => setSelectedId(agent.id)}>
                  <span className="cp-agent-name">{agent.name || agent.id}</span>
                  <span className={`cp-status ${statusClass(agent.status)}`}>
                    <span className={`dot ${statusDot(agent.status)}`} />{agent.status || 'unknown'}
                  </span>
                  {agent.strategy && <span className="cp-agent-meta">{agent.strategy}</span>}
                </button>
                <div className="cp-agent-ops">
                  <button className="cp-btn cp-btn--xs" type="button" disabled={busyId === agent.id} onClick={() => void runLifecycle(agent.id, 'start')}>Start</button>
                  <button className="cp-btn cp-btn--xs" type="button" disabled={busyId === agent.id} onClick={() => void runLifecycle(agent.id, 'stop')}>Stop</button>
                  <button className="cp-btn cp-btn--xs cp-btn--danger" type="button" disabled={busyId === agent.id} onClick={() => void runLifecycle(agent.id, 'delete')}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <LaunchSection />
      </div>

      {selectedAgent && (
        <ChatPane key={selectedAgent.id} agent={selectedAgent} onAnnounce={onAnnounce} />
      )}
    </div>
  )
}

// ----------------------------------------------------------- launch token ---

function LaunchSection() {
  const [walletId, setWalletId] = useState<string | null>(null)
  const [cluster, setCluster] = useState<WalletInfrastructureSettings['cluster']>('devnet')

  useEffect(() => {
    void (async () => {
      const [walletRes, infraRes] = await Promise.all([
        daemon.wallet.list(),
        daemon.settings.getWalletInfrastructureSettings(),
      ])
      if (infraRes.ok && infraRes.data) setCluster(infraRes.data.cluster)
      if (walletRes.ok && walletRes.data) {
        const list = walletRes.data as Array<{ id: string; is_default?: number }>
        if (list.length > 0) setWalletId((list.find((w) => w.is_default) ?? list[0]).id)
      }
    })()
  }, [])

  return (
    <section className="cp-launch">
      <h2 className="cp-section-title">Launch a token</h2>
      <TokenLauncher walletId={walletId} cluster={cluster} showLabel={false} />
    </section>
  )
}

// --------------------------------------------------------- create new agent ---

function CreateAgentForm({ skills, onCreated, onAnnounce }: {
  skills: ClawpumpSkill[]
  onCreated: () => void
  onAnnounce: (m: string) => void
}) {
  const [name, setName] = useState('')
  const [strategy, setStrategy] = useState<string>(STRATEGY_PRESETS[0])
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const toggleSkill = (slug: string) => {
    setSelectedSkills((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug])
  }

  const create = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('Give your agent a name.'); return }
    setCreating(true)
    setError('')
    const res = await daemon.clawpump.create({
      name: trimmed,
      strategy,
      skills: selectedSkills.length > 0 ? selectedSkills : undefined,
    })
    setCreating(false)
    if (!res.ok) { setError(res.error ?? 'Failed to create agent.'); onAnnounce(res.error ?? 'Create failed.'); return }
    setName('')
    setSelectedSkills([])
    onCreated()
  }, [name, strategy, selectedSkills, onCreated, onAnnounce])

  return (
    <section className="cp-create">
      <h2 className="cp-section-title">Launch an agent</h2>
      <div className="cp-create-row">
        <input
          className="cp-input"
          type="text"
          placeholder="Agent name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select className="cp-select" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
          {STRATEGY_PRESETS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="cp-btn cp-btn--primary" type="button" onClick={() => void create()} disabled={creating}>
          {creating ? 'Launching…' : 'Launch'}
        </button>
      </div>

      {skills.length > 0 && (
        <div className="cp-skills">
          <span className="cp-skills-label">Skills</span>
          <div className="cp-skills-grid">
            {skills.map((skill) => (
              <button
                key={skill.slug}
                type="button"
                className={`cp-skill-chip${selectedSkills.includes(skill.slug) ? ' cp-skill-chip--on' : ''}`}
                title={skill.description}
                onClick={() => toggleSkill(skill.slug)}
              >
                {skill.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="cp-error">{error}</p>}
    </section>
  )
}

// ------------------------------------------------------------------- chat ---

function ChatPane({ agent, onAnnounce }: { agent: ClawpumpAgent; onAnnounce: (m: string) => void }) {
  const [messages, setMessages] = useState<ClawpumpMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadMessages = useCallback(async () => {
    setLoading(true)
    const res = await daemon.clawpump.messages(agent.id)
    setLoading(false)
    if (res.ok) setMessages(res.data ?? [])
  }, [agent.id])

  useEffect(() => { void loadMessages() }, [loadMessages])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text) return
    setSending(true)
    setError('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setDraft('')
    const res = await daemon.clawpump.chat(agent.id, text)
    setSending(false)
    if (!res.ok) { setError(res.error ?? 'Message failed.'); onAnnounce(res.error ?? 'Message failed.'); return }
    setMessages((prev) => [...prev, { role: 'assistant', content: res.data?.content ?? '' }])
  }, [draft, agent.id, onAnnounce])

  return (
    <aside className="cp-chat">
      <header className="cp-chat-head">
        <span className="cp-chat-name">{agent.name || agent.id}</span>
        <span className={`cp-status ${statusClass(agent.status)}`}>
          <span className={`dot ${statusDot(agent.status)}`} />{agent.status || 'unknown'}
        </span>
      </header>

      <div className="cp-chat-log">
        {loading && <p className="cp-muted">Loading conversation…</p>}
        {!loading && messages.length === 0 && <p className="cp-muted">No messages yet. Say hello.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`cp-msg cp-msg--${m.role}`}>
            <span className="cp-msg-role">{m.role}</span>
            <span className="cp-msg-body">{m.content}</span>
          </div>
        ))}
      </div>

      {error && <p className="cp-error">{error}</p>}

      <div className="cp-chat-compose">
        <textarea
          className="cp-textarea"
          placeholder="Message this agent…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
        />
        <button className="cp-btn cp-btn--primary" type="button" onClick={() => void send()} disabled={sending}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </aside>
  )
}
