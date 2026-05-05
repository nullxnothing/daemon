import type { SolanaProjectInfo, ValidatorState, SolanaMcpEntry, SolanaToolchainStatus } from '../../store/solanaToolbox'

const FRAMEWORK_LABELS: Record<string, string> = {
  anchor: 'ANCHOR',
  native: 'NATIVE',
  'client-only': 'CLIENT',
}

function getHealthColor(validator: ValidatorState, mcps: SolanaMcpEntry[]): string {
  const mcpActive = mcps.filter((m) => m.enabled).length
  if (validator.status === 'running' && mcpActive > 0) return 'green'
  if (validator.status === 'running' || mcpActive > 0) return 'amber'
  if (validator.status === 'error') return 'red'
  return 'grey'
}

interface EnvironmentBarProps {
  info: SolanaProjectInfo | null
  validator: ValidatorState
  mcps: SolanaMcpEntry[]
  toolchain: SolanaToolchainStatus | null
}

export function EnvironmentBar({ info, validator, mcps, toolchain }: EnvironmentBarProps) {
  if (!info || !info.isSolanaProject) {
    return <div className="solana-env-none">No Solana project detected</div>
  }

  const label = FRAMEWORK_LABELS[info.framework ?? ''] ?? 'SOLANA'
  const fileCount = info.indicators.length
  const readyCount = toolchain
    ? [toolchain.solanaCli, toolchain.anchor, toolchain.avm, toolchain.surfpool, toolchain.testValidator, toolchain.litesvm].filter((entry) => entry.installed).length
    : 0

  return (
    <div className="solana-env-bar">
      <div className="solana-env-badge">
        <span className={`sol-dot green`} />
        {label}
      </div>
      <span className="solana-env-indicators">
        {fileCount} file{fileCount !== 1 ? 's' : ''} detected{toolchain ? ` • ${readyCount}/6 tools ready` : ''}
      </span>
      <span className={`solana-env-health ${getHealthColor(validator, mcps)}`} />
    </div>
  )
}
