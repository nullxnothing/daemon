import { useEffect } from 'react'
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

export function SolanaToolbox() {
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
      <div className="solana-validator-zone">
        <ValidatorCard />
      </div>

      <div className="solana-validator-zone">
        <ToolchainSection toolchain={toolchain} />
      </div>

      <div className="solana-split">
        <ConnectedServices
          mcps={mcps}
          projectPath={activeProjectPath}
          onToggle={toggleMcp}
        />
        <CapabilitiesSection
          mcps={mcps}
          projectPath={activeProjectPath}
          onToggle={toggleMcp}
          onScaffoldX402={handleScaffoldX402}
          onScaffoldMpp={handleScaffoldMpp}
        />
      </div>

      <div className="solana-validator-zone">
        <DaemonRuntimeSection mcps={mcps} toolchain={toolchain} />
      </div>

      <div className="solana-validator-zone">
        <RuntimeStackSection />
      </div>

      <div className="solana-validator-zone">
        <ProtocolPacksSection />
      </div>

      <div className="solana-validator-zone">
        <EcosystemSection />
      </div>
    </div>
  )
}

export default SolanaToolbox
