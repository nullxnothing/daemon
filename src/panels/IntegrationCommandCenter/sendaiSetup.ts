export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

export interface InstallCommandOptions {
  packageManager?: PackageManager | null
  pnpmWorkspaceRoot?: boolean
}

export interface PackageInfo {
  packages: Set<string>
  scripts: Set<string>
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

export interface FirstAgentPlan {
  packageManager: PackageManager
  entryFilePath: string
  readmePath: string
  scriptName: string
  scriptCommand: string
  runCommand: string
  missingPackages: string[]
  alreadyScaffolded: boolean
  scriptPresent: boolean
  canScaffold: boolean
  canRun: boolean
  prerequisites: string[]
  safetyNotes: string[]
}

export const SENDAI_AGENT_KIT_PACKAGES = [
  'solana-agent-kit',
  '@solana-agent-kit/plugin-token',
  '@solana-agent-kit/plugin-defi',
  '@solana-agent-kit/plugin-nft',
  '@solana-agent-kit/plugin-misc',
  '@solana-agent-kit/plugin-blinks',
  '@solana/web3.js',
  'bs58',
]

export const SENDAI_FIRST_AGENT_SCRIPT = 'agent:first-solana'
export const SENDAI_FIRST_AGENT_ENTRY = 'src/agents/first-solana-agent.mjs'
export const SENDAI_FIRST_AGENT_README = 'src/agents/README.md'

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
      scripts?: Record<string, string>
      packageManager?: string
    }
    return {
      packages: new Set([
        ...Object.keys(parsed.dependencies ?? {}),
        ...Object.keys(parsed.devDependencies ?? {}),
        ...Object.keys(parsed.optionalDependencies ?? {}),
      ]),
      scripts: new Set(Object.keys(parsed.scripts ?? {})),
      packageManagerHint: parsePackageManagerHint(parsed.packageManager),
    }
  } catch {
    return { packages: new Set(), scripts: new Set(), packageManagerHint: null }
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

export function normalizeProjectInstallCommand(command: string | null, options: InstallCommandOptions = {}): string | null {
  if (!command) return null

  const match = /^(\s*)(pnpm|npm|yarn|bun)\s+(add|install|i)\b(.*)$/u.exec(command)
  if (!match) return command

  const [, leading, sourceManager, , rest] = match
  const packageManager = options.packageManager ?? (sourceManager as PackageManager)
  const restTokens = rest.trim().length > 0 ? rest.trim().split(/\s+/) : []
  const installTokens = packageManager === 'pnpm'
    ? restTokens
    : restTokens.filter((token) => token !== '-w' && token !== '--workspace-root')
  const hasWorkspaceRootFlag = installTokens.includes('-w') || installTokens.includes('--workspace-root')

  const prefix = packageManager === 'npm'
    ? 'npm install'
    : packageManager === 'yarn'
      ? 'yarn add'
      : packageManager === 'bun'
        ? 'bun add'
        : options.pnpmWorkspaceRoot && !hasWorkspaceRootFlag
          ? 'pnpm add -w'
          : 'pnpm add'

  return `${leading}${prefix}${installTokens.length > 0 ? ` ${installTokens.join(' ')}` : ''}`
}

export function buildInstallCommand(
  packageManager: PackageManager,
  packages: string[],
  options: InstallCommandOptions = {},
): string | null {
  if (packages.length === 0) return null
  const prefix = packageManager === 'npm' ? 'npm install' : `${packageManager} add`
  return normalizeProjectInstallCommand(`${prefix} ${packages.join(' ')}`, {
    ...options,
    packageManager,
  })
}

export function createSendAiSetupPlan(input: {
  packageInfo: PackageInfo
  lockfiles: Partial<Record<PackageManager, boolean>>
  envKeys: Set<string>
  pnpmWorkspaceRoot?: boolean
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
    installCommand: buildInstallCommand(packageManager, missingPackages, {
      pnpmWorkspaceRoot: input.pnpmWorkspaceRoot,
    }),
    envFileName: '.env.example',
    missingEnvKeys,
    presentEnvKeys,
    enabledActions: [
      'Create token and NFT action tools',
      'Preview DeFi routes before signing',
      'Scaffold a first runnable Solana agent inside the active project',
    ],
    safetyNotes: [
      'Apply Setup writes placeholders to .env.example, not real secrets.',
      'Package install runs in a visible terminal so the user can stop it.',
      'No transaction, mint, swap, or transfer is executed by this setup.',
    ],
  }
}

export function mergeEnvExample(
  currentContent: string,
  entries: EnvTemplateEntry[] = SENDAI_ENV_TEMPLATE,
  heading = 'SendAI Solana Agent Kit',
): string {
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
  lines.push(`# ${heading}`)
  for (const entry of missing) {
    lines.push(`# ${entry.comment}`)
    lines.push(`${entry.key}=${entry.value}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function createFirstAgentPlan(input: {
  packageInfo: PackageInfo
  lockfiles: Partial<Record<PackageManager, boolean>>
  hasPackageJson: boolean
  hasStarterFile: boolean
}): FirstAgentPlan {
  const packageManager = detectPackageManager(input.packageInfo, input.lockfiles)
  const missingPackages = SENDAI_AGENT_KIT_PACKAGES.filter((name) => !input.packageInfo.packages.has(name))
  const scriptCommand = `node ${SENDAI_FIRST_AGENT_ENTRY}`
  const scriptPresent = input.packageInfo.scripts.has(SENDAI_FIRST_AGENT_SCRIPT)

  return {
    packageManager,
    entryFilePath: SENDAI_FIRST_AGENT_ENTRY,
    readmePath: SENDAI_FIRST_AGENT_README,
    scriptName: SENDAI_FIRST_AGENT_SCRIPT,
    scriptCommand,
    runCommand: buildRunCommand(packageManager, SENDAI_FIRST_AGENT_SCRIPT),
    missingPackages,
    alreadyScaffolded: input.hasStarterFile,
    scriptPresent,
    canScaffold: input.hasPackageJson && !input.hasStarterFile,
    canRun: input.hasPackageJson && input.hasStarterFile && missingPackages.length === 0,
    prerequisites: [
      input.hasPackageJson ? 'package.json detected' : 'Create or open a Node project first',
      missingPackages.length === 0 ? 'Runtime packages are installed' : `${missingPackages.length} package${missingPackages.length === 1 ? '' : 's'} still need install`,
      input.hasStarterFile ? 'Starter agent file already exists' : 'Starter agent file will be created',
    ],
    safetyNotes: [
      'Scaffold only writes starter files and a package.json script.',
      'The generated example only initializes the agent and prints method inventory.',
      'Run Starter Check uses a visible terminal and does not submit transactions.',
    ],
  }
}

export function upsertPackageJsonScript(packageJson: string, scriptName: string, scriptCommand: string): string {
  const parsed = JSON.parse(packageJson) as {
    scripts?: Record<string, string>
  } & Record<string, unknown>

  const nextScripts = { ...(parsed.scripts ?? {}), [scriptName]: scriptCommand }
  const next = { ...parsed, scripts: nextScripts }
  return `${JSON.stringify(next, null, 2)}\n`
}

export function buildFirstSolanaAgentFile(): string {
  return `import bs58 from 'bs58'
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { SolanaAgentKit, KeypairWallet } from 'solana-agent-kit'
import TokenPlugin from '@solana-agent-kit/plugin-token'
import NFTPlugin from '@solana-agent-kit/plugin-nft'
import DefiPlugin from '@solana-agent-kit/plugin-defi'
import MiscPlugin from '@solana-agent-kit/plugin-misc'
import BlinksPlugin from '@solana-agent-kit/plugin-blinks'

function requireEnv(key) {
  const value = process.env[key]?.trim()
  if (!value) {
    throw new Error(\`Missing \${key}. Copy .env.example into .env and fill the value first.\`)
  }
  return value
}

function parseSecretKey(value) {
  const trimmed = value.trim()

  if (trimmed.startsWith('[')) {
    return Uint8Array.from(JSON.parse(trimmed))
  }

  return bs58.decode(trimmed)
}

async function main() {
  const rpcUrl = requireEnv('RPC_URL')
  const secretKey = parseSecretKey(requireEnv('SOLANA_PRIVATE_KEY'))
  const openAiKey = process.env.OPENAI_API_KEY?.trim()

  const keypair = Keypair.fromSecretKey(secretKey)
  const wallet = new KeypairWallet(keypair)
  const connection = new Connection(rpcUrl, 'confirmed')

  const agent = new SolanaAgentKit(
    wallet,
    rpcUrl,
    openAiKey ? { OPENAI_API_KEY: openAiKey } : {}
  )
    .use(TokenPlugin)
    .use(NFTPlugin)
    .use(DefiPlugin)
    .use(MiscPlugin)
    .use(BlinksPlugin)

  const methods = Object.keys(agent.methods ?? {}).sort()
  const balanceLamports = await connection.getBalance(keypair.publicKey)
  const balanceSol = balanceLamports / LAMPORTS_PER_SOL

  console.log('SendAI Solana agent is ready.')
  console.log(\`Wallet: \${keypair.publicKey.toBase58()}\`)
  console.log(\`RPC: \${rpcUrl}\`)
  console.log(\`Wallet balance: \${balanceSol.toFixed(6)} SOL\`)
  console.log(\`Methods loaded: \${methods.length}\`)
  console.log(\`Sample methods: \${methods.slice(0, 12).join(', ')}\`)
  console.log('Next step: replace this starter with the first protocol action you want DAEMON to own.')
}

main().catch((error) => {
  console.error('Starter check failed.')
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
`
}

export function buildFirstSolanaAgentReadme(runCommand = `pnpm run ${SENDAI_FIRST_AGENT_SCRIPT}`): string {
  return `# SendAI Starter Agent

This folder is the first runnable Solana agent scaffold created by DAEMON.

## Files

- \`${SENDAI_FIRST_AGENT_ENTRY}\` initializes Solana Agent Kit with the standard SendAI plugins.
- \`package.json\` gets an \`${SENDAI_FIRST_AGENT_SCRIPT}\` script so the example is easy to run.

## Before you run it

1. Copy \`.env.example\` to \`.env\`.
2. Set \`RPC_URL\` to a devnet or local validator endpoint.
3. Set \`SOLANA_PRIVATE_KEY\` to a dev wallet secret in base58 or JSON-array form.
4. Optionally set \`OPENAI_API_KEY\` if you plan to wire the agent into model tools next.

## Run

\`\`\`bash
${runCommand}
\`\`\`

The starter does a safe first-read only flow:

- builds the agent
- loads the plugins
- reads the current wallet balance from the configured RPC
- prints the available methods
- does not send a transaction

After that, the next safe upgrade is replacing the balance check with a protocol-specific read such as token price, asset lookup, or wallet inspection.
`
}

function parsePackageManagerHint(value: string | undefined): PackageManager | null {
  if (!value) return null
  if (value.startsWith('pnpm@')) return 'pnpm'
  if (value.startsWith('npm@')) return 'npm'
  if (value.startsWith('yarn@')) return 'yarn'
  if (value.startsWith('bun@')) return 'bun'
  return null
}

function buildRunCommand(packageManager: PackageManager, scriptName: string): string {
  if (packageManager === 'npm') return `npm run ${scriptName}`
  if (packageManager === 'pnpm') return `pnpm run ${scriptName}`
  if (packageManager === 'yarn') return `yarn ${scriptName}`
  return `bun run ${scriptName}`
}
