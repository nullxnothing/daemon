import type { SolanaMcpEntry } from '../../store/solanaToolbox'

interface PaymentSectionProps {
  mcps: SolanaMcpEntry[]
  projectPath: string | null
  onToggle: (projectPath: string, name: string, enabled: boolean) => void
  onScaffoldX402: () => void
  onScaffoldMpp: () => void
}

export function PaymentSection({ mcps, projectPath, onToggle, onScaffoldX402, onScaffoldMpp }: PaymentSectionProps) {
  const payaiMcp = mcps.find((m) => m.name === 'payai-mcp-server')
  const x402Mcp = mcps.find((m) => m.name === 'x402-mcp')
  const paymentEnabled = payaiMcp?.enabled || x402Mcp?.enabled

  return (
    <div className="solana-section">
      <div className="solana-section-title">Payment Protocols</div>

      <div className="solana-payment-card">
        <div className="solana-payment-header">
          <span className="solana-payment-name">x402 / PayAI</span>
          <span className={`solana-dot ${paymentEnabled ? 'green' : 'grey'}`} />
        </div>
        <div className="solana-payment-desc">
          HTTP 402 micropayments with USDC. Monetize APIs with pay-per-request pricing.
        </div>
        <div className="solana-btn-row">
          {!paymentEnabled && projectPath && (
            <button
              className="solana-btn primary"
              onClick={() => {
                if (payaiMcp && !payaiMcp.enabled) onToggle(projectPath, 'payai-mcp-server', true)
                if (x402Mcp && !x402Mcp.enabled) onToggle(projectPath, 'x402-mcp', true)
              }}
            >
              Enable MCPs
            </button>
          )}
          <button className="solana-btn" onClick={onScaffoldX402} disabled={!projectPath}>
            Add x402 Middleware
          </button>
        </div>
      </div>

      <div className="solana-payment-card">
        <div className="solana-payment-header">
          <span className="solana-payment-name">MPP (Machine Payments)</span>
          <span className="solana-dot green" />
        </div>
        <div className="solana-payment-desc">
          Autonomous agent-to-agent payments on Solana via Stripe x Tempo. Context auto-injected for Solana agents.
        </div>
        <div className="solana-btn-row">
          <button className="solana-btn" onClick={onScaffoldMpp} disabled={!projectPath}>
            Add MPP Client
          </button>
        </div>
      </div>
    </div>
  )
}
