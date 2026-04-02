import './WalletPanel.css'

interface PendingSend {
  walletId: string
  mode: 'sol' | 'token'
  dest: string
  amount: number
  mint?: string
}

interface WalletSendFormProps {
  walletId: string
  sendMode: 'sol' | 'token'
  sendDest: string
  sendAmount: string
  sendMint: string
  sendLoading: boolean
  sendError: string | null
  sendResult: string | null
  pendingSend: PendingSend | null
  onDestChange: (value: string) => void
  onAmountChange: (value: string) => void
  onMintChange: (value: string) => void
  onConfirmSend: (walletId: string) => void
  onExecuteSend: () => void
  onCancelSend: () => void
  onClose: () => void
}

export function WalletSendForm({
  walletId,
  sendMode,
  sendDest,
  sendAmount,
  sendMint,
  sendLoading,
  sendError,
  sendResult,
  pendingSend,
  onDestChange,
  onAmountChange,
  onMintChange,
  onConfirmSend,
  onExecuteSend,
  onCancelSend,
  onClose,
}: WalletSendFormProps) {
  return (
    <div className="wallet-send-form">
      <div className="wallet-send-inline">
        <div className="wallet-caption">{sendMode === 'sol' ? 'Send SOL' : 'Send Token'}</div>
        {!pendingSend && (
          <>
            <input
              className="wallet-input"
              value={sendDest}
              onChange={(e) => onDestChange(e.target.value)}
              placeholder="Destination address"
            />
            {sendMode === 'token' && (
              <input
                className="wallet-input"
                value={sendMint}
                onChange={(e) => onMintChange(e.target.value)}
                placeholder="Token mint address"
              />
            )}
            <input
              className="wallet-input"
              value={sendAmount}
              onChange={(e) => onAmountChange(e.target.value)}
              placeholder={sendMode === 'sol' ? 'Amount (SOL)' : 'Amount'}
              type="number"
              step="any"
              min="0"
            />
            <div className="wallet-actions">
              <button
                className="wallet-btn primary"
                disabled={sendLoading}
                onClick={() => onConfirmSend(walletId)}
              >
                Confirm Send
              </button>
              <button className="wallet-btn" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
        {pendingSend && pendingSend.walletId === walletId && (
          <div>
            <div className="wallet-caption">
              Send {pendingSend.amount} {pendingSend.mode === 'sol' ? 'SOL' : pendingSend.mint ? shortAddress(pendingSend.mint) : 'tokens'} to {shortAddress(pendingSend.dest)}?
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
  )
}

function shortAddress(value: string): string {
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}
