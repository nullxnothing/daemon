import { useUIStore } from '../../store/ui'
import type { SolanaProjectInfo, SolanaToolchainStatus, ValidatorState } from '../../store/solanaToolbox'
import './SolanaIdeWorkflow.css'

interface BuildDeployPanelProps {
  projectId: string | null
  projectPath: string | null
  projectInfo: SolanaProjectInfo | null
  toolchain: SolanaToolchainStatus | null
  validator: ValidatorState
}

interface WorkflowCommand {
  id: string
  title: string
  detail: string
  command: string
  requiresProject?: boolean
  preferredFor?: Array<SolanaProjectInfo['framework']>
}

const BUILD_COMMANDS: WorkflowCommand[] = [
  {
    id: 'anchor-build',
    title: 'Anchor build',
    detail: 'Compile Anchor programs and generate fresh IDL artifacts.',
    command: 'anchor build',
    requiresProject: true,
    preferredFor: ['anchor'],
  },
  {
    id: 'anchor-test',
    title: 'Anchor test',
    detail: 'Run the canonical Anchor test loop from the active workspace.',
    command: 'anchor test',
    requiresProject: true,
    preferredFor: ['anchor'],
  },
  {
    id: 'cargo-test',
    title: 'Cargo test',
    detail: 'Run native Rust tests for program crates and utilities.',
    command: 'cargo test',
    requiresProject: true,
    preferredFor: ['native', 'anchor'],
  },
  {
    id: 'pnpm-test',
    title: 'Client tests',
    detail: 'Run TypeScript/client test scripts when the project exposes them.',
    command: 'pnpm test',
    requiresProject: true,
    preferredFor: ['client-only', 'anchor'],
  },
]

const DEPLOY_COMMANDS: WorkflowCommand[] = [
  {
    id: 'anchor-deploy-devnet',
    title: 'Anchor deploy to devnet',
    detail: 'Deploy through Anchor after build/test passes. Confirm cluster and upgrade authority first.',
    command: 'solana config set --url devnet && anchor deploy',
    requiresProject: true,
    preferredFor: ['anchor'],
  },
  {
    id: 'native-program-deploy',
    title: 'Native program deploy',
    detail: 'Deploy a compiled SBF program. Replace the target path with the actual artifact.',
    command: 'solana program deploy ./target/deploy/<program>.so --url devnet',
    requiresProject: true,
    preferredFor: ['native'],
  },
  {
    id: 'idl-upgrade',
    title: 'IDL upgrade',
    detail: 'Update the on-chain IDL after reviewing instruction/account changes.',
    command: 'anchor idl upgrade --provider.cluster devnet --filepath target/idl/<program>.json <PROGRAM_ID>',
    requiresProject: true,
    preferredFor: ['anchor'],
  },
]

function isCommandPreferred(command: WorkflowCommand, projectInfo: SolanaProjectInfo | null): boolean {
  if (!command.preferredFor || !projectInfo?.framework) return true
  return command.preferredFor.includes(projectInfo.framework)
}

function terminalLabel(command: WorkflowCommand): string {
  if (command.id.includes('deploy')) return 'Solana Deploy'
  if (command.id.includes('test')) return 'Solana Test'
  if (command.id.includes('build')) return 'Solana Build'
  return 'Solana Workflow'
}

function safetyChecks(projectInfo: SolanaProjectInfo | null, toolchain: SolanaToolchainStatus | null, validator: ValidatorState) {
  const isProgram = projectInfo?.framework === 'anchor' || projectInfo?.framework === 'native'
  return [
    {
      title: 'Build/test before deploy',
      detail: isProgram ? 'Run a local build and test pass before any devnet or mainnet deploy.' : 'Open a program workspace before deploy actions are considered safe.',
      warning: !isProgram,
    },
    {
      title: 'Confirm cluster explicitly',
      detail: 'DAEMON should make devnet/mainnet/localnet visible before deploy. This panel uses explicit command text for now.',
      warning: false,
    },
    {
      title: 'Verify upgrade authority',
      detail: 'Before mainnet deploy, confirm the upgrade authority is intentional and not a throwaway hot wallet.',
      warning: true,
    },
    {
      title: 'Check IDL and program ID drift',
      detail: projectInfo?.framework === 'anchor' ? 'Review Anchor.toml, declare_id!, generated IDL, and deployed program ID before upgrade.' : 'For native programs, confirm artifact path, program ID, and authority before deploy.',
      warning: false,
    },
    {
      title: 'Local runtime available',
      detail: validator.status === 'running' ? 'A local runtime is running for pre-deploy testing.' : 'Start Surfpool or solana-test-validator before testing local transaction paths.',
      warning: validator.status !== 'running',
    },
    {
      title: 'Toolchain installed',
      detail: toolchain?.solanaCli.installed ? 'Solana CLI detected.' : 'Solana CLI is missing, so deploy commands cannot run successfully yet.',
      warning: !toolchain?.solanaCli.installed,
    },
  ]
}

export function BuildDeployPanel({ projectId, projectPath, projectInfo, toolchain, validator }: BuildDeployPanelProps) {
  const addTerminal = useUIStore((s) => s.addTerminal)
  const canRun = Boolean(projectId && projectPath)
  const visibleBuildCommands = BUILD_COMMANDS.filter((command) => isCommandPreferred(command, projectInfo))
  const visibleDeployCommands = DEPLOY_COMMANDS.filter((command) => isCommandPreferred(command, projectInfo))
  const checks = safetyChecks(projectInfo, toolchain, validator)

  const runCommand = async (command: WorkflowCommand | undefined) => {
    if (!projectId || !projectPath || !command) return
    const res = await window.daemon.terminal.create({
      cwd: projectPath,
      startupCommand: command.command,
      userInitiated: true,
    })
    if (res.ok && res.data) {
      addTerminal(projectId, res.data.id, terminalLabel(command))
    }
  }

  return (
    <div className="solana-ide-surface">
      <div className="solana-ide-hero">
        <div>
          <div className="solana-token-launch-kicker">Build / Test / Deploy</div>
          <h3 className="solana-token-launch-title">Make DAEMON own the Solana program loop</h3>
          <p className="solana-token-launch-copy">
            Run the core program workflow from the active repo, with deploy actions kept behind explicit safety reminders.
          </p>
        </div>
        <div className="solana-ide-hero-actions">
          <button className="sol-btn green" disabled={!canRun || visibleBuildCommands.length === 0} onClick={() => void runCommand(visibleBuildCommands[0])}>
            Run First Build
          </button>
        </div>
      </div>

      <div className="solana-ide-grid">
        <section className="solana-ide-panel">
          <div className="solana-ide-panel-title">Build and Test Commands</div>
          <p className="solana-ide-panel-copy">These run in a real DAEMON terminal from the active project path.</p>
          <div className="solana-ide-grid">
            {visibleBuildCommands.map((command) => (
              <div key={command.id} className="solana-ide-card emphasis">
                <div className="solana-ide-card-title">{command.title}</div>
                <div className="solana-ide-card-copy">{command.detail}</div>
                <code className="solana-ide-command">{command.command}</code>
                <div className="solana-ide-card-actions">
                  <button className="sol-btn green" disabled={!canRun} onClick={() => void runCommand(command)}>
                    Run
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="solana-ide-panel">
          <div className="solana-ide-panel-title">Deploy and IDL Commands</div>
          <p className="solana-ide-panel-copy">These are intentionally explicit. Mainnet deploy should stay manual until full safety checks are implemented.</p>
          <div className="solana-ide-grid">
            {visibleDeployCommands.map((command) => (
              <div key={command.id} className="solana-ide-card warning">
                <div className="solana-ide-card-title">{command.title}</div>
                <div className="solana-ide-card-copy">{command.detail}</div>
                <code className="solana-ide-command">{command.command}</code>
                <div className="solana-ide-card-actions">
                  <button className="sol-btn" disabled={!canRun} onClick={() => void runCommand(command)}>
                    Open Terminal
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="solana-ide-panel">
        <div className="solana-ide-panel-title">Deploy Safety Checklist</div>
        <div className="solana-ide-checklist">
          {checks.map((check) => (
            <div key={check.title} className={`solana-ide-check${check.warning ? ' warning' : ''}`}>
              <span className="solana-ide-check-dot" />
              <div>
                <div className="solana-ide-check-title">{check.title}</div>
                <div className="solana-ide-check-detail">{check.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
