import { useEffect, useMemo, useState } from 'react'
import { useUIStore } from '../../store/ui'
import { useSolanaToolboxStore } from '../../store/solanaToolbox'
import { IntegrationCommandCenter } from '../IntegrationCommandCenter/IntegrationCommandCenter'
import { integrationsForPackId } from '../IntegrationCommandCenter/packPartition'
import { EnvironmentBar } from './EnvironmentBar'
import { ValidatorCard } from './ValidatorCard'
import { ConnectedServices } from './ConnectedServices'
import { CapabilitiesSection } from './CapabilitiesSection'
import { EcosystemSection } from './EcosystemSection'
import { RuntimeStackSection } from './RuntimeStackSection'
import { DaemonRuntimeSection } from './DaemonRuntimeSection'
import { ToolchainSection } from './ToolchainSection'
import { ProtocolPacksSection } from './ProtocolPacksSection'
import { ProjectControlCenter } from './ProjectControlCenter'
import { ProjectDiagnosticsPanel } from './ProjectDiagnosticsPanel'
import { ProgramMonitorPanel } from './ProgramMonitorPanel'
import { BuildDeployPanel } from './BuildDeployPanel'
import { TransactionInspector } from './TransactionInspector'
import { SolanaReadinessStrip } from './SolanaReadinessStrip'
import { scaffoldX402, scaffoldMpp, scaffoldLightProtocol, scaffoldMagicBlock, scaffoldDebridge, scaffoldSquads } from './scaffolding'
import { getSolanaProjectEmptyCopy, getSolanaProjectEmptyTitle } from './solanaToolboxCopy'
import type { SolanaReadinessActionTarget } from '../../lib/solanaReadiness'
import './SolanaToolbox.css'

const SOLANA_VIEWS = [
  {
    id: 'start',
    label: 'Start',
    summary: 'Readiness, runtime, and first moves',
  },
  {
    id: 'connect',
    label: 'Connect',
    summary: 'Wallet, RPC, providers, and MCPs',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    summary: 'Browse and wire Solana RPC, NFT, and DeFi integrations',
  },
  {
    id: 'build',
    label: 'Build',
    summary: 'Build, test, deploy, Shipline proof',
  },
  {
    id: 'launch',
    label: 'Launch',
    summary: 'Protocol flows and launch-oriented surfaces',
  },
  {
    id: 'inspect',
    label: 'Inspect',
    summary: 'Transactions, programs, and receipts',
  },
  {
    id: 'debug',
    label: 'Debug',
    summary: 'Toolchain readiness and environment checks',
  },
] as const

export function SolanaToolbox() {
  const [activeView, setActiveView] = useState<(typeof SOLANA_VIEWS)[number]['id']>('start')
  const pendingSubView = useUIStore((s) => s.pendingSubView)
  const setPendingSubView = useUIStore((s) => s.setPendingSubView)
  const solanaIntegrations = useMemo(() => integrationsForPackId('solana'), [])
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const mcps = useSolanaToolboxStore((s) => s.mcps)
  const projectInfo = useSolanaToolboxStore((s) => s.projectInfo)
  const toolchain = useSolanaToolboxStore((s) => s.toolchain)
  const validator = useSolanaToolboxStore((s) => s.validator)
  const loadMcps = useSolanaToolboxStore((s) => s.loadMcps)
  const toggleMcp = useSolanaToolboxStore((s) => s.toggleMcp)
  const startValidator = useSolanaToolboxStore((s) => s.startValidator)
  const detectProject = useSolanaToolboxStore((s) => s.detectProject)
  const loadToolchain = useSolanaToolboxStore((s) => s.loadToolchain)
  const refreshValidatorStatus = useSolanaToolboxStore((s) => s.refreshValidatorStatus)
  const loading = useSolanaToolboxStore((s) => s.loading)
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)

  useEffect(() => {
    if (!activeProjectPath) return

    const needsMcps = activeView === 'start' || activeView === 'connect'
    const needsProjectDiagnostics = activeView === 'start' || activeView === 'build' || activeView === 'inspect' || activeView === 'debug'
    const needsToolchain = activeView === 'start' || activeView === 'debug' || activeView === 'build'

    if (needsMcps) void loadMcps(activeProjectPath)
    if (needsProjectDiagnostics) void detectProject(activeProjectPath)
    if (needsToolchain) void loadToolchain(activeProjectPath)
  }, [activeProjectPath, activeView, loadMcps, detectProject, loadToolchain])

  useEffect(() => {
    void refreshValidatorStatus()
  }, [refreshValidatorStatus])

  // Honor a deep-link sub-view (e.g. the legacy 'integrations' tool aliased here).
  useEffect(() => {
    if (pendingSubView === 'integrations') {
      setActiveView('integrations')
      setPendingSubView(null)
    }
  }, [pendingSubView, setPendingSubView])

  const handleScaffoldX402 = () => {
    if (activeProjectId) void scaffoldX402(activeProjectId)
  }

  const handleScaffoldMpp = () => {
    if (activeProjectId) void scaffoldMpp(activeProjectId)
  }

  const handleScaffoldLight = () => {
    if (activeProjectId) void scaffoldLightProtocol(activeProjectId)
  }

  const handleScaffoldMagicBlock = () => {
    if (activeProjectId) void scaffoldMagicBlock(activeProjectId)
  }

  const handleScaffoldDebridge = () => {
    if (activeProjectId) void scaffoldDebridge(activeProjectId)
  }

  const handleScaffoldSquads = () => {
    if (activeProjectId) void scaffoldSquads(activeProjectId)
  }

  const handleReadinessAction = (target: SolanaReadinessActionTarget) => {
    if (target === 'wallet' || target === 'settings') {
      openWorkspaceTool('wallet')
      return
    }

    if (target === 'validator') {
      setActiveView('start')
      return
    }

    if (target === 'debug') {
      setActiveView('debug')
      return
    }

    if (target === 'connect') {
      setActiveView('connect')
      return
    }

    openWorkspaceTool('starter')
  }

  return (
    <div className="solana-toolbox">
      <EnvironmentBar info={projectInfo} validator={validator} mcps={mcps} toolchain={toolchain} />

      <SolanaReadinessStrip
        activeProjectPath={activeProjectPath}
        activeProjectId={activeProjectId}
        projectInfo={projectInfo}
        toolchain={toolchain}
        validator={validator}
        mcps={mcps}
        onAction={handleReadinessAction}
      />

      <section className="solana-workflow-shell">
        <div className="solana-workflow-header">
          <div>
            <div className="solana-token-launch-kicker">Solana Workspace</div>
            <h1 className="solana-workflow-title">Ship Solana apps from one AI-native workspace</h1>
            <p className="solana-workflow-copy">
              Open or scaffold a project, connect wallet and RPC, use project-aware agents, build safely, and keep deploy proof in one focused flow.
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
          {activeView !== 'integrations' && (!activeProjectPath || (projectInfo && !projectInfo.isSolanaProject)) && (
            <section className="solana-project-empty-card">
              <div>
                <div className="solana-token-launch-kicker">{activeProjectPath ? 'Project context' : 'No project selected'}</div>
                <h2>{getSolanaProjectEmptyTitle(activeProjectPath)}</h2>
                <p>{getSolanaProjectEmptyCopy(activeProjectPath)}</p>
              </div>
              <div className="solana-project-empty-actions">
                <button type="button" className="sol-btn green" onClick={() => openWorkspaceTool('starter')}>
                  Open project starter
                </button>
                <button type="button" className="sol-btn" onClick={() => setActiveView('connect')}>
                  Check RPC and integrations
                </button>
              </div>
            </section>
          )}

          {activeProjectPath && loading && (
            <div className="solana-loading-state" role="status">
              Checking Solana project files, MCPs, and toolchain status...
            </div>
          )}

          {activeView === 'start' && (
            <>
              <div className="solana-validator-zone">
                <ProjectControlCenter
                  projectPath={activeProjectPath}
                  projectInfo={projectInfo}
                  toolchain={toolchain}
                  validator={validator}
                  mcps={mcps}
                  onStartValidator={(type) => { void startValidator(type) }}
                  onOpenDebug={() => setActiveView('debug')}
                  onOpenConnect={() => setActiveView('connect')}
                  onOpenLaunch={() => setActiveView('launch')}
                />
              </div>
              <div className="solana-validator-zone">
                <DaemonRuntimeSection mcps={mcps} toolchain={toolchain} />
              </div>
              <div className="solana-validator-zone">
                <ValidatorCard />
              </div>
              <div className="solana-validator-zone">
                <CapabilitiesSection
                  mcps={mcps}
                  projectPath={activeProjectPath}
                  onToggle={toggleMcp}
                  onScaffoldX402={handleScaffoldX402}
                  onScaffoldMpp={handleScaffoldMpp}
                  onScaffoldLight={handleScaffoldLight}
                  onScaffoldMagicBlock={handleScaffoldMagicBlock}
                  onScaffoldDebridge={handleScaffoldDebridge}
                  onScaffoldSquads={handleScaffoldSquads}
                />
              </div>
            </>
          )}

          {activeView === 'integrations' && (
            <div className="solana-integrations-view">
              <IntegrationCommandCenter filter={solanaIntegrations} />
            </div>
          )}

          {activeView === 'connect' && (
            <>
              <div className="solana-validator-zone">
                <ConnectedServices
                  mcps={mcps}
                  projectPath={activeProjectPath}
                  onToggle={toggleMcp}
                />
              </div>
              <div className="solana-validator-zone">
                <RuntimeStackSection />
              </div>
              <div className="solana-validator-zone">
                <CapabilitiesSection
                  mcps={mcps}
                  projectPath={activeProjectPath}
                  onToggle={toggleMcp}
                  onScaffoldX402={handleScaffoldX402}
                  onScaffoldMpp={handleScaffoldMpp}
                  onScaffoldLight={handleScaffoldLight}
                  onScaffoldMagicBlock={handleScaffoldMagicBlock}
                  onScaffoldDebridge={handleScaffoldDebridge}
                  onScaffoldSquads={handleScaffoldSquads}
                />
              </div>
            </>
          )}

          {activeView === 'build' && (
            <BuildDeployPanel
              projectId={activeProjectId}
              projectPath={activeProjectPath}
              projectInfo={projectInfo}
              toolchain={toolchain}
              validator={validator}
            />
          )}

          {activeView === 'inspect' && (
            <>
              <TransactionInspector
                projectId={activeProjectId}
                projectPath={activeProjectPath}
              />
              <ProgramMonitorPanel
                projectId={activeProjectId}
                projectPath={activeProjectPath}
                projectInfo={projectInfo}
              />
            </>
          )}

          {activeView === 'launch' && (
            <>
              <div className="solana-validator-zone">
                <ProtocolPacksSection />
              </div>
              <div className="solana-validator-zone">
                <EcosystemSection />
              </div>
            </>
          )}

          {activeView === 'debug' && (
            <>
              <ProjectDiagnosticsPanel projectInfo={projectInfo} />
              <div className="solana-validator-zone">
                <ToolchainSection toolchain={toolchain} />
              </div>
              <div className="solana-validator-zone">
                <ValidatorCard />
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

export default SolanaToolbox
