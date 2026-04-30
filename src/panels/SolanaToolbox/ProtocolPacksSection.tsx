import { useCallback, useState } from 'react'
import { SOLANA_PROTOCOL_PACKS } from './catalog'
import { useUIStore } from '../../store/ui'

const PACK_INTEGRATION_MAP: Partial<Record<string, string>> = {
  jupiter: 'jupiter',
  metaplex: 'metaplex',
  light: 'light-protocol',
  magicblock: 'magicblock',
  debridge: 'debridge',
  raydium: 'token-launch-stack',
  meteora: 'token-launch-stack',
}

export function ProtocolPacksSection() {
  const [copied, setCopied] = useState<string | null>(null)
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)
  const setIntegrationCommandSelectionId = useUIStore((s) => s.setIntegrationCommandSelectionId)

  const copyText = useCallback((value: string) => {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopied(value)
    setTimeout(() => setCopied(null), 1500)
  }, [])

  const openPackFlow = useCallback((packId: string) => {
    const integrationId = PACK_INTEGRATION_MAP[packId]
    if (integrationId) {
      setIntegrationCommandSelectionId(integrationId)
      openWorkspaceTool('integrations')
      return
    }

    openWorkspaceTool('solana-toolbox')
  }, [openWorkspaceTool, setIntegrationCommandSelectionId])

  return (
    <div className="solana-protocol-packs">
      <div className="solana-ecosystem-header">
        <div>
          <div className="solana-token-launch-kicker">Protocol Packs</div>
          <h3 className="solana-token-launch-title">Onboard ecosystem integrations deliberately</h3>
          <p className="solana-token-launch-copy">
            These packs give each protocol a clear first step instead of treating every skill as if it were already fully wired into runtime.
          </p>
        </div>
      </div>

      <div className="solana-protocol-grid">
        {SOLANA_PROTOCOL_PACKS.map((pack) => (
          <section key={pack.id} className="solana-protocol-card">
            <div className="solana-protocol-card-head">
              <div>
                <div className="solana-protocol-name">{pack.label}</div>
                <div className="solana-protocol-status-line">
                  <span className={`solana-ecosystem-status ${pack.status}`}>{pack.status === 'native' ? 'Native' : 'Guided'}</span>
                </div>
              </div>
            </div>
            <div className="solana-runtime-detail">{pack.kickoff}</div>
            <div className="solana-protocol-snippet">
              <div className="solana-protocol-snippet-label">First move</div>
              <code className="solana-protocol-hint">{pack.installHint}</code>
            </div>
            <div className="solana-protocol-footer">
              <div className="solana-protocol-actions">
                <button className="sol-btn green" onClick={() => openPackFlow(pack.id)}>
                  {pack.status === 'native' ? 'Open Flow' : 'Open Integration'}
                </button>
                <button className="sol-btn" onClick={() => copyText(pack.skill)}>
                  {copied === pack.skill ? 'Copied Skill' : 'Copy Skill'}
                </button>
                <button className="sol-btn" onClick={() => copyText(pack.installHint)}>
                  {copied === pack.installHint ? 'Copied Install' : 'Copy Install'}
                </button>
              </div>
              <a className="solana-protocol-doc-link" href={pack.docsUrl} target="_blank" rel="noreferrer">
                Docs
              </a>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
