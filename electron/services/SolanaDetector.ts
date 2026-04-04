import fs from 'node:fs'
import path from 'node:path'

export interface SolanaProjectInfo {
  isSolanaProject: boolean
  framework: 'anchor' | 'native' | 'client-only' | null
  indicators: string[]
  suggestedMcps: string[]
}

export function detect(projectPath: string): SolanaProjectInfo {
  const indicators: string[] = []
  let framework: SolanaProjectInfo['framework'] = null

  // Check Anchor.toml
  const anchorToml = path.join(projectPath, 'Anchor.toml')
  if (fs.existsSync(anchorToml)) {
    indicators.push('Anchor.toml')
    framework = 'anchor'
  }

  // Check Cargo.toml for solana deps
  const cargoToml = path.join(projectPath, 'Cargo.toml')
  if (fs.existsSync(cargoToml)) {
    try {
      const content = fs.readFileSync(cargoToml, 'utf8')
      if (content.includes('solana-program') || content.includes('anchor-lang')) {
        indicators.push('Cargo.toml (solana deps)')
        if (!framework) framework = content.includes('anchor-lang') ? 'anchor' : 'native'
      }
    } catch { /* ignore */ }
  }

  // Check programs/ directory (Anchor convention)
  const programsDir = path.join(projectPath, 'programs')
  if (fs.existsSync(programsDir)) {
    try {
      const entries = fs.readdirSync(programsDir)
      if (entries.length > 0) indicators.push('programs/ directory')
    } catch { /* ignore */ }
  }

  // Check package.json for Solana client deps
  const packageJson = path.join(projectPath, 'package.json')
  if (fs.existsSync(packageJson)) {
    try {
      const content = fs.readFileSync(packageJson, 'utf8')
      const pkg = JSON.parse(content)
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      const solanaClientDeps = ['@solana/web3.js', '@solana/kit', '@coral-xyz/anchor', '@project-serum/anchor']
      for (const dep of solanaClientDeps) {
        if (allDeps[dep]) {
          indicators.push(`package.json (${dep})`)
          if (!framework) framework = 'client-only'
        }
      }
    } catch { /* ignore */ }
  }

  const isSolanaProject = indicators.length > 0

  // Suggest MCPs based on detection
  const suggestedMcps: string[] = []
  if (isSolanaProject) {
    suggestedMcps.push('solana-mcp-server', 'helius')
    if (framework === 'anchor' || framework === 'native') {
      suggestedMcps.push('payai-mcp-server')
    }
  }

  return { isSolanaProject, framework, indicators, suggestedMcps }
}
