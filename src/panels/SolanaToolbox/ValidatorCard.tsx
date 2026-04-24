import { useState } from 'react'
import { useAppActions } from '../../store/appActions'
import { useSolanaToolboxStore } from '../../store/solanaToolbox'
import { useUIStore } from '../../store/ui'
import { getSolanaToolingGuide } from './toolingGuides'

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

export function ValidatorCard() {
  const validator = useSolanaToolboxStore((s) => s.validator)
  const toolchain = useSolanaToolboxStore((s) => s.toolchain)
  const startValidator = useSolanaToolboxStore((s) => s.startValidator)
  const stopValidator = useSolanaToolboxStore((s) => s.stopValidator)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const focusTerminal = useAppActions((s) => s.focusTerminal)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const dotColor = STATUS_COLORS[validator.status] ?? 'grey'
  const statusText = STATUS_LABELS[validator.status] ?? validator.status
  const surfpoolGuide = getSolanaToolingGuide('surfpool')
  const solanaCliGuide = getSolanaToolingGuide('solana-cli')
  const surfpoolReady = toolchain?.surfpool.installed ?? false
  const testValidatorReady = toolchain?.testValidator.installed ?? false
  const recommendedStart = surfpoolReady ? 'surfpool' : testValidatorReady ? 'test-validator' : null

  async function handleRunCommand(command: string, label: string) {
    if (!activeProjectId || !activeProjectPath) {
      setActionMessage('Open a project before asking DAEMON to run validator setup commands.')
      return
    }

    const terminalRes = await window.daemon.terminal.create({
      cwd: activeProjectPath,
      startupCommand: command,
      userInitiated: true,
    })

    if (!terminalRes.ok || !terminalRes.data) {
      setActionMessage(terminalRes.error ?? `Could not open the ${label} terminal.`)
      return
    }

    addTerminal(activeProjectId, terminalRes.data.id, label, terminalRes.data.agentId)
    focusTerminal()
    setActionMessage(`${label} opened in a project terminal.`)
  }

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
          disabled={validator.status === 'starting' || !surfpoolReady}
        >
          Surfpool
        </button>
        <button
          className={`solana-seg-btn ${validator.type === 'test-validator' ? 'active' : ''}`}
          onClick={() => startValidator('test-validator')}
          disabled={validator.status === 'starting' || !testValidatorReady}
        >
          Test Validator
        </button>
      </div>

      {validator.status === 'error' && validator.error && (
        <div className="solana-runtime-troubleshooting">
          <div className="solana-runtime-title">Validator startup failed</div>
          <div className="solana-runtime-warning">{validator.error}</div>
        </div>
      )}

      {validator.status === 'stopped' && (
        <div className="solana-runtime-coverage">
          <div className="solana-runtime-title">Recommended Validator Path</div>
          <div className="solana-runtime-warning">
            {recommendedStart === 'surfpool'
              ? 'Surfpool is installed, so DAEMON can use the faster local validator path.'
              : recommendedStart === 'test-validator'
                ? 'Surfpool is missing, so DAEMON should start with solana-test-validator and only upgrade after Surfpool is installed.'
                : 'No local validator binary is available yet. Install Solana CLI or Surfpool before relying on local execution from DAEMON.'}
          </div>
          <div className="solana-runtime-actions">
            {recommendedStart && (
              <button className="sol-btn green" onClick={() => startValidator(recommendedStart)}>
                {recommendedStart === 'surfpool' ? 'Start Surfpool' : 'Start Test Validator'}
              </button>
            )}
            {!surfpoolReady && surfpoolGuide.installCommand && (
              <button
                type="button"
                className="sol-btn"
                onClick={() => void handleRunCommand(surfpoolGuide.installCommand!, surfpoolGuide.installLabel!)}
              >
                {surfpoolGuide.installLabel}
              </button>
            )}
            <button type="button" className="sol-btn" onClick={() => void window.daemon.shell.openExternal(surfpoolReady ? surfpoolGuide.docsUrl : solanaCliGuide.docsUrl)}>
              {surfpoolReady ? surfpoolGuide.docsLabel : solanaCliGuide.docsLabel}
            </button>
          </div>
        </div>
      )}

      {validator.status === 'running' && validator.port && (
        <div className="solana-validator-endpoint">
          http://localhost:{validator.port}
        </div>
      )}

      {validator.status === 'running' && (
        <div className="solana-validator-actions">
          <button className="sol-btn" onClick={() => { stopValidator().then(() => startValidator(validator.type!)) }}>
            Restart
          </button>
          <button className="sol-btn red" onClick={() => stopValidator()}>
            Stop
          </button>
        </div>
      )}

      {validator.status === 'stopped' && (
        <div className="solana-validator-actions">
          <button className="sol-btn green" onClick={() => recommendedStart && startValidator(recommendedStart)} disabled={!recommendedStart}>
            {recommendedStart === 'surfpool' ? 'Start Surfpool' : recommendedStart === 'test-validator' ? 'Start Test Validator' : 'Install Validator Tools'}
          </button>
        </div>
      )}

      {actionMessage && <div className="solana-toolchain-feedback">{actionMessage}</div>}
    </div>
  )
}
