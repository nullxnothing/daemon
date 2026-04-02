import './WalletPanel.css'

interface WalletExportKeyProps {
  walletId: string
  exportConfirmId: string | null
  exportConfirmText: string
  revealKeyId: string | null
  revealedKey: string | null
  onConfirmTextChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
}

export function WalletExportKey({
  walletId,
  exportConfirmId,
  exportConfirmText,
  revealKeyId,
  revealedKey,
  onConfirmTextChange,
  onConfirm,
  onCancel,
}: WalletExportKeyProps) {
  const isConfirming = exportConfirmId === walletId
  const isRevealed = revealKeyId === walletId && revealedKey !== null

  if (!isConfirming && !isRevealed) return null

  return (
    <>
      {isConfirming && (
        <div>
          <div className="wallet-key-warning">Type EXPORT to reveal your private key:</div>
          <input
            className="wallet-input"
            value={exportConfirmText}
            onChange={(e) => onConfirmTextChange(e.target.value)}
            placeholder="Type EXPORT to confirm"
          />
          <div className="wallet-actions">
            <button
              className="wallet-btn primary"
              disabled={exportConfirmText !== 'EXPORT'}
              onClick={onConfirm}
            >
              Reveal Key
            </button>
            <button className="wallet-btn" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      )}
      {isRevealed && (
        <div>
          <div className="wallet-key-reveal">{revealedKey}</div>
          <div className="wallet-key-warning">This key will be hidden in 5 seconds. Do not share it.</div>
        </div>
      )}
    </>
  )
}
