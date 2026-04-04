import { useEffect } from 'react'
import { useUIStore } from '../../store/ui'
import { useSolanaToolboxStore } from '../../store/solanaToolbox'
import { ProjectStatusSection } from './ProjectStatusSection'
import { ValidatorSection } from './ValidatorSection'
import { McpSection } from './McpSection'
import { PaymentSection } from './PaymentSection'
import { SkillsSection } from './SkillsSection'
import { scaffoldX402, scaffoldMpp } from './scaffolding'
import './SolanaToolbox.css'

export function SolanaToolbox() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const mcps = useSolanaToolboxStore((s) => s.mcps)
  const projectInfo = useSolanaToolboxStore((s) => s.projectInfo)
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
      <ProjectStatusSection info={projectInfo} />
      <ValidatorSection />
      <McpSection
        mcps={mcps}
        projectPath={activeProjectPath}
        onToggle={toggleMcp}
      />
      <PaymentSection
        mcps={mcps}
        projectPath={activeProjectPath}
        onToggle={toggleMcp}
        onScaffoldX402={handleScaffoldX402}
        onScaffoldMpp={handleScaffoldMpp}
      />
      <SkillsSection />
    </div>
  )
}

export default SolanaToolbox
