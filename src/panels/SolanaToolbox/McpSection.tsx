import type { SolanaMcpEntry } from '../../store/solanaToolbox'

interface McpSectionProps {
  mcps: SolanaMcpEntry[]
  projectPath: string | null
  onToggle: (projectPath: string, name: string, enabled: boolean) => void
}

export function McpSection({ mcps, projectPath, onToggle }: McpSectionProps) {
  return (
    <div className="solana-section">
      <div className="solana-section-title">MCP Servers</div>
      {mcps.length === 0 ? (
        <div className="solana-empty">No Solana MCPs available</div>
      ) : (
        mcps.map((mcp) => (
          <div key={mcp.name} className="solana-row">
            <span className={`solana-dot ${mcp.enabled ? 'green' : 'grey'}`} />
            <div className="solana-row-info">
              <div className="solana-row-name">{mcp.label}</div>
              <div className="solana-row-desc">{mcp.description}</div>
            </div>
            <button
              className={`solana-toggle ${mcp.enabled ? 'on' : ''}`}
              onClick={() => projectPath && onToggle(projectPath, mcp.name, !mcp.enabled)}
              disabled={!projectPath}
              title={mcp.enabled ? 'Disable' : 'Enable'}
            />
          </div>
        ))
      )}
    </div>
  )
}
