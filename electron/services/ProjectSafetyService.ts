import fs from 'node:fs'
import path from 'node:path'

import { redactText, type PrivacyDataClass } from '../security/PrivacyGuard'

export type SafetySeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export interface SafetyFinding {
  id: string
  title: string
  severity: SafetySeverity
  dataClass: PrivacyDataClass
  filePath: string
  line: number
  detail: string
  recommendation: string
}

export interface ProjectSafetyReport {
  projectPath: string
  scannedAt: number
  scannedFiles: number
  findings: SafetyFinding[]
  summary: Record<SafetySeverity, number>
}

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-electron',
  'build',
  'release',
  'target',
  '.next',
  '.turbo',
  '.wrangler',
])

const TEXT_EXTENSIONS = new Set([
  '.env',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.md',
  '.mjs',
  '.cjs',
  '.toml',
  '.yaml',
  '.yml',
  '.rs',
  '.py',
  '.sh',
  '.ps1',
  '.html',
  '.css',
])

const MAX_FILE_BYTES = 512 * 1024
const MAX_FILES = 2_000

interface Rule {
  id: string
  title: string
  severity: SafetySeverity
  dataClass: PrivacyDataClass
  pattern: RegExp
  detail: string
  recommendation: string
}

const RULES: Rule[] = [
  {
    id: 'secret-env-assignment',
    title: 'Potential secret committed in plaintext',
    severity: 'critical',
    dataClass: 'env_secret',
    pattern: /\b[A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY|AUTH|CLIENT[_-]?SECRET)[A-Z0-9_]*\s*=\s*(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s\r\n#]+)/i,
    detail: 'A credential-like assignment exists in a project file.',
    recommendation: 'Move the value into DAEMON secure keys or a local untracked .env file and rotate the exposed credential.',
  },
  {
    id: 'solana-keypair-json',
    title: 'Solana keypair material in project file',
    severity: 'critical',
    dataClass: 'wallet_secret',
    pattern: /\[\s*(?:\d{1,3}\s*,\s*){31,}\d{1,3}\s*\]/,
    detail: 'A byte-array keypair appears to be stored in the workspace.',
    recommendation: 'Store wallet material through DAEMON secure key storage or OS keychain-backed vaults, then rotate funded wallets if exposed.',
  },
  {
    id: 'seed-phrase',
    title: 'Seed phrase-like value detected',
    severity: 'critical',
    dataClass: 'wallet_secret',
    pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\s*[:=]\s*(?:[a-z]{3,12}\s+){11,23}[a-z]{3,12}\b/i,
    detail: 'A recovery phrase appears in project text.',
    recommendation: 'Remove it immediately, rotate the wallet, and never include seed phrases in prompts, logs, tests, or fixtures.',
  },
  {
    id: 'dangerously-skip-permissions',
    title: 'Agent command skips permission checks',
    severity: 'high',
    dataClass: 'project_code',
    pattern: /--dangerously-skip-permissions/,
    detail: 'An agent launch command disables provider permission checks.',
    recommendation: 'Replace with a DAEMON-controlled permission profile and explicit approval for filesystem, network, wallet, and deploy actions.',
  },
  {
    id: 'unsafe-html-injection',
    title: 'Potential unsafe HTML injection sink',
    severity: 'medium',
    dataClass: 'project_code',
    pattern: /\b(?:innerHTML|outerHTML|document\.write|dangerouslySetInnerHTML)\b/,
    detail: 'Raw HTML injection can turn untrusted data into executable content.',
    recommendation: 'Use text rendering or a sanitizer with an allowlist before rendering external or AI-generated content.',
  },
  {
    id: 'electron-node-integration',
    title: 'Electron nodeIntegration enabled',
    severity: 'high',
    dataClass: 'project_code',
    pattern: /\bnodeIntegration\s*:\s*true\b/,
    detail: 'Renderer Node.js access increases the blast radius of XSS.',
    recommendation: 'Keep nodeIntegration disabled and expose only narrow APIs through a context-isolated preload bridge.',
  },
  {
    id: 'electron-context-isolation-disabled',
    title: 'Electron contextIsolation disabled',
    severity: 'high',
    dataClass: 'project_code',
    pattern: /\bcontextIsolation\s*:\s*false\b/,
    detail: 'Disabling context isolation weakens renderer/main process boundaries.',
    recommendation: 'Keep contextIsolation enabled and validate all IPC calls in the main process.',
  },
  {
    id: 'telemetry-raw-properties',
    title: 'Telemetry call may include raw properties',
    severity: 'medium',
    dataClass: 'personal_data',
    pattern: /\btelemetry\.(?:track|timing)\s*\(/,
    detail: 'Telemetry calls need schema and redaction before persistence or upload.',
    recommendation: 'Route telemetry through PrivacyGuard and use event-specific schemas with no raw prompts, paths, keys, or personal data.',
  },
]

function shouldScanFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  const name = path.basename(filePath).toLowerCase()
  return TEXT_EXTENSIONS.has(ext) || name.startsWith('.env') || name.endsWith('keypair.json')
}

function* walkFiles(root: string): Generator<string> {
  const entries = fs.readdirSync(root, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) yield* walkFiles(fullPath)
      continue
    }
    if (entry.isFile() && shouldScanFile(fullPath)) yield fullPath
  }
}

function lineNumberForOffset(content: string, offset: number): number {
  return content.slice(0, offset).split(/\r\n|\r|\n/).length
}

function summarize(findings: SafetyFinding[]): Record<SafetySeverity, number> {
  return findings.reduce<Record<SafetySeverity, number>>((acc, finding) => {
    acc[finding.severity] += 1
    return acc
  }, { info: 0, low: 0, medium: 0, high: 0, critical: 0 })
}

export function scanProjectSafety(projectPath: string): ProjectSafetyReport {
  const resolved = path.resolve(projectPath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error('Project path does not exist or is not a directory')
  }

  const findings: SafetyFinding[] = []
  let scannedFiles = 0

  for (const filePath of walkFiles(resolved)) {
    if (scannedFiles >= MAX_FILES) break

    let stats: fs.Stats
    try {
      stats = fs.statSync(filePath)
    } catch {
      continue
    }
    if (stats.size > MAX_FILE_BYTES) continue

    let content: string
    try {
      content = fs.readFileSync(filePath, 'utf8')
    } catch {
      continue
    }
    scannedFiles += 1

    for (const rule of RULES) {
      const pattern = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`)
      for (const match of content.matchAll(pattern)) {
        findings.push({
          id: rule.id,
          title: rule.title,
          severity: rule.severity,
          dataClass: rule.dataClass,
          filePath: path.relative(resolved, filePath),
          line: lineNumberForOffset(content, match.index ?? 0),
          detail: redactText(rule.detail).value,
          recommendation: rule.recommendation,
        })
      }
    }
  }

  return {
    projectPath: resolved,
    scannedAt: Date.now(),
    scannedFiles,
    findings,
    summary: summarize(findings),
  }
}
