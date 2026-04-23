import { useCallback, useState } from 'react'
import { SOLANA_PROTOCOL_PACKS } from './catalog'

export function ProtocolPacksSection() {
  const [copied, setCopied] = useState<string | null>(null)

  const copyText = useCallback((value: string) => {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopied(value)
    setTimeout(() => setCopied(null), 1500)
  }, [])

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
            <div className="solana-protocol-card-top">
              <div className="solana-protocol-card-copy">
                <div className="solana-protocol-card-eyebrow">Protocol</div>
                <div className="solana-protocol-card-title">{pack.label}</div>
              </div>
              <span className={`solana-ecosystem-status ${pack.status}`}>{pack.status === 'native' ? 'Native' : 'Guided'}</span>
            </div>
            <div className="solana-protocol-card-body">{pack.kickoff}</div>
            <div className="solana-protocol-hint">{pack.installHint}</div>
            <div className="solana-protocol-actions">
              <button className="sol-btn" onClick={() => copyText(pack.skill)}>
                {copied === pack.skill ? 'Copied Skill' : 'Copy Skill'}
              </button>
              <button className="sol-btn" onClick={() => copyText(pack.installHint)}>
                {copied === pack.installHint ? 'Copied Install' : 'Copy Install'}
              </button>
              <a className="sol-btn" href={pack.docsUrl} target="_blank" rel="noreferrer">
                Open Docs
              </a>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
