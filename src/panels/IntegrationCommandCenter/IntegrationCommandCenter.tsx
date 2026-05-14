import { useEffect, useMemo, useState } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useAppActions } from '../../store/appActions'
import { useUIStore } from '../../store/ui'
import { useSolanaToolboxStore } from '../../store/solanaToolbox'
import type { EnvFile, WalletListEntry } from '../../types/daemon'
import { buildSolanaRouteReadiness } from '../../lib/solanaReadiness'
import { INTEGRATION_CATEGORIES, INTEGRATION_REGISTRY, type IntegrationCategory, type IntegrationDefinition } from './registry'
import { runIntegrationAction, type IntegrationActionResult } from './actionRunner'
import { resolveIntegrationStatus, summarizeRegistry, type IntegrationContext, type IntegrationStatusSummary } from './status'
import {
  buildFirstSolanaAgentFile,
  buildFirstSolanaAgentReadme,
  createFirstAgentPlan,
  createSendAiSetupPlan,
  detectPackageManager,
  mergeEnvExample,
  normalizeProjectInstallCommand,
  parsePackageInfo,
  upsertPackageJsonScript,
  SENDAI_FIRST_AGENT_ENTRY,
  type EnvTemplateEntry,
  type PackageInfo,
  type PackageManager,
  type FirstAgentPlan,
  type SendAiSetupPlan,
} from './sendaiSetup'
import './IntegrationCommandCenter.css'

function joinProjectPath(projectPath: string, child: string): string {
  return `${projectPath.replace(/[\\/]+$/, '')}/${child}`
}

function statusLabel(summary: IntegrationStatusSummary): string {
  if (summary.status === 'ready') return 'Ready'
  if (summary.status === 'partial') return 'Partial'
  return 'Setup needed'
}

const EMPTY_PACKAGE_INFO: PackageInfo = { packages: new Set(), scripts: new Set(), packageManagerHint: null }
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const STREAMLOCK_STARTER_DIR = 'src/streamlock'
const STREAMLOCK_STARTER_FILE = `${STREAMLOCK_STARTER_DIR}/operator-readiness.mjs`
const STREAMLOCK_STARTER_SCRIPT = 'streamlock:operator-check'
const STREAMLOCK_ENV_TEMPLATE: EnvTemplateEntry[] = [
  {
    key: 'STREAMLOCK_OPERATOR_KEY',
    value: 'sk_replace_with_operator_key',
    comment: 'Server-side Streamlock Operator API key. Never expose this to browser code.',
  },
  {
    key: 'STREAMLOCK_CHAIN',
    value: 'soldev',
    comment: 'Streamlock chain target. Use soldev for devnet and mainnet for production.',
  },
  {
    key: 'STREAMLOCK_API_BASE_URL',
    value: 'https://streamlock.fun',
    comment: 'Hosted Streamlock Operator API base URL. Override only for local Streamlock dev servers.',
  },
  {
    key: 'SOLANA_RPC_URL',
    value: 'https://api.devnet.solana.com',
    comment: 'RPC used by Streamlock write flows for broadcast and confirmation.',
  },
  {
    key: 'STREAMLOCK_TOKEN_MINT',
    value: 'replace_with_streamlock_token_mint',
    comment: 'Optional token mint used by the read-only starter to list eligible locked streams.',
  },
]
const METAPLEX_DRAFT_DIR = 'assets/metaplex'
const METAPLEX_DRAFT_FILE = `${METAPLEX_DRAFT_DIR}/metadata.example.json`
const METAPLEX_DRAFT_SCRIPT = 'metaplex:draft-check'
const LIGHT_STARTER_DIR = 'src/light'
const LIGHT_STARTER_FILE = `${LIGHT_STARTER_DIR}/compression-check.mjs`
const LIGHT_STARTER_SCRIPT = 'light:check'
const MAGICBLOCK_STARTER_DIR = 'src/magicblock'
const MAGICBLOCK_STARTER_FILE = `${MAGICBLOCK_STARTER_DIR}/er-readiness.mjs`
const MAGICBLOCK_STARTER_SCRIPT = 'magicblock:check'
const DEBRIDGE_STARTER_DIR = 'src/debridge'
const DEBRIDGE_STARTER_FILE = `${DEBRIDGE_STARTER_DIR}/dln-route-preview.mjs`
const DEBRIDGE_STARTER_SCRIPT = 'debridge:preview'
const SQUADS_STARTER_DIR = 'src/squads'
const SQUADS_STARTER_FILE = `${SQUADS_STARTER_DIR}/multisig-inspect.mjs`
const SQUADS_STARTER_SCRIPT = 'squads:inspect'
const SENDAI_SKILLS_INSTALL_COMMAND = 'npx skills add sendaifun/skills'
const GUIDED_WORKFLOW_INTEGRATIONS = new Set([
  'streamlock',
  'sendai-agent-kit',
  'helius',
  'phantom',
  'jupiter',
  'metaplex',
  'light-protocol',
  'magicblock',
  'debridge',
  'squads',
])
const INTEGRATION_SELECTION_ALIASES = new Map<string, string>([
  ['sendai-solana-mcp', 'sendai-agent-kit'],
])
const DEFAULT_WALLET_INFRASTRUCTURE: WalletInfrastructureSettings = {
  rpcProvider: 'helius',
  quicknodeRpcUrl: '',
  customRpcUrl: '',
  swapProvider: 'jupiter',
  preferredWallet: 'phantom',
  executionMode: 'rpc',
  jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
}

interface DetailShortcut {
  label: string
  onClick: () => void
}

interface PhantomRpcSetupInput {
  rpcProvider: WalletInfrastructureSettings['rpcProvider']
  heliusKey: string
  rpcUrl: string
}

function getWalletRpcLabel(settings: WalletInfrastructureSettings): string {
  if (settings.rpcProvider === 'helius') return 'Helius RPC'
  if (settings.rpcProvider === 'quicknode') return 'QuickNode RPC'
  if (settings.rpcProvider === 'custom') return 'Custom RPC'
  return 'Public RPC'
}

function isWalletRpcReady(settings: WalletInfrastructureSettings, heliusConfigured: boolean): boolean {
  if (settings.rpcProvider === 'helius') return heliusConfigured
  if (settings.rpcProvider === 'quicknode') return settings.quicknodeRpcUrl.trim().length > 0
  if (settings.rpcProvider === 'custom') return settings.customRpcUrl.trim().length > 0
  return true
}

function buildSendAiSkillSuggestions(context: IntegrationContext): string[] {
  const suggestions: string[] = []

  if (context.packages.has('solana-agent-kit')) suggestions.push('solana-agent-kit')
  if (context.secureKeys.HELIUS_API_KEY || context.mcps.some((entry) => entry.name === 'helius' && entry.enabled)) suggestions.push('helius')
  if (context.secureKeys.JUPITER_API_KEY) suggestions.push('integrating-jupiter')
  if (context.packages.has('@metaplex-foundation/umi')) suggestions.push('metaplex')
  if (context.packages.has('@lightprotocol/stateless.js') || context.packages.has('@lightprotocol/compressed-token')) suggestions.push('light-protocol')
  if (context.packages.has('@magicblock-labs/ephemeral-rollups-sdk')) suggestions.push('magicblock')
  if (context.packages.has('@debridge-finance/dln-client')) suggestions.push('debridge')
  if (context.packages.has('@sqds/multisig')) suggestions.push('squads')
  if (context.packages.has('@raydium-io/raydium-sdk-v2')) suggestions.push('raydium')

  return suggestions.length > 0 ? suggestions : ['solana-agent-kit', 'helius', 'integrating-jupiter']
}

function buildStreamlockOperatorStarter(): string {
  return `const apiKey = process.env.STREAMLOCK_OPERATOR_KEY?.trim()
const chain = process.env.STREAMLOCK_CHAIN?.trim() || 'devnet'
const baseUrl = (process.env.STREAMLOCK_API_BASE_URL?.trim() || 'https://streamlock.fun').replace(/\\/$/, '')
const tokenMint = process.env.STREAMLOCK_TOKEN_MINT?.trim()

if (!apiKey || apiKey === 'sk_replace_with_operator_key') {
  throw new Error('Missing STREAMLOCK_OPERATOR_KEY. Add the server-side operator key before running this check.')
}

async function streamlock(path, init = {}) {
  const response = await fetch(\`\${baseUrl}\${path}\`, {
    ...init,
    headers: {
      Authorization: \`Bearer \${apiKey}\`,
      'Content-Type': 'application/json',
      'X-Streamlock-Chain': chain,
      ...(init.headers ?? {}),
    },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.error) {
    const error = payload?.error ?? { code: response.status, message: response.statusText }
    const requestId = payload?.meta?.requestId ?? null
    throw new Error(\`Streamlock API failed: \${error.code} \${error.message}\${requestId ? \` (requestId \${requestId})\` : ''}\`)
  }
  return payload
}

console.log('Streamlock Operator API is configured.')
console.log(JSON.stringify({ baseUrl, chain, apiKey: \`\${apiKey.slice(0, 11)}...\` }, null, 2))

if (!tokenMint || tokenMint === 'replace_with_streamlock_token_mint') {
  console.log('STREAMLOCK_TOKEN_MINT is not set. Skipping stream discovery.')
  console.log('Next step: set a locked token mint, then read streams before adding session or delta writes.')
  process.exit(0)
}

try {
  const result = await streamlock(\`/v1/operator/tokens/\${tokenMint}/streams\`)
  const streams = Array.isArray(result?.data?.streams) ? result.data.streams : []
  console.log('Streamlock stream discovery complete.')
  console.log(JSON.stringify({
    tokenMint,
    responseChain: result?.meta?.chain ?? null,
    requestId: result?.meta?.requestId ?? null,
    streams: streams.length,
    firstStreamId: streams[0]?.streamId ?? null,
  }, null, 2))
  console.log('No session was created, no delta was submitted, and no transaction was signed.')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
`
}

function buildScriptRunCommand(packageManager: PackageManager | null, scriptName: string): string {
  if (packageManager === 'npm') return `npm run ${scriptName}`
  if (packageManager === 'yarn') return `yarn ${scriptName}`
  if (packageManager === 'bun') return `bun run ${scriptName}`
  return `pnpm run ${scriptName}`
}

function buildMetaplexDraftFile(): string {
  return `${JSON.stringify({
    name: 'DAEMON Collection Example',
    symbol: 'DMON',
    description: 'Example Metaplex metadata draft scaffolded by DAEMON.',
    seller_fee_basis_points: 500,
    image: 'image.png',
    external_url: 'https://example.com',
    attributes: [
      { trait_type: 'Collection', value: 'Example' },
      { trait_type: 'Tier', value: 'Starter' },
    ],
    properties: {
      category: 'image',
      files: [
        { type: 'image/png', uri: 'image.png' },
      ],
      creators: [
        { address: 'replace_with_creator_wallet', share: 100 },
      ],
    },
  }, null, 2)}\n`
}

function buildLightCompressionStarter(): string {
  return `async function main() {
  const rpcUrl = process.env.RPC_URL?.trim()
  if (!rpcUrl) {
    throw new Error('Missing RPC_URL. Copy .env.example into .env and set a compression-capable RPC first.')
  }

  const stateless = await import('@lightprotocol/stateless.js')
  const compressedToken = await import('@lightprotocol/compressed-token')
  const createRpc = stateless.createRpc
  const rpc = typeof createRpc === 'function' ? createRpc(rpcUrl, rpcUrl) : null
  const statelessExports = Object.keys(stateless).sort()
  const tokenExports = Object.keys(compressedToken).sort()

  console.log('Light Protocol starter is ready.')
  console.log(\`RPC: \${rpcUrl}\`)
  console.log(\`Stateless exports detected: \${statelessExports.length}\`)
  console.log(\`Compressed token exports detected: \${tokenExports.length}\`)

  if (rpc && typeof rpc.getIndexerHealth === 'function') {
    try {
      const health = await rpc.getIndexerHealth()
      console.log(\`Indexer health: \${JSON.stringify(health)}\`)
    } catch (error) {
      console.warn('Indexer health check was unavailable on this RPC endpoint.')
      console.warn(error instanceof Error ? error.message : String(error))
    }
  }

  console.log('Next step: add a read-only getCompressedTokenAccountsByOwner check for the wallet you want DAEMON to guide.')
  console.log('Keep transaction builders behind explicit confirmation; compressed-account proof flows need compute budget and fee previews.')
}

main().catch((error) => {
  console.error('Light starter failed.')
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
`
}

function buildMagicBlockStarter(): string {
  return `async function main() {
  const baseRpcUrl = process.env.RPC_URL?.trim()
  const routerUrl = process.env.MAGICBLOCK_ROUTER_URL?.trim() || 'https://devnet-router.magicblock.app'

  if (!baseRpcUrl) {
    throw new Error('Missing RPC_URL. Set the Solana base-layer RPC before adding MagicBlock routes.')
  }

  const magicblock = await import('@magicblock-labs/ephemeral-rollups-sdk')
  const exportedKeys = Object.keys(magicblock).sort()

  console.log('MagicBlock starter is ready.')
  console.log(\`Base RPC: \${baseRpcUrl}\`)
  console.log(\`Magic Router: \${routerUrl}\`)
  console.log(\`SDK exports detected: \${exportedKeys.length}\`)
  console.log(\`Sample exports: \${exportedKeys.slice(0, 12).join(', ')}\`)
  console.log('Next step: map which program accounts can be delegated before building any ER transaction path.')
  console.log('Keep base-layer initialization, ER execution, commit, and undelegate flows as separate reviewed steps.')
  console.log('Only use skipPreflight on the ER path after delegation status is verified.')
}

main().catch((error) => {
  console.error('MagicBlock starter failed.')
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
`
}

function buildDebridgeStarter(): string {
  return `async function main() {
  const apiBase = process.env.DEBRIDGE_API_URL?.trim() || 'https://dln.debridge.finance/v1.0'
  const required = [
    'DEBRIDGE_SRC_CHAIN_ID',
    'DEBRIDGE_DST_CHAIN_ID',
    'DEBRIDGE_SRC_TOKEN_IN',
    'DEBRIDGE_DST_TOKEN_OUT',
    'DEBRIDGE_AMOUNT_IN',
    'DEBRIDGE_SRC_ADDRESS',
    'DEBRIDGE_DST_ADDRESS',
  ]
  const missing = required.filter((key) => !process.env[key]?.trim())

  const dlnClient = await import('@debridge-finance/dln-client')
  const exportedKeys = Object.keys(dlnClient).sort()

  console.log('deBridge DLN starter is ready.')
  console.log(\`API: \${apiBase}\`)
  console.log(\`DLN client exports detected: \${exportedKeys.length}\`)
  console.log(\`Sample exports: \${exportedKeys.slice(0, 12).join(', ')}\`)

  if (missing.length > 0) {
    console.log('Route preview skipped. Add these env vars to request a create-tx estimate:')
    for (const key of missing) console.log(\`- \${key}\`)
    console.log('No transaction was constructed or submitted.')
    return
  }

  const params = new URLSearchParams({
    srcChainId: process.env.DEBRIDGE_SRC_CHAIN_ID.trim(),
    dstChainId: process.env.DEBRIDGE_DST_CHAIN_ID.trim(),
    srcChainTokenIn: process.env.DEBRIDGE_SRC_TOKEN_IN.trim(),
    dstChainTokenOut: process.env.DEBRIDGE_DST_TOKEN_OUT.trim(),
    srcChainTokenInAmount: process.env.DEBRIDGE_AMOUNT_IN.trim(),
    srcChainOrderAuthorityAddress: process.env.DEBRIDGE_SRC_ADDRESS.trim(),
    dstChainTokenOutRecipient: process.env.DEBRIDGE_DST_ADDRESS.trim(),
    dstChainOrderAuthorityAddress: process.env.DEBRIDGE_DST_ADDRESS.trim(),
  })

  const url = \`\${apiBase.replace(/\\/$/, '')}/dln/order/create-tx?\${params.toString()}\`
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  const payload = await response.json()

  if (!response.ok) {
    console.error('deBridge create-tx preview failed.')
    console.error(JSON.stringify(payload, null, 2))
    process.exitCode = 1
    return
  }

  console.log('deBridge create-tx preview returned a response.')
  console.log(JSON.stringify({
    orderId: payload.orderId ?? null,
    estimation: payload.estimation ?? null,
    txIncluded: Boolean(payload.tx),
  }, null, 2))
  console.log('Do not sign or submit tx payloads from this starter without a separate wallet confirmation flow.')
}

main().catch((error) => {
  console.error('deBridge starter failed.')
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
`
}

function buildSquadsStarter(): string {
  return `async function main() {
  const rpcUrl = process.env.RPC_URL?.trim()
  const multisigAddress = process.env.SQUADS_MULTISIG_ADDRESS?.trim()
  const requestedVaultIndex = process.env.SQUADS_VAULT_INDEX?.trim()
  const vaultIndex = requestedVaultIndex ? Number(requestedVaultIndex) : 0

  if (!rpcUrl) {
    throw new Error('Missing RPC_URL. Set a Solana RPC before inspecting Squads accounts.')
  }

  if (!Number.isInteger(vaultIndex) || vaultIndex < 0) {
    throw new Error('SQUADS_VAULT_INDEX must be a non-negative integer.')
  }

  const squads = await import('@sqds/multisig')
  const web3 = await import('@solana/web3.js')
  const exportedKeys = Object.keys(squads).sort()

  console.log('Squads starter is ready.')
  console.log(\`RPC: \${rpcUrl}\`)
  console.log(\`SDK exports detected: \${exportedKeys.length}\`)
  console.log(\`Sample exports: \${exportedKeys.slice(0, 12).join(', ')}\`)

  if (!multisigAddress) {
    console.log('Multisig inspection skipped. Add SQUADS_MULTISIG_ADDRESS to inspect an existing V4 multisig.')
    console.log('No proposal, vote, execute, or treasury movement was attempted.')
    return
  }

  const connection = new web3.Connection(rpcUrl, 'confirmed')
  const multisigPda = new web3.PublicKey(multisigAddress)
  const account = await squads.accounts.Multisig.fromAccountAddress(connection, multisigPda)
  const [vaultPda] = squads.getVaultPda({ multisigPda, index: vaultIndex })
  const vaultLamports = await connection.getBalance(vaultPda)

  console.log('Squads multisig inspection complete.')
  console.log(JSON.stringify({
    multisig: multisigPda.toBase58(),
    threshold: account.threshold?.toString?.() ?? account.threshold ?? null,
    transactionIndex: account.transactionIndex?.toString?.() ?? account.transactionIndex ?? null,
    vaultIndex,
    vault: vaultPda.toBase58(),
    vaultLamports,
  }, null, 2))
  console.log('Do not create proposals, vote, execute, or move vault assets from this starter.')
}

main().catch((error) => {
  console.error('Squads starter failed.')
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
`
}

function RiskPill({ risk }: { risk: string }) {
  return <span className={`icc-risk icc-risk--${risk}`}>{risk.replace('-', ' ')}</span>
}

function RequirementList({ summary }: { summary: IntegrationStatusSummary }) {
  return (
    <div className="icc-requirements">
      {summary.requirements.map((requirement) => (
        <div key={`${requirement.type}:${requirement.key}`} className={`icc-requirement ${requirement.ready ? 'ready' : ''}`}>
          <span className={`icc-requirement-dot ${requirement.ready ? 'ready' : ''}`} />
          <div>
            <span className="icc-requirement-label">
              {requirement.label}
              {requirement.optional ? <span className="icc-optional"> optional</span> : null}
            </span>
            <span className="icc-requirement-detail">{requirement.detail}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function AiSetupCallout({
  title,
  detail,
  providerLabel,
  actionLabel,
  busyLabel,
  busy,
  disabled,
  onSetup,
}: {
  title?: string
  detail: string
  providerLabel?: string
  actionLabel?: string
  busyLabel?: string
  busy?: boolean
  disabled?: boolean
  onSetup: () => void
}) {
  return (
    <div className="icc-ai-setup">
      <div className="icc-ai-setup-copy">
        <span className="icc-mini-title">AI setup</span>
        <strong>{title ?? 'Let DAEMON set this up'}</strong>
        <p>{detail}</p>
        {providerLabel ? <small>Uses {providerLabel}</small> : null}
      </div>
      <button type="button" className="icc-ai-setup-button" onClick={onSetup} disabled={busy || disabled}>
        {busy ? (busyLabel ?? 'Setting up...') : (actionLabel ?? 'Set up with AI')}
      </button>
    </div>
  )
}

function SendAiAgentLaunchpad({
  projectReady,
  setupPlan,
  agentPlan,
  result,
  setupApplied,
  applying,
  scaffolding,
  running,
  onOpenProjectStarter,
  onApplySetup,
  onScaffold,
  onRun,
  aiProviderLabel,
  aiBusy,
  onAiSetup,
}: {
  projectReady: boolean
  setupPlan: SendAiSetupPlan
  agentPlan: FirstAgentPlan
  result?: IntegrationActionResult | null
  setupApplied: boolean
  applying: boolean
  scaffolding: boolean
  running: boolean
  onOpenProjectStarter: () => void
  onApplySetup: () => void
  onScaffold: () => void
  onRun: () => void
  aiProviderLabel: string
  aiBusy: boolean
  onAiSetup: () => void
}) {
  const setupNeedsAction = projectReady && !setupApplied && (Boolean(setupPlan.installCommand) || setupPlan.missingEnvKeys.length > 0)
  const setupDone = !setupNeedsAction
  const scaffoldDone = agentPlan.alreadyScaffolded
  const runReady = projectReady && agentPlan.canRun

  const nextAction = !projectReady
    ? {
      label: 'Open New Project',
      detail: 'Create or open a Node-based Solana project first so DAEMON has somewhere to install packages, write env files, and scaffold the starter agent.',
      disabled: false,
      action: onOpenProjectStarter,
    }
    : setupNeedsAction
    ? {
      label: applying ? 'Applying project setup...' : 'Apply project setup',
      detail: setupPlan.installCommand
        ? `Install ${setupPlan.missingPackages.length} package${setupPlan.missingPackages.length === 1 ? '' : 's'} and add ${setupPlan.missingEnvKeys.length} env template key${setupPlan.missingEnvKeys.length === 1 ? '' : 's'}.`
        : `Add ${setupPlan.missingEnvKeys.length} env template key${setupPlan.missingEnvKeys.length === 1 ? '' : 's'} so the starter has the right placeholders.`,
      disabled: applying,
      action: onApplySetup,
    }
    : !scaffoldDone
      ? {
        label: scaffolding ? 'Creating starter files...' : 'Create starter files',
        detail: 'Write the starter agent, README, and one package.json script so this project has a clear first run path.',
        disabled: scaffolding || !agentPlan.canScaffold,
        action: onScaffold,
      }
      : {
        label: running ? 'Opening starter check...' : 'Run starter check',
        detail: 'Open a visible terminal and run the safe readiness check so you can verify the first agent boots cleanly.',
        disabled: running || !runReady,
        action: onRun,
      }

  return (
    <div className="icc-setup-workflow">
      <div className="icc-setup-head">
        <div>
          <span className="icc-section-title">Guided path</span>
          <h3>Get this project to a first working SendAI agent</h3>
          <p>Instead of sending you to another drawer, DAEMON can take the project through setup, scaffolding, and a safe first run in order.</p>
        </div>
        <span className={`icc-status-badge ${runReady ? 'ready' : 'partial'}`}>
          {runReady ? 'ready to run' : 'guided'}
        </span>
      </div>

      <div className="icc-guided-next">
        <span className="icc-mini-title">Next step</span>
        <strong>{nextAction.label.replace(/\.\.\.$/, '')}</strong>
        <p>{nextAction.detail}</p>
      </div>

      <AiSetupCallout
        detail={`${aiProviderLabel} will inspect the project and handle the safest setup work for this integration.`}
        providerLabel={aiProviderLabel}
        busy={aiBusy}
        busyLabel={`Launching ${aiProviderLabel}...`}
        disabled={nextAction.disabled}
        onSetup={onAiSetup}
      />

      <div className="icc-step-list">
        <div className={`icc-step ${projectReady ? 'ready' : 'active'}`}>
          <span className="icc-step-index">0</span>
          <div className="icc-step-main">
            <strong>Project context</strong>
            <p>{projectReady ? 'Active Node/Solana project detected.' : 'Open or scaffold a project before SendAI setup can start.'}</p>
          </div>
          <span className={`icc-status-badge ${projectReady ? 'ready' : 'partial'}`}>{projectReady ? 'done' : 'next'}</span>
        </div>

        <div className={`icc-step ${setupDone ? 'ready' : 'active'}`}>
          <span className="icc-step-index">1</span>
          <div className="icc-step-main">
            <strong>Project setup</strong>
            <p>{setupPlan.installCommand ?? 'Runtime packages already installed'}{setupPlan.installCommand ? '' : '. Env template keys are already present.'}</p>
          </div>
          <span className={`icc-status-badge ${setupDone ? 'ready' : 'partial'}`}>{setupDone ? 'done' : 'next'}</span>
        </div>

        <div className={`icc-step ${setupDone && !scaffoldDone ? 'active' : scaffoldDone ? 'ready' : ''}`}>
          <span className="icc-step-index">2</span>
          <div className="icc-step-main">
            <strong>Starter files</strong>
            <p>{agentPlan.entryFilePath}, {agentPlan.readmePath}, and {agentPlan.scriptName} in package.json.</p>
          </div>
          <span className={`icc-status-badge ${scaffoldDone ? 'ready' : setupDone ? 'partial' : ''}`}>{scaffoldDone ? 'done' : setupDone ? 'next' : 'waiting'}</span>
        </div>

        <div className={`icc-step ${scaffoldDone && !runReady ? 'active' : runReady ? 'ready' : ''}`}>
          <span className="icc-step-index">3</span>
          <div className="icc-step-main">
            <strong>Safe starter check</strong>
            <p>Run <code>{agentPlan.runCommand}</code> in a visible terminal so the developer can watch the first-agent readiness check.</p>
          </div>
          <span className={`icc-status-badge ${runReady ? 'ready' : scaffoldDone ? 'partial' : ''}`}>{runReady ? 'ready' : scaffoldDone ? 'next' : 'waiting'}</span>
        </div>
      </div>

      <div className="icc-plan-grid">
        <div className="icc-plan-card">
          <span>Starter file</span>
          <code>{agentPlan.entryFilePath}</code>
        </div>
        <div className="icc-plan-card">
          <span>Run command</span>
          <code>{agentPlan.runCommand}</code>
        </div>
      </div>

      <div className="icc-plan-columns">
        <div>
          <span className="icc-mini-title">Readiness</span>
          <div className="icc-check-list">
            {agentPlan.prerequisites.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
        <div>
          <span className="icc-mini-title">Safety</span>
          <div className="icc-check-list">
            {[...setupPlan.safetyNotes, ...agentPlan.safetyNotes].map((note) => <span key={note}>{note}</span>)}
          </div>
        </div>
      </div>

      {result ? (
        <div className={`icc-result ${result.status}`}>
          <span className="icc-result-title">{result.title}</span>
          <p>{result.detail}</p>
          {result.items?.length ? (
            <div className="icc-result-items">
              {result.items.map((item) => <code key={item}>{item}</code>)}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="icc-setup-actions">
        <button type="button" className="icc-secondary" onClick={nextAction.action} disabled={nextAction.disabled}>
          {nextAction.label}
        </button>
      </div>
    </div>
  )
}

function SendAiSkillsWorkflow({
  installCommand,
  suggestions,
  result,
  installing,
  onInstall,
  aiProviderLabel,
  aiBusy,
  onAiSetup,
}: {
  installCommand: string
  suggestions: string[]
  result?: IntegrationActionResult | null
  installing: boolean
  onInstall: () => void
  aiProviderLabel: string
  aiBusy: boolean
  onAiSetup: () => void
}) {
  return (
    <div className="icc-setup-workflow icc-setup-workflow--secondary">
      <div className="icc-setup-head">
        <div>
          <span className="icc-section-title">Curated skills</span>
          <h3>Bring protocol knowledge into this project</h3>
          <p>DAEMON can install the skills pack here and show the protocol guides that best match the current codebase.</p>
        </div>
        <span className="icc-status-badge partial">recommended</span>
      </div>

      <div className="icc-plan-grid">
        <div className="icc-plan-card">
          <span>Install command</span>
          <code>{installCommand}</code>
        </div>
        <div className="icc-plan-card">
          <span>Best skill matches</span>
          <code>{suggestions.join(', ')}</code>
        </div>
      </div>

      <div className="icc-plan-columns">
        <div>
          <span className="icc-mini-title">Suggested skills</span>
          <div className="icc-check-list">
            {suggestions.map((suggestion) => <span key={suggestion}>{suggestion}</span>)}
          </div>
        </div>
        <div>
          <span className="icc-mini-title">What this helps with</span>
          <div className="icc-check-list">
            <span>Protocol docs inside DAEMON</span>
            <span>Cleaner integration recipes</span>
            <span>Less context-switching to external repos</span>
          </div>
        </div>
      </div>

      <div className="icc-inline-note">
        This opens a visible terminal and runs the skills install command in the current project. It does not execute any on-chain action.
      </div>

      <AiSetupCallout
        detail={`${aiProviderLabel} will inspect the project and decide whether the skills pack should be installed.`}
        providerLabel={aiProviderLabel}
        busy={aiBusy}
        busyLabel={`Launching ${aiProviderLabel}...`}
        onSetup={onAiSetup}
      />

      {result ? (
        <div className={`icc-result ${result.status}`}>
          <span className="icc-result-title">{result.title}</span>
          <p>{result.detail}</p>
          {result.items?.length ? (
            <div className="icc-result-items">
              {result.items.map((item) => <code key={item}>{item}</code>)}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="icc-setup-actions">
        <button type="button" className="icc-secondary" onClick={onInstall} disabled={installing}>
          {installing ? 'Opening install terminal...' : 'Install skills in terminal'}
        </button>
      </div>
    </div>
  )
}

function IntegrationFirstWinWorkflow({
  sectionTitle,
  title,
  description,
  status,
  result,
  nextLabel,
  nextDetail,
  cards,
  items,
  primaryLabel,
  primaryBusyLabel,
  busy,
  onPrimary,
  secondaryLabel,
  onSecondary,
  note,
  aiProviderLabel,
  aiBusy,
  onAiSetup,
}: {
  sectionTitle: string
  title: string
  description: string
  status: 'ready' | 'partial'
  result?: IntegrationActionResult | null
  nextLabel: string
  nextDetail: string
  cards: Array<{ label: string; value: string }>
  items: Array<{ label: string; detail: string; ready: boolean }>
  primaryLabel: string
  primaryBusyLabel: string
  busy: boolean
  onPrimary: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  note?: string
  aiProviderLabel: string
  aiBusy: boolean
  onAiSetup: () => void
}) {
  return (
    <div className="icc-setup-workflow">
      <div className="icc-setup-head">
        <div>
          <span className="icc-section-title">{sectionTitle}</span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className={`icc-status-badge ${status}`}>{status === 'ready' ? 'ready' : 'guided'}</span>
      </div>

      <div className="icc-guided-next">
        <span className="icc-mini-title">Next step</span>
        <strong>{nextLabel}</strong>
        <p>{nextDetail}</p>
      </div>

      <AiSetupCallout
        detail={`${aiProviderLabel} will inspect the project and handle the safest setup work for this integration.`}
        providerLabel={aiProviderLabel}
        busy={aiBusy}
        busyLabel={`Launching ${aiProviderLabel}...`}
        onSetup={onAiSetup}
      />

      <div className="icc-plan-grid">
        {cards.map((card) => (
          <div key={card.label} className="icc-plan-card">
            <span>{card.label}</span>
            <code>{card.value}</code>
          </div>
        ))}
      </div>

      <div className="icc-step-list">
        {items.map((item, index) => (
          <div key={item.label} className={`icc-step ${item.ready ? 'ready' : 'active'}`}>
            <span className="icc-step-index">{index + 1}</span>
            <div className="icc-step-main">
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </div>
            <span className={`icc-status-badge ${item.ready ? 'ready' : 'partial'}`}>{item.ready ? 'done' : 'next'}</span>
          </div>
        ))}
      </div>

      {note ? <div className="icc-inline-note">{note}</div> : null}

      {result ? (
        <div className={`icc-result ${result.status}`}>
          <span className="icc-result-title">{result.title}</span>
          <p>{result.detail}</p>
          {result.items?.length ? (
            <div className="icc-result-items">
              {result.items.map((item) => <code key={item}>{item}</code>)}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="icc-setup-actions">
        <button type="button" className="icc-secondary" onClick={onPrimary} disabled={busy}>
          {busy ? primaryBusyLabel : primaryLabel}
        </button>
        {secondaryLabel && onSecondary ? (
          <button type="button" className="icc-secondary" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function PhantomWalletWorkflow({
  wallet,
  isMainWallet,
  signerReady,
  projectAssigned,
  hasActiveProject,
  preferredWallet,
  executionMode,
  rpcLabel,
  rpcReady,
  infrastructure,
  heliusConfigured,
  result,
  busy,
  onOpenWallet,
  onCreateSigningWallet,
  onSaveRpcSetup,
  onSetMainWallet,
  onAssignProject,
  onPreferPhantom,
  onPreviewTransaction,
  aiProviderLabel,
  aiBusy,
  onAiSetup,
}: {
  wallet: WalletListEntry | null
  isMainWallet: boolean
  signerReady: boolean
  projectAssigned: boolean
  hasActiveProject: boolean
  preferredWallet: WalletInfrastructureSettings['preferredWallet']
  executionMode: WalletInfrastructureSettings['executionMode']
  rpcLabel: string
  rpcReady: boolean
  infrastructure: WalletInfrastructureSettings
  heliusConfigured: boolean
  result?: IntegrationActionResult | null
  busy: boolean
  onOpenWallet: () => void
  onCreateSigningWallet: (name: string) => void
  onSaveRpcSetup: (input: PhantomRpcSetupInput) => void
  onSetMainWallet: () => void
  onAssignProject: () => void
  onPreferPhantom: () => void
  onPreviewTransaction: () => void
  aiProviderLabel: string
  aiBusy: boolean
  onAiSetup: () => void
}) {
  const [quickWalletName, setQuickWalletName] = useState('DAEMON Phantom Wallet')
  const [rpcProvider, setRpcProvider] = useState<WalletInfrastructureSettings['rpcProvider']>(infrastructure.rpcProvider)
  const [rpcUrl, setRpcUrl] = useState(
    infrastructure.rpcProvider === 'quicknode'
      ? infrastructure.quicknodeRpcUrl
      : infrastructure.rpcProvider === 'custom'
        ? infrastructure.customRpcUrl
        : '',
  )
  const [heliusKey, setHeliusKey] = useState('')
  useEffect(() => {
    setRpcProvider(infrastructure.rpcProvider)
    setRpcUrl(
      infrastructure.rpcProvider === 'quicknode'
        ? infrastructure.quicknodeRpcUrl
        : infrastructure.rpcProvider === 'custom'
          ? infrastructure.customRpcUrl
          : '',
    )
  }, [infrastructure])
  const readiness = buildSolanaRouteReadiness({
    walletPresent: Boolean(wallet),
    walletName: wallet?.name,
    walletAddress: wallet?.address,
    isMainWallet,
    signerReady,
    hasActiveProject,
    projectAssigned,
    preferredWallet,
    executionMode,
    rpcLabel,
    rpcReady,
    requirePreferredWallet: true,
  })
  const runQuickCreate = () => onCreateSigningWallet(quickWalletName.trim() || 'DAEMON Phantom Wallet')
  const runRpcSetup = () => onSaveRpcSetup({
    rpcProvider,
    heliusKey: heliusKey.trim(),
    rpcUrl: rpcUrl.trim(),
  })
  const nextAction = readiness.nextAction.id === 'open-wallet'
    ? runQuickCreate
    : readiness.nextAction.id === 'set-main-wallet'
    ? onSetMainWallet
    : readiness.nextAction.id === 'assign-project'
      ? onAssignProject
      : readiness.nextAction.id === 'set-preferred-wallet'
        ? onPreferPhantom
        : readiness.nextAction.id === 'preview-transaction'
          ? onPreviewTransaction
          : readiness.nextAction.id === 'open-infrastructure'
            ? runRpcSetup
          : onOpenWallet
  const ready = readiness.readyCount === readiness.totalCount
  const stepActions = readiness.items.map((item) => {
    if (item.key === 'main-wallet') {
      return {
        key: item.key,
        label: !wallet ? 'Create signer' : isMainWallet ? 'Done' : 'Make main',
        onClick: !wallet ? runQuickCreate : isMainWallet ? undefined : onSetMainWallet,
        disabled: isMainWallet,
      }
    }
    if (item.key === 'signer') {
      return {
        key: item.key,
        label: signerReady ? 'Done' : 'Create signer',
        onClick: signerReady ? undefined : runQuickCreate,
        disabled: signerReady,
      }
    }
    if (item.key === 'project') {
      return {
        key: item.key,
        label: !hasActiveProject ? 'Optional' : projectAssigned ? 'Done' : 'Use here',
        onClick: !hasActiveProject || projectAssigned ? undefined : onAssignProject,
        disabled: !hasActiveProject || projectAssigned,
      }
    }
    return {
      key: item.key,
      label: !rpcReady ? 'Save RPC' : preferredWallet !== 'phantom' ? 'Set Phantom' : 'Preview',
      onClick: !rpcReady ? runRpcSetup : preferredWallet !== 'phantom' ? onPreferPhantom : onPreviewTransaction,
      disabled: false,
    }
  })

  return (
    <div className="icc-setup-workflow icc-setup-workflow--wallet">
      <div className="icc-setup-head">
        <div>
          <span className="icc-section-title">Wallet workflow</span>
          <h3>{ready ? 'Phantom route ready' : 'Set up the Phantom route'}</h3>
          <p>One wallet route, one signer path, and one project assignment before DAEMON asks Phantom-facing users to sign anything.</p>
        </div>
        <span className={`icc-status-badge ${ready ? 'ready' : 'partial'}`}>
          {ready ? 'ready' : 'guided'}
        </span>
      </div>

      <div className="icc-guided-next">
        <span className="icc-mini-title">Next step</span>
        <strong>{readiness.nextAction.label}</strong>
        <p>{readiness.nextAction.detail}</p>
      </div>

      <AiSetupCallout
        detail={`${aiProviderLabel} will inspect the project and handle the safest Phantom setup work.`}
        providerLabel={aiProviderLabel}
        busy={aiBusy}
        busyLabel={`Launching ${aiProviderLabel}...`}
        onSetup={onAiSetup}
      />

      {!signerReady ? (
        <div className="icc-quick-wallet">
          <div className="icc-quick-wallet-copy">
            <span className="icc-mini-title">Fast setup</span>
            <strong>Create the signing wallet here</strong>
            <p>This creates a local DAEMON wallet, makes it the default route, links it to this project when possible, and keeps Phantom as the preferred user-facing path.</p>
          </div>
          <div className="icc-quick-wallet-form">
            <input
              className="icc-quick-wallet-input"
              value={quickWalletName}
              onChange={(event) => setQuickWalletName(event.target.value)}
              placeholder="Wallet name"
            />
            <button type="button" className="icc-primary" onClick={runQuickCreate} disabled={busy}>
              {busy ? 'Creating...' : 'Create signing wallet'}
            </button>
          </div>
        </div>
      ) : null}

      {!rpcReady ? (
        <div className="icc-quick-wallet icc-quick-rpc">
          <div className="icc-quick-wallet-copy">
            <span className="icc-mini-title">RPC setup</span>
            <strong>Configure the RPC path here</strong>
            <p>Pick the provider DAEMON should use for wallet reads, transaction previews, and generated Solana project defaults.</p>
          </div>
          <div className="icc-quick-rpc-form">
            <select
              className="icc-quick-wallet-input"
              value={rpcProvider}
              onChange={(event) => {
                const provider = event.target.value as WalletInfrastructureSettings['rpcProvider']
                setRpcProvider(provider)
                setRpcUrl(provider === 'quicknode' ? infrastructure.quicknodeRpcUrl : provider === 'custom' ? infrastructure.customRpcUrl : '')
              }}
            >
              <option value="helius">Helius</option>
              <option value="public">Public RPC</option>
              <option value="quicknode">QuickNode</option>
              <option value="custom">Custom RPC</option>
            </select>
            {rpcProvider === 'helius' && !heliusConfigured ? (
              <input
                className="icc-quick-wallet-input"
                value={heliusKey}
                onChange={(event) => setHeliusKey(event.target.value)}
                placeholder="HELIUS_API_KEY"
              />
            ) : null}
            {(rpcProvider === 'quicknode' || rpcProvider === 'custom') ? (
              <input
                className="icc-quick-wallet-input"
                value={rpcUrl}
                onChange={(event) => setRpcUrl(event.target.value)}
                placeholder={rpcProvider === 'quicknode' ? 'https://your-quicknode-endpoint.quiknode.pro/...' : 'https://your-rpc-provider.example'}
              />
            ) : null}
            <button type="button" className="icc-primary" onClick={runRpcSetup} disabled={busy}>
              {busy ? 'Saving...' : 'Save RPC path'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="icc-plan-grid">
        <div className="icc-plan-card">
          <span>Default wallet</span>
          <code>{readiness.walletLabel}</code>
        </div>
        <div className="icc-plan-card">
          <span>Signing path</span>
          <code>{readiness.signingPathLabel}</code>
        </div>
      </div>

      <div className="icc-guided-next icc-guided-next--quiet">
        <span className="icc-mini-title">What happens next</span>
        <p>DAEMON will use this wallet as the default route for sends, swaps, launches, and transaction previews. Phantom remains the preferred user-facing signing path.</p>
      </div>

      <div className="icc-step-list">
        {readiness.items.map((item, index) => {
          const action = stepActions[index]
          return (
          <div key={item.label} className={`icc-step ${item.ready ? 'ready' : 'active'}`}>
            <span className="icc-step-index">{index + 1}</span>
            <div className="icc-step-main">
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </div>
            <div className="icc-step-side">
              <span className={`icc-status-badge ${item.ready ? 'ready' : 'partial'}`}>{item.ready ? 'done' : 'next'}</span>
              <button
                type="button"
                className="icc-step-action"
                onClick={action.onClick}
                disabled={busy || action.disabled}
              >
                {action.label}
              </button>
            </div>
          </div>
          )
        })}
      </div>

      {result ? (
        <div className={`icc-result ${result.status}`}>
          <span className="icc-result-title">{result.title}</span>
          <p>{result.detail}</p>
          {result.items?.length ? (
            <div className="icc-result-items">
              {result.items.map((item) => <code key={item}>{item}</code>)}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="icc-setup-actions">
        <button type="button" className="icc-secondary" onClick={nextAction} disabled={busy}>
          {busy ? 'Running wallet setup...' : readiness.nextAction.label}
        </button>
        <button type="button" className="icc-secondary" onClick={onOpenWallet}>
          Advanced wallet workspace
        </button>
      </div>
    </div>
  )
}

function IntegrationCard({
  integration,
  selected,
  summary,
  onSelect,
}: {
  integration: IntegrationDefinition
  selected: boolean
  summary: IntegrationStatusSummary
  onSelect: () => void
}) {
  const brandClass = getBrandedIntegrationClass(integration.id)
  const brandedCardClass = brandClass ? `icc-card--${brandClass}` : ''

  return (
    <button
      type="button"
      className={`icc-card ${brandedCardClass} ${selected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <span className={`icc-status-dot ${summary.status}`} />
      <div className="icc-card-main">
        <div className="icc-card-top">
          <span className="icc-card-name">{integration.name}</span>
          <span className={`icc-status-badge ${summary.status}`}>{statusLabel(summary)}</span>
        </div>
        <span className="icc-card-tagline">{integration.tagline}</span>
        <span className="icc-card-desc">{integration.description}</span>
      </div>
    </button>
  )
}

function getBrandedIntegrationClass(integrationId: string): string {
  if (integrationId === 'streamlock') return 'streamlock'
  if (integrationId === 'zauth') return 'zauth'
  if (integrationId === 'helius') return 'helius'
  if (integrationId === 'sendai-agent-kit') return 'sendai'
  if (integrationId === 'spawnagents') return 'spawnagents'
  if (integrationId === 'phantom') return 'phantom'
  if (integrationId === 'jupiter') return 'jupiter'
  if (integrationId === 'metaplex') return 'metaplex'
  if (integrationId === 'light-protocol') return 'light'
  if (integrationId === 'magicblock') return 'magicblock'
  if (integrationId === 'debridge') return 'debridge'
  if (integrationId === 'squads') return 'squads'
  return ''
}

export function IntegrationCommandCenter() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const integrationCommandSelectionId = useUIStore((s) => s.integrationCommandSelectionId)
  const setIntegrationCommandSelectionId = useUIStore((s) => s.setIntegrationCommandSelectionId)
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const focusTerminal = useAppActions((s) => s.focusTerminal)
  const mcps = useSolanaToolboxStore((s) => s.mcps)
  const toolchain = useSolanaToolboxStore((s) => s.toolchain)
  const loadMcps = useSolanaToolboxStore((s) => s.loadMcps)
  const loadToolchain = useSolanaToolboxStore((s) => s.loadToolchain)

  const [category, setCategory] = useState<IntegrationCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('sendai-agent-kit')
  const [envFiles, setEnvFiles] = useState<EnvFile[]>([])
  const [packageInfo, setPackageInfo] = useState<PackageInfo>(EMPTY_PACKAGE_INFO)
  const [packageJsonContent, setPackageJsonContent] = useState<string | null>(null)
  const [lockfiles, setLockfiles] = useState<Partial<Record<PackageManager, boolean>>>({})
  const [pnpmWorkspaceRoot, setPnpmWorkspaceRoot] = useState(false)
  const [hasStarterAgentFile, setHasStarterAgentFile] = useState(false)
  const [hasStreamlockStarterFile, setHasStreamlockStarterFile] = useState(false)
  const [wallets, setWallets] = useState<WalletListEntry[]>([])
  const [walletSignerReady, setWalletSignerReady] = useState<Record<string, boolean>>({})
  const [walletInfrastructure, setWalletInfrastructure] = useState<WalletInfrastructureSettings>(DEFAULT_WALLET_INFRASTRUCTURE)
  const [secureKeys, setSecureKeys] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [applyingSetup, setApplyingSetup] = useState(false)
  const [sendAiSetupApplied, setSendAiSetupApplied] = useState(false)
  const [scaffoldingFirstAgent, setScaffoldingFirstAgent] = useState(false)
  const [runningStarterCheck, setRunningStarterCheck] = useState(false)
  const [installingSkills, setInstallingSkills] = useState(false)
  const [updatingWalletFlow, setUpdatingWalletFlow] = useState(false)
  const [runningGuidedFlow, setRunningGuidedFlow] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<IntegrationActionResult | null>(null)
  const [runningActionId, setRunningActionId] = useState<string | null>(null)
  const [defaultAiProvider, setDefaultAiProvider] = useState<'claude' | 'codex'>('claude')
  const [launchingAiSetup, setLaunchingAiSetup] = useState(false)

  useEffect(() => {
    let cancelled = false
    void daemon.provider.getDefault().then((result) => {
      if (cancelled) return
      if (result.ok && (result.data === 'claude' || result.data === 'codex')) {
        setDefaultAiProvider(result.data)
      }
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadContext() {
      setLoading(true)
      setActionResult(null)

      try {
        const [walletRes, heliusRes, jupiterRes, infraRes] = await Promise.all([
          daemon.wallet.list(),
          daemon.wallet.hasHeliusKey(),
          daemon.wallet.hasJupiterKey(),
          daemon.settings.getWalletInfrastructureSettings(),
        ])

        if (cancelled) return

        const nextWallets = walletRes.ok && walletRes.data ? walletRes.data : []
        setWallets(nextWallets)
        setWalletInfrastructure(infraRes.ok && infraRes.data ? infraRes.data : DEFAULT_WALLET_INFRASTRUCTURE)
        setSecureKeys({
          HELIUS_API_KEY: Boolean(heliusRes.ok && heliusRes.data),
          JUPITER_API_KEY: Boolean(jupiterRes.ok && jupiterRes.data),
        })

        if (nextWallets.length > 0) {
          const signerEntries = await Promise.all(nextWallets.map(async (wallet) => {
            const signerRes = await daemon.wallet.hasKeypair(wallet.id)
            return [wallet.id, Boolean(signerRes.ok && signerRes.data)] as const
          }))
          if (cancelled) return
          setWalletSignerReady(Object.fromEntries(signerEntries))
        } else {
          setWalletSignerReady({})
        }

        if (activeProjectPath) {
          setSendAiSetupApplied(false)
          await Promise.all([
            loadMcps(activeProjectPath),
            loadToolchain(activeProjectPath),
          ])

          const [
            envRes,
            packageRes,
            pnpmLockRes,
            npmLockRes,
            yarnLockRes,
            bunLockRes,
            pnpmWorkspaceYamlRes,
            pnpmWorkspaceYmlRes,
            starterFileRes,
            streamlockStarterFileRes,
          ] = await Promise.all([
            daemon.env.projectVars(activeProjectPath),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'package.json')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'pnpm-lock.yaml')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'package-lock.json')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'yarn.lock')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'bun.lockb')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'pnpm-workspace.yaml')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'pnpm-workspace.yml')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, SENDAI_FIRST_AGENT_ENTRY)),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, STREAMLOCK_STARTER_FILE)),
          ])

          if (cancelled) return

          setEnvFiles(envRes.ok && envRes.data ? envRes.data : [])
          setPackageInfo(packageRes.ok && packageRes.data ? parsePackageInfo(packageRes.data.content) : EMPTY_PACKAGE_INFO)
          setPackageJsonContent(packageRes.ok && packageRes.data ? packageRes.data.content : null)
          setLockfiles({
            pnpm: Boolean(pnpmLockRes.ok),
            npm: Boolean(npmLockRes.ok),
            yarn: Boolean(yarnLockRes.ok),
            bun: Boolean(bunLockRes.ok),
          })
          setPnpmWorkspaceRoot(Boolean(pnpmWorkspaceYamlRes.ok || pnpmWorkspaceYmlRes.ok))
          setHasStarterAgentFile(Boolean(starterFileRes.ok))
          setHasStreamlockStarterFile(Boolean(streamlockStarterFileRes.ok))
        } else {
          setEnvFiles([])
          setPackageInfo(EMPTY_PACKAGE_INFO)
          setPackageJsonContent(null)
          setLockfiles({})
          setPnpmWorkspaceRoot(false)
          setHasStarterAgentFile(false)
          setHasStreamlockStarterFile(false)
          setSendAiSetupApplied(false)
          await loadToolchain(undefined)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadContext()
    return () => {
      cancelled = true
    }
  }, [activeProjectPath, activeProjectId, loadMcps, loadToolchain])

  const defaultWallet = useMemo(
    () => wallets.find((wallet) => wallet.is_default === 1) ?? wallets[0] ?? null,
    [wallets],
  )
  const defaultWalletIsMain = Boolean(defaultWallet?.is_default === 1)
  const defaultWalletSignerReady = defaultWallet ? walletSignerReady[defaultWallet.id] === true : false
  const defaultWalletAssignedToProject = activeProjectId
    ? Boolean(defaultWallet?.assigned_project_ids.includes(activeProjectId))
    : true
  const walletRpcLabel = getWalletRpcLabel(walletInfrastructure)
  const walletRpcReady = isWalletRpcReady(walletInfrastructure, Boolean(secureKeys.HELIUS_API_KEY))

  const context: IntegrationContext = useMemo(() => ({
    envFiles,
    mcps,
    packages: packageInfo.packages,
    walletReady: Boolean(defaultWallet),
    defaultWallet,
    secureKeys,
    toolchain,
  }), [envFiles, mcps, packageInfo, defaultWallet, secureKeys, toolchain])

  const registrySummary = useMemo(() => summarizeRegistry(INTEGRATION_REGISTRY, context), [context])
  const envKeys = useMemo(() => new Set(
    envFiles.flatMap((file) => file.vars.filter((envVar) => !envVar.isComment).map((envVar) => envVar.key)),
  ), [envFiles])
  const projectPackageManager = useMemo<PackageManager | null>(
    () => (activeProjectPath ? detectPackageManager(packageInfo, lockfiles) : null),
    [activeProjectPath, packageInfo, lockfiles],
  )
  const installCommandOptions = useMemo(
    () => ({ packageManager: projectPackageManager, pnpmWorkspaceRoot }),
    [projectPackageManager, pnpmWorkspaceRoot],
  )
  const streamlockConfigReady = envKeys.has('STREAMLOCK_OPERATOR_KEY')
  const lightStatelessReady = packageInfo.packages.has('@lightprotocol/stateless.js')
  const lightCompressedTokenReady = packageInfo.packages.has('@lightprotocol/compressed-token')
  const lightPackagesReady = lightStatelessReady && lightCompressedTokenReady
  const magicBlockPackageReady = packageInfo.packages.has('@magicblock-labs/ephemeral-rollups-sdk')
  const debridgePackageReady = packageInfo.packages.has('@debridge-finance/dln-client')
  const squadsPackageReady = packageInfo.packages.has('@sqds/multisig')
  const sendAiSetupPlan = useMemo(
    () => createSendAiSetupPlan({ packageInfo, lockfiles, envKeys, pnpmWorkspaceRoot }),
    [packageInfo, lockfiles, envKeys, pnpmWorkspaceRoot],
  )
  const firstAgentPlan = useMemo(
    () => createFirstAgentPlan({
      packageInfo,
      lockfiles,
      hasPackageJson: Boolean(packageJsonContent),
      hasStarterFile: hasStarterAgentFile,
    }),
    [packageInfo, lockfiles, packageJsonContent, hasStarterAgentFile],
  )
  const sendAiSkillSuggestions = useMemo(() => buildSendAiSkillSuggestions(context), [context])

  const visibleIntegrations = useMemo(() => {
    const query = search.trim().toLowerCase()
    return INTEGRATION_REGISTRY.filter((integration) => {
      const matchesCategory = category === 'all' || integration.category === category
      const matchesSearch = !query || [
        integration.name,
        integration.tagline,
        integration.description,
        integration.category,
        ...integration.recommendedFor,
      ].some((value) => value.toLowerCase().includes(query))
      return matchesCategory && matchesSearch
    })
  }, [category, search])

  useEffect(() => {
    if (!integrationCommandSelectionId) return
    const targetId = INTEGRATION_SELECTION_ALIASES.get(integrationCommandSelectionId) ?? integrationCommandSelectionId
    const target = INTEGRATION_REGISTRY.find((integration) => integration.id === targetId)
    if (target) {
      setCategory('all')
      setSearch('')
      setSelectedId(targetId)
      setActionResult(null)
    }
    setIntegrationCommandSelectionId(null)
  }, [integrationCommandSelectionId, setIntegrationCommandSelectionId])

  const selectedIntegration = visibleIntegrations.find((integration) => integration.id === selectedId) ?? visibleIntegrations[0] ?? INTEGRATION_REGISTRY[0]
  const selectedSummary = resolveIntegrationStatus(selectedIntegration, context)
  const selectedBrandClass = getBrandedIntegrationClass(selectedIntegration.id)
  const streamlockRunCommand = buildScriptRunCommand(projectPackageManager, STREAMLOCK_STARTER_SCRIPT)
  const streamlockNextLabel = !activeProjectPath
    ? 'Open New Project'
    : !hasStreamlockStarterFile
      ? 'Create operator starter'
      : !streamlockConfigReady
        ? 'Open env manager'
        : 'Run operator check'
  const streamlockNextDetail = !activeProjectPath
    ? 'Open or scaffold a project first so the Streamlock starter has a server-side home.'
    : !hasStreamlockStarterFile
      ? 'Write a read-only Operator API check, add env placeholders, and register a package script.'
      : !streamlockConfigReady
        ? 'Add STREAMLOCK_OPERATOR_KEY to a real .env file so the starter can call Streamlock.'
        : 'Run the read-only stream discovery check in a terminal.'
  const selectedInstallCommand = selectedIntegration.installCommand
    ? normalizeProjectInstallCommand(selectedIntegration.installCommand, installCommandOptions)
    : null
  const defaultAiProviderLabel = defaultAiProvider === 'claude' ? 'Claude' : 'Codex'
  const detailShortcut = useMemo<DetailShortcut | null>(() => {
    if (GUIDED_WORKFLOW_INTEGRATIONS.has(selectedIntegration.id)) {
      return null
    }

    const nextRequirement = selectedSummary.requirements.find((requirement) => !requirement.optional && !requirement.ready)
    if (!nextRequirement) return null

    if (nextRequirement.type === 'wallet') {
      return {
        label: 'Open wallet manager',
        onClick: () => openWorkspaceTool('wallet'),
      }
    }

    if (nextRequirement.type === 'secure-key' || nextRequirement.type === 'env') {
      return {
        label: 'Open env manager',
        onClick: () => openWorkspaceTool('env'),
      }
    }

    if (nextRequirement.type === 'mcp') {
      return {
        label: 'Open MCP setup',
        onClick: () => openWorkspaceTool('solana-toolbox'),
      }
    }

    return null
  }, [openWorkspaceTool, selectedIntegration.id, selectedSummary.requirements])

  async function handleRunAction(actionId: string) {
    const action = selectedIntegration.actions.find((candidate) => candidate.id === actionId)
    if (!action) return

    if (action.kind === 'setup') {
      if (action.id === 'open-env') openWorkspaceTool('env')
      else if (action.id === 'open-wallet') openWorkspaceTool('wallet')
      else if (action.id === 'open-token-launch') openWorkspaceTool('token-launch')
      else if (action.id === 'open-spawnagents-panel') openWorkspaceTool('spawnagents')
      else if (action.id === 'open-zauth-database' || action.id === 'open-zauth-provider-hub') {
        const pageId = action.id === 'open-zauth-provider-hub' ? 'provider-hub' : 'database'
        try {
          window.localStorage.setItem('daemon:zauth:activePage', pageId)
          window.dispatchEvent(new CustomEvent('daemon:zauth-open', { detail: pageId }))
        } catch {
          // The Zauth panel still opens on its default page if storage/events are unavailable.
        }
        openWorkspaceTool('zauth')
      }
      else openWorkspaceTool('solana-toolbox')
      return
    }

    setRunningActionId(actionId)
    setActionResult(null)
    try {
      const result = await runIntegrationAction(actionId, context)
      setActionResult(result)
    } finally {
      setRunningActionId(null)
    }
  }

  async function handleApplySendAiSetup(plan: SendAiSetupPlan) {
    if (!activeProjectPath || !activeProjectId) {
      setActionResult({
        title: 'Open a project first',
        status: 'warning',
        detail: 'DAEMON needs an active project before it can install packages or write .env.example.',
      })
      return
    }

    setApplyingSetup(true)
    setActionResult(null)

    try {
      const envExamplePath = joinProjectPath(activeProjectPath, plan.envFileName)
      const currentEnvRes = await daemon.fs.readFile(envExamplePath)
      const currentEnv = currentEnvRes.ok && currentEnvRes.data ? currentEnvRes.data.content : ''
      const nextEnv = mergeEnvExample(currentEnv)
      const changedFiles: string[] = []

      if (nextEnv !== currentEnv) {
        const writeRes = await daemon.fs.writeFile(envExamplePath, nextEnv)
        if (!writeRes.ok) {
          throw new Error(writeRes.error ?? `Could not write ${plan.envFileName}`)
        }
        changedFiles.push(plan.envFileName)
      }

      const installCommand = normalizeProjectInstallCommand(plan.installCommand, installCommandOptions)
      if (installCommand) {
        const terminalRes = await daemon.terminal.create({
          cwd: activeProjectPath,
          startupCommand: installCommand,
          userInitiated: true,
        })
        if (!terminalRes.ok || !terminalRes.data) {
          throw new Error(terminalRes.error ?? 'Could not start package install terminal')
        }
        addTerminal(activeProjectId, terminalRes.data.id, 'Install SendAI', terminalRes.data.agentId)
        focusTerminal()
        changedFiles.push(`terminal: ${installCommand}`)
      }

      setActionResult({
        title: 'SendAI setup started',
        status: 'success',
        detail: installCommand
          ? 'DAEMON updated the env template and opened a visible terminal for package installation.'
          : 'DAEMON updated the env template. Required SendAI packages were already present.',
        items: changedFiles.length > 0 ? changedFiles : ['No changes needed'],
      })
      setSendAiSetupApplied(true)
    } catch (error) {
      setActionResult({
        title: 'SendAI setup failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not apply the setup plan.',
      })
    } finally {
      setApplyingSetup(false)
    }
  }

  async function ensureDir(path: string) {
    const result = await daemon.fs.createDir(path)
    if (!result.ok && !/exist/i.test(result.error ?? '')) {
      throw new Error(result.error ?? `Could not create ${path}`)
    }
  }

  async function handleSetMainWallet() {
    if (!defaultWallet) {
      setActionResult({
        title: 'No wallet selected',
        status: 'warning',
        detail: 'Create or import a wallet before trying to set the main route.',
      })
      return
    }

    setUpdatingWalletFlow(true)
    setActionResult(null)
    try {
      const result = await daemon.wallet.setDefault(defaultWallet.id)
      if (!result.ok) throw new Error(result.error ?? 'Could not set the main wallet')

      setWallets((current) => current.map((wallet) => ({
        ...wallet,
        is_default: wallet.id === defaultWallet.id ? 1 : 0,
      })))
      setActionResult({
        title: 'Main wallet updated',
        status: 'success',
        detail: `${defaultWallet.name} is now the default wallet route for DAEMON.`,
      })
    } catch (error) {
      setActionResult({
        title: 'Wallet update failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not update the main wallet route.',
      })
    } finally {
      setUpdatingWalletFlow(false)
    }
  }

  async function handleAssignWalletToProject() {
    if (!defaultWallet || !activeProjectId) {
      setActionResult({
        title: 'Open a project first',
        status: 'warning',
        detail: 'DAEMON needs both a wallet and an active project before it can bind them together.',
      })
      return
    }

    setUpdatingWalletFlow(true)
    setActionResult(null)
    try {
      const result = await daemon.wallet.assignProject(activeProjectId, defaultWallet.id)
      if (!result.ok) throw new Error(result.error ?? 'Could not assign the wallet to the current project')

      setWallets((current) => current.map((wallet) => ({
        ...wallet,
        assigned_project_ids: wallet.id === defaultWallet.id
          ? Array.from(new Set([...wallet.assigned_project_ids, activeProjectId]))
          : wallet.assigned_project_ids,
      })))
      setActionResult({
        title: 'Project wallet linked',
        status: 'success',
        detail: `${defaultWallet.name} is now assigned to the active project.`,
      })
    } catch (error) {
      setActionResult({
        title: 'Project assignment failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not assign the wallet to the project.',
      })
    } finally {
      setUpdatingWalletFlow(false)
    }
  }

  async function handleSetPhantomPreferred() {
    setUpdatingWalletFlow(true)
    setActionResult(null)
    try {
      const nextSettings: WalletInfrastructureSettings = {
        ...walletInfrastructure,
        preferredWallet: 'phantom',
      }
      const result = await daemon.settings.setWalletInfrastructureSettings(nextSettings)
      if (!result.ok) throw new Error(result.error ?? 'Could not update the preferred wallet path')

      setWalletInfrastructure(nextSettings)
      setActionResult({
        title: 'Preferred wallet updated',
        status: 'success',
        detail: 'DAEMON will now favor a Phantom-first wallet path for signing flows.',
      })
    } catch (error) {
      setActionResult({
        title: 'Wallet preference failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not update the preferred wallet path.',
      })
    } finally {
      setUpdatingWalletFlow(false)
    }
  }

  async function handleSavePhantomRpcSetup(input: PhantomRpcSetupInput) {
    setUpdatingWalletFlow(true)
    setActionResult(null)

    try {
      const provider = input.rpcProvider
      const rpcUrl = input.rpcUrl.trim()
      const heliusKey = input.heliusKey.trim()
      const completed: string[] = []

      if (provider === 'helius' && !secureKeys.HELIUS_API_KEY) {
        if (!heliusKey) {
          throw new Error('Paste a Helius API key, or switch the provider to Public RPC, QuickNode, or Custom RPC.')
        }
        const keyResult = await daemon.wallet.storeHeliusKey(heliusKey)
        if (!keyResult.ok) {
          throw new Error(keyResult.error ?? 'Could not save the Helius API key')
        }
        setSecureKeys((current) => ({ ...current, HELIUS_API_KEY: true }))
        completed.push('Helius API key saved')
      }

      if ((provider === 'quicknode' || provider === 'custom') && !rpcUrl) {
        throw new Error(provider === 'quicknode' ? 'Paste a QuickNode RPC URL before saving.' : 'Paste a custom Solana RPC URL before saving.')
      }

      const nextSettings: WalletInfrastructureSettings = {
        ...walletInfrastructure,
        rpcProvider: provider,
        preferredWallet: 'phantom',
        quicknodeRpcUrl: provider === 'quicknode' ? rpcUrl : walletInfrastructure.quicknodeRpcUrl,
        customRpcUrl: provider === 'custom' ? rpcUrl : walletInfrastructure.customRpcUrl,
      }
      const settingsResult = await daemon.settings.setWalletInfrastructureSettings(nextSettings)
      if (!settingsResult.ok) {
        throw new Error(settingsResult.error ?? 'Could not save the RPC path')
      }

      setWalletInfrastructure(nextSettings)
      completed.push(`${getWalletRpcLabel(nextSettings)} selected`)
      if (nextSettings.preferredWallet === 'phantom') completed.push('Phantom-first path set')

      setActionResult({
        title: 'RPC path configured',
        status: 'success',
        detail: `${getWalletRpcLabel(nextSettings)} is now the Phantom integration route for wallet reads and transaction previews.`,
        items: completed,
      })
    } catch (error) {
      setActionResult({
        title: 'RPC setup failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not save the RPC path.',
      })
    } finally {
      setUpdatingWalletFlow(false)
    }
  }

  async function handleCreatePhantomSigningWallet(name: string) {
    const walletName = name.trim() || 'DAEMON Phantom Wallet'
    setUpdatingWalletFlow(true)
    setActionResult(null)

    try {
      const createResult = await daemon.wallet.generate({ name: walletName })
      if (!createResult.ok || !createResult.data) {
        throw new Error(createResult.error ?? 'Could not create a signing wallet')
      }

      const createdWallet = createResult.data
      const defaultResult = await daemon.wallet.setDefault(createdWallet.id)
      if (!defaultResult.ok) {
        throw new Error(defaultResult.error ?? 'Wallet was created, but DAEMON could not make it the default route')
      }

      const assignedProjectIds = new Set(createdWallet.assigned_project_ids)
      const completed: string[] = ['Signing wallet created', 'Default wallet route set']

      if (activeProjectId) {
        const assignResult = await daemon.wallet.assignProject(activeProjectId, createdWallet.id)
        if (!assignResult.ok) {
          throw new Error(assignResult.error ?? 'Wallet was created, but DAEMON could not link it to the active project')
        }
        assignedProjectIds.add(activeProjectId)
        completed.push('Active project linked')
      }

      let nextInfrastructure = walletInfrastructure
      if (walletInfrastructure.preferredWallet !== 'phantom') {
        nextInfrastructure = {
          ...walletInfrastructure,
          preferredWallet: 'phantom',
        }
        const preferenceResult = await daemon.settings.setWalletInfrastructureSettings(nextInfrastructure)
        if (!preferenceResult.ok) {
          throw new Error(preferenceResult.error ?? 'Wallet was created, but DAEMON could not set Phantom as preferred')
        }
        setWalletInfrastructure(nextInfrastructure)
        completed.push('Phantom-first path set')
      }

      const nextWallet: WalletListEntry = {
        ...createdWallet,
        is_default: 1,
        assigned_project_ids: Array.from(assignedProjectIds),
      }
      setWallets((current) => [
        nextWallet,
        ...current
          .filter((wallet) => wallet.id !== nextWallet.id)
          .map((wallet) => ({ ...wallet, is_default: 0 })),
      ])
      setWalletSignerReady((current) => ({ ...current, [nextWallet.id]: true }))
      setActionResult({
        title: 'Phantom route created',
        status: 'success',
        detail: `${nextWallet.name} is ready as DAEMON's default signing route.`,
        items: [nextWallet.address, ...completed],
      })
    } catch (error) {
      setActionResult({
        title: 'Quick wallet setup failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not create the Phantom signing route.',
      })
    } finally {
      setUpdatingWalletFlow(false)
    }
  }

  async function handleCreateFirstAgent(plan: FirstAgentPlan) {
    if (!activeProjectPath || !packageJsonContent) {
      setActionResult({
        title: 'Create a Node project first',
        status: 'warning',
        detail: 'DAEMON needs an active project with package.json before it can scaffold a first SendAI agent.',
      })
      return
    }

    setScaffoldingFirstAgent(true)
    setActionResult(null)

    try {
      const packageJsonPath = joinProjectPath(activeProjectPath, 'package.json')
      const packageRes = await daemon.fs.readFile(packageJsonPath)
      if (!packageRes.ok || !packageRes.data) {
        throw new Error(packageRes.error ?? 'Could not read package.json')
      }

      const nextPackageJson = upsertPackageJsonScript(packageRes.data.content, plan.scriptName, plan.scriptCommand)
      const srcDir = joinProjectPath(activeProjectPath, 'src')
      const agentsDir = joinProjectPath(activeProjectPath, 'src/agents')
      const changedFiles: string[] = []

      if (nextPackageJson !== packageRes.data.content) {
        const writePackageRes = await daemon.fs.writeFile(packageJsonPath, nextPackageJson)
        if (!writePackageRes.ok) {
          throw new Error(writePackageRes.error ?? 'Could not update package.json')
        }
        changedFiles.push('package.json')
        setPackageJsonContent(nextPackageJson)
        setPackageInfo(parsePackageInfo(nextPackageJson))
      }

      await ensureDir(srcDir)
      await ensureDir(agentsDir)

      const entryRes = await daemon.fs.writeFile(
        joinProjectPath(activeProjectPath, plan.entryFilePath),
        buildFirstSolanaAgentFile(),
      )
      if (!entryRes.ok) {
        throw new Error(entryRes.error ?? `Could not write ${plan.entryFilePath}`)
      }
      changedFiles.push(plan.entryFilePath)

      const readmeRes = await daemon.fs.writeFile(
        joinProjectPath(activeProjectPath, plan.readmePath),
        buildFirstSolanaAgentReadme(plan.runCommand),
      )
      if (!readmeRes.ok) {
        throw new Error(readmeRes.error ?? `Could not write ${plan.readmePath}`)
      }
      changedFiles.push(plan.readmePath)
      setHasStarterAgentFile(true)

      setActionResult({
        title: 'Starter agent scaffolded',
        status: 'success',
        detail: 'DAEMON wrote a first Solana agent file, added a simple package script, and left the run step as a visible terminal action.',
        items: changedFiles,
      })
    } catch (error) {
      setActionResult({
        title: 'Starter scaffold failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not create the starter agent files.',
      })
    } finally {
      setScaffoldingFirstAgent(false)
    }
  }

  async function handleRunFirstAgent(plan: FirstAgentPlan) {
    if (!activeProjectPath || !activeProjectId) {
      setActionResult({
        title: 'Open a project first',
        status: 'warning',
        detail: 'DAEMON needs an active project before it can open the starter run command in a terminal.',
      })
      return
    }

    setRunningStarterCheck(true)
    setActionResult(null)

    try {
      const terminalRes = await daemon.terminal.create({
        cwd: activeProjectPath,
        startupCommand: plan.runCommand,
        userInitiated: true,
      })
      if (!terminalRes.ok || !terminalRes.data) {
        throw new Error(terminalRes.error ?? 'Could not start starter terminal')
      }

      addTerminal(activeProjectId, terminalRes.data.id, 'SendAI Starter Check', terminalRes.data.agentId)
      focusTerminal()
      setActionResult({
        title: 'Starter check opened',
        status: 'success',
        detail: 'DAEMON opened a visible terminal so you can watch the first-agent readiness check run.',
        items: [plan.runCommand],
      })
    } catch (error) {
      setActionResult({
        title: 'Starter check failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not open the starter terminal.',
      })
    } finally {
      setRunningStarterCheck(false)
    }
  }

  async function handleInstallSkills(command: string) {
    if (!activeProjectPath || !activeProjectId) {
      setActionResult({
        title: 'Open a project first',
        status: 'warning',
        detail: 'DAEMON needs an active project before it can open the skills install command in a terminal.',
      })
      return
    }

    setInstallingSkills(true)
    setActionResult(null)

    try {
      const installCommand = normalizeProjectInstallCommand(command, installCommandOptions) ?? command
      const terminalRes = await daemon.terminal.create({
        cwd: activeProjectPath,
        startupCommand: installCommand,
        userInitiated: true,
      })
      if (!terminalRes.ok || !terminalRes.data) {
        throw new Error(terminalRes.error ?? 'Could not start the skills install terminal')
      }

      addTerminal(activeProjectId, terminalRes.data.id, 'Install SendAI Skills', terminalRes.data.agentId)
      focusTerminal()
      setActionResult({
        title: 'Skills install opened',
        status: 'success',
        detail: 'DAEMON opened a terminal so you can install the SendAI skills pack without leaving this drawer.',
        items: [installCommand, `Suggested skills: ${sendAiSkillSuggestions.join(', ')}`],
      })
    } catch (error) {
      setActionResult({
        title: 'Skills install failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not open the skills install terminal.',
      })
    } finally {
      setInstallingSkills(false)
    }
  }

  async function handleOpenProjectInstall(command: string, label: string) {
    if (!activeProjectPath || !activeProjectId) {
      setActionResult({
        title: 'Open a project first',
        status: 'warning',
        detail: 'DAEMON needs an active project before it can open an install command in a terminal.',
      })
      return
    }

    setRunningGuidedFlow(label)
    setActionResult(null)

    try {
      const installCommand = normalizeProjectInstallCommand(command, installCommandOptions) ?? command
      const terminalRes = await daemon.terminal.create({
        cwd: activeProjectPath,
        startupCommand: installCommand,
        userInitiated: true,
      })
      if (!terminalRes.ok || !terminalRes.data) {
        throw new Error(terminalRes.error ?? 'Could not open the install terminal')
      }

      addTerminal(activeProjectId, terminalRes.data.id, label, terminalRes.data.agentId)
      focusTerminal()
      setActionResult({
        title: `${label} opened`,
        status: 'success',
        detail: 'DAEMON opened a visible terminal so the install stays inside the current Solana workflow.',
        items: [installCommand],
      })
    } catch (error) {
      setActionResult({
        title: `${label} failed`,
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not open the install terminal.',
      })
    } finally {
      setRunningGuidedFlow(null)
    }
  }

  async function handlePreviewPhantomTransaction() {
    if (!defaultWallet) {
      setActionResult({
        title: 'No wallet selected',
        status: 'warning',
        detail: 'Create or import a wallet before previewing a transaction path.',
      })
      return
    }

    setRunningGuidedFlow('phantom-preview')
    setActionResult(null)

    try {
      const previewRes = await daemon.wallet.transactionPreview({
        kind: 'send-sol',
        walletId: defaultWallet.id,
        destination: defaultWallet.address,
        amount: 0.01,
      })
      if (!previewRes.ok || !previewRes.data) {
        throw new Error(previewRes.error ?? 'Could not preview the Phantom signing path')
      }

      setActionResult({
        title: 'Phantom signing preview ready',
        status: 'success',
        detail: 'DAEMON generated a safe preview so the developer can see the signing path before any real transaction is sent.',
        items: [
          previewRes.data.backendLabel,
          previewRes.data.signerLabel,
          previewRes.data.amountLabel,
          previewRes.data.feeLabel,
        ],
      })
    } catch (error) {
      setActionResult({
        title: 'Phantom preview failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not build the Phantom signing preview.',
      })
    } finally {
      setRunningGuidedFlow(null)
    }
  }

  async function handleInspectHeliusWallet() {
    if (!defaultWallet) {
      setActionResult({
        title: 'No wallet selected',
        status: 'warning',
        detail: 'Create or import a wallet before running a Helius-backed wallet read.',
      })
      return
    }

    setRunningGuidedFlow('helius-wallet')
    setActionResult(null)

    try {
      const [balanceRes, holdingsRes] = await Promise.all([
        daemon.wallet.balance(defaultWallet.id),
        daemon.wallet.holdings(defaultWallet.id),
      ])
      if (!balanceRes.ok || !balanceRes.data) {
        throw new Error(balanceRes.error ?? 'Could not load wallet balance')
      }
      if (!holdingsRes.ok || !holdingsRes.data) {
        throw new Error(holdingsRes.error ?? 'Could not load wallet holdings')
      }

      const topHolding = holdingsRes.data[0]
      setActionResult({
        title: 'Helius wallet read complete',
        status: 'success',
        detail: 'DAEMON verified the provider-backed wallet data path by reading the default wallet balance and holdings.',
        items: [
          `${balanceRes.data.sol} SOL`,
          `Holdings: ${holdingsRes.data.length}`,
          topHolding ? `Top token: ${topHolding.symbol} (${topHolding.amount})` : 'Top token: none',
        ],
      })
    } catch (error) {
      setActionResult({
        title: 'Helius wallet read failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not verify the Helius-backed wallet read path.',
      })
    } finally {
      setRunningGuidedFlow(null)
    }
  }

  async function handlePreviewJupiterQuote() {
    if (!defaultWallet) {
      setActionResult({
        title: 'No wallet selected',
        status: 'warning',
        detail: 'Create or import a wallet before requesting a Jupiter quote preview.',
      })
      return
    }

    setRunningGuidedFlow('jupiter-quote')
    setActionResult(null)

    try {
      const quoteRes = await daemon.wallet.swapQuote({
        walletId: defaultWallet.id,
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amount: 0.1,
        slippageBps: 50,
      })
      if (!quoteRes.ok || !quoteRes.data) {
        throw new Error(quoteRes.error ?? 'Could not fetch a Jupiter quote')
      }

      const previewRes = await daemon.wallet.transactionPreview({
        kind: 'swap',
        walletId: defaultWallet.id,
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        inputSymbol: 'SOL',
        outputSymbol: 'USDC',
        inputAmount: quoteRes.data.inAmount,
        outputAmount: quoteRes.data.outAmount,
        amount: 0.1,
        slippageBps: 50,
        priceImpactPct: quoteRes.data.priceImpactPct,
      })
      if (!previewRes.ok || !previewRes.data) {
        throw new Error(previewRes.error ?? 'Could not build the Jupiter transaction preview')
      }

      setActionResult({
        title: 'Jupiter quote ready',
        status: 'success',
        detail: 'DAEMON fetched a quote and built the matching transaction preview before any signing step.',
        items: [
          `Route: ${quoteRes.data.routePlan.map((step) => `${step.label} ${step.percent}%`).join(', ') || 'Direct route'}`,
          `Out amount: ${quoteRes.data.outAmount}`,
          `Price impact: ${quoteRes.data.priceImpactPct}%`,
        ],
      })
    } catch (error) {
      setActionResult({
        title: 'Jupiter quote failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not run the Jupiter preview flow.',
      })
    } finally {
      setRunningGuidedFlow(null)
    }
  }

  async function handleCreateStreamlockStarter() {
    if (!activeProjectPath) {
      setActionResult({
        title: 'Create a Node project first',
        status: 'warning',
        detail: 'DAEMON needs an active project with package.json before it can scaffold a Streamlock operator starter.',
      })
      return
    }

    setRunningGuidedFlow('streamlock-starter')
    setActionResult(null)

    try {
      const packageJsonPath = joinProjectPath(activeProjectPath, 'package.json')
      const packageRes = await daemon.fs.readFile(packageJsonPath)
      if (!packageRes.ok || !packageRes.data) {
        throw new Error('Could not read package.json in the active project. Open or create a Node project before scaffolding Streamlock.')
      }
      const currentPackageJson = packageRes.data.content
      const envPath = joinProjectPath(activeProjectPath, '.env.example')
      const envRes = await daemon.fs.readFile(envPath)
      const currentEnv = envRes.ok && envRes.data ? envRes.data.content : ''
      const nextEnv = mergeEnvExample(currentEnv, STREAMLOCK_ENV_TEMPLATE, 'Streamlock Operator API')
      if (nextEnv !== currentEnv) {
        const envWriteRes = await daemon.fs.writeFile(envPath, nextEnv)
        if (!envWriteRes.ok) {
          throw new Error(envWriteRes.error ?? 'Could not update .env.example for Streamlock')
        }
      }

      const nextPackageJson = upsertPackageJsonScript(currentPackageJson, STREAMLOCK_STARTER_SCRIPT, `node ${STREAMLOCK_STARTER_FILE}`)
      if (nextPackageJson !== currentPackageJson) {
        const packageWriteRes = await daemon.fs.writeFile(packageJsonPath, nextPackageJson)
        if (!packageWriteRes.ok) {
          throw new Error(packageWriteRes.error ?? 'Could not update package.json for Streamlock starter')
        }
        setPackageJsonContent(nextPackageJson)
        setPackageInfo(parsePackageInfo(nextPackageJson))
      }

      await ensureDir(joinProjectPath(activeProjectPath, 'src'))
      await ensureDir(joinProjectPath(activeProjectPath, STREAMLOCK_STARTER_DIR))
      const writeRes = await daemon.fs.writeFile(
        joinProjectPath(activeProjectPath, STREAMLOCK_STARTER_FILE),
        buildStreamlockOperatorStarter(),
      )
      if (!writeRes.ok) {
        throw new Error(writeRes.error ?? 'Could not write the Streamlock operator starter')
      }
      const verifyRes = await daemon.fs.readFile(joinProjectPath(activeProjectPath, STREAMLOCK_STARTER_FILE))
      if (!verifyRes.ok || !verifyRes.data?.content.includes('Streamlock Operator API is configured')) {
        throw new Error('Streamlock starter write could not be verified in the active project.')
      }
      setHasStreamlockStarterFile(true)

      setActionResult({
        title: 'Streamlock starter created',
        status: 'success',
        detail: 'DAEMON scaffolded a read-only Operator API check and package script for building on locked assets.',
        items: [joinProjectPath(activeProjectPath, STREAMLOCK_STARTER_FILE), streamlockRunCommand, '.env.example'],
      })
    } catch (error) {
      setActionResult({
        title: 'Streamlock starter failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not scaffold the Streamlock starter.',
      })
    } finally {
      setRunningGuidedFlow(null)
    }
  }

  async function handleRunStreamlockStarter() {
    if (!activeProjectPath || !activeProjectId) {
      setActionResult({
        title: 'Open a project first',
        status: 'warning',
        detail: 'DAEMON needs an active project before it can run the Streamlock operator check.',
      })
      return
    }

    setRunningGuidedFlow('streamlock-run')
    setActionResult(null)

    try {
      const terminalRes = await daemon.terminal.create({
        cwd: activeProjectPath,
        startupCommand: streamlockRunCommand,
        userInitiated: true,
      })
      if (!terminalRes.ok || !terminalRes.data) {
        throw new Error(terminalRes.error ?? 'Could not open the Streamlock check terminal')
      }

      addTerminal(activeProjectId, terminalRes.data.id, 'Streamlock Operator Check', terminalRes.data.agentId)
      focusTerminal()
      setActionResult({
        title: 'Streamlock check opened',
        status: 'success',
        detail: 'DAEMON opened a terminal for the read-only Streamlock Operator API check.',
        items: [streamlockRunCommand],
      })
    } catch (error) {
      setActionResult({
        title: 'Streamlock check failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not run the Streamlock operator check.',
      })
    } finally {
      setRunningGuidedFlow(null)
    }
  }

  async function handleCreateMetaplexDraft() {
    if (!activeProjectPath) {
      setActionResult({
        title: 'Open a project first',
        status: 'warning',
        detail: 'DAEMON needs an active project before it can scaffold a metadata draft.',
      })
      return
    }

    setRunningGuidedFlow('metaplex-draft')
    setActionResult(null)

    try {
      await ensureDir(joinProjectPath(activeProjectPath, 'assets'))
      await ensureDir(joinProjectPath(activeProjectPath, METAPLEX_DRAFT_DIR))
      const writeRes = await daemon.fs.writeFile(
        joinProjectPath(activeProjectPath, METAPLEX_DRAFT_FILE),
        buildMetaplexDraftFile(),
      )
      if (!writeRes.ok) {
        throw new Error(writeRes.error ?? 'Could not write the Metaplex metadata draft')
      }

      setActionResult({
        title: 'Metaplex draft created',
        status: 'success',
        detail: 'DAEMON scaffolded a metadata-first NFT draft so the project has a concrete starting point before any mint flow.',
        items: [METAPLEX_DRAFT_FILE],
      })
    } catch (error) {
      setActionResult({
        title: 'Metaplex draft failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not scaffold the Metaplex metadata draft.',
      })
    } finally {
      setRunningGuidedFlow(null)
    }
  }

  async function handleCreateLightStarter() {
    if (!activeProjectPath || !packageJsonContent) {
      setActionResult({
        title: 'Create a Node project first',
        status: 'warning',
        detail: 'DAEMON needs an active project with package.json before it can scaffold a Light Protocol starter.',
      })
      return
    }

    setRunningGuidedFlow('light-starter')
    setActionResult(null)

    try {
      const packageJsonPath = joinProjectPath(activeProjectPath, 'package.json')
      const nextPackageJson = upsertPackageJsonScript(packageJsonContent, LIGHT_STARTER_SCRIPT, `node ${LIGHT_STARTER_FILE}`)
      if (nextPackageJson !== packageJsonContent) {
        const packageWriteRes = await daemon.fs.writeFile(packageJsonPath, nextPackageJson)
        if (!packageWriteRes.ok) {
          throw new Error(packageWriteRes.error ?? 'Could not update package.json for Light starter')
        }
        setPackageJsonContent(nextPackageJson)
        setPackageInfo(parsePackageInfo(nextPackageJson))
      }

      await ensureDir(joinProjectPath(activeProjectPath, 'src'))
      await ensureDir(joinProjectPath(activeProjectPath, LIGHT_STARTER_DIR))
      const writeRes = await daemon.fs.writeFile(
        joinProjectPath(activeProjectPath, LIGHT_STARTER_FILE),
        buildLightCompressionStarter(),
      )
      if (!writeRes.ok) {
        throw new Error(writeRes.error ?? 'Could not write the Light Protocol starter')
      }

      setActionResult({
        title: 'Light starter created',
        status: 'success',
        detail: 'DAEMON scaffolded a compression starter and added a runnable package script so the first Light check stays inside the project.',
        items: [LIGHT_STARTER_FILE, `pnpm run ${LIGHT_STARTER_SCRIPT}`],
      })
    } catch (error) {
      setActionResult({
        title: 'Light starter failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not scaffold the Light starter.',
      })
    } finally {
      setRunningGuidedFlow(null)
    }
  }

  async function handleCreateMagicBlockStarter() {
    if (!activeProjectPath || !packageJsonContent) {
      setActionResult({
        title: 'Create a Node project first',
        status: 'warning',
        detail: 'DAEMON needs an active project with package.json before it can scaffold a MagicBlock starter.',
      })
      return
    }

    setRunningGuidedFlow('magicblock-starter')
    setActionResult(null)

    try {
      const packageJsonPath = joinProjectPath(activeProjectPath, 'package.json')
      const nextPackageJson = upsertPackageJsonScript(packageJsonContent, MAGICBLOCK_STARTER_SCRIPT, `node ${MAGICBLOCK_STARTER_FILE}`)
      if (nextPackageJson !== packageJsonContent) {
        const packageWriteRes = await daemon.fs.writeFile(packageJsonPath, nextPackageJson)
        if (!packageWriteRes.ok) {
          throw new Error(packageWriteRes.error ?? 'Could not update package.json for MagicBlock starter')
        }
        setPackageJsonContent(nextPackageJson)
        setPackageInfo(parsePackageInfo(nextPackageJson))
      }

      await ensureDir(joinProjectPath(activeProjectPath, 'src'))
      await ensureDir(joinProjectPath(activeProjectPath, MAGICBLOCK_STARTER_DIR))
      const writeRes = await daemon.fs.writeFile(
        joinProjectPath(activeProjectPath, MAGICBLOCK_STARTER_FILE),
        buildMagicBlockStarter(),
      )
      if (!writeRes.ok) {
        throw new Error(writeRes.error ?? 'Could not write the MagicBlock starter')
      }

      setActionResult({
        title: 'MagicBlock starter created',
        status: 'success',
        detail: 'DAEMON scaffolded an Ephemeral Rollups readiness script and added a package script without creating any delegation or send path.',
        items: [MAGICBLOCK_STARTER_FILE, `pnpm run ${MAGICBLOCK_STARTER_SCRIPT}`],
      })
    } catch (error) {
      setActionResult({
        title: 'MagicBlock starter failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not scaffold the MagicBlock starter.',
      })
    } finally {
      setRunningGuidedFlow(null)
    }
  }

  async function handleCreateDebridgeStarter() {
    if (!activeProjectPath || !packageJsonContent) {
      setActionResult({
        title: 'Create a Node project first',
        status: 'warning',
        detail: 'DAEMON needs an active project with package.json before it can scaffold a deBridge starter.',
      })
      return
    }

    setRunningGuidedFlow('debridge-starter')
    setActionResult(null)

    try {
      const packageJsonPath = joinProjectPath(activeProjectPath, 'package.json')
      const nextPackageJson = upsertPackageJsonScript(packageJsonContent, DEBRIDGE_STARTER_SCRIPT, `node ${DEBRIDGE_STARTER_FILE}`)
      if (nextPackageJson !== packageJsonContent) {
        const packageWriteRes = await daemon.fs.writeFile(packageJsonPath, nextPackageJson)
        if (!packageWriteRes.ok) {
          throw new Error(packageWriteRes.error ?? 'Could not update package.json for deBridge starter')
        }
        setPackageJsonContent(nextPackageJson)
        setPackageInfo(parsePackageInfo(nextPackageJson))
      }

      await ensureDir(joinProjectPath(activeProjectPath, 'src'))
      await ensureDir(joinProjectPath(activeProjectPath, DEBRIDGE_STARTER_DIR))
      const writeRes = await daemon.fs.writeFile(
        joinProjectPath(activeProjectPath, DEBRIDGE_STARTER_FILE),
        buildDebridgeStarter(),
      )
      if (!writeRes.ok) {
        throw new Error(writeRes.error ?? 'Could not write the deBridge starter')
      }

      setActionResult({
        title: 'deBridge starter created',
        status: 'success',
        detail: 'DAEMON scaffolded a DLN route-preview script and added a package script without signing or submitting a bridge transaction.',
        items: [DEBRIDGE_STARTER_FILE, `pnpm run ${DEBRIDGE_STARTER_SCRIPT}`],
      })
    } catch (error) {
      setActionResult({
        title: 'deBridge starter failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not scaffold the deBridge starter.',
      })
    } finally {
      setRunningGuidedFlow(null)
    }
  }

  async function handleCreateSquadsStarter() {
    if (!activeProjectPath || !packageJsonContent) {
      setActionResult({
        title: 'Create a Node project first',
        status: 'warning',
        detail: 'DAEMON needs an active project with package.json before it can scaffold a Squads starter.',
      })
      return
    }

    setRunningGuidedFlow('squads-starter')
    setActionResult(null)

    try {
      const packageJsonPath = joinProjectPath(activeProjectPath, 'package.json')
      const nextPackageJson = upsertPackageJsonScript(packageJsonContent, SQUADS_STARTER_SCRIPT, `node ${SQUADS_STARTER_FILE}`)
      if (nextPackageJson !== packageJsonContent) {
        const packageWriteRes = await daemon.fs.writeFile(packageJsonPath, nextPackageJson)
        if (!packageWriteRes.ok) {
          throw new Error(packageWriteRes.error ?? 'Could not update package.json for Squads starter')
        }
        setPackageJsonContent(nextPackageJson)
        setPackageInfo(parsePackageInfo(nextPackageJson))
      }

      await ensureDir(joinProjectPath(activeProjectPath, 'src'))
      await ensureDir(joinProjectPath(activeProjectPath, SQUADS_STARTER_DIR))
      const writeRes = await daemon.fs.writeFile(
        joinProjectPath(activeProjectPath, SQUADS_STARTER_FILE),
        buildSquadsStarter(),
      )
      if (!writeRes.ok) {
        throw new Error(writeRes.error ?? 'Could not write the Squads starter')
      }

      setActionResult({
        title: 'Squads starter created',
        status: 'success',
        detail: 'DAEMON scaffolded a read-only multisig and vault inspection script and added a package script without enabling proposal or treasury movement.',
        items: [SQUADS_STARTER_FILE, `pnpm run ${SQUADS_STARTER_SCRIPT}`],
      })
    } catch (error) {
      setActionResult({
        title: 'Squads starter failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not scaffold the Squads starter.',
      })
    } finally {
      setRunningGuidedFlow(null)
    }
  }

  function handleOpenMcpSetup() {
    openWorkspaceTool('solana-toolbox')
    setActionResult({
      title: 'Open MCP setup',
      status: 'success',
      detail: 'DAEMON moved you into the Solana toolbox so the MCP path can be enabled and checked from one place.',
    })
  }

  function buildAiSetupPrompt(): string {
    const missingRequirements = selectedSummary.requirements
      .filter((requirement) => !requirement.ready)
      .map((requirement) => `- ${requirement.label}: ${requirement.detail}`)
      .join('\n') || '- No blocking requirements detected.'
    const actionList = selectedIntegration.actions
      .map((action) => `- ${action.label}: ${action.description} (${action.risk})`)
      .join('\n') || '- No registered actions.'
    const installLine = selectedInstallCommand ? `Install command: ${selectedInstallCommand}` : 'Install command: none detected.'

    return `Set up the ${selectedIntegration.name} integration in this DAEMON project.

Goal:
- Make the integration usable with the simplest safe first path.
- Prefer small, reviewable project changes.
- Do not submit transactions or expose secrets.
- If env values or API keys are missing, add placeholders/templates and tell me exactly what I need to fill in.

Current project:
- Path: ${activeProjectPath ?? 'No active project path'}
- Package manager: ${projectPackageManager ?? 'unknown'}

Integration:
- Category: ${selectedIntegration.category}
- Description: ${selectedIntegration.description}
- Docs: ${selectedIntegration.docsUrl}

Missing or partial setup:
${missingRequirements}

Registered DAEMON actions:
${actionList}

${installLine}

Please inspect the project, apply the safe setup work you can complete, and summarize changed files plus anything still required.`
  }

  async function handleSelectedAiSetup() {
    if (!activeProjectPath || !activeProjectId) {
      setActionResult({
        title: 'Open a project first',
        status: 'warning',
        detail: `AI setup uses the configured ${defaultAiProviderLabel} terminal inside an active project. Open or create a project first.`,
      })
      return
    }

    setLaunchingAiSetup(true)
    setActionResult(null)

    try {
      const terminalRes = await daemon.terminal.spawnProvider({
        providerId: defaultAiProvider,
        projectId: activeProjectId,
        cwd: activeProjectPath,
      })
      if (!terminalRes.ok || !terminalRes.data) {
        throw new Error(terminalRes.error ?? `Could not launch ${defaultAiProviderLabel}`)
      }

      addTerminal(activeProjectId, terminalRes.data.id, `${defaultAiProviderLabel} Integration Setup`, terminalRes.data.agentId)
      focusTerminal()

      const prompt = buildAiSetupPrompt()
      window.setTimeout(() => {
        daemon.terminal.write(terminalRes.data!.id, `\x1b[200~${prompt}\x1b[201~\r`)
      }, 2600)

      setActionResult({
        title: `${defaultAiProviderLabel} setup launched`,
        status: 'success',
        detail: `${defaultAiProviderLabel} is running in Terminal with a focused ${selectedIntegration.name} setup prompt.`,
        items: [activeProjectPath, selectedIntegration.name],
      })
    } catch (error) {
      setActionResult({
        title: 'AI setup failed',
        status: 'error',
        detail: error instanceof Error ? error.message : `DAEMON could not launch ${defaultAiProviderLabel} for integration setup.`,
      })
    } finally {
      setLaunchingAiSetup(false)
    }
  }

  function openDocs() {
    void daemon.shell.openExternal(selectedIntegration.docsUrl)
  }

  return (
    <div className="icc-shell">
      <header className="drawer-shared-header icc-header">
        <div className="drawer-shared-kicker icc-header-kicker">Integration Command Center</div>
        <div className="drawer-shared-title icc-header-title">Make Solana integrations obvious before anything runs</div>
        <p className="drawer-shared-subtitle icc-header-subtitle">
          Review setup, safe checks, and next actions for the protocols DAEMON should help with first.
        </p>
      </header>

      <section className="icc-metrics" aria-label="Integration readiness summary">
        <div className="icc-metric"><span>{registrySummary.ready}</span><small>ready</small></div>
        <div className="icc-metric"><span>{registrySummary.partial}</span><small>partial</small></div>
        <div className="icc-metric"><span>{registrySummary.missing}</span><small>need setup</small></div>
        <div className="icc-metric"><span>{registrySummary.safeActions}</span><small>safe checks</small></div>
      </section>

      <div className="icc-toolbar">
        <input
          className="icc-search"
          value={search}
          placeholder="Search integrations, actions, protocols..."
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="icc-filter-row" role="tablist" aria-label="Integration categories">
          {INTEGRATION_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`icc-filter ${category === item.id ? 'active' : ''}`}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <main className="icc-layout">
        <section className="icc-list" aria-label="Integrations">
          {visibleIntegrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              selected={integration.id === selectedIntegration.id}
              summary={resolveIntegrationStatus(integration, context)}
              onSelect={() => {
                setSelectedId(integration.id)
                setActionResult(null)
              }}
            />
          ))}
          {visibleIntegrations.length === 0 && (
            <div className="icc-empty">No integrations match this filter.</div>
          )}
        </section>

        <aside className={`icc-detail ${selectedBrandClass ? `icc-detail--brand icc-detail--${selectedBrandClass}` : ''}`} aria-label={`${selectedIntegration.name} details`}>
          <div className="icc-detail-head">
            <div>
              <span className="icc-detail-kicker">{selectedIntegration.category}</span>
              <h2>{selectedIntegration.name}</h2>
              <p>{selectedIntegration.description}</p>
            </div>
            <span className={`icc-status-badge ${selectedSummary.status}`}>{statusLabel(selectedSummary)}</span>
          </div>

          <div className="icc-detail-section">
            <div className="icc-section-title">Setup</div>
            <RequirementList summary={selectedSummary} />
          </div>

          <div className="icc-detail-section">
            <div className="icc-section-title">Best for</div>
            <div className="icc-tags">
              {selectedIntegration.recommendedFor.map((item) => <span key={item}>{item}</span>)}
            </div>
          </div>

          {selectedInstallCommand && !GUIDED_WORKFLOW_INTEGRATIONS.has(selectedIntegration.id) && (
            <div className="icc-install">
              <span>Install</span>
              <code>{selectedInstallCommand}</code>
            </div>
          )}

          {selectedIntegration.id === 'sendai-agent-kit' && (
            <SendAiAgentLaunchpad
              projectReady={Boolean(activeProjectPath && packageJsonContent)}
              setupPlan={sendAiSetupPlan}
              agentPlan={firstAgentPlan}
              result={actionResult?.title === 'Open MCP setup' ? null : actionResult}
              setupApplied={sendAiSetupApplied}
              applying={applyingSetup}
              scaffolding={scaffoldingFirstAgent}
              running={runningStarterCheck}
              onOpenProjectStarter={() => openWorkspaceTool('starter')}
              onApplySetup={() => void handleApplySendAiSetup(sendAiSetupPlan)}
              onScaffold={() => void handleCreateFirstAgent(firstAgentPlan)}
              onRun={() => void handleRunFirstAgent(firstAgentPlan)}
              aiProviderLabel={defaultAiProviderLabel}
              aiBusy={launchingAiSetup}
              onAiSetup={() => void handleSelectedAiSetup()}
            />
          )}

          {selectedIntegration.id === 'sendai-agent-kit' && (
            <SendAiSkillsWorkflow
              installCommand={SENDAI_SKILLS_INSTALL_COMMAND}
              suggestions={sendAiSkillSuggestions}
              result={actionResult?.title.includes('Skills') ? actionResult : null}
              installing={installingSkills}
              onInstall={() => void handleInstallSkills(SENDAI_SKILLS_INSTALL_COMMAND)}
              aiProviderLabel={defaultAiProviderLabel}
              aiBusy={launchingAiSetup}
              onAiSetup={() => void handleSelectedAiSetup()}
            />
          )}

          {selectedIntegration.id === 'streamlock' && (
            <IntegrationFirstWinWorkflow
              sectionTitle="Primitive Layer workflow"
              title="Scaffold the first Streamlock Operator API check"
              description="Streamlock should start as a server-side HTTP integration for locked streams, entitlement ledgers, and zero-sum operator sessions."
              status={Boolean(activeProjectPath) && hasStreamlockStarterFile && streamlockConfigReady ? 'ready' : 'partial'}
              result={actionResult}
              nextLabel={streamlockNextLabel}
              nextDetail={streamlockNextDetail}
              cards={[
                { label: 'Starter file', value: STREAMLOCK_STARTER_FILE },
                { label: 'Run command', value: streamlockRunCommand },
              ]}
              items={[
                { label: 'Project context', detail: activeProjectPath ? 'A project is open and ready for source scaffolding.' : 'Open or create a project before DAEMON can scaffold Streamlock.', ready: Boolean(activeProjectPath) },
                { label: 'Starter file', detail: hasStreamlockStarterFile ? `${STREAMLOCK_STARTER_FILE} exists in the active project.` : 'Create the starter before configuring real Streamlock credentials.', ready: hasStreamlockStarterFile },
                { label: 'Operator API', detail: 'Uses Streamlock HTTP routes directly until the Operator SDK is published to npm.', ready: true },
                { label: 'Operator API key', detail: streamlockConfigReady ? 'STREAMLOCK_OPERATOR_KEY is present in project env.' : 'The starter writes a placeholder only; keep the real key server-side.', ready: streamlockConfigReady },
                { label: 'RPC and mint inputs', detail: envKeys.has('SOLANA_RPC_URL') ? 'SOLANA_RPC_URL is available for write-flow broadcast helpers.' : 'Add SOLANA_RPC_URL before enabling writes or broadcast helpers.', ready: envKeys.has('SOLANA_RPC_URL') },
                { label: 'Signing boundary', detail: 'Session, delta, settle, and claim transactions remain behind explicit wallet or operator-signing review.', ready: false },
              ]}
              primaryLabel={streamlockNextLabel}
              primaryBusyLabel={!activeProjectPath ? 'Opening project flow...' : !hasStreamlockStarterFile ? 'Creating operator starter...' : !streamlockConfigReady ? 'Opening env manager...' : 'Opening operator check...'}
              busy={runningGuidedFlow === 'streamlock-starter' || runningGuidedFlow === 'streamlock-run'}
              onPrimary={!activeProjectPath
                ? () => openWorkspaceTool('starter')
                : !hasStreamlockStarterFile
                  ? () => void handleCreateStreamlockStarter()
                  : !streamlockConfigReady
                    ? () => openWorkspaceTool('env')
                    : () => void handleRunStreamlockStarter()}
              secondaryLabel="Open operator docs"
              onSecondary={openDocs}
              note="This starter is read-only. It verifies API configuration and stream discovery before any operator session, ledger delta, or settlement path is enabled."
              aiProviderLabel={defaultAiProviderLabel}
              aiBusy={launchingAiSetup}
              onAiSetup={() => void handleSelectedAiSetup()}
            />
          )}

          {selectedIntegration.id === 'phantom' && (
            <PhantomWalletWorkflow
              wallet={defaultWallet}
              isMainWallet={defaultWalletIsMain}
              signerReady={defaultWalletSignerReady}
              projectAssigned={defaultWalletAssignedToProject}
              hasActiveProject={Boolean(activeProjectId)}
              preferredWallet={walletInfrastructure.preferredWallet}
              executionMode={walletInfrastructure.executionMode}
              rpcLabel={walletRpcLabel}
              rpcReady={walletRpcReady}
              infrastructure={walletInfrastructure}
              heliusConfigured={Boolean(secureKeys.HELIUS_API_KEY)}
              result={actionResult}
              busy={updatingWalletFlow || runningGuidedFlow === 'phantom-preview'}
              onOpenWallet={() => openWorkspaceTool('wallet')}
              onCreateSigningWallet={(name) => void handleCreatePhantomSigningWallet(name)}
              onSaveRpcSetup={(input) => void handleSavePhantomRpcSetup(input)}
              onSetMainWallet={() => void handleSetMainWallet()}
              onAssignProject={() => void handleAssignWalletToProject()}
              onPreferPhantom={() => void handleSetPhantomPreferred()}
              onPreviewTransaction={() => void handlePreviewPhantomTransaction()}
              aiProviderLabel={defaultAiProviderLabel}
              aiBusy={launchingAiSetup}
              onAiSetup={() => void handleSelectedAiSetup()}
            />
          )}

          {selectedIntegration.id === 'sendai-agent-kit' && (
            <IntegrationFirstWinWorkflow
              sectionTitle="MCP workflow"
              title="Route one Solana MCP path inside DAEMON"
              description="The MCP setup should not be a dead end. DAEMON should guide the developer straight into the server path that exposes read-only Solana tools to agents."
              status={mcps.some((entry) => entry.name === 'solana-mcp-server' && entry.enabled) && envKeys.has('RPC_URL') ? 'ready' : 'partial'}
              result={actionResult?.title === 'Open MCP setup' ? actionResult : null}
              nextLabel={mcps.some((entry) => entry.name === 'solana-mcp-server' && entry.enabled) && envKeys.has('RPC_URL') ? 'Check MCP server state' : 'Open MCP setup'}
              nextDetail={mcps.some((entry) => entry.name === 'solana-mcp-server' && entry.enabled) && envKeys.has('RPC_URL')
                ? 'The MCP server looks configured. Move into toolbox setup to verify which tools are exposed.'
                : 'The server is not fully configured yet. Open the MCP setup path directly from here.'}
              cards={[
                { label: 'Server', value: mcps.some((entry) => entry.name === 'solana-mcp-server' && entry.enabled) ? 'Enabled' : 'Not enabled' },
                { label: 'RPC env', value: envKeys.has('RPC_URL') ? 'Configured' : 'Missing RPC_URL' },
              ]}
              items={[
                { label: 'Solana MCP enabled', detail: mcps.some((entry) => entry.name === 'solana-mcp-server' && entry.enabled) ? 'The MCP server is enabled for this project.' : 'Enable the MCP server so DAEMON can expose the Solana tool boundary.', ready: mcps.some((entry) => entry.name === 'solana-mcp-server' && entry.enabled) },
                { label: 'RPC available', detail: envKeys.has('RPC_URL') ? 'The MCP server has an RPC endpoint to target.' : 'Add RPC_URL so MCP-backed tools can read live Solana state.', ready: envKeys.has('RPC_URL') },
              ]}
              primaryLabel="Open MCP setup"
              primaryBusyLabel="Opening MCP setup..."
              busy={false}
              onPrimary={handleOpenMcpSetup}
              secondaryLabel="Open Solana toolbox"
              onSecondary={() => openWorkspaceTool('solana-toolbox')}
              note="This keeps the MCP handoff inside DAEMON instead of leaving the user with a generic setup card."
              aiProviderLabel={defaultAiProviderLabel}
              aiBusy={launchingAiSetup}
              onAiSetup={() => void handleSelectedAiSetup()}
            />
          )}

          {selectedIntegration.id === 'helius' && (
            <IntegrationFirstWinWorkflow
              sectionTitle="Provider workflow"
              title="Verify the Helius-backed wallet data path"
              description="Helius should feel operational immediately. The first win here is reading live wallet data inside DAEMON, not just proving a key exists."
              status={secureKeys.HELIUS_API_KEY && Boolean(defaultWallet) ? 'ready' : 'partial'}
              result={actionResult}
              nextLabel={secureKeys.HELIUS_API_KEY ? (defaultWallet ? 'Read default wallet data' : 'Open wallet manager') : 'Open env manager'}
              nextDetail={secureKeys.HELIUS_API_KEY
                ? (defaultWallet ? 'Run one safe wallet read to verify balance and holdings flow through the provider route.' : 'Create or connect a wallet so DAEMON has a target for the provider-backed read.')
                : 'Add the Helius API key first so the provider route is actually available.'}
              cards={[
                { label: 'Provider', value: secureKeys.HELIUS_API_KEY ? 'Helius configured' : 'Helius key missing' },
                { label: 'Wallet target', value: defaultWallet ? defaultWallet.name : 'No default wallet' },
              ]}
              items={[
                { label: 'Helius key', detail: secureKeys.HELIUS_API_KEY ? 'DAEMON has a Helius key available.' : 'Store the Helius key so provider-backed reads can run.', ready: secureKeys.HELIUS_API_KEY },
                { label: 'Wallet target', detail: defaultWallet ? `Default wallet is ${defaultWallet.name}.` : 'Create or import a wallet before running the provider read.', ready: Boolean(defaultWallet) },
                { label: 'Safe first read', detail: 'Read balance and holdings before moving toward transaction-related provider flows.', ready: false },
              ]}
              primaryLabel={secureKeys.HELIUS_API_KEY ? (defaultWallet ? 'Read wallet with Helius' : 'Open wallet manager') : 'Open env manager'}
              primaryBusyLabel="Running Helius wallet read..."
              busy={runningGuidedFlow === 'helius-wallet'}
              onPrimary={secureKeys.HELIUS_API_KEY ? (defaultWallet ? () => void handleInspectHeliusWallet() : () => openWorkspaceTool('wallet')) : () => openWorkspaceTool('env')}
              secondaryLabel="Open wallet workspace"
              onSecondary={() => openWorkspaceTool('wallet')}
              note="This is read-only. It validates the provider route without sending a transaction."
              aiProviderLabel={defaultAiProviderLabel}
              aiBusy={launchingAiSetup}
              onAiSetup={() => void handleSelectedAiSetup()}
            />
          )}

          {selectedIntegration.id === 'jupiter' && (
            <IntegrationFirstWinWorkflow
              sectionTitle="Swap workflow"
              title="Get to a first Jupiter quote before any signing"
              description="The Jupiter path should start with a quote and transaction preview, not with docs or abstract swap capability labels."
              status={Boolean(defaultWallet) && defaultWalletSignerReady ? 'ready' : 'partial'}
              result={actionResult}
              nextLabel={defaultWallet && defaultWalletSignerReady ? 'Preview SOL to USDC quote' : 'Open wallet manager'}
              nextDetail={defaultWallet && defaultWalletSignerReady
                ? 'Fetch a small read-only route preview so the developer sees the swap path and impact before signing exists.'
                : 'Use a wallet with a signer before trying to preview Jupiter swap routes.'}
              cards={[
                { label: 'Swap engine', value: walletInfrastructure.swapProvider === 'jupiter' ? 'Jupiter selected' : walletInfrastructure.swapProvider },
                { label: 'Wallet route', value: defaultWallet ? defaultWallet.name : 'No default wallet' },
              ]}
              items={[
                { label: 'Wallet route', detail: defaultWallet ? `Default wallet is ${defaultWallet.name}.` : 'Create or import a wallet so Jupiter has a route owner.', ready: Boolean(defaultWallet) },
                { label: 'Signer path', detail: defaultWalletSignerReady ? 'Signer is available for follow-up transaction previews.' : 'Add or restore the signer keypair for the default wallet.', ready: defaultWalletSignerReady },
                { label: 'Safe first quote', detail: 'Use a quote preview before moving into any swap execution surface.', ready: false },
              ]}
              primaryLabel={defaultWallet && defaultWalletSignerReady ? 'Preview Jupiter quote' : 'Open wallet manager'}
              primaryBusyLabel="Fetching Jupiter quote..."
              busy={runningGuidedFlow === 'jupiter-quote'}
              onPrimary={defaultWallet && defaultWalletSignerReady ? () => void handlePreviewJupiterQuote() : () => openWorkspaceTool('wallet')}
              secondaryLabel="Open wallet workspace"
              onSecondary={() => openWorkspaceTool('wallet')}
              note="DAEMON uses a quote plus transaction preview here so new Solana devs see the full swap path before any signing step."
              aiProviderLabel={defaultAiProviderLabel}
              aiBusy={launchingAiSetup}
              onAiSetup={() => void handleSelectedAiSetup()}
            />
          )}

          {selectedIntegration.id === 'metaplex' && (
            <IntegrationFirstWinWorkflow
              sectionTitle="NFT workflow"
              title="Create a first metadata draft inside the project"
              description="The first Metaplex success should be a metadata scaffold the project can edit immediately, not a vague promise of NFT support."
              status={Boolean(activeProjectPath) && packageInfo.packages.has('@metaplex-foundation/umi') ? 'ready' : 'partial'}
              result={actionResult}
              nextLabel={!activeProjectPath ? 'Open New Project' : !packageInfo.packages.has('@metaplex-foundation/umi') ? 'Install Metaplex packages' : 'Create metadata draft'}
              nextDetail={!activeProjectPath
                ? 'Open or scaffold a project first so the metadata draft has somewhere to live.'
                : !packageInfo.packages.has('@metaplex-foundation/umi')
                  ? 'Install the common Metaplex packages before DAEMON scaffolds the draft file.'
                  : 'Write a ready-to-edit metadata JSON draft into the project assets folder.'}
              cards={[
                { label: 'Project', value: activeProjectPath ? activeProjectPath.split('/').pop() ?? activeProjectPath : 'No project open' },
                { label: 'Draft file', value: METAPLEX_DRAFT_FILE },
              ]}
              items={[
                { label: 'Project context', detail: activeProjectPath ? 'A project is open and ready for asset scaffolding.' : 'Open or create a project before running the NFT starter flow.', ready: Boolean(activeProjectPath) },
                { label: 'Metaplex package', detail: packageInfo.packages.has('@metaplex-foundation/umi') ? 'Core Metaplex package detected in package.json.' : 'Install the Metaplex packages DAEMON expects for metadata workflows.', ready: packageInfo.packages.has('@metaplex-foundation/umi') },
                { label: 'Metadata-first start', detail: 'Create and edit metadata before pushing the user into mint or collection creation flows.', ready: false },
              ]}
              primaryLabel={!activeProjectPath ? 'Open New Project' : !packageInfo.packages.has('@metaplex-foundation/umi') ? 'Install Metaplex packages' : 'Create metadata draft'}
              primaryBusyLabel={!activeProjectPath ? 'Opening project flow...' : !packageInfo.packages.has('@metaplex-foundation/umi') ? 'Opening install terminal...' : 'Creating metadata draft...'}
              busy={runningGuidedFlow === 'Install Metaplex' || runningGuidedFlow === 'metaplex-draft'}
              onPrimary={!activeProjectPath
                ? () => openWorkspaceTool('starter')
                : !packageInfo.packages.has('@metaplex-foundation/umi')
                  ? () => void handleOpenProjectInstall(selectedInstallCommand!, 'Install Metaplex')
                  : () => void handleCreateMetaplexDraft()}
              secondaryLabel="Open New Project"
              onSecondary={() => openWorkspaceTool('starter')}
              note="This stays deliberately metadata-first so the user gets a concrete asset draft before any mint transaction path."
              aiProviderLabel={defaultAiProviderLabel}
              aiBusy={launchingAiSetup}
              onAiSetup={() => void handleSelectedAiSetup()}
            />
          )}

          {selectedIntegration.id === 'light-protocol' && (
            <IntegrationFirstWinWorkflow
              sectionTitle="Compression workflow"
              title="Scaffold the first Light compression starter"
              description="Light Protocol should begin with a concrete compression-capable project check, not a generic package status card."
              status={Boolean(activeProjectPath) && lightPackagesReady && envKeys.has('RPC_URL') ? 'ready' : 'partial'}
              result={actionResult}
              nextLabel={!activeProjectPath ? 'Open New Project' : !lightPackagesReady ? 'Install Light SDK' : !envKeys.has('RPC_URL') ? 'Open env manager' : 'Create compression starter'}
              nextDetail={!activeProjectPath
                ? 'Open or scaffold a project first so the compression starter can be written into source.'
                : !lightPackagesReady
                  ? 'Install the Light SDK and compressed-token package before DAEMON scaffolds the starter file.'
                  : !envKeys.has('RPC_URL')
                    ? 'Add a compression-capable RPC first so the starter has a real target.'
                    : 'Write a runnable compression starter into the project and add the package script.'}
              cards={[
                { label: 'Starter file', value: LIGHT_STARTER_FILE },
                { label: 'Run command', value: `pnpm run ${LIGHT_STARTER_SCRIPT}` },
              ]}
              items={[
                { label: 'Project context', detail: activeProjectPath ? 'A project is open and ready for source scaffolding.' : 'Open or create a project before DAEMON can scaffold the Light starter.', ready: Boolean(activeProjectPath) },
                { label: 'Light SDK', detail: lightStatelessReady ? 'The Light SDK is already installed.' : 'Install @lightprotocol/stateless.js before scaffolding the starter.', ready: lightStatelessReady },
                { label: 'Compressed token SDK', detail: lightCompressedTokenReady ? 'The compressed token package is already installed.' : 'Install @lightprotocol/compressed-token before compressed-token flows.', ready: lightCompressedTokenReady },
                { label: 'Compression-capable RPC', detail: envKeys.has('RPC_URL') ? 'RPC_URL is available for the starter check.' : 'Add RPC_URL so the compression starter has a real endpoint.', ready: envKeys.has('RPC_URL') },
              ]}
              primaryLabel={!activeProjectPath ? 'Open New Project' : !lightPackagesReady ? 'Install Light SDK' : !envKeys.has('RPC_URL') ? 'Open env manager' : 'Create compression starter'}
              primaryBusyLabel={!activeProjectPath ? 'Opening project flow...' : !lightPackagesReady ? 'Opening install terminal...' : !envKeys.has('RPC_URL') ? 'Opening env manager...' : 'Creating compression starter...'}
              busy={runningGuidedFlow === 'Install Light SDK' || runningGuidedFlow === 'light-starter'}
              onPrimary={!activeProjectPath
                ? () => openWorkspaceTool('starter')
                : !lightPackagesReady
                  ? () => void handleOpenProjectInstall(selectedInstallCommand!, 'Install Light SDK')
                  : !envKeys.has('RPC_URL')
                    ? () => openWorkspaceTool('env')
                    : () => void handleCreateLightStarter()}
              secondaryLabel="Open env manager"
              onSecondary={() => openWorkspaceTool('env')}
              note="This is still safe. The starter only verifies imports and RPC configuration before you add real compression logic."
              aiProviderLabel={defaultAiProviderLabel}
              aiBusy={launchingAiSetup}
              onAiSetup={() => void handleSelectedAiSetup()}
            />
          )}

          {selectedIntegration.id === 'magicblock' && (
            <IntegrationFirstWinWorkflow
              sectionTitle="Ephemeral Rollup workflow"
              title="Scaffold the first MagicBlock readiness check"
              description="MagicBlock should start with package, base RPC, and delegation-shape checks before DAEMON exposes any ER transaction path."
              status={Boolean(activeProjectPath) && magicBlockPackageReady && envKeys.has('RPC_URL') ? 'ready' : 'partial'}
              result={actionResult}
              nextLabel={!activeProjectPath ? 'Open New Project' : !magicBlockPackageReady ? 'Install MagicBlock SDK' : !envKeys.has('RPC_URL') ? 'Open env manager' : 'Create ER readiness starter'}
              nextDetail={!activeProjectPath
                ? 'Open or scaffold a project first so the MagicBlock starter can be written into source.'
                : !magicBlockPackageReady
                  ? 'Install the MagicBlock Ephemeral Rollups SDK before DAEMON scaffolds the starter file.'
                  : !envKeys.has('RPC_URL')
                    ? 'Add RPC_URL so the starter has a base-layer Solana target.'
                    : 'Write a runnable MagicBlock readiness starter into the project and add the package script.'}
              cards={[
                { label: 'Starter file', value: MAGICBLOCK_STARTER_FILE },
                { label: 'Run command', value: `pnpm run ${MAGICBLOCK_STARTER_SCRIPT}` },
              ]}
              items={[
                { label: 'Project context', detail: activeProjectPath ? 'A project is open and ready for source scaffolding.' : 'Open or create a project before DAEMON can scaffold the MagicBlock starter.', ready: Boolean(activeProjectPath) },
                { label: 'MagicBlock SDK', detail: magicBlockPackageReady ? 'The MagicBlock SDK is already installed.' : 'Install @magicblock-labs/ephemeral-rollups-sdk before scaffolding the starter.', ready: magicBlockPackageReady },
                { label: 'Base-layer RPC', detail: envKeys.has('RPC_URL') ? 'RPC_URL is available for the base-layer connection.' : 'Add RPC_URL so DAEMON can separate base-layer and ER routing clearly.', ready: envKeys.has('RPC_URL') },
                { label: 'Delegation map', detail: 'Identify which PDAs can be delegated before any ER transaction builder is enabled.', ready: false },
              ]}
              primaryLabel={!activeProjectPath ? 'Open New Project' : !magicBlockPackageReady ? 'Install MagicBlock SDK' : !envKeys.has('RPC_URL') ? 'Open env manager' : 'Create ER readiness starter'}
              primaryBusyLabel={!activeProjectPath ? 'Opening project flow...' : !magicBlockPackageReady ? 'Opening install terminal...' : !envKeys.has('RPC_URL') ? 'Opening env manager...' : 'Creating ER readiness starter...'}
              busy={runningGuidedFlow === 'Install MagicBlock SDK' || runningGuidedFlow === 'magicblock-starter'}
              onPrimary={!activeProjectPath
                ? () => openWorkspaceTool('starter')
                : !magicBlockPackageReady
                  ? () => void handleOpenProjectInstall(selectedInstallCommand!, 'Install MagicBlock SDK')
                  : !envKeys.has('RPC_URL')
                    ? () => openWorkspaceTool('env')
                    : () => void handleCreateMagicBlockStarter()}
              secondaryLabel="Open docs"
              onSecondary={openDocs}
              note="This starter is read-only. Delegation, commit, undelegate, and ER sends stay behind a separate explicit implementation step."
              aiProviderLabel={defaultAiProviderLabel}
              aiBusy={launchingAiSetup}
              onAiSetup={() => void handleSelectedAiSetup()}
            />
          )}

          {selectedIntegration.id === 'debridge' && (
            <IntegrationFirstWinWorkflow
              sectionTitle="Cross-chain workflow"
              title="Scaffold the first deBridge DLN route preview"
              description="deBridge should start with route input collection and create-tx response parsing before DAEMON exposes any bridge signing path."
              status={Boolean(activeProjectPath) && debridgePackageReady ? 'ready' : 'partial'}
              result={actionResult}
              nextLabel={!activeProjectPath ? 'Open New Project' : !debridgePackageReady ? 'Install deBridge client' : 'Create route preview starter'}
              nextDetail={!activeProjectPath
                ? 'Open or scaffold a project first so the deBridge starter can be written into source.'
                : !debridgePackageReady
                  ? 'Install the deBridge DLN client before DAEMON scaffolds the starter file.'
                  : 'Write a runnable DLN route-preview starter into the project and add the package script.'}
              cards={[
                { label: 'Starter file', value: DEBRIDGE_STARTER_FILE },
                { label: 'Run command', value: `pnpm run ${DEBRIDGE_STARTER_SCRIPT}` },
              ]}
              items={[
                { label: 'Project context', detail: activeProjectPath ? 'A project is open and ready for source scaffolding.' : 'Open or create a project before DAEMON can scaffold the deBridge starter.', ready: Boolean(activeProjectPath) },
                { label: 'deBridge client', detail: debridgePackageReady ? 'The deBridge DLN client is already installed.' : 'Install @debridge-finance/dln-client before scaffolding the starter.', ready: debridgePackageReady },
                { label: 'Route inputs', detail: 'Source chain, destination chain, tokens, amount, sender, and receiver stay in env until the route-preview UI exists.', ready: false },
                { label: 'Signing boundary', detail: 'Treat create-tx responses as previews until a wallet confirmation flow reviews the serialized transaction or calldata.', ready: false },
              ]}
              primaryLabel={!activeProjectPath ? 'Open New Project' : !debridgePackageReady ? 'Install deBridge client' : 'Create route preview starter'}
              primaryBusyLabel={!activeProjectPath ? 'Opening project flow...' : !debridgePackageReady ? 'Opening install terminal...' : 'Creating route preview starter...'}
              busy={runningGuidedFlow === 'Install deBridge client' || runningGuidedFlow === 'debridge-starter'}
              onPrimary={!activeProjectPath
                ? () => openWorkspaceTool('starter')
                : !debridgePackageReady
                  ? () => void handleOpenProjectInstall(selectedInstallCommand!, 'Install deBridge client')
                  : () => void handleCreateDebridgeStarter()}
              secondaryLabel="Open docs"
              onSecondary={openDocs}
              note="This starter can call create-tx for estimation, but it does not sign or submit any cross-chain transaction."
              aiProviderLabel={defaultAiProviderLabel}
              aiBusy={launchingAiSetup}
              onAiSetup={() => void handleSelectedAiSetup()}
            />
          )}

          {selectedIntegration.id === 'squads' && (
            <IntegrationFirstWinWorkflow
              sectionTitle="Smart account workflow"
              title="Scaffold the first Squads multisig inspection"
              description="Squads should start with read-only multisig and vault inspection before DAEMON exposes proposal creation, voting, execution, or treasury movement."
              status={Boolean(activeProjectPath) && squadsPackageReady && envKeys.has('RPC_URL') ? 'ready' : 'partial'}
              result={actionResult}
              nextLabel={!activeProjectPath ? 'Open New Project' : !squadsPackageReady ? 'Install Squads SDK' : !envKeys.has('RPC_URL') ? 'Open env manager' : 'Create multisig inspection starter'}
              nextDetail={!activeProjectPath
                ? 'Open or scaffold a project first so the Squads starter can be written into source.'
                : !squadsPackageReady
                  ? 'Install the Squads multisig SDK before DAEMON scaffolds the starter file.'
                  : !envKeys.has('RPC_URL')
                    ? 'Add RPC_URL so the starter can inspect existing multisig and vault accounts.'
                    : 'Write a runnable multisig inspection starter into the project and add the package script.'}
              cards={[
                { label: 'Starter file', value: SQUADS_STARTER_FILE },
                { label: 'Run command', value: `pnpm run ${SQUADS_STARTER_SCRIPT}` },
              ]}
              items={[
                { label: 'Project context', detail: activeProjectPath ? 'A project is open and ready for source scaffolding.' : 'Open or create a project before DAEMON can scaffold the Squads starter.', ready: Boolean(activeProjectPath) },
                { label: 'Squads SDK', detail: squadsPackageReady ? 'The Squads multisig SDK is already installed.' : 'Install @sqds/multisig before scaffolding the starter.', ready: squadsPackageReady },
                { label: 'Solana RPC', detail: envKeys.has('RPC_URL') ? 'RPC_URL is available for multisig account reads.' : 'Add RPC_URL so the starter can read Squads accounts.', ready: envKeys.has('RPC_URL') },
                { label: 'Existing multisig', detail: 'Add SQUADS_MULTISIG_ADDRESS when you want the starter to inspect a real V4 multisig and vault PDA.', ready: false },
              ]}
              primaryLabel={!activeProjectPath ? 'Open New Project' : !squadsPackageReady ? 'Install Squads SDK' : !envKeys.has('RPC_URL') ? 'Open env manager' : 'Create multisig inspection starter'}
              primaryBusyLabel={!activeProjectPath ? 'Opening project flow...' : !squadsPackageReady ? 'Opening install terminal...' : !envKeys.has('RPC_URL') ? 'Opening env manager...' : 'Creating multisig inspection starter...'}
              busy={runningGuidedFlow === 'Install Squads SDK' || runningGuidedFlow === 'squads-starter'}
              onPrimary={!activeProjectPath
                ? () => openWorkspaceTool('starter')
                : !squadsPackageReady
                  ? () => void handleOpenProjectInstall(selectedInstallCommand!, 'Install Squads SDK')
                  : !envKeys.has('RPC_URL')
                    ? () => openWorkspaceTool('env')
                    : () => void handleCreateSquadsStarter()}
              secondaryLabel="Open docs"
              onSecondary={openDocs}
              note="This starter is read-only. Proposal creation, voting, execution, and treasury movement stay behind a separate explicit implementation step."
              aiProviderLabel={defaultAiProviderLabel}
              aiBusy={launchingAiSetup}
              onAiSetup={() => void handleSelectedAiSetup()}
            />
          )}

          {!GUIDED_WORKFLOW_INTEGRATIONS.has(selectedIntegration.id) && (
            <div className="icc-detail-section">
              <div className="icc-section-title">Actions</div>
              <AiSetupCallout
                detail={`${defaultAiProviderLabel} will inspect the project and handle the safest setup work for this integration.`}
                providerLabel={defaultAiProviderLabel}
                busy={launchingAiSetup}
                busyLabel={`Launching ${defaultAiProviderLabel}...`}
                onSetup={() => void handleSelectedAiSetup()}
              />
              <div className="icc-actions">
                {selectedIntegration.actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="icc-action"
                    onClick={() => void handleRunAction(action.id)}
                    disabled={runningActionId === action.id}
                  >
                    <span className="icc-action-main">
                      <span>{runningActionId === action.id ? 'Running...' : action.label}</span>
                      <small>{action.description}</small>
                    </span>
                    <RiskPill risk={action.risk} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {actionResult && !GUIDED_WORKFLOW_INTEGRATIONS.has(selectedIntegration.id) && (
            <div className={`icc-result ${actionResult.status}`}>
              <span className="icc-result-title">{actionResult.title}</span>
              <p>{actionResult.detail}</p>
              {actionResult.items?.length ? (
                <div className="icc-result-items">
                  {actionResult.items.map((item) => <code key={item}>{item}</code>)}
                </div>
              ) : null}
            </div>
          )}

          <div className="icc-footer-actions">
            <button type="button" className="icc-secondary" onClick={openDocs}>Open docs</button>
            {detailShortcut ? (
              <button type="button" className="icc-primary" onClick={detailShortcut.onClick}>{detailShortcut.label}</button>
            ) : null}
          </div>

          {loading && <div className="icc-loading">Refreshing setup context...</div>}
        </aside>
      </main>
    </div>
  )
}

export default IntegrationCommandCenter
