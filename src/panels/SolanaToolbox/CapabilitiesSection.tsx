import { useState } from 'react'
import type { SolanaMcpEntry } from '../../store/solanaToolbox'
import { useClipboard } from '../../hooks/useClipboard'
import { LiveRegion } from '../../components/LiveRegion'
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
  onScaffoldSquads: () => void
}

export function CapabilitiesSection({ mcps, projectPath, onToggle, onScaffoldX402, onScaffoldMpp, onScaffoldLight, onScaffoldMagicBlock, onScaffoldDebridge, onScaffoldSquads }: CapabilitiesSectionProps) {
  const { copiedKey: copiedSkill, copy } = useClipboard()
  const [showAllSkills, setShowAllSkills] = useState(false)

  const payaiMcp = mcps.find((m) => m.name === 'payai-mcp-server')
  const x402Mcp = mcps.find((m) => m.name === 'x402-mcp')
  const paymentEnabled = payaiMcp?.enabled || x402Mcp?.enabled

  const handleCopySkill = (skill: string) => { void copy(skill, skill) }

  const totalSkills = SOLANA_AGENT_SKILL_GROUPS.reduce((sum, g) => sum + g.skills.length, 0)
  const visibleGroups = showAllSkills ? SOLANA_AGENT_SKILL_GROUPS : SOLANA_AGENT_SKILL_GROUPS.slice(0, 3)

  return (
    <div className="solana-split-panel">
      <div className="solana-split-body">
        <div className="ds-pack-section">
        <div className="ds-pack-section-head">
          <span className="ds-eyebrow">Capabilities</span>
          <span className="ds-pack-section-count">{totalSkills} skills</span>
        </div>
        {/* Payment integrations */}
        <div className="ds-card-grid">
        <div className="ds-card">
          <span className={`sol-dot ${paymentEnabled ? 'green' : 'grey'}`} style={{ marginTop: 5 }} />
          <div className="ds-card-body">
            <div className="ds-card-title">x402 / PayAI</div>
            <div className="ds-card-desc">HTTP 402 micropayments</div>
            <div className="ds-card-actions">
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
              <button type="button" className="sol-btn" onClick={onScaffoldX402} disabled={!projectPath}>Scaffold</button>
            </div>
          </div>
        </div>

        <div className="ds-card">
          <span className="sol-dot grey" style={{ marginTop: 5 }} />
          <div className="ds-card-body">
            <div className="ds-card-title">MPP</div>
            <div className="ds-card-desc">Agent-to-agent payments</div>
            <div className="ds-card-actions">
              <button type="button" className="sol-btn" onClick={onScaffoldMpp} disabled={!projectPath}>Scaffold</button>
            </div>
          </div>
        </div>

        <div className="ds-card">
          <span className="sol-dot grey" style={{ marginTop: 5 }} />
          <div className="ds-card-body">
            <div className="ds-card-title">Light Protocol</div>
            <div className="ds-card-desc">ZK Compression + compressed tokens</div>
            <div className="ds-card-actions">
              <button type="button" className="sol-btn" onClick={onScaffoldLight} disabled={!projectPath}>Scaffold</button>
            </div>
          </div>
        </div>

        <div className="ds-card">
          <span className="sol-dot grey" style={{ marginTop: 5 }} />
          <div className="ds-card-body">
            <div className="ds-card-title">MagicBlock</div>
            <div className="ds-card-desc">Ephemeral Rollups + Magic Router</div>
            <div className="ds-card-actions">
              <button type="button" className="sol-btn" onClick={onScaffoldMagicBlock} disabled={!projectPath}>Scaffold</button>
            </div>
          </div>
        </div>

        <div className="ds-card">
          <span className="sol-dot grey" style={{ marginTop: 5 }} />
          <div className="ds-card-body">
            <div className="ds-card-title">deBridge</div>
            <div className="ds-card-desc">Cross-chain DLN route previews</div>
            <div className="ds-card-actions">
              <button type="button" className="sol-btn" onClick={onScaffoldDebridge} disabled={!projectPath}>Scaffold</button>
            </div>
          </div>
        </div>

        <div className="ds-card">
          <span className="sol-dot grey" style={{ marginTop: 5 }} />
          <div className="ds-card-body">
            <div className="ds-card-title">Squads</div>
            <div className="ds-card-desc">V4 multisig + vault inspection</div>
            <div className="ds-card-actions">
              <button type="button" className="sol-btn" onClick={onScaffoldSquads} disabled={!projectPath}>Scaffold</button>
            </div>
          </div>
        </div>
        </div>
        </div>

        {/* Skills by group */}
        <div className="ds-pack-section">
        <div className="ds-pack-section-head">
          <span className="ds-eyebrow">Agent Skills</span>
        </div>
        {visibleGroups.map((group) => (
          <div key={group.label} className="solana-skill-group">
            <div className="solana-skill-group-label">{group.label}</div>
            <div className="solana-skills-grid">
              {group.skills.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  className={`solana-skill-chip ${copiedSkill === skill ? 'copied' : ''}`}
                  onClick={() => handleCopySkill(skill)}
                  title={`Copy ${skill}`}
                >
                  {skill}
                </button>
              ))}
            </div>
          </div>
        ))}

        {!showAllSkills && SOLANA_AGENT_SKILL_GROUPS.length > 3 && (
          <button type="button" className="solana-skills-expand" onClick={() => setShowAllSkills(true)}>
            Show all {totalSkills} skills
          </button>
        )}
        </div>
      </div>

      {copiedSkill && (
        <div className="solana-toast" aria-hidden="true">Copied {copiedSkill}</div>
      )}
      <LiveRegion message={copiedSkill ? `Copied ${copiedSkill} to clipboard` : ''} />
    </div>
  )
}
