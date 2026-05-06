import { useEffect, useState } from 'react'
import './WalletPanel.css'
import { TransactionPreviewCard } from './TransactionPreviewCard'

interface PendingSend {
  walletId: string
  mode: 'sol' | 'token'
  dest: string
  amount?: number
  sendMax?: boolean
  mint?: string
}

interface RecipientWalletOption {
  id: string
  name: string
  address: string
}

interface SendTokenOption {
  mint: string
  symbol: string
  amount: number
}

interface WalletSendFormProps {
  walletId: string
  walletName: string
  sendMode: 'sol' | 'token'
  sendDest: string
  sendAmount: string
  sendMint: string
  sendMax: boolean
  selectedRecipientWalletId: string
  recipientWallets: RecipientWalletOption[]
  tokenOptions: SendTokenOption[]
  walletBalanceSol: number | null
  executionMode: WalletInfrastructureSettings['executionMode']
  sendLoading: boolean
  sendError: string | null
  sendResult: WalletExecutionResult | null
  pendingSend: PendingSend | null
  onRecipientWalletChange: (walletId: string) => void
  onDestChange: (value: string) => void
  onAmountChange: (value: string) => void
  onMintChange: (value: string) => void
  onToggleSendMax: () => void
  onConfirmSend: (walletId: string) => void
  onExecuteSend: () => void
  onCancelSend: () => void
  onClose: () => void
}

export function WalletSendForm({
  walletId,
  walletName,
  sendMode,
  sendDest,
  sendAmount,
  sendMint,
  sendMax,
  selectedRecipientWalletId,
  recipientWallets,
  tokenOptions,
  walletBalanceSol,
  executionMode,
  sendLoading,
  sendError,
  sendResult,
  pendingSend,
  onRecipientWalletChange,
  onDestChange,
  onAmountChange,
  onMintChange,
  onToggleSendMax,
  onConfirmSend,
  onExecuteSend,
  onCancelSend,
  onClose,
}: WalletSendFormProps) {
  const selectedToken = tokenOptions.find((token) => token.mint === sendMint) ?? null
  const selectedRecipientWallet = recipientWallets.find((wallet) => wallet.id === selectedRecipientWalletId) ?? null
  const pendingRecipientWallet = recipientWallets.find((wallet) => wallet.address === pendingSend?.dest) ?? null
  const amountLabel = sendMode === 'sol'
    ? 'SOL'
    : selectedToken?.symbol || 'tokens'
  const maxButtonLabel = sendMax
    ? `Using Max ${amountLabel}`
    : `Send All ${amountLabel}`
  const backendLabel = executionMode === 'jito' ? 'Shared Jito executor' : 'Shared RPC executor'
  const [preview, setPreview] = useState<SolanaTransactionPreview | null>(null)

  useEffect(() => {
    let cancelled = false
    setPreview(null)

    if (!pendingSend || pendingSend.walletId !== walletId) return

    void window.daemon.wallet.transactionPreview({
      kind: pendingSend.mode === 'sol' ? 'send-sol' : 'send-token',
      walletId: pendingSend.walletId,
      destination: pendingSend.dest,
      amount: pendingSend.amount,
      sendMax: pendingSend.sendMax,
      mint: pendingSend.mint,
      tokenSymbol: selectedToken?.symbol,
    }).then((res) => {
      if (cancelled || !res.ok || !res.data) return
      setPreview(res.data)
    }).catch(() => {})

    return () => {
      cancelled = true
    }
  }, [pendingSend, selectedToken?.symbol, walletId])

  return (
    <div className="wallet-send-form">
      <div className="wallet-send-inline">
        <div className="wallet-send-head">
          <div>
            <div className="wallet-caption">{sendMode === 'sol' ? 'Send SOL' : 'Send Token'}</div>
            <div className="wallet-label">From {walletName}</div>
            <div className="wallet-caption">Execution path: {executionMode === 'jito' ? 'Jito block engine' : 'Standard RPC'}</div>
          </div>
          <div className="wallet-send-balance-stack">
            {sendMode === 'sol' && walletBalanceSol !== null && (
              <div className="wallet-send-balance">Available {walletBalanceSol.toFixed(4)} SOL</div>
            )}
            {sendMode === 'token' && selectedToken && (
              <div className="wallet-send-balance">Available {formatAmount(selectedToken.amount)} {selectedToken.symbol}</div>
            )}
          </div>
        </div>
        {!pendingSend && (
          <>
            {recipientWallets.length > 0 && (
              <div className="wallet-send-group">
                <label className="wallet-caption">Transfer to tracked wallet</label>
                <select
                  className="wallet-input"
                  value={selectedRecipientWalletId}
                  onChange={(e) => onRecipientWalletChange(e.target.value)}
                >
                  <option value="">Custom address</option>
                  {recipientWallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name} ({shortAddress(wallet.address)})
                    </option>
                  ))}
                </select>
                {selectedRecipientWallet && (
                  <div className="wallet-send-helper">
                    Internal transfer to <strong>{selectedRecipientWallet.name}</strong> at {shortAddress(selectedRecipientWallet.address)}
                  </div>
                )}
              </div>
            )}
            <div className="wallet-send-group">
              <label className="wallet-caption">{selectedRecipientWallet ? 'Recipient address' : 'Destination address'}</label>
            <input
              className="wallet-input"
              value={sendDest}
              onChange={(e) => onDestChange(e.target.value)}
              placeholder={selectedRecipientWallet ? selectedRecipientWallet.address : 'Destination address'}
            />
            </div>
            {sendMode === 'token' && (
              <div className="wallet-send-group">
                <label className="wallet-caption">Token</label>
                {tokenOptions.length > 0 ? (
                <select
                  className="wallet-input"
                  value={sendMint}
                  onChange={(e) => onMintChange(e.target.value)}
                >
                  <option value="">Select token</option>
                  {tokenOptions.map((token) => (
                    <option key={token.mint} value={token.mint}>
                      {token.symbol} ({formatAmount(token.amount)})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="wallet-input"
                  value={sendMint}
                  onChange={(e) => onMintChange(e.target.value)}
                  placeholder="Token mint address"
                />
              )}
              </div>
            )}
            <div className="wallet-send-amount-row">
              <input
                className="wallet-input"
                value={sendAmount}
                onChange={(e) => onAmountChange(e.target.value)}
                placeholder={sendMode === 'sol' ? 'Amount (SOL)' : `Amount (${amountLabel})`}
                type="number"
                step="any"
                min="0"
                disabled={sendMax}
              />
              <button
                className={`wallet-btn ${sendMax ? 'primary' : ''}`}
                type="button"
                onClick={onToggleSendMax}
              >
                {maxButtonLabel}
              </button>
            </div>
            {sendMode === 'sol' && walletBalanceSol !== null && !sendMax && sendAmount.trim() && !Number.isNaN(Number(sendAmount)) && (
              <div className="wallet-send-helper">
                Remaining after send: {Math.max(walletBalanceSol - Number(sendAmount), 0).toFixed(4)} SOL before network fees
              </div>
            )}
            <div className="wallet-actions">
              <button
                className="wallet-btn primary"
                disabled={sendLoading}
                onClick={() => onConfirmSend(walletId)}
              >
                Confirm Send
              </button>
              <button type="button" className="wallet-btn" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
        {pendingSend && pendingSend.walletId === walletId && (
          <div>
            <TransactionPreviewCard
              title={preview?.title ?? 'Review Send'}
              backendLabel={preview?.backendLabel ?? backendLabel}
              signerLabel={preview?.signerLabel ?? walletName}
              destinationLabel={preview?.targetLabel ?? (pendingRecipientWallet ? pendingRecipientWallet.name : shortAddress(pendingSend.dest))}
              amountLabel={preview?.amountLabel ?? (pendingSend.sendMax
                ? `Max ${pendingSend.mode === 'sol' ? 'SOL' : selectedToken?.symbol ?? 'token'}`
                : `${pendingSend.amount} ${pendingSend.mode === 'sol' ? 'SOL' : selectedToken?.symbol ?? shortAddress(pendingSend.mint ?? 'token')}`)}
              feeLabel={preview?.feeLabel}
              warnings={preview?.warnings}
              notes={preview?.notes ?? [
                pendingSend.sendMax ? 'This will send the maximum transferable balance after reserving fees.' : 'The send amount is fixed to the value shown above.',
                pendingSend.mode === 'token' ? 'If the destination does not already have the token account, DAEMON will create it when needed.' : 'This uses the currently selected Solana execution backend.',
              ]}
            />
            <div className="wallet-actions">
              <button type="button" className="wallet-btn" onClick={onCancelSend}>Cancel</button>
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
            Sent via {sendResult.transport === 'jito' ? 'Jito' : 'RPC'}! Sig: {sendResult.signature.slice(0, 8)}...{sendResult.signature.slice(-8)}
          </div>
        )}
      </div>
    </div>
  )
}

function shortAddress(value: string): string {
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`
  if (amount >= 1) return amount.toFixed(2)
  return amount.toFixed(4)
}
