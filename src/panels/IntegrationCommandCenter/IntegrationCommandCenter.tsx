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
  mergeEnvExample,
  parsePackageInfo,
  upsertPackageJsonScript,
  SENDAI_FIRST_AGENT_ENTRY,
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
const METAPLEX_DRAFT_DIR = 'assets/metaplex'
const METAPLEX_DRAFT_FILE = `${METAPLEX_DRAFT_DIR}/metadata.example.json`
const METAPLEX_DRAFT_SCRIPT = 'metaplex:draft-check'
const LIGHT_STARTER_DIR = 'src/light'
const LIGHT_STARTER_FILE = `${LIGHT_STARTER_DIR}/compression-check.mjs`
const LIGHT_STARTER_SCRIPT = 'light:check'
const GUIDED_WORKFLOW_INTEGRATIONS = new Set([
  'sendai-agent-kit',
  'sendai-solana-mcp',
  'helius',
  'phantom',
  'jupiter',
  'metaplex',
  'light-protocol',
  'protocol-skills',
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
  if (context.packages.has('@lightprotocol/stateless.js')) suggestions.push('light-protocol')
  if (context.packages.has('@raydium-io/raydium-sdk-v2')) suggestions.push('raydium')

  return suggestions.length > 0 ? suggestions : ['solana-agent-kit', 'helius', 'integrating-jupiter']
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

  const light = await import('@lightprotocol/stateless.js')
  const exportedKeys = Object.keys(light).sort()

  console.log('Light Protocol starter is ready.')
  console.log(\`RPC: \${rpcUrl}\`)
  console.log(\`Exports detected: \${exportedKeys.length}\`)
  console.log(\`Sample exports: \${exportedKeys.slice(0, 12).join(', ')}\`)
  console.log('Next step: replace this import check with the compressed-state flow you want DAEMON to guide.')
}

main().catch((error) => {
  console.error('Light starter failed.')
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
        <button type="button" className="icc-primary" onClick={nextAction.action} disabled={nextAction.disabled}>
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
}: {
  installCommand: string
  suggestions: string[]
  result?: IntegrationActionResult | null
  installing: boolean
  onInstall: () => void
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
        <button type="button" className="icc-primary" onClick={onInstall} disabled={installing}>
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
        <button type="button" className="icc-primary" onClick={onPrimary} disabled={busy}>
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
  result,
  busy,
  onOpenWallet,
  onSetMainWallet,
  onAssignProject,
  onPreferPhantom,
  onPreviewTransaction,
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
  result?: IntegrationActionResult | null
  busy: boolean
  onOpenWallet: () => void
  onSetMainWallet: () => void
  onAssignProject: () => void
  onPreferPhantom: () => void
  onPreviewTransaction: () => void
}) {
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
  const nextAction = readiness.nextAction.id === 'set-main-wallet'
    ? onSetMainWallet
    : readiness.nextAction.id === 'assign-project'
      ? onAssignProject
      : readiness.nextAction.id === 'set-preferred-wallet'
        ? onPreferPhantom
        : readiness.nextAction.id === 'preview-transaction'
          ? onPreviewTransaction
          : onOpenWallet

  return (
    <div className="icc-setup-workflow icc-setup-workflow--wallet">
      <div className="icc-setup-head">
        <div>
          <span className="icc-section-title">Wallet workflow</span>
          <h3>Get the wallet route ready for Phantom-first signing</h3>
          <p>New Solana developers should be able to see one wallet path, one signer path, and one project route without leaving this drawer.</p>
        </div>
        <span className={`icc-status-badge ${readiness.readyCount === readiness.totalCount ? 'ready' : 'partial'}`}>
          {readiness.readyCount === readiness.totalCount ? 'ready' : 'guided'}
        </span>
      </div>

      <div className="icc-guided-next">
        <span className="icc-mini-title">Next step</span>
        <strong>{readiness.nextAction.label}</strong>
        <p>{readiness.nextAction.detail}</p>
      </div>

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

      <div className="icc-step-list">
        {readiness.items.map((item, index) => (
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
        <button type="button" className="icc-primary" onClick={nextAction} disabled={busy}>
          {busy ? 'Applying wallet setup...' : readiness.nextAction.label}
        </button>
        <button type="button" className="icc-secondary" onClick={onOpenWallet}>
          Open wallet workspace
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
  return (
    <button
      type="button"
      className={`icc-card ${selected ? 'selected' : ''}`}
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
  const [selectedId, setSelectedId] = useState(INTEGRATION_REGISTRY[0]?.id ?? '')
  const [envFiles, setEnvFiles] = useState<EnvFile[]>([])
  const [packageInfo, setPackageInfo] = useState<PackageInfo>(EMPTY_PACKAGE_INFO)
  const [packageJsonContent, setPackageJsonContent] = useState<string | null>(null)
  const [lockfiles, setLockfiles] = useState<Partial<Record<PackageManager, boolean>>>({})
  const [hasStarterAgentFile, setHasStarterAgentFile] = useState(false)
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

          const [envRes, packageRes, pnpmLockRes, npmLockRes, yarnLockRes, bunLockRes, starterFileRes] = await Promise.all([
            daemon.env.projectVars(activeProjectPath),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'package.json')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'pnpm-lock.yaml')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'package-lock.json')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'yarn.lock')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'bun.lockb')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, SENDAI_FIRST_AGENT_ENTRY)),
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
          setHasStarterAgentFile(Boolean(starterFileRes.ok))
        } else {
          setEnvFiles([])
          setPackageInfo(EMPTY_PACKAGE_INFO)
          setPackageJsonContent(null)
          setLockfiles({})
          setHasStarterAgentFile(false)
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
  const sendAiSetupPlan = useMemo(
    () => createSendAiSetupPlan({ packageInfo, lockfiles, envKeys }),
    [packageInfo, lockfiles, envKeys],
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
    const target = INTEGRATION_REGISTRY.find((integration) => integration.id === integrationCommandSelectionId)
    if (target) {
      setCategory('all')
      setSearch('')
      setSelectedId(integrationCommandSelectionId)
      setActionResult(null)
    }
    setIntegrationCommandSelectionId(null)
  }, [integrationCommandSelectionId, setIntegrationCommandSelectionId])

  const selectedIntegration = visibleIntegrations.find((integration) => integration.id === selectedId) ?? visibleIntegrations[0] ?? INTEGRATION_REGISTRY[0]
  const selectedSummary = resolveIntegrationStatus(selectedIntegration, context)
  const detailShortcut = useMemo<DetailShortcut | null>(() => {
    if (GUIDED_WORKFLOW_INTEGRATIONS.has(selectedIntegration.id)) {
      return null
    }

    if (selectedIntegration.id === 'token-launch-stack') {
      return {
        label: 'Open Token Launch',
        onClick: () => openWorkspaceTool('token-launch'),
      }
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

      if (plan.installCommand) {
        const terminalRes = await daemon.terminal.create({
          cwd: activeProjectPath,
          startupCommand: plan.installCommand,
          userInitiated: true,
        })
        if (!terminalRes.ok || !terminalRes.data) {
          throw new Error(terminalRes.error ?? 'Could not start package install terminal')
        }
        addTerminal(activeProjectId, terminalRes.data.id, 'Install SendAI', terminalRes.data.agentId)
        focusTerminal()
        changedFiles.push(`terminal: ${plan.installCommand}`)
      }

      setActionResult({
        title: 'SendAI setup started',
        status: 'success',
        detail: plan.installCommand
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
      const terminalRes = await daemon.terminal.create({
        cwd: activeProjectPath,
        startupCommand: command,
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
        items: [command, `Suggested skills: ${sendAiSkillSuggestions.join(', ')}`],
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
      const terminalRes = await daemon.terminal.create({
        cwd: activeProjectPath,
        startupCommand: command,
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
        items: [command],
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

  function handleOpenMcpSetup() {
    openWorkspaceTool('solana-toolbox')
    setActionResult({
      title: 'Open MCP setup',
      status: 'success',
      detail: 'DAEMON moved you into the Solana toolbox so the MCP path can be enabled and checked from one place.',
    })
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

        <aside className="icc-detail" aria-label={`${selectedIntegration.name} details`}>
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

          {selectedIntegration.installCommand && !GUIDED_WORKFLOW_INTEGRATIONS.has(selectedIntegration.id) && (
            <div className="icc-install">
              <span>Install</span>
              <code>{selectedIntegration.installCommand}</code>
            </div>
          )}

          {selectedIntegration.id === 'sendai-agent-kit' && (
            <SendAiAgentLaunchpad
              projectReady={Boolean(activeProjectPath && packageJsonContent)}
              setupPlan={sendAiSetupPlan}
              agentPlan={firstAgentPlan}
              result={actionResult}
              setupApplied={sendAiSetupApplied}
              applying={applyingSetup}
              scaffolding={scaffoldingFirstAgent}
              running={runningStarterCheck}
              onOpenProjectStarter={() => openWorkspaceTool('starter')}
              onApplySetup={() => void handleApplySendAiSetup(sendAiSetupPlan)}
              onScaffold={() => void handleCreateFirstAgent(firstAgentPlan)}
              onRun={() => void handleRunFirstAgent(firstAgentPlan)}
            />
          )}

          {selectedIntegration.id === 'protocol-skills' && selectedIntegration.installCommand && (
            <SendAiSkillsWorkflow
              installCommand={selectedIntegration.installCommand}
              suggestions={sendAiSkillSuggestions}
              result={actionResult}
              installing={installingSkills}
              onInstall={() => void handleInstallSkills(selectedIntegration.installCommand!)}
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
              result={actionResult}
              busy={updatingWalletFlow}
              onOpenWallet={() => openWorkspaceTool('wallet')}
              onSetMainWallet={() => void handleSetMainWallet()}
              onAssignProject={() => void handleAssignWalletToProject()}
              onPreferPhantom={() => void handleSetPhantomPreferred()}
              onPreviewTransaction={() => void handlePreviewPhantomTransaction()}
            />
          )}

          {selectedIntegration.id === 'sendai-solana-mcp' && (
            <IntegrationFirstWinWorkflow
              sectionTitle="MCP workflow"
              title="Route one Solana MCP path inside DAEMON"
              description="The MCP setup should not be a dead end. DAEMON should guide the developer straight into the server path that exposes read-only Solana tools to agents."
              status={selectedSummary.status === 'ready' ? 'ready' : 'partial'}
              result={actionResult}
              nextLabel={selectedSummary.status === 'ready' ? 'Check MCP server state' : 'Open MCP setup'}
              nextDetail={selectedSummary.status === 'ready'
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
                  ? () => void handleOpenProjectInstall(selectedIntegration.installCommand!, 'Install Metaplex')
                  : () => void handleCreateMetaplexDraft()}
              secondaryLabel="Open New Project"
              onSecondary={() => openWorkspaceTool('starter')}
              note="This stays deliberately metadata-first so the user gets a concrete asset draft before any mint transaction path."
            />
          )}

          {selectedIntegration.id === 'light-protocol' && (
            <IntegrationFirstWinWorkflow
              sectionTitle="Compression workflow"
              title="Scaffold the first Light compression starter"
              description="Light Protocol should begin with a concrete compression-capable project check, not a generic package status card."
              status={Boolean(activeProjectPath) && packageInfo.packages.has('@lightprotocol/stateless.js') && envKeys.has('RPC_URL') ? 'ready' : 'partial'}
              result={actionResult}
              nextLabel={!activeProjectPath ? 'Open New Project' : !packageInfo.packages.has('@lightprotocol/stateless.js') ? 'Install Light SDK' : !envKeys.has('RPC_URL') ? 'Open env manager' : 'Create compression starter'}
              nextDetail={!activeProjectPath
                ? 'Open or scaffold a project first so the compression starter can be written into source.'
                : !packageInfo.packages.has('@lightprotocol/stateless.js')
                  ? 'Install the Light SDK before DAEMON scaffolds the starter file.'
                  : !envKeys.has('RPC_URL')
                    ? 'Add a compression-capable RPC first so the starter has a real target.'
                    : 'Write a runnable compression starter into the project and add the package script.'}
              cards={[
                { label: 'Starter file', value: LIGHT_STARTER_FILE },
                { label: 'Run command', value: `pnpm run ${LIGHT_STARTER_SCRIPT}` },
              ]}
              items={[
                { label: 'Project context', detail: activeProjectPath ? 'A project is open and ready for source scaffolding.' : 'Open or create a project before DAEMON can scaffold the Light starter.', ready: Boolean(activeProjectPath) },
                { label: 'Light SDK', detail: packageInfo.packages.has('@lightprotocol/stateless.js') ? 'The Light SDK is already installed.' : 'Install the Light SDK package before scaffolding the starter.', ready: packageInfo.packages.has('@lightprotocol/stateless.js') },
                { label: 'Compression-capable RPC', detail: envKeys.has('RPC_URL') ? 'RPC_URL is available for the starter check.' : 'Add RPC_URL so the compression starter has a real endpoint.', ready: envKeys.has('RPC_URL') },
              ]}
              primaryLabel={!activeProjectPath ? 'Open New Project' : !packageInfo.packages.has('@lightprotocol/stateless.js') ? 'Install Light SDK' : !envKeys.has('RPC_URL') ? 'Open env manager' : 'Create compression starter'}
              primaryBusyLabel={!activeProjectPath ? 'Opening project flow...' : !packageInfo.packages.has('@lightprotocol/stateless.js') ? 'Opening install terminal...' : !envKeys.has('RPC_URL') ? 'Opening env manager...' : 'Creating compression starter...'}
              busy={runningGuidedFlow === 'Install Light SDK' || runningGuidedFlow === 'light-starter'}
              onPrimary={!activeProjectPath
                ? () => openWorkspaceTool('starter')
                : !packageInfo.packages.has('@lightprotocol/stateless.js')
                  ? () => void handleOpenProjectInstall(selectedIntegration.installCommand!, 'Install Light SDK')
                  : !envKeys.has('RPC_URL')
                    ? () => openWorkspaceTool('env')
                    : () => void handleCreateLightStarter()}
              secondaryLabel="Open env manager"
              onSecondary={() => openWorkspaceTool('env')}
              note="This is still safe. The starter only verifies imports and RPC configuration before you add real compression logic."
            />
          )}

          {!GUIDED_WORKFLOW_INTEGRATIONS.has(selectedIntegration.id) && (
            <div className="icc-detail-section">
              <div className="icc-section-title">Actions</div>
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
