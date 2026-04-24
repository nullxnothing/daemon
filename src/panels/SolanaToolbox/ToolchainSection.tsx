import { useState } from 'react'
import { useAppActions } from '../../store/appActions'
import type { SolanaToolchainStatus } from '../../store/solanaToolbox'
import { useUIStore } from '../../store/ui'
import { getSolanaToolingGuide } from './toolingGuides'

interface ToolchainSectionProps {
  toolchain: SolanaToolchainStatus | null
  projectId: string | null
  projectPath: string | null
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

export function ToolchainSection({ toolchain, projectId, projectPath }: ToolchainSectionProps) {
  const addTerminal = useUIStore((s) => s.addTerminal)
  const focusTerminal = useAppActions((s) => s.focusTerminal)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  if (!toolchain) return null

  async function handleRunCommand(command: string, label: string) {
    if (!projectId || !projectPath) {
      setActionMessage('Open a project before asking DAEMON to run Solana setup commands.')
      return
    }

    const terminalRes = await window.daemon.terminal.create({
      cwd: projectPath,
      startupCommand: command,
      userInitiated: true,
    })

    if (!terminalRes.ok || !terminalRes.data) {
      setActionMessage(terminalRes.error ?? `Could not open the ${label} terminal.`)
      return
    }

    addTerminal(projectId, terminalRes.data.id, label, terminalRes.data.agentId)
    focusTerminal()
    setActionMessage(`${label} opened in a project terminal.`)
    void window.daemon.activity.appendSolana({
      kind: 'setup-action',
      status: 'confirmed',
      title: label,
      detail: `${label} opened in a project terminal.`,
      fromAddress: 'solana-toolbox',
      metadata: {
        projectId,
        projectPath,
        command,
        terminalId: terminalRes.data.id,
      },
    })
  }

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
          const guide = getSolanaToolingGuide(
            tool.key === 'solanaCli'
              ? 'solana-cli'
              : tool.key === 'testValidator'
                ? 'surfpool'
                : tool.key,
            { avmInstalled: toolchain.avm.installed, hasProject: Boolean(projectPath) },
          )
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
              <div className="solana-toolchain-version">{detail}</div>
              {(tool.key !== 'testValidator' || !toolchain.surfpool.installed) && (
                <div className="solana-runtime-actions">
                  {!installed && guide.installCommand && guide.installLabel && (
                    <button
                      type="button"
                      className="sol-btn green"
                      onClick={() => void handleRunCommand(guide.installCommand!, guide.installLabel!)}
                    >
                      {guide.installLabel}
                    </button>
                  )}
                  <button
                    type="button"
                    className="sol-btn secondary"
                    onClick={() => void window.daemon.shell.openExternal(guide.docsUrl)}
                  >
                    {guide.docsLabel}
                  </button>
                </div>
              )}
            </section>
          )
        })}
      </div>
      {actionMessage && <div className="solana-toolchain-feedback">{actionMessage}</div>}
    </div>
  )
}
