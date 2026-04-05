import type { SolanaMcpEntry } from '../../store/solanaToolbox'

const MCP_TAGS: Record<string, string> = {
  helius: 'RPC',
  'solana-mcp-server': 'TOOLS',
  'payai-mcp-server': 'PAY',
  'x402-mcp': 'PAY',
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
      <div className="solana-split-header">
        <span className="solana-split-title">Services</span>
        <span className="solana-split-count">{activeCount}/{mcps.length}</span>
      </div>
      <div className="solana-split-body">
        {mcps.map((mcp) => (
          <div key={mcp.name} className="solana-service-row">
            <span className={`sol-dot ${mcp.enabled ? 'green' : 'grey'}`} />
            <div className="solana-service-info">
              <span className="solana-service-name">{mcp.label}</span>
              <span className="solana-service-tag">{MCP_TAGS[mcp.name] ?? 'MCP'}</span>
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
  )
}
