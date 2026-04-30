import fs from 'node:fs'
import path from 'node:path'

export interface SolanaProjectInfo {
  isSolanaProject: boolean
  framework: 'anchor' | 'native' | 'client-only' | null
  indicators: string[]
  suggestedMcps: string[]
}

export interface SolanaToolchainProjectStatus {
  litesvm: boolean
  anchorTests: boolean
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
      if (content.includes('solana-program') || content.includes('anchor-lang') || content.includes('ephemeral-rollups-sdk')) {
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
      const solanaClientDeps = [
        '@solana/web3.js',
        '@solana/kit',
        '@solana/client',
        '@solana/react-hooks',
        '@solana/web3-compat',
        '@solana/wallet-adapter-react',
        '@phantom/browser-sdk',
        '@phantom/react-sdk',
        '@lightprotocol/stateless.js',
        '@lightprotocol/compressed-token',
        '@lightprotocol/light-token',
        '@magicblock-labs/ephemeral-rollups-sdk',
        '@magicblock-labs/ephemeral-rollups-kit',
        '@magicblock-labs/vrf-sdk',
        '@coral-xyz/anchor',
        '@project-serum/anchor',
      ]
      for (const dep of solanaClientDeps) {
        if (allDeps[dep]) {
          indicators.push(`package.json (${dep})`)
          if (!framework) {
            framework = dep.includes('anchor') ? 'anchor' : 'client-only'
          }
        }
      }
    } catch { /* ignore */ }
  }

  const isSolanaProject = indicators.length > 0

  // Suggest MCPs based on detection
  const suggestedMcps: string[] = []
  if (isSolanaProject) {
    suggestedMcps.push('solana-mcp-server', 'helius', 'phantom-docs')
  }

  return { isSolanaProject, framework, indicators, suggestedMcps }
}

export function detectProjectToolchain(projectPath: string): SolanaToolchainProjectStatus {
  let litesvm = false
  let anchorTests = false

  const cargoToml = path.join(projectPath, 'Cargo.toml')
  if (fs.existsSync(cargoToml)) {
    try {
      const content = fs.readFileSync(cargoToml, 'utf8')
      if (content.includes('litesvm') || content.includes('LiteSVM')) litesvm = true
      if (content.includes('anchor-lang') || content.includes('anchor-client')) anchorTests = true
    } catch { /* ignore */ }
  }

  const packageJson = path.join(projectPath, 'package.json')
  if (fs.existsSync(packageJson)) {
    try {
      const content = fs.readFileSync(packageJson, 'utf8')
      const pkg = JSON.parse(content)
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (allDeps['litesvm'] || allDeps['@lite-svm/js']) litesvm = true
      if (allDeps['@coral-xyz/anchor'] || allDeps['@project-serum/anchor']) anchorTests = true
    } catch { /* ignore */ }
  }

  return { litesvm, anchorTests }
}
