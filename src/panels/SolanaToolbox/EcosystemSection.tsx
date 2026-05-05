import {
  SOLANA_INTEGRATION_CATALOG,
  getIntegrationStatusLabel,
} from './catalog'

const AREA_ORDER = [
  'Foundation',
  'Wallets',
  'Providers',
  'Execution',
  'Testing',
  'Protocols',
  'Payments',
] as const

export function EcosystemSection() {
  return (
    <div className="solana-ecosystem">
      <div className="solana-ecosystem-header">
        <div>
          <div className="solana-token-launch-kicker">Solana IDE Coverage</div>
          <h3 className="solana-token-launch-title">Foundation, tooling, and protocol packs</h3>
          <p className="solana-token-launch-copy">
            DAEMON now separates native integrations from guided ecosystem support so the toolbox reflects
            what is already wired in versus what is available through skills, scaffolds, and provider setup.
          </p>
        </div>
      </div>

      <div className="solana-ecosystem-grid">
        {AREA_ORDER.map((area) => {
          const entries = SOLANA_INTEGRATION_CATALOG.filter((entry) => entry.area === area)
          if (entries.length === 0) return null

          return (
            <section key={area} className="solana-ecosystem-card">
              <div className="solana-ecosystem-card-top">
                <h4 className="solana-ecosystem-card-title">{area}</h4>
                <span className="solana-split-count">{entries.length}</span>
              </div>
              <div className="solana-ecosystem-list">
                {entries.map((entry) => (
                  <div key={entry.id} className="solana-ecosystem-row">
                    <div className="solana-ecosystem-main">
                      <div className="solana-ecosystem-title">
                        <span>{entry.label}</span>
                        <span className={`solana-ecosystem-status ${entry.status}`}>
                          {getIntegrationStatusLabel(entry.status)}
                        </span>
                        <span className="solana-ecosystem-kind">{entry.kind}</span>
                      </div>
                      <div className="solana-ecosystem-desc">{entry.description}</div>
                      {(entry.skill || entry.mcpName || entry.docsUrl) && (
                        <div className="solana-ecosystem-meta">
                          {entry.skill && <span>{entry.skill}</span>}
                          {entry.mcpName && <span>{entry.mcpName}</span>}
                          {entry.docsUrl && (
                            <a href={entry.docsUrl} target="_blank" rel="noreferrer">
                              docs
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

