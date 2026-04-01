import { useCallback, useEffect, useState } from 'react'
import { useUIStore } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import { Toggle } from '../../components/Toggle'
import './WalletPanel.css'

export function WalletPanel() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const dashboard = useWalletStore((s) => s.dashboard)
  const showMarketTape = useWalletStore((s) => s.showMarketTape)
  const showTitlebarWallet = useWalletStore((s) => s.showTitlebarWallet)
  const loading = useWalletStore((s) => s.loading)
  const agentWallets = useWalletStore((s) => s.agentWallets)
  const transactions = useWalletStore((s) => s.transactions)
  const setStoreShowMarketTape = useWalletStore((s) => s.setShowMarketTape)
  const setStoreShowTitlebarWallet = useWalletStore((s) => s.setShowTitlebarWallet)
  const [showSettings, setShowSettings] = useState(false)
  const [walletName, setWalletName] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [heliusKey, setHeliusKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [createTab, setCreateTab] = useState<'import' | 'generate'>('import')
  const [genName, setGenName] = useState('')
  const [genSuccess, setGenSuccess] = useState<string | null>(null)

  // Send form state
  const [sendWalletId, setSendWalletId] = useState<string | null>(null)
  const [sendMode, setSendMode] = useState<'sol' | 'token' | null>(null)
  const [sendDest, setSendDest] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [sendMint, setSendMint] = useState('')
  const [sendLoading, setSendLoading] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  // Keypair cache: walletId -> boolean
  const [keypairCache, setKeypairCache] = useState<Record<string, boolean>>({})

  // Export key state
  const [revealKeyId, setRevealKeyId] = useState<string | null>(null)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [exportConfirmId, setExportConfirmId] = useState<string | null>(null)
  const [exportConfirmText, setExportConfirmText] = useState('')

  // Send confirmation state
  const [pendingSend, setPendingSend] = useState<{
    walletId: string
    mode: 'sol' | 'token'
    dest: string
    amount: number
    mint?: string
  } | null>(null)

  // Agent wallet creation
  const [showCreateAgent, setShowCreateAgent] = useState(false)
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [agentWalletName, setAgentWalletName] = useState('')

  const load = useCallback(async () => {
    await useWalletStore.getState().refresh(activeProjectId)
  }, [activeProjectId])

  useEffect(() => {
    void load()
  }, [load])

  // Fast-poll while wallet panel is visible, downgrades on unmount
  useEffect(() => {
    return useWalletStore.getState().subscribeFastPoll()
  }, [])

  // Load agent wallets on mount
  useEffect(() => {
    void useWalletStore.getState().loadAgentWallets()
  }, [])

  // Load transactions when active wallet changes
  useEffect(() => {
    if (dashboard?.activeWallet) {
      void useWalletStore.getState().loadTransactions(dashboard.activeWallet.id ?? '')
    }
  }, [dashboard?.activeWallet])

  // Check keypairs for all wallets
  useEffect(() => {
    if (!dashboard?.wallets) return
    const check = async () => {
      const cache: Record<string, boolean> = {}
      for (const w of dashboard.wallets) {
        try {
          const res = await window.daemon.wallet.hasKeypair(w.id)
          cache[w.id] = res.ok && res.data === true
        } catch {
          cache[w.id] = false
        }
      }
      setKeypairCache(cache)
    }
    void check()
  }, [dashboard?.wallets])

  const handleAddWallet = async () => {
    setError(null)
    if (!walletName.trim() || !walletAddress.trim()) return
    const res = await window.daemon.wallet.create({ name: walletName.trim(), address: walletAddress.trim() })
    if (res.ok) {
      setWalletName('')
      setWalletAddress('')
      await load()
      return
    }
    setError(res.error ?? 'Failed to add wallet')
  }

  const handleGenerate = async () => {
    setError(null)
    setGenSuccess(null)
    if (!genName.trim()) return
    const res = await window.daemon.wallet.generate({ name: genName.trim() })
    if (res.ok && res.data) {
      setGenName('')
      setGenSuccess(res.data.address)
      await load()
      return
    }
    setError(res.error ?? 'Failed to generate wallet')
  }

  const handleToggleTape = async (checked: boolean) => {
    await setStoreShowMarketTape(checked)
  }

  const handleToggleTitlebarWallet = async (checked: boolean) => {
    await setStoreShowTitlebarWallet(checked)
  }

  const handleSaveHelius = async () => {
    setError(null)
    if (!heliusKey.trim()) return
    const res = await window.daemon.wallet.storeHeliusKey(heliusKey.trim())
    if (res.ok) {
      setHeliusKey('')
      await load()
      return
    }
    setError(res.error ?? 'Failed to save Helius key')
  }

  const handleDeleteHelius = async () => {
    setError(null)
    const res = await window.daemon.wallet.deleteHeliusKey()
    if (res.ok) {
      await load()
      return
    }
    setError(res.error ?? 'Failed to delete Helius key')
  }

  const handleConfirmSend = (fromWalletId: string) => {
    setSendError(null)
    setSendResult(null)
    const amount = parseFloat(sendAmount)
    if (sendMode === 'sol') {
      if (!sendDest.trim() || isNaN(amount) || amount <= 0) {
        setSendError('Invalid destination or amount')
        return
      }
      setPendingSend({ walletId: fromWalletId, mode: 'sol', dest: sendDest.trim(), amount })
    } else {
      if (!sendDest.trim() || !sendMint.trim() || isNaN(amount) || amount <= 0) {
        setSendError('Invalid destination, mint, or amount')
        return
      }
      setPendingSend({ walletId: fromWalletId, mode: 'token', dest: sendDest.trim(), amount, mint: sendMint.trim() })
    }
  }

  const handleExecuteSend = async () => {
    if (!pendingSend) return
    setSendLoading(true)
    setSendError(null)

    if (pendingSend.mode === 'sol') {
      const res = await window.daemon.wallet.sendSol({ fromWalletId: pendingSend.walletId, toAddress: pendingSend.dest, amountSol: pendingSend.amount })
      setSendLoading(false)
      setPendingSend(null)
      if (res.ok && res.data) {
        setSendResult(res.data.signature)
        setSendDest('')
        setSendAmount('')
        await load()
      } else {
        setSendError(res.error ?? 'Send failed')
      }
    } else {
      const res = await window.daemon.wallet.sendToken({ fromWalletId: pendingSend.walletId, toAddress: pendingSend.dest, mint: pendingSend.mint!, amount: pendingSend.amount })
      setSendLoading(false)
      setPendingSend(null)
      if (res.ok && res.data) {
        setSendResult(res.data.signature)
        setSendDest('')
        setSendAmount('')
        setSendMint('')
        await load()
      } else {
        setSendError(res.error ?? 'Send failed')
      }
    }
  }

  const handleCancelSend = () => {
    setPendingSend(null)
  }

  const handleExportKeyStart = (walletId: string) => {
    setExportConfirmId(walletId)
    setExportConfirmText('')
    setRevealKeyId(null)
    setRevealedKey(null)
  }

  const handleExportKeyConfirm = async () => {
    if (!exportConfirmId || exportConfirmText !== 'EXPORT') return
    const res = await window.daemon.wallet.exportPrivateKey(exportConfirmId)
    if (res.ok && res.data) {
      setRevealKeyId(exportConfirmId)
      setRevealedKey(res.data)
      setExportConfirmId(null)
      setExportConfirmText('')
      setTimeout(() => {
        setRevealKeyId(null)
        setRevealedKey(null)
      }, 5_000)
    } else {
      setError(res.error ?? 'Failed to export key')
      setExportConfirmId(null)
      setExportConfirmText('')
    }
  }

  const handleCreateAgentWallet = async () => {
    setError(null)
    if (!selectedAgentId) return
    const agent = agents.find((a) => a.id === selectedAgentId)
    if (!agent) return
    const name = agentWalletName.trim() || `${agent.name} Wallet`
    const res = await window.daemon.wallet.createAgentWallet(selectedAgentId, name)
    if (res.ok) {
      setShowCreateAgent(false)
      setSelectedAgentId('')
      setAgentWalletName('')
      await useWalletStore.getState().loadAgentWallets()
    } else {
      setError(res.error ?? 'Failed to create agent wallet')
    }
  }

  const handleFundAgent = (agentWalletAddress: string) => {
    // Find default wallet
    const defaultWallet = dashboard?.wallets.find((w) => w.isDefault)
    if (!defaultWallet) return
    setSendWalletId(defaultWallet.id)
    setSendMode('sol')
    setSendDest(agentWalletAddress)
    setSendAmount('')
    setSendResult(null)
    setSendError(null)
  }

  const openCreateAgent = async () => {
    try {
      const res = await window.daemon.agents.list()
      if (res.ok && res.data) {
        setAgents(res.data.map((a) => ({ id: a.id, name: a.name })))
      }
    } catch {
      // ignore
    }
    setShowCreateAgent(true)
  }

  const openSend = (walletId: string, mode: 'sol' | 'token') => {
    setSendWalletId(walletId)
    setSendMode(mode)
    setSendDest('')
    setSendAmount('')
    setSendMint('')
    setSendResult(null)
    setSendError(null)
  }

  const closeSend = () => {
    setSendWalletId(null)
    setSendMode(null)
  }

  if (!dashboard && loading) {
    return (
      <div className="wallet-panel">
        <div className="panel-header">Wallet</div>
        <div className="wallet-empty">Loading wallet data...</div>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="wallet-panel">
        <div className="panel-header">Wallet</div>
        <div className="wallet-empty">Wallet data unavailable</div>
      </div>
    )
  }

  return (
    <div className="wallet-panel">
      <div className="panel-header wallet-panel-header">
        <span>Wallet</span>
        <button className="wallet-icon-btn" onClick={() => setShowSettings((value) => !value)}>
          {showSettings ? 'Close' : 'Settings'}
        </button>
      </div>

      <section className="wallet-section">
        <div className="wallet-section-title">Portfolio</div>
        <div className="wallet-total">${formatUsd(dashboard.portfolio.totalUsd)}</div>
        <div className={`wallet-delta ${dashboard.portfolio.delta24hUsd >= 0 ? 'up' : 'down'}`}>
          {dashboard.portfolio.delta24hUsd >= 0 ? '+' : '-'}${formatUsd(Math.abs(dashboard.portfolio.delta24hUsd))} · {formatPct(dashboard.portfolio.delta24hPct)}
        </div>
        <div className="wallet-caption">{dashboard.portfolio.walletCount} wallet{dashboard.portfolio.walletCount !== 1 ? 's' : ''} tracked</div>
      </section>

      {showSettings && (
        <section className="wallet-section">
          <div className="wallet-section-title">Settings</div>
          {error && <div className="wallet-empty">{error}</div>}
          <div className="wallet-toggle-row">
            <div>
              <div className="wallet-label">Show Market Tape</div>
              <div className="wallet-caption">BTC, SOL, ETH in the bottom bar</div>
            </div>
            <Toggle checked={showMarketTape} onChange={handleToggleTape} />
          </div>
          <div className="wallet-toggle-row">
            <div>
              <div className="wallet-label">Show Titlebar Balance</div>
              <div className="wallet-caption">Display the portfolio balance in the titlebar</div>
            </div>
            <Toggle checked={showTitlebarWallet} onChange={handleToggleTitlebarWallet} />
          </div>
          <div className="wallet-settings-block">
            <div className="wallet-label">Helius API Key</div>
            <div className="wallet-caption">
              {dashboard.heliusConfigured ? 'A Helius key is currently stored for wallet data.' : 'Add a Helius key to enable balances, holdings, and portfolio refresh.'}
            </div>
            <input
              className="wallet-input"
              value={heliusKey}
              onChange={(e) => setHeliusKey(e.target.value)}
              placeholder={dashboard.heliusConfigured ? 'Replace Helius API key' : 'HELIUS_API_KEY'}
            />
            <div className="wallet-actions">
              <button className="wallet-btn primary" onClick={handleSaveHelius}>Save Key</button>
              {dashboard.heliusConfigured && (
                <button className="wallet-btn danger" onClick={handleDeleteHelius}>Delete Key</button>
              )}
            </div>
          </div>

          <div className="wallet-settings-block">
            <div className="wallet-label">Manage Wallets</div>

            <div className="wallet-tab-group">
              <button className={`wallet-tab ${createTab === 'import' ? 'active' : ''}`} onClick={() => { setCreateTab('import'); setGenSuccess(null) }}>Import</button>
              <button className={`wallet-tab ${createTab === 'generate' ? 'active' : ''}`} onClick={() => { setCreateTab('generate'); setGenSuccess(null) }}>Generate</button>
            </div>

            {createTab === 'import' && (
              <div className="wallet-form">
                <input className="wallet-input" value={walletName} onChange={(e) => setWalletName(e.target.value)} placeholder="Wallet name" />
                <input className="wallet-input" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="Solana address" />
                <button className="wallet-btn primary" onClick={handleAddWallet}>Add Wallet</button>
              </div>
            )}

            {createTab === 'generate' && (
              <div className="wallet-form">
                <input className="wallet-input" value={genName} onChange={(e) => setGenName(e.target.value)} placeholder="Wallet name" />
                <button className="wallet-btn primary" onClick={handleGenerate}>Generate Wallet</button>
                {genSuccess && (
                  <div className="wallet-success-msg">Generated: {shortAddress(genSuccess)}</div>
                )}
              </div>
            )}

            <div className="wallet-list">
              {dashboard.wallets.map((wallet) => (
                <div key={wallet.id} className="wallet-row">
                  <div className="wallet-row-main">
                    <div className="wallet-name">
                      {wallet.name}
                      {wallet.isDefault && <span className="wallet-badge">default</span>}
                    </div>
                    <div className="wallet-value">${formatUsd(wallet.totalUsd)}</div>
                  </div>
                  <div className="wallet-row-sub">
                    <span>{shortAddress(wallet.address)}</span>
                    <span>{wallet.tokenCount} assets</span>
                  </div>
                  <div className="wallet-actions">
                    {!wallet.isDefault && (
                      <button
                        className="wallet-btn"
                        onClick={async () => {
                          setError(null)
                          const res = await window.daemon.wallet.setDefault(wallet.id)
                          if (res.ok) await load()
                          else setError(res.error ?? 'Failed to set default wallet')
                        }}
                      >
                        Set Default
                      </button>
                    )}
                    {activeProjectId && (
                      <button
                        className="wallet-btn"
                        onClick={async () => {
                          setError(null)
                          const res = await window.daemon.wallet.assignProject(activeProjectId, wallet.id)
                          if (res.ok) await load()
                          else setError(res.error ?? 'Failed to assign wallet to project')
                        }}
                      >
                        Use For Project
                      </button>
                    )}
                    {keypairCache[wallet.id] && (
                      <>
                        <button className="wallet-btn" onClick={() => openSend(wallet.id, 'sol')}>Send SOL</button>
                        <button className="wallet-btn" onClick={() => openSend(wallet.id, 'token')}>Send Token</button>
                        <button
                          className="wallet-btn"
                          onClick={() => handleExportKeyStart(wallet.id)}
                        >
                          Export Key
                        </button>
                      </>
                    )}
                    <button
                      className="wallet-btn danger"
                      onClick={async () => {
                        setError(null)
                        const res = await window.daemon.wallet.delete(wallet.id)
                        if (res.ok) await load()
                        else setError(res.error ?? 'Failed to remove wallet')
                      }}
                    >
                      Remove
                    </button>
                  </div>

                  {/* Export key confirmation */}
                  {exportConfirmId === wallet.id && (
                    <div>
                      <div className="wallet-key-warning">Type EXPORT to reveal your private key:</div>
                      <input
                        className="wallet-input"
                        value={exportConfirmText}
                        onChange={(e) => setExportConfirmText(e.target.value)}
                        placeholder="Type EXPORT to confirm"
                      />
                      <div className="wallet-actions">
                        <button
                          className="wallet-btn primary"
                          disabled={exportConfirmText !== 'EXPORT'}
                          onClick={handleExportKeyConfirm}
                        >
                          Reveal Key
                        </button>
                        <button className="wallet-btn" onClick={() => { setExportConfirmId(null); setExportConfirmText('') }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Export key reveal */}
                  {revealKeyId === wallet.id && revealedKey && (
                    <div>
                      <div className="wallet-key-reveal">{revealedKey}</div>
                      <div className="wallet-key-warning">This key will be hidden in 5 seconds. Do not share it.</div>
                    </div>
                  )}

                  {/* Inline send form */}
                  {sendWalletId === wallet.id && sendMode && (
                    <div className="wallet-send-form">
                      <div className="wallet-send-inline">
                        <div className="wallet-caption">{sendMode === 'sol' ? 'Send SOL' : 'Send Token'}</div>
                        {!pendingSend && (
                          <>
                            <input
                              className="wallet-input"
                              value={sendDest}
                              onChange={(e) => setSendDest(e.target.value)}
                              placeholder="Destination address"
                            />
                            {sendMode === 'token' && (
                              <input
                                className="wallet-input"
                                value={sendMint}
                                onChange={(e) => setSendMint(e.target.value)}
                                placeholder="Token mint address"
                              />
                            )}
                            <input
                              className="wallet-input"
                              value={sendAmount}
                              onChange={(e) => setSendAmount(e.target.value)}
                              placeholder={sendMode === 'sol' ? 'Amount (SOL)' : 'Amount'}
                              type="number"
                              step="any"
                              min="0"
                            />
                            <div className="wallet-actions">
                              <button
                                className="wallet-btn primary"
                                disabled={sendLoading}
                                onClick={() => handleConfirmSend(wallet.id)}
                              >
                                Confirm Send
                              </button>
                              <button className="wallet-btn" onClick={closeSend}>Cancel</button>
                            </div>
                          </>
                        )}
                        {pendingSend && pendingSend.walletId === wallet.id && (
                          <div>
                            <div className="wallet-caption">
                              Send {pendingSend.amount} {pendingSend.mode === 'sol' ? 'SOL' : pendingSend.mint ? shortAddress(pendingSend.mint) : 'tokens'} to {shortAddress(pendingSend.dest)}?
                            </div>
                            <div className="wallet-actions">
                              <button className="wallet-btn" onClick={handleCancelSend}>Cancel</button>
                              <button
                                className="wallet-btn primary"
                                disabled={sendLoading}
                                onClick={handleExecuteSend}
                              >
                                {sendLoading ? 'Sending...' : 'Send Now'}
                              </button>
                            </div>
                          </div>
                        )}
                        {sendError && <div className="wallet-empty">{sendError}</div>}
                        {sendResult && (
                          <div className="wallet-success-msg">
                            Sent! Sig: {sendResult.slice(0, 8)}...{sendResult.slice(-8)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {dashboard.wallets.length === 0 && <div className="wallet-empty">No wallets configured</div>}
            </div>
          </div>
        </section>
      )}

      {/* Agent Wallets Section */}
      <section className="wallet-agent-section">
        <div className="wallet-section-title">Agent Wallets</div>
        {agentWallets && agentWallets.length > 0 ? (
          agentWallets.map((aw) => (
            <div key={aw.id} className="wallet-agent-row">
              <div>
                <div className="wallet-name">
                  {aw.name}
                  <span className="wallet-agent-badge">{aw.wallet_type}</span>
                </div>
                <div className="wallet-caption">{shortAddress(aw.address)}</div>
              </div>
              <button className="wallet-btn" onClick={() => handleFundAgent(aw.address)}>Fund</button>
            </div>
          ))
        ) : (
          <div className="wallet-empty">No agent wallets</div>
        )}

        {/* Fund agent inline form (shows when triggered) */}
        {sendWalletId && sendMode === 'sol' && sendDest && !showSettings && (
          <div className="wallet-send-form">
            <div className="wallet-send-inline">
              <div className="wallet-caption">Fund Agent Wallet</div>
              <div className="wallet-caption">To: {shortAddress(sendDest)}</div>
              {!pendingSend && (
                <>
                  <input
                    className="wallet-input"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    placeholder="Amount (SOL)"
                    type="number"
                    step="any"
                    min="0"
                  />
                  <div className="wallet-actions">
                    <button
                      className="wallet-btn primary"
                      disabled={sendLoading}
                      onClick={() => handleConfirmSend(sendWalletId)}
                    >
                      Confirm Send
                    </button>
                    <button className="wallet-btn" onClick={closeSend}>Cancel</button>
                  </div>
                </>
              )}
              {pendingSend && (
                <div>
                  <div className="wallet-caption">
                    Send {pendingSend.amount} SOL to {shortAddress(pendingSend.dest)}?
                  </div>
                  <div className="wallet-actions">
                    <button className="wallet-btn" onClick={handleCancelSend}>Cancel</button>
                    <button
                      className="wallet-btn primary"
                      disabled={sendLoading}
                      onClick={handleExecuteSend}
                    >
                      {sendLoading ? 'Sending...' : 'Send Now'}
                    </button>
                  </div>
                </div>
              )}
              {sendError && <div className="wallet-empty">{sendError}</div>}
              {sendResult && (
                <div className="wallet-success-msg">
                  Sent! Sig: {sendResult.slice(0, 8)}...{sendResult.slice(-8)}
                </div>
              )}
            </div>
          </div>
        )}

        {!showCreateAgent && (
          <button className="wallet-btn primary" style={{ marginTop: 8 }} onClick={openCreateAgent}>
            Create Agent Wallet
          </button>
        )}

        {showCreateAgent && (
          <div className="wallet-send-form">
            <div className="wallet-send-inline">
              <div className="wallet-caption">Create Agent Wallet</div>
              <select
                className="wallet-input"
                value={selectedAgentId}
                onChange={(e) => {
                  setSelectedAgentId(e.target.value)
                  const agent = agents.find((a) => a.id === e.target.value)
                  if (agent) setAgentWalletName(`${agent.name} Wallet`)
                }}
              >
                <option value="">Select agent...</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <input
                className="wallet-input"
                value={agentWalletName}
                onChange={(e) => setAgentWalletName(e.target.value)}
                placeholder="Wallet name"
              />
              <div className="wallet-actions">
                <button className="wallet-btn primary" onClick={handleCreateAgentWallet}>Create</button>
                <button className="wallet-btn" onClick={() => setShowCreateAgent(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </section>

      {dashboard.feed.length > 0 && (
        <section className="wallet-section">
          <div className="wallet-section-title">Live Feed</div>
          {dashboard.feed.slice(0, 5).map((entry) => (
            <div key={entry.walletId} className="wallet-feed-row">
              <span className="wallet-feed-name">{entry.walletName}</span>
              <span className={`wallet-feed-delta ${entry.deltaUsd >= 0 ? 'up' : 'down'}`}>
                {entry.deltaUsd >= 0 ? '+' : '-'}${formatUsd(Math.abs(entry.deltaUsd))}
              </span>
            </div>
          ))}
        </section>
      )}

      {dashboard.activeWallet && (
        <section className="wallet-section">
          <div className="wallet-section-title">{dashboard.activeWallet.name}</div>
          <div className="wallet-holdings">
            {dashboard.activeWallet.holdings.map((holding) => (
              <div key={holding.mint} className="wallet-holding-row">
                <div>
                  <div className="wallet-label">{holding.symbol}</div>
                  <div className="wallet-caption">{holding.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                </div>
                <div className="wallet-holding-value">
                  <div>${formatUsd(holding.valueUsd)}</div>
                  <div className="wallet-caption">${formatUsd(holding.priceUsd)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Transaction History */}
      {transactions && transactions.length > 0 && (
        <section className="wallet-section">
          <div className="wallet-section-title">Transaction History</div>
          {transactions.slice(0, 10).map((tx) => (
            <div key={tx.id} className="wallet-tx-row">
              <div>
                <div className="wallet-label">{tx.type}</div>
                <div className="wallet-caption">
                  {shortAddress(tx.from_address)} → {shortAddress(tx.to_address)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="wallet-label">{tx.amount}{tx.mint ? '' : ' SOL'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                  <span className={`wallet-tx-status ${tx.status}`}>{tx.status}</span>
                  <span className="wallet-caption">{relativeTime(tx.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {dashboard.recentActivity.length > 0 && (
        <section className="wallet-section">
          <div className="wallet-section-title">Recent Activity</div>
          {dashboard.recentActivity.slice(0, 6).map((event) => (
            <div key={event.signature} className="wallet-activity-row">
              <div className="wallet-label">{event.type ?? 'Transaction'}</div>
              <div className="wallet-caption">{event.description ?? shortSignature(event.signature)}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: value >= 1000 ? 0 : 2, maximumFractionDigits: 2 })
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '-'
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

function shortAddress(value: string): string {
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

function shortSignature(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-8)}`
}

function relativeTime(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
