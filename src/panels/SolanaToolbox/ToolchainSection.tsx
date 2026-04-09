import type { SolanaToolchainStatus } from '../../store/solanaToolbox'

interface ToolchainSectionProps {
  toolchain: SolanaToolchainStatus | null
}

const TOOL_ROWS: Array<{
  key: keyof SolanaToolchainStatus
  label: string
  description: string
}> = [
  { key: 'solanaCli', label: 'Solana CLI', description: 'Core CLI and account/program tooling.' },
  { key: 'anchor', label: 'Anchor', description: 'Program build, test, deploy, and IDL workflows.' },
  { key: 'avm', label: 'AVM', description: 'Pinned Anchor toolchain management.' },
  { key: 'surfpool', label: 'Surfpool', description: 'Fast local validator and forked development environment.' },
  { key: 'testValidator', label: 'solana-test-validator', description: 'Canonical local validator from the Solana toolchain.' },
  { key: 'litesvm', label: 'LiteSVM', description: 'Project-level fast execution harness for tests.' },
]

export function ToolchainSection({ toolchain }: ToolchainSectionProps) {
  if (!toolchain) return null

  return (
    <div className="solana-toolchain">
      <div className="solana-ecosystem-header">
        <div>
          <div className="solana-token-launch-kicker">Toolchain Diagnostics</div>
          <h3 className="solana-token-launch-title">Local Solana development readiness</h3>
          <p className="solana-token-launch-copy">
            These checks reflect what is installed on the machine and what the active project already depends on.
          </p>
        </div>
      </div>

      <div className="solana-toolchain-grid">
        {TOOL_ROWS.map((tool) => {
          const entry = toolchain[tool.key]
          const installed = entry.installed
          const detail = 'version' in entry
            ? entry.version || 'Installed, version unavailable'
            : entry.source === 'project'
              ? 'Detected in the active project'
              : 'Not detected in the active project'

          return (
            <section key={tool.key} className="solana-toolchain-card">
              <div className="solana-runtime-title-row">
                <span className="solana-runtime-label">{tool.label}</span>
                <span className={`solana-ecosystem-status ${installed ? 'native' : 'guided'}`}>
                  {installed ? 'Ready' : 'Missing'}
                </span>
              </div>
              <div className="solana-runtime-detail">{tool.description}</div>
              <div className="solana-toolchain-version">{installed ? detail : detail}</div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
