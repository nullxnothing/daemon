import { useOnboardingStore } from '../../../store/onboarding'
import { useUIStore } from '../../../store/ui'

export function StepWalletRuntime() {
  const advanceStep = useOnboardingStore((s) => s.advanceStep)
  const setStepStatus = useOnboardingStore((s) => s.setStepStatus)
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)

  const complete = (openWallet: boolean) => {
    if (openWallet) openWorkspaceTool('wallet')
    setStepStatus('runtime', 'complete')
    advanceStep()
  }

  return (
    <div className="wizard-api-section">
      <div className="wizard-checks">
        <div className="wizard-check">
          <span className="wizard-dot green" />
          <div className="wizard-check-label-wrap">
            <span className="wizard-check-label">Devnet is the default</span>
            <span className="wizard-check-desc">New Solana workspaces start on devnet; mainnet actions need explicit review.</span>
          </div>
        </div>
        <div className="wizard-check">
          <span className="wizard-dot pulse" />
          <div className="wizard-check-label-wrap">
            <span className="wizard-check-label">Wallet and RPC are separate checks</span>
            <span className="wizard-check-desc">Connect a wallet, pick RPC, then DAEMON can show clear previews and receipts.</span>
          </div>
        </div>
      </div>
      <div className="wizard-btn-row">
        <button type="button" className="wizard-btn primary" onClick={() => complete(true)}>
          Open Wallet Setup
        </button>
        <button type="button" className="wizard-btn secondary" onClick={() => complete(false)}>
          Use Devnet Defaults
        </button>
      </div>
    </div>
  )
}
