import { useSolanaToolboxStore, type ValidatorState } from '../../store/solanaToolbox'

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

function getValidatorHelpText(validator: ValidatorState): string {
  if (validator.status === 'running' && validator.port) {
    return `Local RPC is ready at http://localhost:${validator.port}.`
  }
  if (validator.status === 'starting') {
    return 'Starting the local runtime. Check terminal logs if this takes more than a few seconds.'
  }
  if (validator.status === 'error') {
    return 'Validator did not start. Check missing CLI tools, port conflicts, or terminal logs, then retry.'
  }
  return 'Start a local runtime before relying on local transaction tests or localnet explorer links.'
}

export function ValidatorCard() {
  const validator = useSolanaToolboxStore((s) => s.validator)
  const startValidator = useSolanaToolboxStore((s) => s.startValidator)
  const stopValidator = useSolanaToolboxStore((s) => s.stopValidator)

  const dotColor = STATUS_COLORS[validator.status] ?? 'grey'
  const statusText = STATUS_LABELS[validator.status] ?? validator.status

  return (
    <div className={`solana-validator-card ${validator.status === 'running' ? 'running' : ''}`}>
      <div className="solana-validator-top">
        <span className="solana-validator-title">Local Validator</span>
        <span className="solana-validator-status-text">
          <span className={`sol-dot ${dotColor}`} />
          {statusText}
        </span>
      </div>

      <div className="solana-seg-toggle">
        <button
          className={`solana-seg-btn ${validator.type === 'surfpool' ? 'active' : ''}`}
          onClick={() => startValidator('surfpool')}
          disabled={validator.status === 'starting'}
        >
          Surfpool
        </button>
        <button
          className={`solana-seg-btn ${validator.type === 'test-validator' ? 'active' : ''}`}
          onClick={() => startValidator('test-validator')}
          disabled={validator.status === 'starting'}
        >
          Test Validator
        </button>
      </div>

      {validator.status === 'running' && validator.port && (
        <div className="solana-validator-endpoint">
          http://localhost:{validator.port}
        </div>
      )}

      <div className={`solana-validator-help ${validator.status}`}>
        {getValidatorHelpText(validator)}
      </div>

      {validator.status === 'running' && (
        <div className="solana-validator-actions">
          <button type="button" className="sol-btn" onClick={() => { stopValidator().then(() => startValidator(validator.type!)) }}>
            Restart
          </button>
          <button type="button" className="sol-btn red" onClick={() => stopValidator()}>
            Stop
          </button>
        </div>
      )}

      {validator.status === 'stopped' && (
        <div className="solana-validator-actions">
          <button type="button" className="sol-btn green" onClick={() => startValidator('surfpool')}>
            Start
          </button>
        </div>
      )}
    </div>
  )
}
