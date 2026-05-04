import { useUIStore } from '../../store/ui'
import type { SolanaProjectInfo, SolanaProgramDiagnostic } from '../../store/solanaToolbox'
import './SolanaIdeWorkflow.css'

interface ProgramMonitorPanelProps {
  projectId: string | null
  projectPath: string | null
  projectInfo: SolanaProjectInfo | null
}

function collectProgramIds(program: SolanaProgramDiagnostic): Array<{ label: string; value: string }> {
  const rows = [
    { label: 'Anchor.toml', value: program.anchorProgramId },
    { label: 'declare_id!', value: program.declareId },
    { label: 'Generated IDL', value: program.idlAddress },
    { label: 'Deploy keypair', value: program.keypairAddress },
  ]

  const seen = new Set<string>()
  return rows.flatMap((row) => {
    if (!row.value || seen.has(row.value)) return []
    seen.add(row.value)
    return [{ label: row.label, value: row.value }]
  })
}

export function ProgramMonitorPanel({ projectId, projectPath, projectInfo }: ProgramMonitorPanelProps) {
  const addTerminal = useUIStore((s) => s.addTerminal)
  const diagnostics = projectInfo?.diagnostics
  const programs = diagnostics?.programs ?? []
  const canRun = Boolean(projectId && projectPath)

  const runCommand = async (command: string, label: string) => {
    if (!projectId || !projectPath) return
    const res = await window.daemon.terminal.create({
      cwd: projectPath,
      startupCommand: command,
      userInitiated: true,
    })
    if (res.ok && res.data) {
      addTerminal(projectId, res.data.id, label)
    }
  }

  if (!projectInfo?.isSolanaProject || programs.length === 0) {
    return (
      <div className="solana-ide-surface">
        <div className="solana-ide-hero">
          <div>
            <div className="solana-token-launch-kicker">Program Monitor</div>
            <h3 className="solana-token-launch-title">No deployable programs detected yet</h3>
            <p className="solana-token-launch-copy">
              Open an Anchor or native Solana program workspace so DAEMON can discover program IDs, generated IDLs, and deploy keypairs.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="solana-ide-surface">
      <div className="solana-ide-hero">
        <div>
          <div className="solana-token-launch-kicker">Program Monitor</div>
          <h3 className="solana-token-launch-title">Read deployed program state before and after shipping</h3>
          <p className="solana-token-launch-copy">
            This foundation uses detected program IDs to launch read-only Solana CLI lookups for program state, upgrade authority, and deploy verification.
          </p>
        </div>
        <div className="solana-ide-hero-actions">
          <button className="sol-btn" disabled={!canRun} onClick={() => void runCommand('solana config get', 'Solana Config')}>
            Show Cluster Config
          </button>
        </div>
      </div>

      <div className="solana-ide-grid three">
        <section className="solana-ide-card emphasis">
          <div className="solana-ide-card-title">Programs</div>
          <div className="solana-ide-card-copy">{programs.length} program{programs.length === 1 ? '' : 's'} discovered from project diagnostics.</div>
        </section>
        <section className="solana-ide-card">
          <div className="solana-ide-card-title">Read-only monitor</div>
          <div className="solana-ide-card-copy">Commands inspect state only. They do not deploy, upgrade, close buffers, or send transactions.</div>
        </section>
        <section className="solana-ide-card warning">
          <div className="solana-ide-card-title">Cluster matters</div>
          <div className="solana-ide-card-copy">Run config lookup first so devnet/mainnet/localnet assumptions are visible before reviewing state.</div>
        </section>
      </div>

      {programs.map((program) => {
        const ids = collectProgramIds(program)
        const preferredId = program.anchorProgramId ?? program.declareId ?? program.idlAddress ?? program.keypairAddress
        return (
          <section key={program.name} className="solana-ide-panel">
            <div className="solana-ide-panel-title">Program: {program.name}</div>
            <p className="solana-ide-panel-copy">
              Compare every detected program ID source before trusting a deploy or upgrade command.
            </p>

            <div className="solana-ide-grid">
              {ids.map((id) => (
                <div key={`${program.name}-${id.label}-${id.value}`} className="solana-ide-card">
                  <div className="solana-ide-card-title">{id.label}</div>
                  <div className="solana-ide-card-copy">{id.value}</div>
                  <code className="solana-ide-command">solana program show {id.value}</code>
                  <div className="solana-ide-card-actions">
                    <button
                      className="sol-btn"
                      disabled={!canRun}
                      onClick={() => void runCommand(`solana program show ${id.value}`, `Program ${program.name}`)}
                    >
                      Show Program
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="solana-ide-panel-actions">
              <button
                className="sol-btn green"
                disabled={!canRun || !preferredId}
                onClick={() => preferredId ? void runCommand(`solana program show ${preferredId}`, `Program ${program.name}`) : undefined}
              >
                Inspect Preferred ID
              </button>
              <button
                className="sol-btn"
                disabled={!canRun || !preferredId}
                onClick={() => preferredId ? void runCommand(`solana account ${preferredId}`, `Account ${program.name}`) : undefined}
              >
                Raw Account
              </button>
            </div>
          </section>
        )
      })}
    </div>
  )
}
