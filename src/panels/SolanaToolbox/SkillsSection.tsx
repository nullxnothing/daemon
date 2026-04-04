const SKILLS = [
  '/solana-dev', '/helius', '/raydium', '/meteora', '/jupiter-lend',
  '/metaplex', '/drift', '/orca', '/pumpfun', '/light-protocol',
  '/solana-kit', '/pyth', '/switchboard', '/vulnhunter', '/kamino',
  '/sanctum', '/payai-x402',
]

export function SkillsSection() {
  return (
    <div className="solana-section">
      <div className="solana-section-title">Agent Skills</div>
      <div className="solana-row-desc" style={{ marginBottom: 6 }}>
        Available to Solana Agent via slash commands
      </div>
      <div className="solana-skills-grid">
        {SKILLS.map((skill) => (
          <span key={skill} className="solana-skill-chip">{skill}</span>
        ))}
      </div>
    </div>
  )
}
