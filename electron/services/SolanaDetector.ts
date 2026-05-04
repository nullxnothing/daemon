import fs from 'node:fs'
import path from 'node:path'
import { Keypair } from '@solana/web3.js'

export type SolanaDiagnosticStatus = 'ready' | 'warning' | 'missing'

export interface SolanaDiagnosticCheck {
  id: string
  label: string
  status: SolanaDiagnosticStatus
  detail: string
  evidence?: string
  command?: string
}

export interface SolanaProgramDiagnostic {
  name: string
  anchorProgramId: string | null
  declareId: string | null
  idlAddress: string | null
  keypairAddress: string | null
  checks: SolanaDiagnosticCheck[]
}

export interface SolanaProjectDiagnostics {
  status: SolanaDiagnosticStatus
  issueCount: number
  programCount: number
  checks: SolanaDiagnosticCheck[]
  programs: SolanaProgramDiagnostic[]
}

export interface SolanaProjectInfo {
  isSolanaProject: boolean
  framework: 'anchor' | 'native' | 'client-only' | null
  indicators: string[]
  suggestedMcps: string[]
  diagnostics?: SolanaProjectDiagnostics
}

export interface SolanaToolchainProjectStatus {
  litesvm: boolean
  anchorTests: boolean
}

function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

function safeJson<T = unknown>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

function exists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

function listDirs(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

function listFiles(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

function parseAnchorPrograms(anchorToml: string): Record<string, string> {
  const programs: Record<string, string> = {}
  let inProgramsSection = false

  for (const rawLine of anchorToml.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    if (line.startsWith('[') && line.endsWith(']')) {
      inProgramsSection = /^\[programs\.[^\]]+\]$/.test(line)
      continue
    }

    if (!inProgramsSection) continue
    const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*['"]([^'"]+)['"]$/)
    if (match) programs[match[1]] = match[2]
  }

  return programs
}

function extractDeclareId(programPath: string): string | null {
  const candidates = [
    path.join(programPath, 'src', 'lib.rs'),
    path.join(programPath, 'src', 'main.rs'),
  ]

  for (const candidate of candidates) {
    const content = readText(candidate)
    if (!content) continue
    const match = content.match(/declare_id!\s*\(\s*['"]([^'"]+)['"]\s*\)/)
    if (match) return match[1]
  }

  return null
}

function readIdlAddress(projectPath: string, programName: string): string | null {
  const idlPath = path.join(projectPath, 'target', 'idl', `${programName}.json`)
  const idl = safeJson<{ address?: string; metadata?: { address?: string } }>(idlPath)
  return idl?.address ?? idl?.metadata?.address ?? null
}

function readKeypairAddress(projectPath: string, programName: string): string | null {
  const keypairPath = path.join(projectPath, 'target', 'deploy', `${programName}-keypair.json`)
  const secret = safeJson<number[]>(keypairPath)
  if (!Array.isArray(secret)) return null

  try {
    return Keypair.fromSecretKey(Uint8Array.from(secret)).publicKey.toBase58()
  } catch {
    return null
  }
}

function checkDrift(label: string, expected: string | null, actual: string | null, missingDetail: string): SolanaDiagnosticCheck {
  if (!actual) {
    return {
      id: label.toLowerCase().replace(/\s+/g, '-'),
      label,
      status: 'missing',
      detail: missingDetail,
    }
  }

  if (!expected) {
    return {
      id: label.toLowerCase().replace(/\s+/g, '-'),
      label,
      status: 'warning',
      detail: `Found ${actual}, but Anchor.toml did not provide a baseline program ID for comparison.`,
      evidence: actual,
    }
  }

  if (expected === actual) {
    return {
      id: label.toLowerCase().replace(/\s+/g, '-'),
      label,
      status: 'ready',
      detail: `${label} matches Anchor.toml.`,
      evidence: actual,
    }
  }

  return {
    id: label.toLowerCase().replace(/\s+/g, '-'),
    label,
    status: 'warning',
    detail: `${label} does not match Anchor.toml. Expected ${expected}, found ${actual}.`,
    evidence: actual,
  }
}

function worstStatus(checks: SolanaDiagnosticCheck[]): SolanaDiagnosticStatus {
  if (checks.some((check) => check.status === 'missing')) return 'missing'
  if (checks.some((check) => check.status === 'warning')) return 'warning'
  return 'ready'
}

function buildDiagnostics(projectPath: string, framework: SolanaProjectInfo['framework']): SolanaProjectDiagnostics {
  const checks: SolanaDiagnosticCheck[] = []
  const programs: SolanaProgramDiagnostic[] = []

  const anchorPath = path.join(projectPath, 'Anchor.toml')
  const anchorToml = readText(anchorPath)
  const anchorPrograms = anchorToml ? parseAnchorPrograms(anchorToml) : {}
  const programsDir = path.join(projectPath, 'programs')
  const programDirs = listDirs(programsDir)
  const targetIdlDir = path.join(projectPath, 'target', 'idl')
  const targetDeployDir = path.join(projectPath, 'target', 'deploy')

  checks.push({
    id: 'anchor-toml',
    label: 'Anchor.toml',
    status: anchorToml ? 'ready' : framework === 'anchor' ? 'missing' : 'warning',
    detail: anchorToml
      ? 'Anchor.toml detected. DAEMON can compare declared program IDs against source and generated artifacts.'
      : framework === 'anchor'
        ? 'Anchor workspace detected, but Anchor.toml was not found at the project root.'
        : 'Anchor.toml is not required unless this is an Anchor workspace.',
    evidence: anchorToml ? anchorPath : undefined,
  })

  checks.push({
    id: 'programs-dir',
    label: 'Program workspace',
    status: programDirs.length > 0 ? 'ready' : framework === 'client-only' ? 'warning' : 'missing',
    detail: programDirs.length > 0
      ? `Detected ${programDirs.length} program folder${programDirs.length === 1 ? '' : 's'} in programs/.`
      : framework === 'client-only'
        ? 'Client-only Solana apps do not need a programs/ directory.'
        : 'No programs/ directory found. Program build/test/deploy flows will be limited.',
    evidence: programDirs.join(', '),
  })

  checks.push({
    id: 'idl-artifacts',
    label: 'IDL artifacts',
    status: exists(targetIdlDir) && listFiles(targetIdlDir).some((file) => file.endsWith('.json')) ? 'ready' : framework === 'anchor' ? 'warning' : 'warning',
    detail: exists(targetIdlDir) && listFiles(targetIdlDir).some((file) => file.endsWith('.json'))
      ? 'Generated IDL artifacts found in target/idl.'
      : framework === 'anchor'
        ? 'No generated IDL artifacts found yet. Run anchor build before deploy or IDL review.'
        : 'IDL artifacts are only expected for Anchor workflows.',
    command: framework === 'anchor' ? 'anchor build' : undefined,
  })

  checks.push({
    id: 'deploy-keypairs',
    label: 'Program keypairs',
    status: exists(targetDeployDir) && listFiles(targetDeployDir).some((file) => file.endsWith('-keypair.json')) ? 'ready' : framework === 'anchor' || framework === 'native' ? 'warning' : 'warning',
    detail: exists(targetDeployDir) && listFiles(targetDeployDir).some((file) => file.endsWith('-keypair.json'))
      ? 'Program keypair artifacts found in target/deploy.'
      : framework === 'anchor' || framework === 'native'
        ? 'No target/deploy program keypair artifacts found yet. Build/deploy commands may need explicit program IDs.'
        : 'Program keypairs are not expected for client-only apps.',
  })

  const programNames = Array.from(new Set([...programDirs, ...Object.keys(anchorPrograms)]))
  for (const programName of programNames) {
    const programPath = path.join(programsDir, programName)
    const anchorProgramId = anchorPrograms[programName] ?? null
    const declareId = exists(programPath) ? extractDeclareId(programPath) : null
    const idlAddress = readIdlAddress(projectPath, programName)
    const keypairAddress = readKeypairAddress(projectPath, programName)

    const programChecks: SolanaDiagnosticCheck[] = [
      checkDrift('declare_id!', anchorProgramId, declareId, 'No declare_id! macro found in src/lib.rs or src/main.rs.'),
      checkDrift('IDL address', anchorProgramId, idlAddress, 'No matching generated IDL address found in target/idl.'),
      checkDrift('Deploy keypair', anchorProgramId, keypairAddress, 'No matching target/deploy keypair found or keypair could not be decoded.'),
    ]

    programs.push({
      name: programName,
      anchorProgramId,
      declareId,
      idlAddress,
      keypairAddress,
      checks: programChecks,
    })
  }

  if (programs.length === 0 && (framework === 'anchor' || framework === 'native')) {
    checks.push({
      id: 'program-discovery',
      label: 'Program discovery',
      status: 'missing',
      detail: 'DAEMON could not discover any program names from programs/ or Anchor.toml.',
    })
  }

  const allChecks = [...checks, ...programs.flatMap((program) => program.checks)]
  const issueCount = allChecks.filter((check) => check.status !== 'ready').length

  return {
    status: worstStatus(allChecks),
    issueCount,
    programCount: programs.length,
    checks,
    programs,
  }
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
      const solanaClientDeps = [
        '@solana/web3.js',
        '@solana/kit',
        '@solana/client',
        '@solana/react-hooks',
        '@solana/web3-compat',
        '@solana/wallet-adapter-react',
        '@phantom/browser-sdk',
        '@phantom/react-sdk',
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

  return {
    isSolanaProject,
    framework,
    indicators,
    suggestedMcps,
    diagnostics: isSolanaProject ? buildDiagnostics(projectPath, framework) : undefined,
  }
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
