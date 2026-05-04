import fs from 'node:fs'
import path from 'node:path'
import { parse as parseToml } from 'smol-toml'

export interface SolanaDetectedProgram {
  name: string
  cluster: string
  address: string
  source: 'Anchor.toml' | 'IDL'
}

export interface SolanaDetectedIdl {
  name: string
  path: string
  address: string | null
}

export interface SolanaDetectedScript {
  name: string
  command: string
  source: 'package.json'
}

export interface SolanaProjectRuntimeProfile {
  cluster: string | null
  providerWallet: string | null
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | null
  files: {
    anchorToml: boolean
    cargoToml: boolean
    packageJson: boolean
    programsDir: boolean
    targetIdlDir: boolean
    surfpoolToml: boolean
    testsDir: boolean
  }
  programs: SolanaDetectedProgram[]
  idls: SolanaDetectedIdl[]
  scripts: SolanaDetectedScript[]
  tests: SolanaToolchainProjectStatus
}

export interface SolanaProjectInfo {
  isSolanaProject: boolean
  framework: 'anchor' | 'native' | 'client-only' | null
  indicators: string[]
  suggestedMcps: string[]
  runtime: SolanaProjectRuntimeProfile
}

export interface SolanaToolchainProjectStatus {
  litesvm: boolean
  anchorTests: boolean
}

function emptyRuntimeProfile(): SolanaProjectRuntimeProfile {
  return {
    cluster: null,
    providerWallet: null,
    packageManager: null,
    files: {
      anchorToml: false,
      cargoToml: false,
      packageJson: false,
      programsDir: false,
      targetIdlDir: false,
      surfpoolToml: false,
      testsDir: false,
    },
    programs: [],
    idls: [],
    scripts: [],
    tests: { litesvm: false, anchorTests: false },
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function readAnchorToml(anchorToml: string): {
  cluster: string | null
  providerWallet: string | null
  programs: SolanaDetectedProgram[]
} {
  try {
    const parsed = parseToml(fs.readFileSync(anchorToml, 'utf8')) as Record<string, unknown>
    const provider = asRecord(parsed.provider)
    const programsRoot = asRecord(parsed.programs)
    const programs: SolanaDetectedProgram[] = []

    if (programsRoot) {
      for (const [cluster, entries] of Object.entries(programsRoot)) {
        const clusterPrograms = asRecord(entries)
        if (!clusterPrograms) continue
        for (const [name, address] of Object.entries(clusterPrograms)) {
          if (typeof address === 'string' && address.trim()) {
            programs.push({ name, cluster, address: address.trim(), source: 'Anchor.toml' })
          }
        }
      }
    }

    return {
      cluster: typeof provider?.cluster === 'string' ? provider.cluster : null,
      providerWallet: typeof provider?.wallet === 'string' ? provider.wallet : null,
      programs,
    }
  } catch {
    return { cluster: null, providerWallet: null, programs: [] }
  }
}

function detectPackageManager(projectPath: string): SolanaProjectRuntimeProfile['packageManager'] {
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(projectPath, 'package-lock.json'))) return 'npm'
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn'
  if (fs.existsSync(path.join(projectPath, 'bun.lockb')) || fs.existsSync(path.join(projectPath, 'bun.lock'))) return 'bun'
  return null
}

function detectPackageScripts(packageJson: string): SolanaDetectedScript[] {
  const pkg = readJson(packageJson)
  const scripts = asRecord(pkg?.scripts)
  if (!scripts) return []

  return Object.entries(scripts)
    .filter(([, command]) => typeof command === 'string')
    .filter(([name, command]) => /(anchor|solana|test|build|deploy|validator|surfpool)/i.test(`${name} ${command}`))
    .slice(0, 8)
    .map(([name, command]) => ({ name, command: String(command), source: 'package.json' }))
}

function detectIdls(projectPath: string): SolanaDetectedIdl[] {
  const idlDir = path.join(projectPath, 'target', 'idl')
  if (!fs.existsSync(idlDir)) return []

  try {
    return fs.readdirSync(idlDir)
      .filter((entry) => entry.endsWith('.json'))
      .slice(0, 12)
      .map((entry) => {
        const filePath = path.join(idlDir, entry)
        const json = readJson(filePath)
        const metadata = asRecord(json?.metadata)
        const address = typeof json?.address === 'string'
          ? json.address
          : typeof metadata?.address === 'string'
            ? metadata.address
            : null

        return {
          name: typeof json?.name === 'string' ? json.name : path.basename(entry, '.json'),
          path: filePath,
          address,
        }
      })
  } catch {
    return []
  }
}

export function detect(projectPath: string): SolanaProjectInfo {
  const indicators: string[] = []
  let framework: SolanaProjectInfo['framework'] = null
  const runtime = emptyRuntimeProfile()

  // Check Anchor.toml
  const anchorToml = path.join(projectPath, 'Anchor.toml')
  if (fs.existsSync(anchorToml)) {
    indicators.push('Anchor.toml')
    framework = 'anchor'
    runtime.files.anchorToml = true
    const anchor = readAnchorToml(anchorToml)
    runtime.cluster = anchor.cluster
    runtime.providerWallet = anchor.providerWallet
    runtime.programs.push(...anchor.programs)
  }

  // Check Cargo.toml for solana deps
  const cargoToml = path.join(projectPath, 'Cargo.toml')
  if (fs.existsSync(cargoToml)) {
    runtime.files.cargoToml = true
    try {
      const content = fs.readFileSync(cargoToml, 'utf8')
      if (content.includes('solana-program') || content.includes('anchor-lang') || content.includes('ephemeral-rollups-sdk') || content.includes('debridge-solana-sdk') || content.includes('squads-multisig') || content.includes('@sqds/multisig')) {
        indicators.push('Cargo.toml (solana deps)')
        if (!framework) framework = content.includes('anchor-lang') ? 'anchor' : 'native'
      }
    } catch { /* ignore */ }
  }

  // Check programs/ directory (Anchor convention)
  const programsDir = path.join(projectPath, 'programs')
  if (fs.existsSync(programsDir)) {
    runtime.files.programsDir = true
    try {
      const entries = fs.readdirSync(programsDir)
      if (entries.length > 0) indicators.push('programs/ directory')
    } catch { /* ignore */ }
  }

  // Check package.json for Solana client deps
  const packageJson = path.join(projectPath, 'package.json')
  if (fs.existsSync(packageJson)) {
    runtime.files.packageJson = true
    runtime.packageManager = detectPackageManager(projectPath)
    runtime.scripts = detectPackageScripts(packageJson)
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
        '@debridge-finance/dln-client',
        '@debridge-finance/desdk',
        '@sqds/multisig',
        '@sqds/grid',
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

  runtime.files.targetIdlDir = fs.existsSync(path.join(projectPath, 'target', 'idl'))
  runtime.files.surfpoolToml = fs.existsSync(path.join(projectPath, 'Surfpool.toml'))
  runtime.files.testsDir = fs.existsSync(path.join(projectPath, 'tests'))
  runtime.idls = detectIdls(projectPath)
  runtime.tests = detectProjectToolchain(projectPath)
  for (const idl of runtime.idls) {
    if (idl.address && !runtime.programs.some((program) => program.address === idl.address)) {
      runtime.programs.push({
        name: idl.name,
        cluster: runtime.cluster ?? 'idl',
        address: idl.address,
        source: 'IDL',
      })
    }
  }

  const isSolanaProject = indicators.length > 0

  // Suggest MCPs based on detection
  const suggestedMcps: string[] = []
  if (isSolanaProject) {
    suggestedMcps.push('solana-mcp-server', 'helius', 'phantom-docs')
  }

  return { isSolanaProject, framework, indicators, suggestedMcps, runtime }
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
