import { useMemo } from 'react'
import { useSolanaToolboxStore, type SolanaProjectInfo, type SolanaToolchainStatus } from '../../store/solanaToolbox'

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

interface ValidatorCardProps {
  toolchain?: SolanaToolchainStatus | null
  projectInfo?: SolanaProjectInfo | null
  projectPath?: string | null
}

function getRecommendation(toolchain: SolanaToolchainStatus | null | undefined): {
  type: 'surfpool' | 'test-validator' | null
  label: string
  detail: string
} {
  if (toolchain?.surfpool.installed) {
    return {
      type: 'surfpool',
      label: 'Surfpool',
      detail: 'Best local path for fast project boot, mainnet account forking, and Studio inspection.',
    }
  }
  if (toolchain?.testValidator.installed) {
    return {
      type: 'test-validator',
      label: 'Test Validator',
      detail: 'Canonical Solana local validator path from the installed Solana CLI.',
    }
  }
  return {
    type: null,
    label: 'No local validator detected',
    detail: 'Install Surfpool or solana-test-validator to run local program workflows from DAEMON.',
  }
}

function shortPath(value: string | null | undefined): string {
  if (!value) return 'No project cwd'
  const normalized = value.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts.slice(-2).join('/')
}

export function ValidatorCard({ toolchain, projectInfo, projectPath }: ValidatorCardProps) {
  const validator = useSolanaToolboxStore((s) => s.validator)
  const startValidator = useSolanaToolboxStore((s) => s.startValidator)
  const stopValidator = useSolanaToolboxStore((s) => s.stopValidator)

  const dotColor = STATUS_COLORS[validator.status] ?? 'grey'
  const statusText = STATUS_LABELS[validator.status] ?? validator.status
  const recommendation = useMemo(() => getRecommendation(toolchain), [toolchain])
  const canStartSurfpool = toolchain?.surfpool.installed ?? true
  const canStartTestValidator = toolchain?.testValidator.installed ?? true
  const rpcEndpoint = validator.port ? `http://127.0.0.1:${validator.port}` : 'http://127.0.0.1:8899'
  const wsEndpoint = validator.port ? `ws://127.0.0.1:${validator.port + 1}` : 'ws://127.0.0.1:8900'
  const studioEndpoint = validator.studioPort ? `http://127.0.0.1:${validator.studioPort}` : 'http://127.0.0.1:18488'
  const validatorProjectPath = validator.projectPath ?? projectPath
  const currentType = validator.type ?? recommendation.type ?? 'surfpool'

  return (
    <div className={`solana-validator-card ${validator.status === 'running' ? 'running' : ''}`}>
      <div className="solana-validator-top">
        <div>
          <span className="solana-validator-title">Validator Workbench</span>
          <div className="solana-validator-subtitle">{recommendation.detail}</div>
        </div>
        <span className="solana-validator-status-text">
          <span className={`sol-dot ${dotColor}`} />
          {statusText}
        </span>
      </div>

      <div className="solana-seg-toggle">
        <button
          className={`solana-seg-btn ${validator.type === 'surfpool' ? 'active' : ''}`}
          onClick={() => startValidator('surfpool')}
          disabled={validator.status === 'starting' || !canStartSurfpool}
        >
          Surfpool
        </button>
        <button
          className={`solana-seg-btn ${validator.type === 'test-validator' ? 'active' : ''}`}
          onClick={() => startValidator('test-validator')}
          disabled={validator.status === 'starting' || !canStartTestValidator}
        >
          Test Validator
        </button>
      </div>

      <div className="solana-validator-workbench-grid">
        <div className="solana-validator-workbench-item">
          <span>RPC</span>
          <code>{rpcEndpoint}</code>
        </div>
        <div className="solana-validator-workbench-item">
          <span>WebSocket</span>
          <code>{wsEndpoint}</code>
        </div>
        <div className="solana-validator-workbench-item">
          <span>Project cwd</span>
          <code>{shortPath(validatorProjectPath)}</code>
        </div>
        <div className="solana-validator-workbench-item">
          <span>Mode</span>
          <code>{validator.type === 'surfpool' ? 'mainnet fork capable' : validator.type === 'test-validator' ? 'local ledger' : recommendation.label}</code>
        </div>
      </div>

      {validator.status === 'running' && (
        <div className="solana-validator-endpoint-list">
          <div className="solana-validator-endpoint">{rpcEndpoint}</div>
          {validator.type === 'surfpool' && <div className="solana-validator-endpoint">{studioEndpoint}</div>}
          {validator.command && <div className="solana-validator-command">{validator.command}</div>}
        </div>
      )}

      {projectInfo?.runtime?.files.surfpoolToml && (
        <div className="solana-validator-note">Surfpool.toml detected in this project.</div>
      )}

      {validator.status === 'running' && (
        <div className="solana-validator-actions">
          <button className="sol-btn" onClick={() => { stopValidator().then(() => startValidator(currentType)) }}>
            Restart
          </button>
          <button className="sol-btn" onClick={() => { stopValidator().then(() => startValidator(currentType, { reset: true })) }}>
            Reset
          </button>
          <button className="sol-btn red" onClick={() => stopValidator()}>
            Stop
          </button>
        </div>
      )}

      {validator.status === 'stopped' && (
        <div className="solana-validator-actions">
          <button
            className="sol-btn green"
            onClick={() => startValidator(recommendation.type ?? 'surfpool')}
            disabled={!recommendation.type}
          >
            Start Recommended
          </button>
          <button
            className="sol-btn"
            onClick={() => startValidator('test-validator', { reset: true })}
            disabled={!canStartTestValidator}
          >
            Reset Test Validator
          </button>
        </div>
      )}
    </div>
  )
}
