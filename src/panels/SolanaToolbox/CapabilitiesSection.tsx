import { useState, useCallback } from 'react'
import type { SolanaMcpEntry } from '../../store/solanaToolbox'
import { SOLANA_AGENT_SKILL_GROUPS } from './catalog'

interface CapabilitiesSectionProps {
  mcps: SolanaMcpEntry[]
  projectPath: string | null
  onToggle: (projectPath: string, name: string, enabled: boolean) => void
  onScaffoldX402: () => void
  onScaffoldMpp: () => void
  onScaffoldLight: () => void
  onScaffoldMagicBlock: () => void
  onScaffoldDebridge: () => void
}

export function CapabilitiesSection({ mcps, projectPath, onToggle, onScaffoldX402, onScaffoldMpp, onScaffoldLight, onScaffoldMagicBlock, onScaffoldDebridge }: CapabilitiesSectionProps) {
  const [copiedSkill, setCopiedSkill] = useState<string | null>(null)
  const [showAllSkills, setShowAllSkills] = useState(false)

  const payaiMcp = mcps.find((m) => m.name === 'payai-mcp-server')
  const x402Mcp = mcps.find((m) => m.name === 'x402-mcp')
  const paymentEnabled = payaiMcp?.enabled || x402Mcp?.enabled

  const handleCopySkill = useCallback((skill: string) => {
    navigator.clipboard.writeText(skill).catch(() => {})
    setCopiedSkill(skill)
    setTimeout(() => setCopiedSkill(null), 1500)
  }, [])

  const totalSkills = SOLANA_AGENT_SKILL_GROUPS.reduce((sum, g) => sum + g.skills.length, 0)
  const visibleGroups = showAllSkills ? SOLANA_AGENT_SKILL_GROUPS : SOLANA_AGENT_SKILL_GROUPS.slice(0, 3)

  return (
    <div className="solana-split-panel">
      <div className="solana-split-header">
        <span className="solana-split-title">Capabilities</span>
        <span className="solana-split-count">{totalSkills} skills</span>
      </div>
      <div className="solana-split-body">
        {/* Payment integrations */}
        <div className="solana-integration-row">
          <span className={`sol-dot ${paymentEnabled ? 'green' : 'grey'}`} style={{ marginTop: 5 }} />
          <div className="solana-integration-info">
            <div className="solana-integration-name">x402 / PayAI</div>
            <div className="solana-integration-desc">HTTP 402 micropayments</div>
            <div className="solana-integration-actions">
              {!paymentEnabled && projectPath && (
                <button
                  className="sol-btn green"
                  onClick={() => {
                    if (payaiMcp && !payaiMcp.enabled) onToggle(projectPath, 'payai-mcp-server', true)
                    if (x402Mcp && !x402Mcp.enabled) onToggle(projectPath, 'x402-mcp', true)
                  }}
                >
                  Activate
                </button>
              )}
              <button className="sol-btn" onClick={onScaffoldX402} disabled={!projectPath}>Scaffold</button>
            </div>
          </div>
        </div>

        <div className="solana-integration-row">
          <span className="sol-dot blue" style={{ marginTop: 5 }} />
          <div className="solana-integration-info">
            <div className="solana-integration-name">MPP</div>
            <div className="solana-integration-desc">Agent-to-agent payments</div>
            <div className="solana-integration-actions">
              <button className="sol-btn" onClick={onScaffoldMpp} disabled={!projectPath}>Scaffold</button>
            </div>
          </div>
        </div>

        <div className="solana-integration-row">
          <span className="sol-dot green" style={{ marginTop: 5 }} />
          <div className="solana-integration-info">
            <div className="solana-integration-name">Light Protocol</div>
            <div className="solana-integration-desc">ZK Compression + compressed tokens</div>
            <div className="solana-integration-actions">
              <button className="sol-btn" onClick={onScaffoldLight} disabled={!projectPath}>Scaffold</button>
            </div>
          </div>
        </div>

        <div className="solana-integration-row">
          <span className="sol-dot blue" style={{ marginTop: 5 }} />
          <div className="solana-integration-info">
            <div className="solana-integration-name">MagicBlock</div>
            <div className="solana-integration-desc">Ephemeral Rollups + Magic Router</div>
            <div className="solana-integration-actions">
              <button className="sol-btn" onClick={onScaffoldMagicBlock} disabled={!projectPath}>Scaffold</button>
            </div>
          </div>
        </div>

        <div className="solana-integration-row">
          <span className="sol-dot green" style={{ marginTop: 5 }} />
          <div className="solana-integration-info">
            <div className="solana-integration-name">deBridge</div>
            <div className="solana-integration-desc">Cross-chain DLN route previews</div>
            <div className="solana-integration-actions">
              <button className="sol-btn" onClick={onScaffoldDebridge} disabled={!projectPath}>Scaffold</button>
            </div>
          </div>
        </div>

        {/* Skills by group */}
        <div className="solana-services-label">Agent Skills</div>
        {visibleGroups.map((group) => (
          <div key={group.label} className="solana-skill-group">
            <div className="solana-skill-group-label">{group.label}</div>
            <div className="solana-skills-grid">
              {group.skills.map((skill) => (
                <span
                  key={skill}
                  className={`solana-skill-chip ${copiedSkill === skill ? 'copied' : ''}`}
                  onClick={() => handleCopySkill(skill)}
                  title={`Copy ${skill}`}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ))}

        {!showAllSkills && SOLANA_AGENT_SKILL_GROUPS.length > 3 && (
          <button className="solana-skills-expand" onClick={() => setShowAllSkills(true)}>
            Show all {totalSkills} skills
          </button>
        )}
      </div>

      {copiedSkill && (
        <div className="solana-toast">Copied {copiedSkill}</div>
      )}
    </div>
  )
}
