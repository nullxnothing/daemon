import { useEffect } from 'react'
import { useUIStore } from '../../store/ui'
import { useSolanaToolboxStore } from '../../store/solanaToolbox'
import { EnvironmentBar } from './EnvironmentBar'
import { ValidatorCard } from './ValidatorCard'
import { ConnectedServices } from './ConnectedServices'
import { CapabilitiesSection } from './CapabilitiesSection'
import { scaffoldX402, scaffoldMpp } from './scaffolding'
import './SolanaToolbox.css'

export function SolanaToolbox() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const mcps = useSolanaToolboxStore((s) => s.mcps)
  const projectInfo = useSolanaToolboxStore((s) => s.projectInfo)
  const validator = useSolanaToolboxStore((s) => s.validator)
  const loadMcps = useSolanaToolboxStore((s) => s.loadMcps)
  const toggleMcp = useSolanaToolboxStore((s) => s.toggleMcp)
  const detectProject = useSolanaToolboxStore((s) => s.detectProject)
  const refreshValidatorStatus = useSolanaToolboxStore((s) => s.refreshValidatorStatus)

  useEffect(() => {
    if (activeProjectPath) {
      void loadMcps(activeProjectPath)
      void detectProject(activeProjectPath)
    }
  }, [activeProjectPath, loadMcps, detectProject])

  useEffect(() => {
    void refreshValidatorStatus()
  }, [refreshValidatorStatus])

  const handleScaffoldX402 = () => {
    if (activeProjectId) void scaffoldX402(activeProjectId)
  }

  const handleScaffoldMpp = () => {
    if (activeProjectId) void scaffoldMpp(activeProjectId)
  }

  return (
    <div className="solana-toolbox">
      <EnvironmentBar info={projectInfo} validator={validator} mcps={mcps} />

      <div className="solana-validator-zone">
        <ValidatorCard />
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
    </div>
  )
}

export default SolanaToolbox
