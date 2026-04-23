import './WalletPanel.css'

interface TransactionPreviewCardProps {
  title: string
  backendLabel: string
  signerLabel: string
  destinationLabel: string
  amountLabel: string
  notes: string[]
  feeLabel?: string
  warnings?: string[]
}

export function TransactionPreviewCard({
  title,
  backendLabel,
  signerLabel,
  destinationLabel,
  amountLabel,
  notes,
  feeLabel,
  warnings = [],
}: TransactionPreviewCardProps) {
  return (
    <div className="wallet-transaction-preview">
      <div className="wallet-transaction-preview-title">{title}</div>
      <div className="wallet-transaction-preview-grid">
        <div className="wallet-transaction-preview-item">
          <div className="wallet-transaction-preview-label">Execution</div>
          <div className="wallet-transaction-preview-value">{backendLabel}</div>
        </div>
        <div className="wallet-transaction-preview-item">
          <div className="wallet-transaction-preview-label">Signer</div>
          <div className="wallet-transaction-preview-value">{signerLabel}</div>
        </div>
        <div className="wallet-transaction-preview-item">
          <div className="wallet-transaction-preview-label">Target</div>
          <div className="wallet-transaction-preview-value">{destinationLabel}</div>
        </div>
        <div className="wallet-transaction-preview-item">
          <div className="wallet-transaction-preview-label">Amount</div>
          <div className="wallet-transaction-preview-value">{amountLabel}</div>
        </div>
        {feeLabel && (
          <div className="wallet-transaction-preview-item">
            <div className="wallet-transaction-preview-label">Fees</div>
            <div className="wallet-transaction-preview-value">{feeLabel}</div>
          </div>
        )}
      </div>
      {warnings.length > 0 && (
        <div className="wallet-transaction-preview-warnings">
          {warnings.map((warning) => (
            <div key={warning} className="wallet-transaction-preview-warning">{warning}</div>
          ))}
        </div>
      )}
      {notes.length > 0 && (
        <div className="wallet-transaction-preview-notes">
          {notes.map((note) => (
            <div key={note} className="wallet-transaction-preview-note">{note}</div>
          ))}
        </div>
      )}
    </div>
  )
}
