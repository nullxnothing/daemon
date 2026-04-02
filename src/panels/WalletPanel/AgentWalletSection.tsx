import { useState } from 'react'
import './WalletPanel.css'

interface AgentWallet {
  id: string
  name: string
  address: string
  agent_id: string
  wallet_type: string
}

interface PendingSend {
  walletId: string
  mode: 'sol' | 'token'
  dest: string
  amount: number
  mint?: string
}

interface AgentWalletSectionProps {
  agentWallets: AgentWallet[] | null
  sendWalletId: string | null
  sendMode: 'sol' | 'token' | null
  sendDest: string
  sendAmount: string
  sendLoading: boolean
  sendError: string | null
  sendResult: string | null
  pendingSend: PendingSend | null
  showSettings: boolean
  onFundAgent: (address: string) => void
  onAmountChange: (value: string) => void
  onConfirmSend: (walletId: string) => void
  onExecuteSend: () => void
  onCancelSend: () => void
  onCloseSend: () => void
  onCreateAgentWallet: (agentId: string, name: string) => Promise<void>
  onLoadAgents: () => Promise<Array<{ id: string; name: string }>>
}

export function AgentWalletSection({
  agentWallets,
  sendWalletId,
  sendMode,
  sendDest,
  sendAmount,
  sendLoading,
  sendError,
  sendResult,
  pendingSend,
  showSettings,
  onFundAgent,
  onAmountChange,
  onConfirmSend,
  onExecuteSend,
  onCancelSend,
  onCloseSend,
  onCreateAgentWallet,
  onLoadAgents,
}: AgentWalletSectionProps) {
  const [showCreateAgent, setShowCreateAgent] = useState(false)
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [agentWalletName, setAgentWalletName] = useState('')

  const openCreateAgent = async () => {
    const loadedAgents = await onLoadAgents()
    setAgents(loadedAgents)
    setShowCreateAgent(true)
  }

  const handleCreate = async () => {
    if (!selectedAgentId) return
    const agent = agents.find((a) => a.id === selectedAgentId)
    if (!agent) return
    const name = agentWalletName.trim() || `${agent.name} Wallet`
    await onCreateAgentWallet(selectedAgentId, name)
    setShowCreateAgent(false)
    setSelectedAgentId('')
    setAgentWalletName('')
  }

  const isFundFormVisible = sendWalletId && sendMode === 'sol' && sendDest && !showSettings

  return (
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
            <button className="wallet-btn" onClick={() => onFundAgent(aw.address)}>Fund</button>
          </div>
        ))
      ) : (
        <div className="wallet-empty">No agent wallets</div>
      )}

      {isFundFormVisible && (
        <div className="wallet-send-form">
          <div className="wallet-send-inline">
            <div className="wallet-caption">Fund Agent Wallet</div>
            <div className="wallet-caption">To: {shortAddress(sendDest)}</div>
            {!pendingSend && (
              <>
                <input
                  className="wallet-input"
                  value={sendAmount}
                  onChange={(e) => onAmountChange(e.target.value)}
                  placeholder="Amount (SOL)"
                  type="number"
                  step="any"
                  min="0"
                />
                <div className="wallet-actions">
                  <button
                    className="wallet-btn primary"
                    disabled={sendLoading}
                    onClick={() => onConfirmSend(sendWalletId!)}
                  >
                    Confirm Send
                  </button>
                  <button className="wallet-btn" onClick={onCloseSend}>Cancel</button>
                </div>
              </>
            )}
            {pendingSend && (
              <div>
                <div className="wallet-caption">
                  Send {pendingSend.amount} SOL to {shortAddress(pendingSend.dest)}?
                </div>
                <div className="wallet-actions">
                  <button className="wallet-btn" onClick={onCancelSend}>Cancel</button>
                  <button
                    className="wallet-btn primary"
                    disabled={sendLoading}
                    onClick={onExecuteSend}
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
              <button className="wallet-btn primary" onClick={handleCreate}>Create</button>
              <button className="wallet-btn" onClick={() => setShowCreateAgent(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function shortAddress(value: string): string {
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}
