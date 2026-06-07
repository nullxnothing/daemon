import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { useUIStore } from '../../store/ui'
import { useSolanaToolboxStore } from '../../store/solanaToolbox'
import { IntegrationCommandCenter } from '../IntegrationCommandCenter/IntegrationCommandCenter'
import { integrationsForPackId } from '../IntegrationCommandCenter/packPartition'
import { PackHostShell } from '../../components/PackHostShell/PackHostShell'
import { UnderlineTabs } from '../../components/Panel'

const BlockScanner = lazy(() => import('../BlockScanner/BlockScanner'))
const ReplayEngine = lazy(() => import('../ReplayEngine/ReplayEngine').then((m) => ({ default: m.ReplayEngine })))
const MetaplexDemoPanel = lazy(() => import('../MetaplexDemo/MetaplexDemoPanel').then((m) => ({ default: m.MetaplexDemoPanel })))
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
    id: 'scanner',
    label: 'Scanner',
    summary: 'Solana block and account explorer',
  },
  {
    id: 'replay',
    label: 'Replay',
    summary: 'Replay any transaction with on-chain context',
  },
  {
    id: 'metaplex',
    label: 'Metaplex',
    summary: 'Core, DAS, and Agent Registry demo',
  },
  {
    id: 'debug',
    label: 'Debug',
    summary: 'Toolchain readiness and environment checks',
  },
] as const

// Views that render a full self-contained panel and should bypass the
// project-empty wrapper / loading state.
const EMBEDDED_VIEWS = new Set(['integrations', 'scanner', 'replay', 'metaplex'])

type SolanaView = (typeof SOLANA_VIEWS)[number]['id']

// Top-level pack tabs group the 10 views into 6 legible sections. Connect owns
// its integrations sub-view; Explore owns the on-chain explorers.
const SOLANA_TOP_TABS = [
  { id: 'start', label: 'Start' },
  { id: 'connect', label: 'Connect' },
  { id: 'build', label: 'Build' },
  { id: 'launch', label: 'Launch' },
  { id: 'explore', label: 'Explore' },
  { id: 'debug', label: 'Debug' },
] as const
type SolanaTopTab = (typeof SOLANA_TOP_TABS)[number]['id']

// Secondary segments shown inside a top tab that owns multiple views.
const CONNECT_SEGMENTS = [
  { id: 'connect', label: 'Providers' },
  { id: 'integrations', label: 'Integrations' },
] as const
const EXPLORE_SEGMENTS = [
  { id: 'inspect', label: 'Inspect' },
  { id: 'scanner', label: 'Scanner' },
  { id: 'replay', label: 'Replay' },
  { id: 'metaplex', label: 'Metaplex' },
] as const

// Map an internal view to the top tab that owns it.
const VIEW_TO_TOP: Record<SolanaView, SolanaTopTab> = {
  start: 'start',
  connect: 'connect',
  integrations: 'connect',
  build: 'build',
  launch: 'launch',
  inspect: 'explore',
  scanner: 'explore',
  replay: 'explore',
  metaplex: 'explore',
  debug: 'debug',
}

// Default view to land on when a top tab is clicked.
const TOP_TO_VIEW: Record<SolanaTopTab, SolanaView> = {
  start: 'start',
  connect: 'connect',
  build: 'build',
  launch: 'launch',
  explore: 'inspect',
  debug: 'debug',
}

// Secondary segment row for top tabs that own multiple views (Connect, Explore).
function SolanaSegmentRow({
  segments,
  activeId,
  onChange,
}: {
  segments: ReadonlyArray<{ id: SolanaView; label: string }>
  activeId: SolanaView
  onChange: (id: SolanaView) => void
}) {
  return (
    <div className="solana-segment-row">
      <UnderlineTabs
        tabs={segments.map((s) => ({ id: s.id, label: s.label }))}
        activeId={activeId}
        onChange={onChange}
      />
    </div>
  )
}

export function SolanaToolbox() {
  const [activeView, setActiveView] = useState<SolanaView>('start')
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

  // Honor a deep-link sub-view (folded tools like block-scanner/replay/metaplex
  // and the legacy 'integrations' tool alias here).
  useEffect(() => {
    if (!pendingSubView) return
    if (SOLANA_VIEWS.some((view) => view.id === pendingSubView)) {
      setActiveView(pendingSubView as (typeof SOLANA_VIEWS)[number]['id'])
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
      <PackHostShell
        kicker="Solana pack"
        title="Solana Workflow"
        subtitle="Scaffold, connect, build, launch, and explore Solana — one AI-native flow."
        tabs={SOLANA_TOP_TABS.map((t) => ({ id: t.id, label: t.label }))}
        activeId={VIEW_TO_TOP[activeView]}
        onChange={(top) => setActiveView(TOP_TO_VIEW[top])}
      >
        {!EMBEDDED_VIEWS.has(activeView) && (
          <>
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
          </>
        )}

        {VIEW_TO_TOP[activeView] === 'connect' && (
          <SolanaSegmentRow
            segments={CONNECT_SEGMENTS}
            activeId={activeView}
            onChange={setActiveView}
          />
        )}
        {VIEW_TO_TOP[activeView] === 'explore' && (
          <SolanaSegmentRow
            segments={EXPLORE_SEGMENTS}
            activeId={activeView}
            onChange={setActiveView}
          />
        )}

        <div className="solana-view-panel">
          {!EMBEDDED_VIEWS.has(activeView) && (!activeProjectPath || (projectInfo && !projectInfo.isSolanaProject)) && (
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

          {!EMBEDDED_VIEWS.has(activeView) && activeProjectPath && loading && (
            <div className="solana-loading-state" role="status">
              Checking Solana project files, MCPs, and toolchain status...
            </div>
          )}

          {activeView === 'scanner' && (
            <div className="solana-integrations-view">
              <Suspense fallback={<div className="solana-loading-state" role="status">Loading scanner…</div>}>
                <BlockScanner />
              </Suspense>
            </div>
          )}

          {activeView === 'replay' && (
            <div className="solana-integrations-view">
              <Suspense fallback={<div className="solana-loading-state" role="status">Loading replay…</div>}>
                <ReplayEngine />
              </Suspense>
            </div>
          )}

          {activeView === 'metaplex' && (
            <div className="solana-integrations-view">
              <Suspense fallback={<div className="solana-loading-state" role="status">Loading Metaplex…</div>}>
                <MetaplexDemoPanel />
              </Suspense>
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
      </PackHostShell>
    </div>
  )
}

export default SolanaToolbox
