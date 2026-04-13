import { useUIStore } from '../../store/ui'
import { useSolanaToolboxStore } from '../../store/solanaToolbox'
import { useWorkflowShellStore } from '../../store/workflowShell'
import './SolanaOnboardingBanner.css'

const FRAMEWORK_LABELS: Record<string, string> = {
  anchor: 'Anchor',
  native: 'Native Solana',
  'client-only': 'Solana Client',
}

export function SolanaOnboardingBanner() {
  const projectInfo = useSolanaToolboxStore((s) => s.projectInfo)
  const dismissed = useSolanaToolboxStore((s) => s.dismissed)
  const dismiss = useSolanaToolboxStore((s) => s.dismiss)
  const setDrawerTool = useWorkflowShellStore((s) => s.setDrawerTool)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const toggleMcp = useSolanaToolboxStore((s) => s.toggleMcp)
  const mcps = useSolanaToolboxStore((s) => s.mcps)

  if (!projectInfo?.isSolanaProject || dismissed) return null

  const frameworkLabel = FRAMEWORK_LABELS[projectInfo.framework ?? ''] ?? 'Solana'

  const handleEnableSuggested = () => {
    if (!activeProjectPath) return
    for (const mcpName of projectInfo.suggestedMcps) {
      const mcp = mcps.find((m) => m.name === mcpName)
      if (mcp && !mcp.enabled) {
        void toggleMcp(activeProjectPath, mcpName, true)
      }
    }
    dismiss()
  }

  return (
    <div className="solana-onboarding-banner">
      <div className="solana-onboarding-left">
        <span className="solana-onboarding-dot" />
        <span className="solana-onboarding-framework">{frameworkLabel}</span>
        <span>project detected</span>
      </div>
      <div className="solana-onboarding-actions">
        {projectInfo.suggestedMcps.length > 0 && (
          <button className="solana-onboarding-btn" onClick={handleEnableSuggested}>
            Enable Suggested MCPs
          </button>
        )}
        <button className="solana-onboarding-btn" onClick={() => { useUIStore.getState().openWorkspaceTool('project-readiness'); dismiss() }}>
          Open Readiness
        </button>
        <button className="solana-onboarding-btn dismiss" onClick={dismiss}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
