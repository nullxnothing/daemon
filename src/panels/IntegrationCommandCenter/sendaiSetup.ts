export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

export interface PackageInfo {
  packages: Set<string>
  packageManagerHint: PackageManager | null
}

export interface SendAiSetupPlan {
  packageManager: PackageManager
  missingPackages: string[]
  installedPackages: string[]
  installCommand: string | null
  envFileName: string
  missingEnvKeys: string[]
  presentEnvKeys: string[]
  enabledActions: string[]
  safetyNotes: string[]
}

export interface EnvTemplateEntry {
  key: string
  value: string
  comment: string
}

export const SENDAI_AGENT_KIT_PACKAGES = [
  'solana-agent-kit',
  '@solana-agent-kit/plugin-token',
  '@solana-agent-kit/plugin-defi',
  '@solana-agent-kit/plugin-nft',
  '@solana-agent-kit/plugin-misc',
  '@solana-agent-kit/plugin-blinks',
]

export const SENDAI_ENV_TEMPLATE: EnvTemplateEntry[] = [
  {
    key: 'RPC_URL',
    value: 'https://api.devnet.solana.com',
    comment: 'Solana RPC endpoint. Start on devnet until the workflow is tested.',
  },
  {
    key: 'OPENAI_API_KEY',
    value: 'replace_with_model_provider_key',
    comment: 'Model provider key used by the agent runtime.',
  },
  {
    key: 'SOLANA_PRIVATE_KEY',
    value: 'replace_with_devnet_wallet_private_key_or_use_daemon_wallet',
    comment: 'Server-side agent wallet secret. Do not commit real private keys.',
  },
  {
    key: 'HELIUS_API_KEY',
    value: 'optional_helius_key_for_rpc_das_and_priority_fees',
    comment: 'Optional but recommended for production RPC, DAS, and priority fees.',
  },
]

export function parsePackageInfo(packageJson: string): PackageInfo {
  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
      packageManager?: string
    }
    return {
      packages: new Set([
        ...Object.keys(parsed.dependencies ?? {}),
        ...Object.keys(parsed.devDependencies ?? {}),
        ...Object.keys(parsed.optionalDependencies ?? {}),
      ]),
      packageManagerHint: parsePackageManagerHint(parsed.packageManager),
    }
  } catch {
    return { packages: new Set(), packageManagerHint: null }
  }
}

export function detectPackageManager(
  packageInfo: PackageInfo,
  lockfiles: Partial<Record<PackageManager, boolean>>,
): PackageManager {
  if (packageInfo.packageManagerHint) return packageInfo.packageManagerHint
  if (lockfiles.pnpm) return 'pnpm'
  if (lockfiles.bun) return 'bun'
  if (lockfiles.yarn) return 'yarn'
  return 'npm'
}

export function buildInstallCommand(packageManager: PackageManager, packages: string[]): string | null {
  if (packages.length === 0) return null
  const prefix = packageManager === 'yarn' ? 'yarn add' : `${packageManager} add`
  return `${prefix} ${packages.join(' ')}`
}

export function createSendAiSetupPlan(input: {
  packageInfo: PackageInfo
  lockfiles: Partial<Record<PackageManager, boolean>>
  envKeys: Set<string>
}): SendAiSetupPlan {
  const packageManager = detectPackageManager(input.packageInfo, input.lockfiles)
  const missingPackages = SENDAI_AGENT_KIT_PACKAGES.filter((name) => !input.packageInfo.packages.has(name))
  const installedPackages = SENDAI_AGENT_KIT_PACKAGES.filter((name) => input.packageInfo.packages.has(name))
  const missingEnvKeys = SENDAI_ENV_TEMPLATE.map((entry) => entry.key).filter((key) => !input.envKeys.has(key))
  const presentEnvKeys = SENDAI_ENV_TEMPLATE.map((entry) => entry.key).filter((key) => input.envKeys.has(key))

  return {
    packageManager,
    missingPackages,
    installedPackages,
    installCommand: buildInstallCommand(packageManager, missingPackages),
    envFileName: '.env.example',
    missingEnvKeys,
    presentEnvKeys,
    enabledActions: [
      'Create token and NFT action tools',
      'Preview DeFi routes before signing',
      'Expose agent-readable Solana actions through MCP later',
    ],
    safetyNotes: [
      'Apply Setup writes placeholders to .env.example, not real secrets.',
      'Package install runs in a visible terminal so the user can stop it.',
      'No transaction, mint, swap, or transfer is executed by this setup.',
    ],
  }
}

export function mergeEnvExample(currentContent: string, entries: EnvTemplateEntry[] = SENDAI_ENV_TEMPLATE): string {
  const normalized = currentContent.replace(/\r\n/g, '\n')
  const existingKeys = new Set<string>()

  for (const line of normalized.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed
    const eqIndex = withoutExport.indexOf('=')
    if (eqIndex > 0) existingKeys.add(withoutExport.slice(0, eqIndex).trim())
  }

  const missing = entries.filter((entry) => !existingKeys.has(entry.key))
  if (missing.length === 0) return normalized

  const lines = normalized.length > 0 ? normalized.replace(/\n*$/, '\n').split('\n') : []
  if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('')
  lines.push('# SendAI Solana Agent Kit')
  for (const entry of missing) {
    lines.push(`# ${entry.comment}`)
    lines.push(`${entry.key}=${entry.value}`)
  }
  lines.push('')
  return lines.join('\n')
}

function parsePackageManagerHint(value: string | undefined): PackageManager | null {
  if (!value) return null
  if (value.startsWith('pnpm@')) return 'pnpm'
  if (value.startsWith('npm@')) return 'npm'
  if (value.startsWith('yarn@')) return 'yarn'
  if (value.startsWith('bun@')) return 'bun'
  return null
}
