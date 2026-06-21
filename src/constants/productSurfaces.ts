export type ProductSurfaceAvailability = 'live' | 'partial' | 'planned'
export type ProductSurfaceKind = 'drawer' | 'tab' | 'plugin'
export type ProductSurfaceSetupKind =
  | 'project'
  | 'wallet'
  | 'signer'
  | 'env'
  | 'secure-key'
  | 'provider'
  | 'service'
  | 'file'
  | 'plugin'
  | 'none'

export interface ProductSurfaceAction {
  label: string
  toolId: string
  detail: string
}

export interface ProductSurfaceDefinition {
  id: string
  name: string
  purpose: string
  kind: ProductSurfaceKind
  category: 'dev' | 'solana-core' | 'launch' | 'agents' | 'markets' | 'partners' | 'create' | 'system'
  availability: ProductSurfaceAvailability
  setupKinds: ProductSurfaceSetupKind[]
  primaryAction: ProductSurfaceAction
  relatedIntegrationId?: string
  relatedToolIds: string[]
}

export const PRODUCT_SURFACES: ProductSurfaceDefinition[] = [
  { id: 'starter', name: 'New Project', purpose: 'Scaffold Solana app and agent templates.', kind: 'drawer', category: 'dev', availability: 'live', setupKinds: ['project'], primaryAction: { label: 'Create project', toolId: 'starter', detail: 'Choose a template and working folder.' }, relatedToolIds: ['solana-toolbox', 'env', 'deploy'] },
  { id: 'git', name: 'Git', purpose: 'Review, stage, commit, stash, and sync project changes.', kind: 'drawer', category: 'dev', availability: 'live', setupKinds: ['project'], primaryAction: { label: 'Review changes', toolId: 'git', detail: 'Inspect staged and unstaged work.' }, relatedToolIds: ['deploy', 'activity'] },
  { id: 'deploy', name: 'Deploy', purpose: 'Link and deploy projects through Vercel or Railway.', kind: 'drawer', category: 'dev', availability: 'live', setupKinds: ['project', 'provider', 'env'], primaryAction: { label: 'Check deploy', toolId: 'deploy', detail: 'Link a provider and verify deploy readiness.' }, relatedToolIds: ['env', 'ports', 'browser'] },
  { id: 'env', name: 'Env', purpose: 'Manage project env vars and write-only secret setup.', kind: 'drawer', category: 'dev', availability: 'live', setupKinds: ['project', 'env', 'secure-key'], primaryAction: { label: 'Open env', toolId: 'env', detail: 'Add required project variables and API keys.' }, relatedToolIds: ['integrations', 'settings'] },
  { id: 'wallet', name: 'Wallet', purpose: 'Create, import, fund, assign, and preview Solana wallet actions.', kind: 'drawer', category: 'solana-core', availability: 'live', setupKinds: ['wallet', 'signer'], primaryAction: { label: 'Open wallet', toolId: 'wallet', detail: 'Create or select the project wallet route.' }, relatedIntegrationId: 'phantom', relatedToolIds: ['project-readiness', 'dashboard'] },
  { id: 'email', name: 'Email', purpose: 'Connect Gmail or iCloud and extract useful project context.', kind: 'drawer', category: 'create', availability: 'partial', setupKinds: ['provider'], primaryAction: { label: 'Connect inbox', toolId: 'email', detail: 'Add an account before using summaries or extraction.' }, relatedToolIds: ['agent-work', 'daemon-ai'] },
  { id: 'ports', name: 'Ports', purpose: 'Inspect tracked local apps and actionable ghost listeners.', kind: 'drawer', category: 'system', availability: 'live', setupKinds: ['service'], primaryAction: { label: 'Inspect ports', toolId: 'ports', detail: 'Find the active local app or blocked listener.' }, relatedToolIds: ['browser', 'deploy'] },
  { id: 'processes', name: 'Processes', purpose: 'Monitor DAEMON-managed sessions and orphaned processes.', kind: 'drawer', category: 'system', availability: 'live', setupKinds: ['service'], primaryAction: { label: 'Review processes', toolId: 'processes', detail: 'Focus or stop active process work.' }, relatedToolIds: ['sessions', 'activity'] },
  { id: 'settings', name: 'Settings', purpose: 'Configure app, AI, tool visibility, and global runtime settings.', kind: 'drawer', category: 'system', availability: 'live', setupKinds: ['none'], primaryAction: { label: 'Open settings', toolId: 'settings', detail: 'Adjust app and tool configuration.' }, relatedToolIds: ['env', 'plugins'] },
  { id: 'image-editor', name: 'Image Editor', purpose: 'Edit local image assets for launches and content.', kind: 'drawer', category: 'create', availability: 'partial', setupKinds: ['file'], primaryAction: { label: 'Open image', toolId: 'image-editor', detail: 'Choose an image before editing.' }, relatedToolIds: ['token-launch', 'degentools'] },
  { id: 'token-launch', name: 'Token Launch', purpose: 'Prepare and launch tokens across supported venues.', kind: 'drawer', category: 'launch', availability: 'live', setupKinds: ['wallet', 'signer', 'secure-key'], primaryAction: { label: 'Prepare launch', toolId: 'token-launch', detail: 'Review wallet, metadata, and venue readiness.' }, relatedToolIds: ['wallet', 'degentools', 'flywheel'] },
  { id: 'proof-pool', name: 'Proof Pool', purpose: 'Coordinate pooled launches with verifiable backer slots.', kind: 'drawer', category: 'launch', availability: 'partial', setupKinds: ['wallet', 'signer'], primaryAction: { label: 'Open pool', toolId: 'proof-pool', detail: 'Review launch slots and backer state.' }, relatedToolIds: ['token-launch', 'wallet'] },
  { id: 'project-readiness', name: 'Solana Start', purpose: 'Central action queue for project, wallet, RPC, integrations, AI, and runtime health.', kind: 'drawer', category: 'solana-core', availability: 'live', setupKinds: ['project', 'wallet', 'env'], primaryAction: { label: 'Open Start', toolId: 'project-readiness', detail: 'See the next ranked setup action.' }, relatedToolIds: ['integrations', 'wallet', 'activity'] },
  { id: 'solana-toolbox', name: 'Solana Workflow', purpose: 'Build, connect, inspect, launch, and debug Solana projects.', kind: 'drawer', category: 'solana-core', availability: 'live', setupKinds: ['project', 'env', 'service'], primaryAction: { label: 'Open workflow', toolId: 'solana-toolbox', detail: 'Move through Solana build and runtime tasks.' }, relatedToolIds: ['starter', 'integrations'] },
  { id: 'integrations', name: 'Integrations', purpose: 'Guided setup checks and panel routing for Solana protocols and partners.', kind: 'drawer', category: 'solana-core', availability: 'live', setupKinds: ['project', 'env', 'secure-key', 'wallet'], primaryAction: { label: 'Choose integration', toolId: 'integrations', detail: 'Pick the next protocol or partner route.' }, relatedToolIds: ['project-readiness', 'env'] },
  { id: 'agentops', name: 'AgentOps', purpose: 'Metaplex agent identity, website handoff, and registry controls.', kind: 'drawer', category: 'agents', availability: 'partial', setupKinds: ['wallet', 'signer'], primaryAction: { label: 'Open AgentOps', toolId: 'agentops', detail: 'Inspect agent identity readiness.' }, relatedIntegrationId: 'metaplex', relatedToolIds: ['metaplex-demo', 'agent-station'] },
  { id: 'metaplex-demo', name: 'Metaplex Demo', purpose: 'Core, DAS, launch, and Agent Registry demonstration workflows.', kind: 'drawer', category: 'solana-core', availability: 'live', setupKinds: ['wallet', 'signer', 'env'], primaryAction: { label: 'Run safe demo', toolId: 'metaplex-demo', detail: 'Start with read-only DAS or demo setup.' }, relatedIntegrationId: 'metaplex', relatedToolIds: ['agentops', 'wallet'] },
  { id: 'zauth', name: 'Zauth', purpose: 'Embedded x402 database and provider hub.', kind: 'drawer', category: 'partners', availability: 'partial', setupKinds: ['service'], primaryAction: { label: 'Open Zauth', toolId: 'zauth', detail: 'Open database or provider hub.' }, relatedIntegrationId: 'zauth', relatedToolIds: ['meterflow', 'subscriptions'] },
  { id: 'block-scanner', name: 'Block Scanner', purpose: 'Explore Solana accounts, blocks, tokens, and transactions.', kind: 'drawer', category: 'solana-core', availability: 'partial', setupKinds: ['wallet'], primaryAction: { label: 'Open scanner', toolId: 'block-scanner', detail: 'Inspect a current wallet, token, or transaction.' }, relatedToolIds: ['wallet', 'replay-engine'] },
  { id: 'replay-engine', name: 'Replay', purpose: 'Replay and debug Solana transactions with AI handoff.', kind: 'drawer', category: 'solana-core', availability: 'live', setupKinds: ['wallet', 'env'], primaryAction: { label: 'Replay transaction', toolId: 'replay-engine', detail: 'Paste or receive a transaction signature.' }, relatedToolIds: ['activity', 'block-scanner'] },
  { id: 'docs', name: 'Docs', purpose: 'Read DAEMON product and workflow documentation.', kind: 'drawer', category: 'system', availability: 'live', setupKinds: ['none'], primaryAction: { label: 'Open docs', toolId: 'docs', detail: 'Read workflow-specific guidance.' }, relatedToolIds: ['project-readiness', 'integrations'] },
  { id: 'dashboard', name: 'Dashboard', purpose: 'Track token market data, wallet scans, and launch follow-up.', kind: 'drawer', category: 'markets', availability: 'live', setupKinds: ['wallet'], primaryAction: { label: 'Open dashboard', toolId: 'dashboard', detail: 'Scan wallet or import a token.' }, relatedToolIds: ['wallet', 'token-launch'] },
  { id: 'agent-work', name: 'Agent Work', purpose: 'Create, fund, verify, and settle wallet-funded agent jobs.', kind: 'drawer', category: 'agents', availability: 'live', setupKinds: ['project', 'wallet', 'signer'], primaryAction: { label: 'Create task', toolId: 'agent-work', detail: 'Create a funded task with project and agent assignment.' }, relatedToolIds: ['wallet', 'daemon-ai', 'meterflow'] },
  { id: 'meterflow', name: 'Meterflow', purpose: 'Track x402 receipts, meters, budgets, and paid agent readiness.', kind: 'drawer', category: 'agents', availability: 'live', setupKinds: ['secure-key', 'wallet'], primaryAction: { label: 'Open Meterflow', toolId: 'meterflow', detail: 'Inspect receipts or create a demo payer wallet.' }, relatedIntegrationId: 'idle-protocol', relatedToolIds: ['agent-work', 'subscriptions', 'zauth'] },
  { id: 'sessions', name: 'Sessions', purpose: 'Review and resume agent session history.', kind: 'drawer', category: 'dev', availability: 'live', setupKinds: ['project'], primaryAction: { label: 'Review sessions', toolId: 'sessions', detail: 'Resume, relaunch, rename, or publish sessions.' }, relatedToolIds: ['daemon-ai', 'activity'] },
  { id: 'hackathon', name: 'Hackathon', purpose: 'Research Colosseum opportunities and project ideas.', kind: 'drawer', category: 'markets', availability: 'partial', setupKinds: ['provider'], primaryAction: { label: 'Research ideas', toolId: 'hackathon', detail: 'Search opportunities or open Arena.' }, relatedToolIds: ['starter', 'daemon-ai'] },
  { id: 'daemon-ai', name: 'Daemon AI', purpose: 'Run AI chat, agent runs, approvals, patches, and receipts.', kind: 'drawer', category: 'agents', availability: 'live', setupKinds: ['project', 'provider'], primaryAction: { label: 'Start run', toolId: 'daemon-ai', detail: 'Launch a project-aware chat or agent run.' }, relatedToolIds: ['sessions', 'agent-work', 'activity'] },
  { id: 'pro', name: 'Daemon Pro', purpose: 'Manage Pro lanes, holder access, skills, sync, and Arena entry points.', kind: 'drawer', category: 'agents', availability: 'partial', setupKinds: ['wallet', 'provider'], primaryAction: { label: 'Open Pro', toolId: 'pro', detail: 'Check available lanes and unlock state.' }, relatedToolIds: ['subscriptions', 'daemon-ai'] },
  { id: 'activity', name: 'Activity', purpose: 'Flight recorder for runtime, agent, Solana, and setup events.', kind: 'drawer', category: 'system', availability: 'live', setupKinds: ['none'], primaryAction: { label: 'Review activity', toolId: 'activity', detail: 'Inspect the latest issue or session trail.' }, relatedToolIds: ['project-readiness', 'replay-engine'] },
  { id: 'plugins', name: 'Plugins', purpose: 'Manage active and installed plugin surfaces.', kind: 'drawer', category: 'system', availability: 'live', setupKinds: ['plugin'], primaryAction: { label: 'Manage plugins', toolId: 'plugins', detail: 'Enable, order, or configure plugins.' }, relatedToolIds: ['settings', 'subscriptions'] },
  { id: 'recovery', name: 'Recovery', purpose: 'Inspect crash recovery and snapshot state.', kind: 'drawer', category: 'system', availability: 'partial', setupKinds: ['file'], primaryAction: { label: 'Open recovery', toolId: 'recovery', detail: 'Review recoverable state before restoring work.' }, relatedToolIds: ['activity', 'settings'] },
  { id: 'agent-station', name: 'Agent Station', purpose: 'Scaffold and run Solana AI agents powered by SAK.', kind: 'drawer', category: 'agents', availability: 'partial', setupKinds: ['project', 'wallet', 'env'], primaryAction: { label: 'Create agent', toolId: 'agent-station', detail: 'Choose a template and scaffold an agent.' }, relatedIntegrationId: 'sendai-agent-kit', relatedToolIds: ['agentops', 'meterflow'] },
  { id: 'clawpump', name: 'ClawPump', purpose: 'Launch and manage hosted AI trading agents on Solana.', kind: 'drawer', category: 'partners', availability: 'live', setupKinds: ['secure-key'], primaryAction: { label: 'Open ClawPump', toolId: 'clawpump', detail: 'Connect key or create the first hosted agent.' }, relatedIntegrationId: 'clawpump', relatedToolIds: ['integrations', 'token-launch'] },
  { id: 'degentools', name: 'DegenTools', purpose: 'Generate meme assets, launch copy, token data, and Bags.fm calls.', kind: 'drawer', category: 'partners', availability: 'live', setupKinds: ['secure-key'], primaryAction: { label: 'Open DegenTools', toolId: 'degentools', detail: 'Connect key or generate launch assets.' }, relatedIntegrationId: 'degentools', relatedToolIds: ['token-launch', 'image-editor'] },
  { id: 'signalhouse', name: 'Signalhouse', purpose: 'Browse Drift strategy rankings and live copy-risk verdicts.', kind: 'drawer', category: 'markets', availability: 'partial', setupKinds: ['service'], primaryAction: { label: 'Open Signalhouse', toolId: 'signalhouse', detail: 'Browse top strategies and risk status.' }, relatedIntegrationId: 'signalhouse', relatedToolIds: ['dashboard', 'wallet'] },
  { id: 'flywheel', name: 'Fee Flywheel', purpose: 'Configure fee splits and run buyback/burn workflows.', kind: 'drawer', category: 'launch', availability: 'partial', setupKinds: ['wallet', 'env'], primaryAction: { label: 'Open Flywheel', toolId: 'flywheel', detail: 'Preview fee split prerequisites and actions.' }, relatedIntegrationId: 'flywheel', relatedToolIds: ['token-launch', 'dashboard'] },
  { id: 'autopilot', name: 'Autopilot', purpose: 'Run standing mandates that trade Solana unattended on a schedule.', kind: 'drawer', category: 'markets', availability: 'live', setupKinds: ['wallet', 'signer', 'env'], primaryAction: { label: 'Open Autopilot', toolId: 'autopilot', detail: 'Create a mandate, set its exposure cap, and arm it.' }, relatedToolIds: ['wallet', 'dashboard', 'signalhouse'] },
  { id: 'ricomaps', name: 'RicoMaps', purpose: 'Graph token and wallet forensic relationships.', kind: 'drawer', category: 'markets', availability: 'partial', setupKinds: ['service'], primaryAction: { label: 'Open RicoMaps', toolId: 'ricomaps', detail: 'Start the graph service or inspect a wallet/token.' }, relatedIntegrationId: 'ricomaps', relatedToolIds: ['dashboard', 'block-scanner'] },
  { id: 'browser', name: 'Browser', purpose: 'Open and test local project web targets inside DAEMON.', kind: 'tab', category: 'dev', availability: 'live', setupKinds: ['service'], primaryAction: { label: 'Open browser', toolId: 'browser', detail: 'Inspect a registered local app.' }, relatedToolIds: ['ports', 'deploy'] },
  { id: 'subscriptions', name: 'Subscriptions', purpose: 'Show plan, quota, holder access, and hosted AI lane status.', kind: 'plugin', category: 'agents', availability: 'partial', setupKinds: ['wallet', 'provider'], primaryAction: { label: 'Open subscriptions', toolId: 'subscriptions', detail: 'Review current plan and unlock path.' }, relatedIntegrationId: 'allowances', relatedToolIds: ['pro', 'daemon-ai', 'meterflow'] },
]

export const PRODUCT_SURFACE_BY_ID = Object.fromEntries(
  PRODUCT_SURFACES.map((surface) => [surface.id, surface]),
) as Record<string, ProductSurfaceDefinition>

export function getProductSurface(id: string): ProductSurfaceDefinition | null {
  return PRODUCT_SURFACE_BY_ID[id] ?? null
}

export function getSurfacesForIntegration(integrationId: string): ProductSurfaceDefinition[] {
  return PRODUCT_SURFACES.filter((surface) => surface.relatedIntegrationId === integrationId)
}
