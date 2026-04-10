import { useEffect, useState } from 'react'
import { useUIStore } from '../../store/ui'
import { useSolanaToolboxStore } from '../../store/solanaToolbox'
import { EnvironmentBar } from './EnvironmentBar'
import { ValidatorCard } from './ValidatorCard'
import { ConnectedServices } from './ConnectedServices'
import { CapabilitiesSection } from './CapabilitiesSection'
import { EcosystemSection } from './EcosystemSection'
import { RuntimeStackSection } from './RuntimeStackSection'
import { DaemonRuntimeSection } from './DaemonRuntimeSection'
import { ToolchainSection } from './ToolchainSection'
import { ProtocolPacksSection } from './ProtocolPacksSection'
import { scaffoldX402, scaffoldMpp } from './scaffolding'
import './SolanaToolbox.css'

const SOLANA_VIEWS = [
  {
    id: 'overview',
    label: 'Overview',
    summary: 'Runtime, validator, and project state',
  },
  {
    id: 'connect',
    label: 'Connect',
    summary: 'Providers, MCPs, and wallet paths',
  },
  {
    id: 'build',
    label: 'Build',
    summary: 'Scaffolds, skills, and payment setup',
  },
  {
    id: 'integrate',
    label: 'Integrate',
    summary: 'Protocol packs and ecosystem coverage',
  },
  {
    id: 'diagnose',
    label: 'Diagnose',
    summary: 'Toolchain readiness and environment checks',
  },
] as const

export function SolanaToolbox() {
  const [activeView, setActiveView] = useState<(typeof SOLANA_VIEWS)[number]['id']>('overview')
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const mcps = useSolanaToolboxStore((s) => s.mcps)
  const projectInfo = useSolanaToolboxStore((s) => s.projectInfo)
  const toolchain = useSolanaToolboxStore((s) => s.toolchain)
  const validator = useSolanaToolboxStore((s) => s.validator)
  const loadMcps = useSolanaToolboxStore((s) => s.loadMcps)
  const toggleMcp = useSolanaToolboxStore((s) => s.toggleMcp)
  const detectProject = useSolanaToolboxStore((s) => s.detectProject)
  const loadToolchain = useSolanaToolboxStore((s) => s.loadToolchain)
  const refreshValidatorStatus = useSolanaToolboxStore((s) => s.refreshValidatorStatus)
  useEffect(() => {
    if (activeProjectPath) {
      void loadMcps(activeProjectPath)
      void detectProject(activeProjectPath)
      void loadToolchain(activeProjectPath)
    }
  }, [activeProjectPath, loadMcps, detectProject, loadToolchain])

  useEffect(() => {
    void refreshValidatorStatus()
    void loadToolchain(activeProjectPath ?? undefined)
  }, [refreshValidatorStatus, loadToolchain, activeProjectPath])

  const handleScaffoldX402 = () => {
    if (activeProjectId) void scaffoldX402(activeProjectId)
  }

  const handleScaffoldMpp = () => {
    if (activeProjectId) void scaffoldMpp(activeProjectId)
  }

  return (
    <div className="solana-toolbox">
      <EnvironmentBar info={projectInfo} validator={validator} mcps={mcps} toolchain={toolchain} />

      <section className="solana-workflow-shell">
        <div className="solana-workflow-header">
          <div>
            <div className="solana-token-launch-kicker">Solana Workspace</div>
            <h1 className="solana-workflow-title">Choose the task you need right now</h1>
            <p className="solana-workflow-copy">
              Keep DAEMON focused on the next Solana job instead of making you scroll through one oversized toolbox page.
            </p>
          </div>
        </div>

        <div className="solana-view-tabs" role="tablist" aria-label="Solana workflow views">
          {SOLANA_VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              role="tab"
              aria-selected={activeView === view.id}
              className={`solana-view-tab${activeView === view.id ? ' active' : ''}`}
              onClick={() => setActiveView(view.id)}
            >
              <span className="solana-view-tab-label">{view.label}</span>
              <span className="solana-view-tab-summary">{view.summary}</span>
            </button>
          ))}
        </div>

        <div className="solana-view-panel">
          {activeView === 'overview' && (
            <>
              <div className="solana-validator-zone">
                <ValidatorCard />
              </div>
              <div className="solana-validator-zone">
                <RuntimeStackSection />
              </div>
            </>
          )}

          {activeView === 'connect' && (
            <div className="solana-validator-zone">
              <ConnectedServices
                mcps={mcps}
                projectPath={activeProjectPath}
                onToggle={toggleMcp}
              />
            </div>
          )}

          {activeView === 'build' && (
            <div className="solana-validator-zone">
              <CapabilitiesSection
                mcps={mcps}
                projectPath={activeProjectPath}
                onToggle={toggleMcp}
                onScaffoldX402={handleScaffoldX402}
                onScaffoldMpp={handleScaffoldMpp}
              />
            </div>
          )}

          {activeView === 'integrate' && (
            <>
              <div className="solana-validator-zone">
                <DaemonRuntimeSection mcps={mcps} toolchain={toolchain} />
              </div>
              <div className="solana-validator-zone">
                <ProtocolPacksSection />
              </div>
              <div className="solana-validator-zone">
                <EcosystemSection />
              </div>
            </>
          )}

          {activeView === 'diagnose' && (
            <div className="solana-validator-zone">
              <ToolchainSection toolchain={toolchain} />
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default SolanaToolbox
