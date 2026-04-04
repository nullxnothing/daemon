import { useSolanaToolboxStore } from '../../store/solanaToolbox'

const STATUS_COLORS: Record<string, string> = {
  stopped: 'grey',
  starting: 'amber',
  running: 'green',
  error: 'red',
}

const STATUS_LABELS: Record<string, string> = {
  stopped: 'Stopped',
  starting: 'Starting...',
  running: 'Running',
  error: 'Error',
}

export function ValidatorSection() {
  const validator = useSolanaToolboxStore((s) => s.validator)
  const startValidator = useSolanaToolboxStore((s) => s.startValidator)
  const stopValidator = useSolanaToolboxStore((s) => s.stopValidator)

  const dotColor = STATUS_COLORS[validator.status] ?? 'grey'
  const statusText = STATUS_LABELS[validator.status] ?? validator.status
  const portText = validator.status === 'running' && validator.port ? ` on :${validator.port}` : ''

  return (
    <div className="solana-section">
      <div className="solana-section-title">Validator</div>

      <div className="solana-validator-tabs">
        <button
          className={`solana-validator-tab ${validator.type === 'surfpool' && validator.status !== 'stopped' ? 'active' : ''}`}
          onClick={() => startValidator('surfpool')}
          disabled={validator.status === 'starting'}
        >
          Surfpool
        </button>
        <button
          className={`solana-validator-tab ${validator.type === 'test-validator' && validator.status !== 'stopped' ? 'active' : ''}`}
          onClick={() => startValidator('test-validator')}
          disabled={validator.status === 'starting'}
        >
          Test Validator
        </button>
      </div>

      <div className="solana-validator-status">
        <span className={`solana-dot ${dotColor}`} />
        <span>{validator.type ? `${validator.type === 'surfpool' ? 'Surfpool' : 'Test Validator'}: ${statusText}${portText}` : `Validator: ${statusText}`}</span>
      </div>

      {validator.status === 'running' && (
        <div className="solana-btn-row">
          <button className="solana-btn" onClick={() => { stopValidator().then(() => startValidator(validator.type!)) }}>
            Restart
          </button>
          <button className="solana-btn" onClick={() => stopValidator()}>
            Stop
          </button>
        </div>
      )}
    </div>
  )
}
