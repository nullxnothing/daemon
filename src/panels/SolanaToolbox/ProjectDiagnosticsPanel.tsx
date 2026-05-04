import type { SolanaDiagnosticCheck, SolanaProjectInfo } from '../../store/solanaToolbox'
import './SolanaIdeWorkflow.css'

interface ProjectDiagnosticsPanelProps {
  projectInfo: SolanaProjectInfo | null
}

function statusClass(status: SolanaDiagnosticCheck['status']): 'live' | 'partial' | 'setup' {
  if (status === 'ready') return 'live'
  if (status === 'warning') return 'partial'
  return 'setup'
}

function statusLabel(status: SolanaDiagnosticCheck['status']): string {
  if (status === 'ready') return 'Ready'
  if (status === 'warning') return 'Review'
  return 'Missing'
}

function CheckRow({ check }: { check: SolanaDiagnosticCheck }) {
  return (
    <div className={`solana-ide-check${check.status === 'ready' ? '' : ' warning'}`}>
      <span className="solana-ide-check-dot" />
      <div className="solana-diagnostic-row-main">
        <div className="solana-diagnostic-row-title">
          <span className="solana-ide-check-title">{check.label}</span>
          <span className={`solana-runtime-status ${statusClass(check.status)}`}>{statusLabel(check.status)}</span>
        </div>
        <div className="solana-ide-check-detail">{check.detail}</div>
        {check.evidence && <code className="solana-ide-command">{check.evidence}</code>}
        {check.command && <code className="solana-ide-command">{check.command}</code>}
      </div>
    </div>
  )
}

export function ProjectDiagnosticsPanel({ projectInfo }: ProjectDiagnosticsPanelProps) {
  const diagnostics = projectInfo?.diagnostics

  if (!projectInfo?.isSolanaProject || !diagnostics) {
    return (
      <div className="solana-ide-surface">
        <div className="solana-ide-hero">
          <div>
            <div className="solana-token-launch-kicker">Project Diagnostics</div>
            <h3 className="solana-token-launch-title">Open a Solana repo to inspect program drift</h3>
            <p className="solana-token-launch-copy">
              DAEMON will check Anchor.toml, programs/, declare_id!, generated IDLs, and deploy keypairs once a Solana project is active.
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
          <div className="solana-token-launch-kicker">Project Diagnostics</div>
          <h3 className="solana-token-launch-title">Anchor and program drift checks</h3>
          <p className="solana-token-launch-copy">
            DAEMON compares project files and generated artifacts so deploy issues are visible before you ship.
          </p>
        </div>
        <div className="solana-project-score" aria-label={`${diagnostics.issueCount} Solana diagnostics to review`}>
          <span className="solana-project-score-value">{diagnostics.issueCount}</span>
          <span className="solana-project-score-label">Issues</span>
        </div>
      </div>

      <div className="solana-ide-grid three">
        <section className="solana-ide-card emphasis">
          <div className="solana-ide-card-title">Project status</div>
          <div className="solana-ide-card-copy">
            {diagnostics.status === 'ready' ? 'No drift detected in scanned artifacts.' : 'Review warnings before build, deploy, or IDL upgrade.'}
          </div>
          <span className={`solana-runtime-status ${statusClass(diagnostics.status)}`}>{statusLabel(diagnostics.status)}</span>
        </section>
        <section className="solana-ide-card">
          <div className="solana-ide-card-title">Programs discovered</div>
          <div className="solana-ide-card-copy">{diagnostics.programCount} program{diagnostics.programCount === 1 ? '' : 's'} found from programs/ and Anchor.toml.</div>
        </section>
        <section className="solana-ide-card warning">
          <div className="solana-ide-card-title">Deploy readiness</div>
          <div className="solana-ide-card-copy">Program ID, IDL, and keypair drift should be resolved before any mainnet upgrade.</div>
        </section>
      </div>

      <section className="solana-ide-panel">
        <div className="solana-ide-panel-title">Workspace checks</div>
        <div className="solana-ide-checklist">
          {diagnostics.checks.map((check) => <CheckRow key={check.id} check={check} />)}
        </div>
      </section>

      {diagnostics.programs.map((program) => (
        <section key={program.name} className="solana-ide-panel">
          <div className="solana-ide-panel-title">Program: {program.name}</div>
          <div className="solana-ide-grid three">
            <div className="solana-ide-card">
              <div className="solana-ide-card-title">Anchor.toml</div>
              <div className="solana-ide-card-copy">{program.anchorProgramId ?? 'Not declared'}</div>
            </div>
            <div className="solana-ide-card">
              <div className="solana-ide-card-title">declare_id!</div>
              <div className="solana-ide-card-copy">{program.declareId ?? 'Not found'}</div>
            </div>
            <div className="solana-ide-card">
              <div className="solana-ide-card-title">Generated IDL</div>
              <div className="solana-ide-card-copy">{program.idlAddress ?? 'Not found'}</div>
            </div>
          </div>
          <div className="solana-ide-checklist">
            {program.checks.map((check) => <CheckRow key={`${program.name}-${check.id}`} check={check} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
