import fs from 'node:fs'
import path from 'node:path'
import { redactText } from '../security/PrivacyGuard'
import { createSuggestion } from './MemoryService'
import type { MemoryKind, MemorySuggestionInput, ProjectMemory } from '../shared/types'

const LOCKFILE_MANAGERS: Array<{ file: string; manager: string }> = [
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'yarn.lock', manager: 'yarn' },
  { file: 'bun.lockb', manager: 'bun' },
  { file: 'package-lock.json', manager: 'npm' },
]

// Map well-known script names to a typed memory kind. Unknown scripts are not memorized
// automatically (too noisy); the check runner promotes the ones that actually pass.
const SCRIPT_KIND: Record<string, MemoryKind> = {
  test: 'test_command',
  typecheck: 'test_command',
  'type-check': 'test_command',
  build: 'build_command',
  dev: 'dev_command',
  start: 'dev_command',
}

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function detectPackageManager(projectPath: string, pkg: Record<string, unknown> | null): string | null {
  const declared = typeof pkg?.packageManager === 'string' ? pkg.packageManager as string : null
  if (declared) return declared.split('@')[0]
  for (const { file, manager } of LOCKFILE_MANAGERS) {
    if (fs.existsSync(path.join(projectPath, file))) return manager
  }
  return null
}

function detectStack(pkg: Record<string, unknown> | null): string | null {
  if (!pkg) return null
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  }
  const names = Object.keys(deps)
  const hints: string[] = []
  if (names.includes('next')) hints.push('Next.js')
  else if (names.includes('react')) hints.push('React')
  if (names.includes('vue')) hints.push('Vue')
  if (names.includes('svelte')) hints.push('Svelte')
  if (names.includes('electron')) hints.push('Electron')
  if (names.includes('vite')) hints.push('Vite')
  if (names.includes('typescript')) hints.push('TypeScript')
  if (names.some((n) => n.startsWith('@solana/') || n.includes('anchor'))) hints.push('Solana')
  return hints.length ? hints.join(', ') : null
}

/** Drop any candidate whose value contains live secret material. */
function isClean(value: string): boolean {
  return redactText(value).findings.length === 0
}

function push(out: MemorySuggestionInput[], input: MemorySuggestionInput): void {
  if (isClean(input.value) && isClean(input.title)) out.push(input)
}

/**
 * Pure analysis: read the project's config files and return memory suggestion inputs.
 * No DB access — unit-testable against a temp fixture dir.
 */
export function analyzeProject(projectPath: string, projectId: string | null): MemorySuggestionInput[] {
  const out: MemorySuggestionInput[] = []
  const pkgPath = path.join(projectPath, 'package.json')
  const pkg = fs.existsSync(pkgPath) ? readJsonSafe(pkgPath) : null

  const manager = detectPackageManager(projectPath, pkg)
  if (manager) {
    push(out, {
      projectId, kind: 'package_manager', title: 'Package manager',
      value: manager, sourceType: 'lockfile', sourceRef: 'package.json/lockfile',
      confidence: 0.9, createdBy: 'extractor',
    })
  }

  const stack = detectStack(pkg)
  if (stack) {
    push(out, {
      projectId, kind: 'stack', title: 'Stack',
      value: stack, sourceType: 'package_json', sourceRef: 'package.json:dependencies',
      confidence: 0.8, createdBy: 'extractor',
    })
  }

  const scripts = (pkg?.scripts as Record<string, string> | undefined) ?? {}
  const run = manager ?? 'npm'
  for (const [name, kind] of Object.entries(SCRIPT_KIND)) {
    if (typeof scripts[name] === 'string') {
      push(out, {
        projectId, kind, title: `${name} command`,
        value: `${run} run ${name}`, sourceType: 'package_script', sourceRef: `package.json:scripts.${name}`,
        confidence: 0.7, createdBy: 'extractor',
      })
    }
  }

  if (fs.existsSync(path.join(projectPath, '.mcp.json')) ||
      fs.existsSync(path.join(projectPath, '.claude', 'settings.json'))) {
    push(out, {
      projectId, kind: 'mcp_config', title: 'MCP configuration present',
      value: 'Project declares MCP servers via .mcp.json / .claude/settings.json',
      sourceType: 'config_file', sourceRef: '.mcp.json/.claude/settings.json',
      confidence: 0.6, createdBy: 'extractor',
    })
  }

  if (fs.existsSync(path.join(projectPath, 'Anchor.toml'))) {
    push(out, {
      projectId, kind: 'deployment_target', title: 'Anchor/Solana project',
      value: 'Anchor project — Solana on-chain program. Build with anchor build; never auto-deploy.',
      sourceType: 'config_file', sourceRef: 'Anchor.toml',
      confidence: 0.7, createdBy: 'extractor',
    })
  }

  return out
}

/** Effectful: analyze the project and persist deduped suggestions via MemoryService. */
export function extractFromProject(projectPath: string, projectId: string | null): ProjectMemory[] {
  const inputs = analyzeProject(projectPath, projectId)
  const created: ProjectMemory[] = []
  for (const input of inputs) {
    try {
      created.push(createSuggestion(input))
    } catch {
      // A suggestion that trips the secret guard is silently skipped — never surfaced.
    }
  }
  return created
}
