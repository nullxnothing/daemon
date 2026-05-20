import './WalletPanel.css'
import { getClusterDisplayName } from './walletCopy'

export type TransactionPipelineStepState = 'idle' | 'active' | 'complete' | 'failed'

export interface TransactionPipelineStep {
  label: string
  detail: string
  state: TransactionPipelineStepState
}

interface TransactionPreviewCardProps {
  title: string
  backendLabel: string
  networkLabel?: string
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
  networkLabel,
  signerLabel,
  destinationLabel,
  amountLabel,
  notes,
  feeLabel,
  warnings = [],
}: TransactionPreviewCardProps) {
  const visibleWarnings = warnings.filter(Boolean)
  const displayedNetworkLabel = networkLabel ? getClusterDisplayName(networkLabel) : null

  return (
    <div className="wallet-transaction-preview">
      <div className="wallet-transaction-preview-head">
        <div>
          <div className="wallet-transaction-preview-kicker">Safety preview</div>
          <div className="wallet-transaction-preview-title">{title}</div>
        </div>
        <span className="wallet-transaction-preview-state">Not signed</span>
      </div>
      <div className="wallet-transaction-preview-safe">
        Nothing has been signed or broadcast yet. Review the signer, network, target, amount, fees, and warnings before continuing.
      </div>
      <div className="wallet-transaction-preview-grid">
        <div className="wallet-transaction-preview-item">
          <div className="wallet-transaction-preview-label">Execution path</div>
          <div className="wallet-transaction-preview-value">{backendLabel}</div>
        </div>
        {displayedNetworkLabel && (
          <div className="wallet-transaction-preview-item">
            <div className="wallet-transaction-preview-label">Network / explorer</div>
            <div className="wallet-transaction-preview-value">{displayedNetworkLabel}</div>
          </div>
        )}
        <div className="wallet-transaction-preview-item">
          <div className="wallet-transaction-preview-label">Signer wallet</div>
          <div className="wallet-transaction-preview-value">{signerLabel}</div>
        </div>
        <div className="wallet-transaction-preview-item">
          <div className="wallet-transaction-preview-label">Recipient / route</div>
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
      {visibleWarnings.length > 0 && (
        <div className="wallet-transaction-preview-warnings">
          {visibleWarnings.map((warning) => (
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

export function TransactionPipeline({ steps }: { steps: TransactionPipelineStep[] }) {
  return (
    <div className="wallet-transaction-pipeline" aria-label="Transaction progress">
      {steps.map((step) => (
        <div key={step.label} className={`wallet-transaction-step wallet-transaction-step--${step.state}`}>
          <span className="wallet-transaction-step-dot" />
          <span className="wallet-transaction-step-copy">
            <strong>{step.label}</strong>
            <small>{step.detail}</small>
          </span>
        </div>
      ))}
    </div>
  )
}
