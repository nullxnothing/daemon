import { useState, useEffect, useCallback, useRef } from 'react'
import { useWalletStore } from '../../../store/wallet'

interface AgentWallet {
  id: string
  name: string
  address: string
  agent_id: string
  wallet_type: string
}

type AgentAction = 'fund' | 'rename' | 'export' | null

export function AgentsTab() {
  const agentWallets = useWalletStore((s) => s.agentWallets)
  const dashboard = useWalletStore((s) => s.dashboard)

  const [showCreate, setShowCreate] = useState(false)
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [agentWalletName, setAgentWalletName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Per-wallet action state
  const [activeWalletId, setActiveWalletId] = useState<string | null>(null)
  const [activeAction, setActiveAction] = useState<AgentAction>(null)

  // Fund
  const [fundAmount, setFundAmount] = useState('')
  const [fundLoading, setFundLoading] = useState(false)

  // Rename
  const [renameValue, setRenameValue] = useState('')

  // Export key
  const [exportConfirmText, setExportConfirmText] = useState('')
  const [revealedKey, setRevealedKey] = useState<string | null>(null)

  // Balances
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => { void useWalletStore.getState().loadAgentWallets() }, [])

  useEffect(() => {
    if (!agentWallets?.length) return
    const fetch = async () => {
      const cache: Record<string, number> = {}
      for (const aw of agentWallets) {
        try {
          const res = await window.daemon.wallet.balance(aw.id)
          if (res.ok && res.data != null) cache[aw.id] = (res.data as { sol: number }).sol
          else cache[aw.id] = 0
        } catch { cache[aw.id] = 0 }
      }
      setBalances(cache)
    }
    void fetch()
  }, [agentWallets])

  const clearAction = () => {
    setActiveWalletId(null); setActiveAction(null)
    setFundAmount(''); setRenameValue('')
    setExportConfirmText(''); setRevealedKey(null)
    setError(null); setSuccessMsg(null)
  }

  const startAction = (walletId: string, action: AgentAction, wallet?: AgentWallet) => {
    clearAction()
    setActiveWalletId(walletId)
    setActiveAction(action)
    if (action === 'rename' && wallet) setRenameValue(wallet.name)
  }

  // Copy address
  const copyAddress = useCallback((address: string, id: string) => {
    navigator.clipboard.writeText(address).catch(() => {})
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }, [])

  // Fund
  const handleFund = useCallback(async () => {
    if (!activeWalletId || fundLoading) return
    const target = agentWallets?.find((w) => w.id === activeWalletId)
    const defaultWallet = dashboard?.wallets.find((w) => w.isDefault)
    if (!target || !defaultWallet) { setError('No default wallet to fund from'); return }

    const amount = parseFloat(fundAmount)
    if (isNaN(amount) || amount <= 0) { setError('Enter a valid amount'); return }

    setFundLoading(true); setError(null)
    try {
      const res = await window.daemon.wallet.sendSol({
        fromWalletId: defaultWallet.id, toAddress: target.address, amountSol: amount,
      })
      if (res.ok && res.data) {
        setSuccessMsg(`Sent! ${res.data.signature.slice(0, 8)}...`)
        setFundAmount('')
        const balRes = await window.daemon.wallet.balance(activeWalletId)
        if (balRes.ok && balRes.data != null) {
          setBalances((prev) => ({ ...prev, [activeWalletId]: (balRes.data as { sol: number }).sol }))
        }
      } else { setError(res.error ?? 'Fund failed') }
    } catch (err) { setError(String(err)) }
    finally { setFundLoading(false) }
  }, [activeWalletId, fundAmount, fundLoading, agentWallets, dashboard?.wallets])

  // Rename
  const handleRename = useCallback(async () => {
    if (!activeWalletId || !renameValue.trim()) return
    setError(null)
    const res = await window.daemon.wallet.rename(activeWalletId, renameValue.trim())
    if (res.ok) {
      await useWalletStore.getState().loadAgentWallets()
      clearAction()
    } else { setError(res.error ?? 'Rename failed') }
  }, [activeWalletId, renameValue])

  // Delete
  const handleDelete = useCallback(async (walletId: string) => {
    setError(null)
    const res = await window.daemon.wallet.delete(walletId)
    if (res.ok) {
      clearAction()
      await useWalletStore.getState().loadAgentWallets()
    } else { setError(res.error ?? 'Delete failed') }
  }, [])

  // Export key
  const handleExportConfirm = useCallback(async () => {
    if (!activeWalletId || exportConfirmText !== 'EXPORT') return
    const res = await window.daemon.wallet.exportPrivateKey(activeWalletId)
    if (res.ok && res.data) {
      setRevealedKey('Private key copied to clipboard for 30 seconds.')
      setExportConfirmText('')
      setTimeout(() => { setRevealedKey(null); clearAction() }, 5000)
    } else { setError(res.error ?? 'Export failed') }
  }, [activeWalletId, exportConfirmText])

  // Create
  const openCreate = useCallback(async () => {
    try {
      const res = await window.daemon.agents.list()
      if (res.ok && res.data) setAgents(res.data.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })))
    } catch { /* */ }
    setShowCreate(true)
  }, [])

  const handleCreate = useCallback(async () => {
    if (!selectedAgentId) return
    setError(null)
    const agent = agents.find((a) => a.id === selectedAgentId)
    const name = agentWalletName.trim() || `${agent?.name ?? 'Agent'} Wallet`
    const res = await window.daemon.wallet.createAgentWallet(selectedAgentId, name)
    if (res.ok) {
      await useWalletStore.getState().loadAgentWallets()
      setShowCreate(false); setSelectedAgentId(''); setAgentWalletName('')
    } else { setError(res.error ?? 'Failed to create agent wallet') }
  }, [selectedAgentId, agentWalletName, agents])

  // Compute totals for portfolio summary
  const totalSol = Object.values(balances).reduce((s, b) => s + b, 0)
  const walletCount = agentWallets?.length ?? 0

  return (
    <div className="wallet-agents-tab">
      {/* Portfolio summary — matches wallet tab style */}
      <section className="wallet-section">
        <div className="wallet-section-title">Agent Portfolio</div>
        <div className="wallet-total">{totalSol.toFixed(4)} SOL</div>
        <div className="wallet-caption">{walletCount} agent wallet{walletCount !== 1 ? 's' : ''}</div>
      </section>

      {/* Agent wallet list */}
      <section className="wallet-section">
        <div className="wallet-section-title">Wallets</div>
        {agentWallets && agentWallets.length > 0 ? (
          <div className="wallet-agent-list">
            {agentWallets.map((aw) => {
              const bal = balances[aw.id]
              const isActive = activeWalletId === aw.id
              return (
                <div key={aw.id} className={`wallet-agent-card${isActive ? ' wallet-agent-card--active' : ''}`}>
                  <div className="wallet-agent-card-info">
                    <div className="wallet-agent-card-name">
                      {aw.name}
                      <span className="wallet-agent-badge">{aw.wallet_type}</span>
                    </div>
                    <div className="wallet-agent-card-addr">
                      {shortAddr(aw.address)}
                      <button
                        className="wallet-copy-btn"
                        onClick={() => copyAddress(aw.address, aw.id)}
                        title="Copy address"
                      >
                        {copiedId === aw.id ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="wallet-agent-card-right">
                    <div className="wallet-agent-card-bal">
                      {bal != null ? `${bal.toFixed(4)} SOL` : '...'}
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div className="wallet-agent-actions">
                    <button className={`wallet-agent-action-btn${isActive && activeAction === 'fund' ? ' active' : ''}`} onClick={() => isActive && activeAction === 'fund' ? clearAction() : startAction(aw.id, 'fund')} title="Fund">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                    </button>
                    <button className={`wallet-agent-action-btn${isActive && activeAction === 'rename' ? ' active' : ''}`} onClick={() => isActive && activeAction === 'rename' ? clearAction() : startAction(aw.id, 'rename', aw)} title="Rename">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button className={`wallet-agent-action-btn${isActive && activeAction === 'export' ? ' active' : ''}`} onClick={() => isActive && activeAction === 'export' ? clearAction() : startAction(aw.id, 'export')} title="Export Key">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </button>
                    <button className="wallet-agent-action-btn wallet-agent-action-btn--danger" onClick={() => handleDelete(aw.id)} title="Delete">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>

                  {/* Inline action forms */}
                  {isActive && activeAction === 'fund' && (
                    <div className="wallet-agent-inline-form">
                      <div className="wallet-caption">From default wallet to {shortAddr(aw.address)}</div>
                      <input className="wallet-input" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} placeholder="Amount (SOL)" type="number" step="any" min="0" autoFocus />
                      <div className="wallet-actions">
                        <button className="wallet-btn primary" disabled={fundLoading} onClick={handleFund}>{fundLoading ? 'Sending...' : 'Send SOL'}</button>
                        <button className="wallet-btn" onClick={clearAction}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {isActive && activeAction === 'rename' && (
                    <div className="wallet-agent-inline-form">
                      <input className="wallet-input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="New name" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleRename() }} />
                      <div className="wallet-actions">
                        <button className="wallet-btn primary" onClick={handleRename}>Save</button>
                        <button className="wallet-btn" onClick={clearAction}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {isActive && activeAction === 'export' && !revealedKey && (
                    <div className="wallet-agent-inline-form">
                      <div className="wallet-caption" style={{ color: 'var(--red)' }}>Type EXPORT to reveal the private key</div>
                      <input className="wallet-input" value={exportConfirmText} onChange={(e) => setExportConfirmText(e.target.value)} placeholder='Type "EXPORT"' autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleExportConfirm() }} />
                      <div className="wallet-actions">
                        <button className="wallet-btn primary" disabled={exportConfirmText !== 'EXPORT'} onClick={handleExportConfirm}>Reveal</button>
                        <button className="wallet-btn" onClick={clearAction}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {isActive && activeAction === 'export' && revealedKey && (
                    <div className="wallet-agent-inline-form">
                      <div className="wallet-key-reveal">{revealedKey}</div>
                      <div className="wallet-key-warning">Auto-clears in 5 seconds</div>
                    </div>
                  )}

                  {isActive && error && <div className="wallet-error-msg">{error}</div>}
                  {isActive && successMsg && <div className="wallet-success-msg">{successMsg}</div>}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="wallet-empty">No agent wallets yet</div>
        )}
      </section>

      {/* Create */}
      {!showCreate ? (
        <button className="wallet-btn wallet-create-agent-btn" onClick={openCreate}>+ Create Agent Wallet</button>
      ) : (
        <section className="wallet-section">
          <div className="wallet-section-title">Create Agent Wallet</div>
          <select className="wallet-input" value={selectedAgentId} onChange={(e) => { setSelectedAgentId(e.target.value); const a = agents.find((x) => x.id === e.target.value); if (a) setAgentWalletName(`${a.name} Wallet`) }}>
            <option value="">Select agent...</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input className="wallet-input" value={agentWalletName} onChange={(e) => setAgentWalletName(e.target.value)} placeholder="Wallet name" style={{ marginTop: 6 }} />
          {error && !activeWalletId && <div className="wallet-error-msg">{error}</div>}
          <div className="wallet-actions" style={{ marginTop: 8 }}>
            <button className="wallet-btn primary" onClick={handleCreate}>Create</button>
            <button className="wallet-btn" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </section>
      )}
    </div>
  )
}

function shortAddr(v: string): string {
  return `${v.slice(0, 4)}...${v.slice(-4)}`
}
