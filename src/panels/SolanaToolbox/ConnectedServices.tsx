import type { SolanaMcpEntry } from '../../store/solanaToolbox'

const MCP_TAGS: Record<string, string> = {
  helius: 'RPC',
  'solana-mcp-server': 'TOOLS',
  'phantom-docs': 'WALLET',
  'payai-mcp-server': 'PAY',
  'x402-mcp': 'PAY',
  kausalayer: 'PRIVACY',
}

interface ConnectedServicesProps {
  mcps: SolanaMcpEntry[]
  projectPath: string | null
  onToggle: (projectPath: string, name: string, enabled: boolean) => void
}

export function ConnectedServices({ mcps, projectPath, onToggle }: ConnectedServicesProps) {
  const activeCount = mcps.filter((m) => m.enabled).length

  return (
    <div className="solana-split-panel">
      <div className="solana-split-body">
        <div className="ds-pack-section">
          <div className="ds-pack-section-head">
            <span className="ds-eyebrow">Services</span>
            <span className="ds-pack-section-count">{activeCount}/{mcps.length}</span>
          </div>
          <div className="ds-card-grid">
            {mcps.map((mcp) => (
              <div key={mcp.name} className="ds-card">
                <span className={`sol-dot ${mcp.enabled ? 'green' : 'grey'}`} style={{ marginTop: 5 }} />
                <div className="ds-card-body">
                  <div className="ds-card-title-row">
                    <span className="ds-card-title">{mcp.label}</span>
                    <span className="solana-service-tag">{MCP_TAGS[mcp.name] ?? 'MCP'}</span>
                  </div>
                  <span className="ds-card-desc">{mcp.description}</span>
                  {mcp.docsUrl && (
                    <a className="solana-service-docs" href={mcp.docsUrl} target="_blank" rel="noreferrer">
                      Docs
                    </a>
                  )}
                </div>
                <button
                  className={`solana-toggle ${mcp.enabled ? 'on' : ''}`}
                  onClick={() => projectPath && onToggle(projectPath, mcp.name, !mcp.enabled)}
                  disabled={!projectPath}
                  title={mcp.enabled ? 'Disable' : 'Enable'}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
