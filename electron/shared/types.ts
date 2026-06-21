import type { IPty } from 'node-pty'

// Single source of truth for all entity types shared between main and renderer.
// Both tsconfigs include the electron/ directory, so these types are importable everywhere.

// --- IPC ---

export interface IpcResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

// --- Proof Pools ---

export type ProofPoolStatus = 'backing' | 'funded' | 'launching' | 'live' | 'distributed' | 'refunding' | 'failed'
export type ProofBackingStatus = 'confirmed' | 'withdrawn' | 'refunding' | 'refunded' | 'distributing' | 'distributed'

export interface ProofPool {
  id: string
  name: string
  symbol: string
  description: string
  image_path: string | null
  twitter: string | null
  telegram: string | null
  website: string | null
  creator_wallet: string
  pool_wallet: string
  pool_key_name: string
  creator_subescrow: string
  creator_key_name: string
  mint: string | null
  mint_key_name: string | null
  metadata_uri: string | null
  launch_signature: string | null
  proof_level: string | null
  total_slots: number
  min_backing_sol: number
  min_backing_lamports: number
  current_backing_sol: number
  current_backing_lamports: number
  pool_token_balance: string | null
  status: ProofPoolStatus
  backing_deadline: number
  launched_at: number | null
  distributed_at: number | null
  created_at: number
  updated_at: number
  error_message: string | null
}

export interface ProofBacking {
  id: string
  pool_id: string
  backer_wallet: string
  amount_sol: number
  amount_lamports: number
  deposit_signature: string
  slot_number: number
  status: ProofBackingStatus
  tokens_allocated: string | null
  distribution_signature: string | null
  refund_signature: string | null
  claimable_fees_sol: number
  claimable_fees_lamports: number
  total_claimed_sol: number
  total_claimed_lamports: number
  last_claim_signature: string | null
  distributed_at: number | null
  refunded_at: number | null
  created_at: number
  updated_at: number
}

export interface ProofPoolEvent {
  id: string
  pool_id: string
  kind: string
  message: string
  signature: string | null
  metadata_json: string
  created_at: number
}

export interface ProofPoolDetail {
  pool: ProofPool
  backings: ProofBacking[]
  events: ProofPoolEvent[]
}

export interface ProofEscrowStatus {
  configured: boolean
  address: string | null
  keyName: string
  hint: string
  balanceLamports?: number
  balanceSol?: number
}

export interface CreateProofPoolInput {
  name: string
  symbol: string
  description: string
  imagePath?: string | null
  twitter?: string | null
  telegram?: string | null
  website?: string | null
  creatorWallet: string
  totalSlots: number
  minBackingSol: number
  backingDays?: number
}

export interface VerifyProofBackingInput {
  poolId: string
  backerWallet: string
  amountSol: number
  depositSignature: string
}

export interface ImportProofVanityMintInput {
  privateKeyBase58: string
}

export interface ProofClaimFeesInput {
  backingId: string
}

export interface ProofBackingActionInput {
  backingId: string
  force?: boolean
}

export interface ProofPoolLaunchResult {
  pool: ProofPool
  signature: string
  mint: string
  metadataUri: string
  proofLevel: string
  poolTokenBalance: string
}

export interface ProofCollectFeesResult {
  ok: boolean
  skipped?: string
  collectedLamports?: number
  platformLamports?: number
  backerLamports?: number
  backerCount?: number
  collectSig?: string
  drainSig?: string
  error?: string
}

export interface ProofEscrowExportResult {
  copied: boolean
  address: string
  expiresInMs: number
}

export interface ProofPartnerCredentialStatus {
  apiKeyConfigured: boolean
  webhookSecretConfigured: boolean
  apiBase: string
  partnerSlug: string
}

export interface ConfigureProofPartnerCredentialsInput {
  apiKey?: string | null
  webhookSecret?: string | null
}

export interface CreateProofPartnerSessionInput {
  name: string
  symbol: string
  description: string
  imageUrl?: string | null
  creatorWallet: string
  totalSlots: number
  minBackingSol: number
  metadata?: Record<string, string | null | undefined> | null
  returnUrl?: string | null
  partnerReference?: string | null
}

export interface ProofPartnerSession {
  id: string
  partner_reference: string
  name: string
  symbol: string
  description: string
  image_url: string | null
  creator_wallet: string
  total_slots: number
  min_backing_sol: number
  metadata_json: string
  return_url: string | null
  checkout_url: string | null
  status: string
  meme_id: string | null
  meme_url: string | null
  prefill_json: string | null
  request_json: string
  response_json: string
  created_at: number
  updated_at: number
  last_polled_at: number | null
  error_message: string | null
}

// --- DB Entities ---

export interface Project {
  id: string
  name: string
  path: string
  git_remote: string | null
  default_agent_id: string | null
  status: string
  session_summary: string | null
  infra: string
  aliases: string
  wallet_id: string | null
  created_at: number
  last_active: number | null
  pinned: number
  branch: string | null
}

export interface Agent {
  id: string
  name: string
  system_prompt: string
  model: string
  mcps: string
  shortcut: string | null
  provider?: string | null
  source?: string | null
  external_path?: string | null
  created_at: number
}

export interface ActiveSession {
  id: string
  project_id: string | null
  agent_id: string | null
  terminal_id: string | null
  pid: number | null
  started_at: number
}

export interface PortRow {
  port: number
  project_id: string
  service_name: string
  pid: number | null
  registered_at: number
}

export interface Service {
  id: string
  name: string
  cwd: string
  command: string
  auto_restart: number
  auto_start: number
  health_check_url: string | null
  env_overrides: string
  created_at: number
}

export interface CrashHistory {
  id: string
  service_id: string
  exit_code: number | null
  error_signature: string | null
  error_summary: string | null
  fix_applied: string | null
  fix_worked: number | null
  auto_fixed: number
  created_at: number
}

export interface OvernightRun {
  id: string
  started_at: number | null
  ended_at: number | null
  phases: string
  token_cost: number
  briefing: string | null
  status: string
}

export interface DispatchSession {
  id: string
  project_id: string
  platform: string
  context_bundle: string | null
  dispatched_at: number
  depth: string
}

// --- File Explorer ---

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

// --- Language Server Protocol ---

export type LspServerId = 'typescript' | 'python' | 'rust'

export interface LspPosition {
  line: number
  character: number
}

export interface LspRange {
  start: LspPosition
  end: LspPosition
}

export interface LspDiagnostic {
  range: LspRange
  severity?: number
  code?: string | number
  source?: string
  message: string
}

export interface LspDiagnosticEvent {
  uri: string
  filePath: string
  diagnostics: LspDiagnostic[]
}

export interface LspServerStatus {
  serverId: LspServerId
  label: string
  command: string
  commandPath: string | null
  available: boolean
  active: boolean
  pid: number | null
  projectPath: string | null
  languageIds: string[]
  extensions: string[]
  startedAt: number | null
  error: string | null
}

export interface LspDocumentInput {
  projectPath: string
  filePath: string
  languageId: string
  text: string
  version?: number
}

export interface LspDocumentSyncResult {
  supported: boolean
  serverId?: LspServerId
  languageId: string
  status?: LspServerStatus
  error?: string
}

export interface LspHoverResult {
  contents: string
  range?: LspRange
}

export interface LspLocation {
  uri: string
  filePath: string
  range: LspRange
}

export interface LspCompletionItem {
  label: string
  kind?: number
  detail?: string
  documentation?: string
  insertText?: string
  filterText?: string
  sortText?: string
}

export interface LspCompletionResult {
  items: LspCompletionItem[]
}

// --- Icon Theme ---

export interface RuntimeIconTheme {
  name: string
  rootPath: string
  hidesExplorerArrows: boolean
  file: string
  folder: string
  folderExpanded: string
  rootFolder?: string
  rootFolderExpanded?: string
  iconDefinitions: Record<string, { iconPath: string }>
  fileExtensions?: Record<string, string>
  fileNames?: Record<string, string>
  folderNames?: Record<string, string>
}

// --- Process Manager ---

export interface ProcessInfo {
  id: string
  pid: number
  name: string
  /** 'agent' = spawned via spawnAgent, 'shell' = plain interactive terminal */
  kind: 'agent' | 'shell'
  agentId: string | null
  agentName: string | null
  projectId: string | null
  projectName: string | null
  projectPath: string | null
  model: string | null
  memory: number
  cpu: number
  startedAt: number
}

export interface OrphanProcess {
  pid: number
  name: string
  memory: number
}

// --- Git ---

export interface GitFile {
  path: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
  deleted: boolean
  status: string
}

export interface GitCommit {
  hash: string
  short: string
  message: string
  author: string
  time: string
}

export interface GitBranches {
  branches: string[]
  current: string
}

// --- Ports ---

export interface ListeningPort {
  port: number
  pid: number
  address: string
  processName: string | null
}

export interface RegisteredPort {
  port: number
  projectId: string
  projectName: string
  serviceName: string
  pid: number | null
  isListening: boolean
}

export interface GhostPort {
  port: number
  pid: number
  address: string
  processName: string | null
}

// --- Daemon Pro / DAEMON AI ---

export type DaemonPlanId = 'light' | 'pro' | 'operator' | 'ultra' | 'team' | 'enterprise'
export type ProFeature =
  | 'daemon-ai'
  | 'arena'
  | 'pro-skills'
  | 'mcp-sync'
  | 'priority-api'
  | 'app-factory'
  | 'shipline'
  | 'cloud-agents'
  | 'team-admin'
export type ProAccessSource = 'free' | 'payment' | 'holder' | 'admin' | 'trial' | 'dev_bypass'

export interface ProHolderStatus {
  enabled: boolean
  eligible: boolean
  mint: string | null
  minAmount: number | null
  currentAmount: number | null
  symbol: string
}

export interface ProSubscriptionState {
  active: boolean
  plan: DaemonPlanId
  walletId: string | null
  walletAddress: string | null
  expiresAt: number | null
  features: ProFeature[]
  tier: Exclude<DaemonPlanId, 'light'> | null
  accessSource: ProAccessSource | null
  holderStatus: ProHolderStatus
  priceUsdc: number | null
  durationDays: number | null
  offlineGraceUntil?: number | null
}

export interface ProPriceInfo {
  priceUsdc: number
  durationDays: number
  network: string
  payTo: string
  paymentMint?: string
  holderMint?: string
  holderMinAmount?: number
}

export interface ArenaSubmission {
  id: string
  title: string
  pitch: string
  author: {
    handle: string
    wallet: string
  }
  description: string
  category: 'tool' | 'agent' | 'skill' | 'mcp' | 'grind-recipe'
  themeWeek: string | null
  submittedAt: number
  status: 'submitted' | 'featured' | 'winner' | 'shipped'
  votes: number
  githubUrl?: string
  demoUrl?: string
  xHandle?: string
  discordHandle?: string
  contestSlug?: string
}

export interface ArenaSubmissionInput {
  title: string
  pitch: string
  description: string
  category: ArenaSubmission['category']
  githubUrl: string
  demoUrl?: string
  xHandle?: string
  discordHandle?: string
}

export interface ProSkillManifestEntry {
  id: string
  name: string
  version: string
  description: string
  downloadUrl: string
  sha256: string
}

export interface ProSkillManifest {
  version: 1
  skills: ProSkillManifestEntry[]
}

export type DaemonAiAccessMode = 'auto' | 'hosted' | 'byok'
export type DaemonAiChatMode = 'ask' | 'plan'
export type DaemonAiModelLane = 'auto' | 'fast' | 'standard' | 'reasoning' | 'premium'
export type DaemonAiAgentMode = 'patch' | 'agent' | 'background'
export type DaemonAiAgentRunStatus = 'queued' | 'planning' | 'awaiting_approval' | 'running' | 'completed' | 'failed' | 'cancelled'
export type DaemonAiToolRiskLevel = 'low' | 'medium' | 'high' | 'blocked'
export type DaemonAiToolApprovalStatus = 'pending' | 'approved' | 'rejected' | 'blocked'
export type DaemonAiToolApprovalDecision = 'approve' | 'reject'
export type DaemonAiPatchProposalStatus = 'proposed' | 'accepted' | 'rejected' | 'superseded' | 'applied'
export type DaemonAiPatchRiskLevel = 'low' | 'medium' | 'high' | 'blocked'
export type DaemonAiApprovalPolicy =
  | 'require_for_write_and_terminal'
  | 'require_for_all_tools'
  | 'read_only'

export interface DaemonAiContextOptions {
  activeFile?: boolean
  projectTree?: boolean
  gitDiff?: boolean
  terminalLogs?: boolean
  walletContext?: boolean
}

export interface DaemonAiContextInput {
  projectId?: string | null
  projectPath?: string | null
  activeFilePath?: string | null
  activeFileContent?: string | null
  context?: DaemonAiContextOptions
}

export interface DaemonAiChatRequest extends DaemonAiContextInput {
  conversationId?: string | null
  message: string
  mode?: DaemonAiChatMode
  accessMode?: DaemonAiAccessMode
  modelPreference?: DaemonAiModelLane
}

export interface DaemonAiUsageSnapshot {
  plan: DaemonPlanId
  accessSource: ProAccessSource | null
  monthlyCredits: number
  usedCredits: number
  remainingCredits: number
  resetAt: number
}

export interface DaemonAiChatResponse {
  messageId: string
  conversationId: string
  text: string
  accessMode: DaemonAiAccessMode
  modelLane: DaemonAiModelLane
  usedContext: string[]
  usage: DaemonAiUsageSnapshot
}

export interface DaemonAiUsageEvent {
  id: string
  userId: string | null
  walletAddress?: string | null
  plan: DaemonPlanId
  accessSource: ProAccessSource | null
  feature: string
  provider: 'openai' | 'anthropic' | 'google' | 'local' | 'daemon-cloud' | 'other'
  model: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
  providerCostUsd: number
  daemonCreditsCharged: number
  createdAt: number
}

export interface DaemonAiModelInfo {
  lane: DaemonAiModelLane
  label: string
  description: string
  hosted: boolean
  byok: boolean
  requiresPlan: DaemonPlanId | null
}

export interface DaemonAiFeatureState {
  hostedAvailable: boolean
  byokAvailable: boolean
  plan: DaemonPlanId
  accessSource: ProAccessSource | null
  features: ProFeature[]
  upgradeRequired: boolean
  backendConfigured: boolean
}

export interface DaemonAiAgentRunInput extends DaemonAiContextInput {
  task: string
  mode?: DaemonAiAgentMode
  accessMode?: DaemonAiAccessMode
  modelPreference?: DaemonAiModelLane
  allowedTools?: string[]
  approvalPolicy?: DaemonAiApprovalPolicy
}

export interface DaemonAiAgentRun {
  id: string
  task: string
  projectId: string | null
  projectPath: string | null
  mode: DaemonAiAgentMode
  accessMode: DaemonAiAccessMode
  modelLane: DaemonAiModelLane
  status: DaemonAiAgentRunStatus
  allowedTools: string[]
  approvalPolicy: DaemonAiApprovalPolicy
  createdAt: number
  updatedAt: number
  cancelledAt: number | null
  result: Record<string, unknown> | null
  error: string | null
}

export interface DaemonAiToolCallInput {
  runId: string
  toolCallId?: string | null
  toolName: string
  summary?: string | null
  arguments?: unknown
}

export interface DaemonAiToolApprovalRequest {
  id: string
  runId: string
  toolCallId: string
  toolName: string
  riskLevel: DaemonAiToolRiskLevel
  summary: string
  argumentsPreview: unknown
  status: DaemonAiToolApprovalStatus
  requiresApproval: boolean
  createdAt: number
  decidedAt: number | null
  decisionReason: string | null
}

export interface DaemonAiToolApprovalDecisionInput {
  runId: string
  toolCallId: string
  decision: DaemonAiToolApprovalDecision
  reason?: string | null
}

export interface DaemonAiPatchProposalInput {
  runId: string
  title?: string | null
  summary?: string | null
  unifiedDiff: string
}

export interface DaemonAiPatchSafetyFinding {
  severity: DaemonAiPatchRiskLevel
  code: string
  message: string
  filePath?: string
}

export interface DaemonAiPatchProposal {
  id: string
  runId: string
  title: string
  summary: string | null
  unifiedDiff: string
  files: string[]
  status: DaemonAiPatchProposalStatus
  riskLevel: DaemonAiPatchRiskLevel
  safetyFindings: DaemonAiPatchSafetyFinding[]
  createdAt: number
  decidedAt: number | null
  decisionReason: string | null
}

export interface DaemonAiPatchDecisionInput {
  proposalId: string
  decision: 'accept' | 'reject'
  reason?: string | null
}

export interface DaemonAiPatchApplyInput {
  proposalId: string
  reason?: string | null
}

export interface DaemonAiPatchApplyResult {
  proposal: DaemonAiPatchProposal
  files: string[]
  appliedAt: number
}

// --- MCP ---

export interface McpEntry {
  name: string
  config: { command?: string; args?: string[]; env?: Record<string, string>; type?: string; url?: string }
  source: string
  enabled: boolean
}

export interface McpRegistryEntry {
  name: string
  config: string
  description: string
  is_global: number
}

// --- Skills ---

export interface SkillEntry {
  name: string
  type: 'skill' | 'plugin'
  enabled: boolean
}

// --- Claude Status & Usage ---

export interface AnthropicStatus {
  indicator: 'none' | 'minor' | 'major' | 'critical'
  description: string
}

export interface SessionUsage {
  lastCost: number
  models: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; costUSD: number }>
}

export interface ClaudeMdData {
  content: string
  diff: string
}

// --- Claude Agent Files ---

export interface ClaudeAgentFile {
  id: string
  name: string
  description: string
  model: string
  color: string | null
  filePath: string
  systemPrompt: string
}

// --- Secure Keys ---

export interface SecureKeyEntry {
  key_name: string
  hint: string
}

// --- Wallet ---

export interface WalletListEntry {
  id: string
  name: string
  address: string
  is_default: number
  wallet_type: string
  created_at: number
  assigned_project_ids: string[]
}

export interface MarketTickerEntry {
  symbol: string
  priceUsd: number
  change24hPct: number
}

export interface WalletDashboard {
  heliusConfigured: boolean
  market: MarketTickerEntry[]
  portfolio: {
    totalUsd: number
    delta24hUsd: number
    delta24hPct: number
    walletCount: number
  }
  wallets: Array<{
    id: string
    name: string
    address: string
    isDefault: boolean
    totalUsd: number
    tokenCount: number
    assignedProjectIds: string[]
  }>
  activeWallet: null | {
    id: string
    name: string
    address: string
    holdings: Array<{
      mint: string
      symbol: string
      name: string
      amount: number
      priceUsd: number
      valueUsd: number
      logoUri: string | null
    }>
  }
  feed: Array<{
    walletId: string
    walletName: string
    totalUsd: number
    deltaUsd: number
  }>
  recentActivity: Array<{
    signature: string
    timestamp?: number
    type?: string
    description?: string
  }>
}

export type MoonpayEnvironment = 'sandbox' | 'production'

export interface MoonpayStatus {
  configured: boolean
  environment: MoonpayEnvironment | null
  publishableKeyHint: string | null
}

export interface MoonpayKeysInput {
  publishableKey: string
  secretKey: string
}

export interface MoonpayOnrampInput {
  walletId: string
  baseCurrencyAmount?: number
  baseCurrencyCode?: string
  externalTransactionId?: string | null
  redirectUrl?: string | null
}

export interface MoonpayOnrampResult {
  url: string
  environment: MoonpayEnvironment
  walletAddress: string
}

// --- Forensics ---

export type ForensicsScanMode = 'auto' | 'wallet' | 'token'
export type ForensicsDetectedMode = 'wallet' | 'token'
export type ForensicsNodeType =
  | 'target'
  | 'funder'
  | 'funded'
  | 'connected'
  | 'holder'
  | 'token'
  | 'cabal-funder'
  | 'sniper'
  | 'bundled'

export interface ForensicsWalletIdentity {
  name: string | null
  category: string | null
  type: string | null
  tags: string[]
}

export interface ForensicsGraphNode {
  id: string
  label: string
  val: number
  type: ForensicsNodeType
  depth: number
  solBalance?: number
  tokenAmount?: number
  expanded: boolean
  identity?: ForensicsWalletIdentity
  fundingSource?: {
    funderAddress: string
    funderName: string | null
    funderType: string | null
    amount: number
    timestamp: number
    signature: string
  }
  metadata?: {
    firstTx?: number
    txCount?: number
    suspicious?: boolean
    fundedCount?: number
    isSniper?: boolean
    buyBlock?: number
    buyTimestamp?: number
    blocksAfterLaunch?: number
    isBundled?: boolean
    sharedFunderGroup?: string
    cabalConfidence?: number
    transferPatterns?: {
      totalIn: number
      totalOut: number
      uniqueCounterparties: number
    }
  }
}

export interface ForensicsGraphLink {
  source: string
  target: string
  value: number
  timestamp?: number
  txSignature?: string
  suspicious?: boolean
}

export interface ForensicsGraphData {
  nodes: ForensicsGraphNode[]
  links: ForensicsGraphLink[]
}

export interface ForensicsTokenSecurity {
  hasFreezeAuthority: boolean
  freezeAuthority?: string
  hasMintAuthority: boolean
  mintAuthority?: string
  isMutable: boolean
  supply?: number
  decimals?: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  riskFactors: string[]
}

export interface ForensicsTokenMetadata {
  name?: string
  symbol?: string
  image?: string
  description?: string
}

export interface ForensicsStats {
  nodesFound?: number
  linksFound?: number
  scanDepth?: number
  totalHolders?: number
  rawHolderCount?: number
  filteredOut?: number
  analyzedHolders?: number
  analysisIncomplete?: boolean
  cabalConnectionsFound?: number
  suspiciousWallets?: string[]
  snipersDetected?: number
  sniperWallets?: string[]
  bundleClustersDetected?: number
  bundledWallets?: string[]
  cacheHit?: boolean
}

export interface ForensicsScanInput {
  address: string
  mode?: ForensicsScanMode
  topHolders?: number
  maxDepth?: number
  maxNodesPerLevel?: number
  force?: boolean
}

export interface ForensicsScanResult {
  mode: ForensicsDetectedMode
  data: ForensicsGraphData
  stats: ForensicsStats
  tokenSecurity?: ForensicsTokenSecurity | null
  tokenMetadata?: ForensicsTokenMetadata | null
}

export interface ForensicsExpandInput {
  wallet: string
  mode: 'funding' | 'funded'
  existingNodes: string[]
}

export interface ForensicsExpandResult {
  newNodes: ForensicsGraphNode[]
  newLinks: ForensicsGraphLink[]
}

export interface ForensicsBundleTokenAppearance {
  mint: string
  tokenName?: string
  tokenSymbol?: string
  slot: number
  timestamp: number
  walletCount: number
  transactionSignatures: string[]
}

export interface ForensicsBundleCluster {
  id: string
  wallets: string[]
  tokens: ForensicsBundleTokenAppearance[]
  totalAppearances: number
  lastSeenTimestamp: number
  firstSeenTimestamp: number
  confidence: number
  sharedFunder?: string
  metadata?: {
    avgClusterSize: number
    maxSameSlotCount: number
  }
}

export interface ForensicsBlacklistResult {
  clusters: ForensicsBundleCluster[]
  totalWallets: number
  totalClusters: number
}

export interface ForensicsHolderPollResult {
  holders: Array<{ owner: string; amount: number }>
  timestamp: number
}

export interface RicoMapsEmbedStatus {
  url: string
  port: number
  projectPath: string
  installed: boolean
  running: boolean
  pid: number | null
  error: string | null
}

export interface SaidTrustScore {
  score: number
  verified: boolean
  staked: boolean
  reputation: number | null
}

export interface SaidIdentity {
  wallet: string
  pda: string | null
  owner: string | null
  name: string | null
  description: string | null
  isVerified: boolean
  image: string | null
  twitter: string | null
  website: string | null
  serviceTypes: string[]
  skills: string[]
  reputationScore: number | null
  feedbackCount: number | null
  trustScore: number | null
  passportMint: string | null
  registered: boolean
}

export type SynapseSapCluster = 'devnet' | 'mainnet-beta'

export interface SynapseSapStatus {
  programId: string
  cluster: SynapseSapCluster
  rpcUrl: string
  explorerUrl: string
}

export interface SynapseSapCapability {
  id: string
  description: string | null
  protocolId: string | null
  version: string | null
}

export interface SynapseSapAgent {
  pda: string
  wallet: string
  name: string
  description: string
  agentId: string | null
  agentUri: string | null
  x402Endpoint: string | null
  isActive: boolean
  reputationScore: number | null
  totalCallsServed: string | null
  avgLatencyMs: number | null
  uptimePercent: number | null
  capabilities: SynapseSapCapability[]
  protocols: string[]
  pricingCount: number
  createdAt: number | null
  updatedAt: number | null
}

export interface SynapseSapDiscoveryInput {
  cluster?: SynapseSapCluster
  capabilityId?: string
  protocolId?: string
  limit?: number
}

export interface SynapseSapDiscoveryResult {
  cluster: SynapseSapCluster
  indexPda: string
  query: string
  total: number
  agents: SynapseSapAgent[]
}

export interface SynapseSapRegisterInput {
  walletId: string
  agentStationId: string
  cluster?: SynapseSapCluster
  capabilityIds?: string[]
  protocolIds?: string[]
  agentUri?: string | null
  x402Endpoint?: string | null
}

export interface SynapseSapRegisterResult {
  cluster: SynapseSapCluster
  wallet: string
  agentPda: string
  signature: string
  explorerUrl: string
  capabilities: string[]
  protocols: string[]
}

// Native Solana spend permission (SPL/Token-2022 delegation) read off a wallet's token account.
export interface AllowanceState {
  wallet: string
  mint: string
  tokenAccount: string | null
  delegate: string | null
  delegatedAmount: string
  hasDelegate: boolean
  tokenAccountExists: boolean
}

// Whether a (wallet, mint) pair has approved the native Subscriptions Delegation Program authority.
export interface SubscriptionEnrollment {
  wallet: string
  mint: string
  subscriptionAuthority: string
  tokenAccount: string | null
  enrolled: boolean
  delegatedAmount: string
}

// Signalhouse — non-custodial copy-trading + risk/trust layer for Solana perps on Drift.
// DAEMON consumes only the public read API; follow/copy/delegation signing stays gated for Phase 2.
export interface SignalhouseHealth {
  ok: boolean
  service: string | null
  time: string | null
}

export interface SignalhouseStatus {
  indexerFresh: boolean | null
  indexerLagSeconds: number | null
  globalExecutionPaused: boolean | null
}

export interface SignalhouseStrategy {
  id: string
  name: string | null
  status: string | null
  creatorType: string | null
  market: string | null
  riskLevel: string | null
  proofOfEdge: number | null
  proofOfEdgeVerificationStatus: string | null
  realizedPnlUsd: number | null
  drawdownBps: number | null
  followerCount: number | null
}

export interface SignalhouseStrategyDetail extends SignalhouseStrategy {
  description: string | null
  allowedMarkets: string[]
  maxLeverage: number | null
  positions: SignalhousePosition[]
}

export interface SignalhouseEquityPoint {
  at: string | null
  equityUsd: number | null
  realizedPnlUsd: number | null
}

export interface SignalhouseVerdict {
  id: string
  market: string | null
  side: string | null
  sizeUsd: number | null
  approved: boolean
  verdict: string | null
  at: string | null
}

export interface SignalhousePosition {
  id: string
  market: string | null
  side: string | null
  sizeUsd: number | null
  unrealizedPnlUsd: number | null
}

// --- DAEMON Flywheel Protocol ---------------------------------------------

export interface FlywheelShareholder {
  address: string
  shareBps: number
}

export interface FlywheelConfigureInput {
  tokenMint: string
  label?: string
  creatorWalletId: string
  payoutWallet: string
  buybackWalletId: string
  payoutBps?: number
  buybackBps?: number
  buybackTargetMint?: string
  burn?: boolean
  /** Must be true to send the irreversible on-chain config. */
  confirmed?: boolean
  /** DAEMON platform share in bps, skimmed off the top of each claim. Locked at creation. */
  platformBps?: number
}

export interface FlywheelConfig {
  id: string
  tokenMint: string
  label: string | null
  creatorWalletId: string
  payoutWallet: string
  buybackWalletId: string
  buybackWallet: string
  payoutBps: number
  buybackBps: number
  buybackTargetMint: string
  burn: boolean
  configureSignature: string | null
  createdAt: number
  /** DAEMON platform share in bps, skimmed off the top before the payout/buyback split. */
  platformBps: number
}

export interface FlywheelPreview {
  tokenMint: string
  shareholders: FlywheelShareholder[]
  buybackTargetMint: string
  /** True when an on-chain sharing config already exists for this mint. */
  alreadyConfigured: boolean
  /** The token's on-chain creator authority, if it could be read. */
  onChainCreator: string | null
  /** True when the selected creator wallet matches the on-chain creator. */
  creatorMatches: boolean
  warnings: string[]
  /** DAEMON platform share that will apply to this config. */
  platformBps: number
}

export interface FlywheelEvent {
  id: string
  configId: string
  kind: 'configure' | 'claim' | 'transfer' | 'swap' | 'burn'
  signature: string | null
  solAmount: string | null
  tokenAmount: string | null
  tokenMint: string | null
  note: string | null
  at: number
}

export interface FlywheelState {
  config: FlywheelConfig
  /** Accrued, unclaimed creator-vault fees in lamports (string). */
  accruedLamports: string
  /** The off-chain split recipients DAEMON routes claimed fees to. */
  splitRecipients: FlywheelShareholder[]
  buybackWalletSol: number
  totalBurnedTokens: string
  totalSwappedSol: string
  events: FlywheelEvent[]
}

// --- ARIA Autopilot ---

/** A single take-profit / stop-loss / exit rule the evaluator checks each tick. */
export interface MandateRule {
  kind: 'take_profit' | 'stop_loss' | 'liquidity_floor'
  /** Percent for TP/SL (e.g. 40 = +40% / -40%); SOL for liquidity_floor. */
  threshold: number
}

/**
 * Structured strategy parsed from a natural-language mandate. The scheduler reads this,
 * never the raw text. `targetMint` is what the mandate accumulates; `clipLamports` is the
 * size of each DCA buy; rules drive automated exits.
 */
export interface MandateStrategy {
  /** Mint the mandate accumulates (buys into). */
  targetMint: string
  targetSymbol?: string
  /** DCA buy size per tick, in lamports of SOL spent. */
  clipLamports: number
  /** Slippage tolerance for autopilot swaps, in bps. */
  slippageBps: number
  rules: MandateRule[]
}

export type MandateStatus = 'draft' | 'armed' | 'paused' | 'exhausted' | 'error'

export interface Mandate {
  id: string
  label: string
  walletId: string
  cluster: string
  /** The original natural-language mandate the user gave ARIA. */
  mandateText: string
  strategy: MandateStrategy
  /** Hard ceiling on total SOL the mandate may ever spend (lamports). Enforced pre-swap. */
  maxExposureLamports: number
  intervalSeconds: number
  status: MandateStatus
  armed: boolean
  spentLamports: number
  realizedPnlLamports: number
  lastTickAt: number | null
  nextTickAt: number | null
  lastError: string | null
  armedAt: number | null
  createdAt: number
  updatedAt: number
}

export type MandateDecision = 'buy' | 'sell' | 'hold' | 'skip'
export type MandateActionStatus = 'decided' | 'executed' | 'failed'

export interface MandateAction {
  id: string
  mandateId: string
  /** Monotonic per-mandate tick counter; unique with mandateId (idempotent ticks). */
  tickSeq: number
  decision: MandateDecision
  reason: string | null
  inputMint: string | null
  outputMint: string | null
  notionalLamports: number | null
  feeLamports: number | null
  signature: string | null
  status: MandateActionStatus
  error: string | null
  createdAt: number
}

/** Live, un-persisted position valuation for an armed mandate (priced via reverse quote). */
export interface MandatePositionLive {
  mandateId: string
  valueLamports: number
  unrealizedLamports: number
  pnlPct: number
}

export interface AutopilotState {
  mandates: Mandate[]
  recentActions: MandateAction[]
  /** Live position values for armed mandates, keyed by mandateId. Best-effort; may be empty. */
  positions: MandatePositionLive[]
  /** True while the scheduler tick loop is running. */
  running: boolean
}

export type SolanaTransactionPreviewKind = 'send-sol' | 'send-token' | 'swap' | 'launch'

export interface SolanaTransactionPreviewInput {
  kind: SolanaTransactionPreviewKind
  walletId?: string
  destination?: string
  amount?: number
  sendMax?: boolean
  mint?: string
  tokenSymbol?: string
  inputMint?: string
  outputMint?: string
  inputSymbol?: string
  outputSymbol?: string
  inputAmount?: string
  outputAmount?: string
  quoteId?: string
  messageHash?: string
  slippageBps?: number
  priceImpactPct?: string
  protocol?: string
}

export interface SolanaTransactionPreview {
  title: string
  backendLabel: string
  networkLabel?: string
  signerLabel: string
  targetLabel: string
  amountLabel: string
  feeLabel: string
  notes: string[]
  warnings: string[]
  requiresAcknowledgement: boolean
  acknowledgementLabel: string | null
  messageHash?: string
}

// --- Env ---

export interface EnvVar {
  key: string
  value: string
  isComment: boolean
  isSecret: boolean
  secretLabel: string | null
  lineIndex: number
  raw: string
}

export interface EnvFile {
  filePath: string
  fileName: string
  vars: EnvVar[]
}

export interface UnifiedKey {
  key: string
  isSecret: boolean
  secretLabel: string | null
  projects: Array<{ projectId: string; projectName: string; projectPath: string; filePath: string; value: string }>
}

export interface EnvDiff {
  onlyA: Array<{ key: string; value: string }>
  onlyB: Array<{ key: string; value: string }>
  same: Array<{ key: string; value: string }>
  different: Array<{ key: string; valueA: string; valueB: string }>
}

// --- Tweets ---

export interface Tweet {
  id: string
  content: string
  /** 'original' | 'reply' | 'quote' | 'thread' */
  mode: string | null
  source_tweet: string | null
  status: string
  created_at: number
}

export interface VoiceProfile {
  id: string
  system_prompt: string
  examples: string
  updated_at: number
}

// --- Plugins ---

export interface PluginRow {
  id: string
  enabled: number
  sort_order: number
  config: string
  updated_at: number
}

export interface PluginCreateInput {
  id: string
  name: string
  description?: string
  entry?: string
  command?: string
}

// --- Claude Connection ---

export interface ClaudeConnection {
  claudePath: string
  hasApiKey: boolean
  isAuthenticated: boolean
  authMode: 'api' | 'cli' | 'both' | 'none'
}

export interface CodexConnection {
  providerId: 'codex'
  cliPath: string
  hasApiKey: boolean
  isAuthenticated: boolean
  authMode: 'api' | 'cli' | 'both' | 'none'
}

export interface ProviderConnectionInfo {
  claude: ClaudeConnection | null
  codex: CodexConnection | null
  defaultProvider: string
}

// --- UI Settings ---

export interface UiSettings {
  showMarketTape: boolean
  showTitlebarWallet: boolean
  lowPowerMode: boolean
}

// --- Voight observability ---

export type VoightPrivacyLevel = 'minimal' | 'standard' | 'full'
export type VoightKeySource = 'secure' | 'env' | 'none'

export interface VoightStatus {
  configured: boolean
  keySource: VoightKeySource
  privacyLevel: VoightPrivacyLevel
  endpoint: string
  pending: number
  failed: number
  sent: number
  lastSentAt: number | null
  lastError: string | null
}

export interface VoightTestResult {
  accepted: boolean
  status: number
  eventId: string
  response: unknown
}

// --- Recovery ---

export interface RecoveryWalletInfo {
  index: number
  pubkey: string
  solLamports: number
  tokenAccountCount: number
  emptyTokenAccounts: number
  hasPammFees: boolean
}

export type RecoveryProgressType =
  | 'scan-progress'
  | 'scan-complete'
  | 'phase-start'
  | 'wallet-start'
  | 'wallet-complete'
  | 'wallet-error'
  | 'flow'
  | 'complete'

export interface RecoveryProgressEvent {
  type: RecoveryProgressType
  walletIndex?: number
  pubkey?: string
  phase?: number
  amount?: number
  totalRecovered?: number
  message?: string
  error?: string
}

export interface RecoveryStatus {
  state: 'idle' | 'scanning' | 'executing' | 'complete' | 'error'
  currentPhase: number
  totalRecovered: number
  walletCount: number
  completed: number
  failed: number
}

// --- Terminal ---

export interface TerminalSession {
  pty: IPty
  agentId: string | null
  contextFilePath: string | null
  /** Which AI provider spawned this session ('claude' | 'codex' | null for plain shells). */
  providerId?: string | null
  /** True when session was created via terminal:create with isAgent flag (e.g. AgentGrid claude cells). */
  isAgentShell?: boolean
  /** Local session tracker ID — set when agent spawns via spawnAgent. */
  localSessionId?: string | null
  /** Best-effort count of terminal output lines for session receipts. */
  generatedLineCount?: number
  /** Bounded recent terminal output for workflow receipts. */
  outputBuffer?: string
  /** Buffers PTY data until renderer signals ready */
  dataBuffer?: string[]
  /** True once renderer has attached its xterm onData listener */
  rendererReady?: boolean
  /** Command to run once the renderer has attached and resized the PTY. */
  pendingStartupCommand?: string | null
}

export interface TerminalCreateInput {
  cwd?: string
  startupCommand?: string
  /** When true, skip project-path validation (used for user-initiated folder drops). */
  userInitiated?: boolean
  /** When true, classify this session as an agent in the process manager. */
  isAgent?: boolean
  /** Initial terminal dimensions from renderer (avoids 120-col hardcode). */
  cols?: number
  rows?: number
}

export interface TerminalSpawnAgentInput {
  agentId: string
  projectId: string
  initialPrompt?: string
}

export interface TerminalCreateOutput {
  id: string
  pid: number
  agentId: null | string
  agentName?: string
  localSessionId?: string | null
}

// --- Agents ---

export interface AgentCreateInput {
  name: string
  systemPrompt: string
  model: string
  mcps: string[]
  provider?: string
  projectId?: string
  shortcut?: string
  source?: string
  externalPath?: string | null
}

// --- Projects ---

export interface ProjectCreateInput {
  name: string
  path: string
}

// --- Tweets ---

export interface TweetUpdateInput {
  content?: string
  status?: string
}

// --- Wallet ---

export interface WalletCreateInput {
  name: string
  address: string
}

export interface WalletGenerateInput {
  name: string
  walletType?: 'user' | 'agent'
  agentId?: string
}

export interface TransferSOLInput {
  fromWalletId: string
  toAddress: string
  amountSol?: number
  sendMax?: boolean
}

export interface ExternalSolTransferDraft {
  id: string
  fromAddress: string
  toAddress: string
  amountSol: number
  transactionBase64: string
  transport: 'rpc' | 'jito'
}

export interface SubmitExternalSignedTransactionInput {
  id: string
  publicKey: string
  signedTransactionBase64: string
  // Which Daemon Wallet Adapter provider signed (e.g. 'solflare'); drives perk
  // attribution in the settlement event. Defaults to 'solflare' for the legacy
  // path when omitted.
  signerProvider?: string
}

export interface TransferTokenInput {
  fromWalletId: string
  toAddress: string
  mint: string
  amount?: number
  sendMax?: boolean
}

export interface TransactionHistoryEntry {
  id: string
  wallet_id: string
  type: string
  signature: string | null
  from_address: string
  to_address: string
  amount: number
  mint: string | null
  symbol: string | null
  status: string
  error: string | null
  created_at: number
}

export interface AgentWalletEntry {
  id: string
  name: string
  address: string
  is_default: number
  agent_id: string
  wallet_type: string
  created_at: number
  assigned_project_ids: string[]
}

export interface WalletBalanceResult {
  sol: number
  lamports: number
}

export interface JupiterTokenSearchResult {
  mint: string
  name: string
  symbol: string
  icon: string | null
  decimals: number
  usdPrice: number | null
  liquidity: number | null
  holderCount: number | null
  organicScore: number | null
  isSus: boolean
  verified: boolean
  tokenProgram: string | null
}

// --- Agent Work Escrow ---

export type AgentWorkStatus =
  | 'draft'
  | 'funded'
  | 'running'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'settled'

export interface AgentWorkTask {
  id: string
  title: string
  prompt: string
  acceptance: string
  project_id: string | null
  project_name: string | null
  project_path: string | null
  wallet_id: string | null
  wallet_name: string | null
  wallet_address: string | null
  agent_id: string | null
  agent_name: string | null
  agent_wallet_id: string | null
  agent_wallet_address: string | null
  verifier_wallet: string | null
  repo_hash: string
  prompt_hash: string
  acceptance_hash: string
  bounty_lamports: number
  bounty_sol: number
  deadline_at: number | null
  onchain_task_id: string | null
  create_signature: string | null
  start_signature: string | null
  receipt_signature: string | null
  review_signature: string | null
  status: AgentWorkStatus
  session_id: string | null
  commit_hash: string | null
  diff_hash: string | null
  tests_hash: string | null
  artifact_uri: string | null
  keycard_gate_id: string | null
  keycard_open_url: string | null
  keycard_capsule_hash: string | null
  keycard_created_at: number | null
  submitted_at: number | null
  approved_at: number | null
  settled_signature: string | null
  created_at: number
  updated_at: number
}

export interface AgentWorkCreateInput {
  title: string
  prompt: string
  acceptance: string
  projectId?: string | null
  walletId?: string | null
  agentId?: string | null
  agentWalletId?: string | null
  verifierWallet?: string | null
  bountySol: number
  deadlineAt?: number | null
}

export interface AgentWorkSubmitInput {
  artifactUri?: string | null
  testsOutput?: string | null
  artifactMode?: 'local' | 'keycard'
}

// --- PnL Tracking ---

export interface TradeRecord {
  id: number
  signature: string
  wallet: string
  mint: string
  side: 'buy' | 'sell'
  tokenAmount: number
  solAmount: number
  pricePerToken: number
  source: string
  timestamp: number
}

export interface CostBasisEntry {
  wallet: string
  mint: string
  totalBought: number
  totalSolSpent: number
  totalSold: number
  totalSolReceived: number
  avgBuyPrice: number
  realizedPnlSol: number
  lastUpdated: number
}

export interface PnlHolding {
  mint: string
  symbol: string
  name: string
  logoUri: string | null
  amount: number
  currentPriceUsd: number
  currentPriceSol: number
  valueUsd: number
  avgBuyPriceSol: number
  avgBuyPriceUsd: number
  costBasisUsd: number
  unrealizedPnlUsd: number
  unrealizedPnlPct: number
  realizedPnlUsd: number
  totalTrades: number
  priceSource: string
}

export interface PnlPortfolio {
  totalValueUsd: number
  totalCostBasisUsd: number
  totalUnrealizedPnlUsd: number
  totalUnrealizedPnlPct: number
  totalRealizedPnlUsd: number
  holdings: PnlHolding[]
  lastPriceUpdate: number
  syncStatus: 'idle' | 'syncing' | 'done' | 'error'
  syncProgress?: { current: number; total: number }
}

export interface PnlTokenDetail {
  mint: string
  symbol: string
  name: string
  costBasis: CostBasisEntry | null
  trades: TradeRecord[]
  currentPriceUsd: number
  currentPriceSol: number
  priceSource: string
}

export interface PnlSyncResult {
  tradesFound: number
  newTrades: number
  walletsProcessed: number
}

// --- IDLE paid resource routing ---

export type IdleResourceType = 'gpu' | 'agent' | 'api' | 'pc' | 'wallet' | 'data' | 'unknown'
export type IdleResourceStatus = 'available' | 'degraded' | 'disabled'
export type IdleReceiptStatus = 'previewed' | 'settled' | 'failed' | 'blocked'

export interface IdleResource {
  id: string
  provider: string
  type: IdleResourceType
  name: string
  endpoint: string
  method: 'GET' | 'POST'
  priceUsdc: number
  asset: string
  network: string
  payee: string
  score: number
  status: IdleResourceStatus
  schema: Record<string, unknown>
  registryUrl: string | null
  lastSeenAt: number
}

export interface IdleBudgetPolicy {
  maxPerCallUsdc: number
  maxPerTaskUsdc: number
  allowedDomains: string[]
  allowedNetworks: string[]
  allowedAssets: string[]
  allowedPayees: string[]
  receiptRequired: boolean
  humanApproved: boolean
}

export interface IdleRegistryRefreshInput {
  registryUrl?: string | null
}

export interface IdlePolicyCheckInput {
  resourceId: string
  projectId?: string | null
  taskId?: string | null
  policy: IdleBudgetPolicy
}

export interface IdlePolicyCheckResult {
  allowed: boolean
  reasons: string[]
  resource: IdleResource | null
  spentThisTaskUsdc: number
  remainingTaskBudgetUsdc: number
}

export interface IdlePaidCallInput extends IdlePolicyCheckInput {
  agentId?: string | null
  requestBody?: unknown
  paymentSignature?: string | null
  approvedBy?: string | null
}

export interface IdlePaidCallReceipt {
  id: string
  resourceId: string
  projectId: string | null
  taskId: string | null
  agentId: string | null
  endpoint: string
  method: string
  amountUsdc: number
  asset: string
  network: string
  payee: string
  status: IdleReceiptStatus
  paymentId: string | null
  facilitator: string | null
  responseStatus: number | null
  responseContentType: string | null
  responseBytes: number | null
  errorMessage: string | null
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface IdleRegistryStatus {
  registryConfigured: boolean
  registryUrl: string | null
  resourceCount: number
  receiptCount: number
  latestReceipt: IdlePaidCallReceipt | null
  executionReady: boolean
  blockers: string[]
}

// --- Meterflow control plane ---

export type MeterflowKeySource = 'secure' | 'env' | 'none'

export interface MeterflowStatus {
  configured: boolean
  keySource: MeterflowKeySource
  baseUrl: string
  tier: string | null
  balanceUsd: number | null
  executionReady: boolean
  error: string | null
  raw: Record<string, unknown> | null
}

export interface MeterflowReceipt {
  id: string
  createdAt?: string | number | null
  updatedAt?: string | number | null
  status?: string | null
  method?: string | null
  paymentProtocol?: string | null
  paymentState?: string | null
  route?: string | null
  providerRoute?: string | null
  meterId?: string | null
  payerWallet?: string | null
  wallet?: string | null
  amountUsd?: number | string | null
  amountUSDC?: number | string | null
  asset?: string | null
  txSignature?: string | null
  publicVerifyUrl?: string | null
  trustState?: string | null
  trustScore?: number | string | null
  agentId?: string | null
  agentName?: string | null
  providerName?: string | null
  responseStatus?: number | string | null
  error?: string | null
  raw?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface MeterflowReceiptGraph {
  receipt?: MeterflowReceipt
  quote?: unknown
  payment?: unknown
  policy?: unknown
  provider?: unknown
  webhook?: unknown
  [key: string]: unknown
}

export interface MeterflowMeter {
  id: string
  route?: string | null
  endpoint?: string | null
  targetUrl?: string | null
  targetHost?: string | null
  method?: string | null
  unit?: string | null
  priceUsd?: number | string | null
  asset?: string | null
  status?: string | null
  mode?: string | null
  providerName?: string | null
  category?: string | null
  description?: string | null
  capabilities?: string[]
  daemonReady?: boolean
  source?: string | null
  metrics?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface MeterflowBudget {
  id: string
  name?: string | null
  status?: string | null
  dailyCapUsd?: number | string | null
  perCallCapUsd?: number | string | null
  spentUsdToday?: number | string | null
  allowedMeterIds?: string[]
  [key: string]: unknown
}

export interface MeterflowAgentSession {
  id: string
  name?: string | null
  agentId?: string | null
  status?: string | null
  maxSpendUsd?: number | string | null
  spentUsd?: number | string | null
  perCallCapUsd?: number | string | null
  authMethod?: string | null
  metadataPolicy?: string | null
  expiresAt?: string | number | null
  allowedMeterIds?: string[]
  [key: string]: unknown
}

export interface MeterflowWebhook {
  id: string
  url?: string | null
  events?: string[]
  status?: string | null
  createdAt?: string | number | null
  updatedAt?: string | number | null
  lastDeliveryAt?: string | number | null
  lastStatus?: string | number | null
  secretHint?: string | null
  [key: string]: unknown
}

export interface MeterflowRevenueRow {
  meterId?: string | null
  route?: string | null
  unit?: string | null
  calls?: number | string | null
  successful?: number | string | null
  failed?: number | string | null
  grossUsd?: number | string | null
  verifiedUsd?: number | string | null
  estimatedUsd?: number | string | null
  avgLatencyMs?: number | string | null
  [key: string]: unknown
}

export interface MeterflowReceiptsQuery {
  meterId?: string
  status?: string
  limit?: number
}

export interface MeterflowReceiptDetail {
  receipt: MeterflowReceipt
  graph: MeterflowReceiptGraph | null
}

export interface MeterflowDemoWallet {
  walletId: string
  address: string
  name: string
  walletType: 'agent' | 'user' | string
  createdAt: number
  hasKeypair: boolean
}

export interface MeterflowWalletReadiness {
  wallet: MeterflowDemoWallet | null
  ready: boolean
  network: string
  solBalance: number | null
  usdcBalance: number | null
  fundingMessage: string
  blockers: string[]
}

export interface MeterflowPaidAgentReadinessInput {
  agentName?: string
  metaplexAssetAddress?: string
  idempotencyKey?: string
  action?: string
  address?: string
  [key: string]: unknown
}

export interface MeterflowPaidAgentReadinessResult {
  wallet: MeterflowDemoWallet
  idempotencyKey: string
  status: number
  ok: boolean
  receipt: MeterflowReceipt
  receiptId: string | null
  receiptUrl: string | null
  txSignature: string | null
  result: Record<string, unknown>
}

export interface MeterflowWatchProjectResult {
  projectPath: string
  watchPath: string
  watching: boolean
}

export interface MeterflowCsvExport {
  filename: string
  contentType: string
  content: string
}

export interface MeterflowOverview {
  status: MeterflowStatus
  receipts: MeterflowReceipt[]
  meters: MeterflowMeter[]
  budgets: MeterflowBudget[]
  agentSessions: MeterflowAgentSession[]
  webhooks: MeterflowWebhook[]
  revenue: MeterflowRevenueRow[]
  registrySummary: Record<string, unknown> | null
  errors: string[]
  fetchedAt: number
}

// --- MCP Management ---

export interface McpAddInput {
  name: string
  config: string
  description: string
  isGlobal: boolean
}

// --- Tools ---

export interface ToolRow {
  id: string
  name: string
  description: string | null
  category: string
  language: string
  entrypoint: string
  tool_path: string
  icon: string
  version: string
  author: string | null
  tags: string
  config: string
  last_run_at: number | null
  run_count: number
  enabled: number
  sort_order: number
  created_at: number
}

export interface ToolCreateInput {
  name: string
  description?: string
  category?: string
  language?: string
}

export interface ToolManifest {
  name: string
  description: string
  version: string
  category: string
  language: string
  entrypoint: string
  author?: string
  tags?: string[]
  config?: Record<string, unknown>
}

export interface ToolRunStatus {
  running: boolean
  terminalId: string | null
  pid: number | null
  startedAt: number | null
}

// --- Email (Multi-Account) ---

export interface EmailAccount {
  id: string
  provider: 'gmail' | 'icloud'
  email: string
  display_name: string | null
  status: 'connected' | 'error' | 'refreshing'
  last_sync_at: number | null
  settings: string
  created_at: number
  unreadCount: number
}

export interface EmailMessage {
  id: string
  accountId: string
  provider: 'gmail' | 'icloud'
  from: string
  subject: string
  snippet: string
  body: string
  date: number
  isRead: boolean
  labels: string[]
}

export interface EmailAccountRow {
  id: string
  provider: string
  email: string
  display_name: string | null
  access_token: Buffer | null
  refresh_token: Buffer | null
  imap_password: Buffer | null
  token_expiry: number | null
  client_id_ref: string | null
  client_secret_ref: string | null
  status: string
  last_sync_at: number | null
  settings: string
  created_at: number
  updated_at: number
}

// --- Gmail ---

export interface GmailMessage {
  id: string
  threadId: string
  from: string
  subject: string
  snippet: string
  body: string
  date: number
  isRead: boolean
  labels: string[]
}

export interface ExtractedItem {
  type: 'code' | 'config' | 'error' | 'link' | 'task'
  content: string
  language?: string
  context: string
}

export interface GmailExtractionResult {
  messageId: string
  items: ExtractedItem[]
  summary: string
}

export interface GmailAuthStatus {
  isAuthenticated: boolean
  email: string | null
}

export interface ExtractionResult {
  messageId: string
  items: ExtractedItem[]
  summary: string
}

// --- Browser ---

export interface BrowserPage {
  id: string
  url: string
  title: string
  content: string
  timestamp: number
}

export interface BrowserAnalysis {
  url: string
  summary: string
  findings: string[]
  type: 'summarize' | 'extract' | 'audit' | 'compare'
}

export interface BrowserNavResult {
  pageId: string
  url: string
  title: string
  status: number
  contentLength: number
}

// --- Engine ---

export type EngineActionType =
  | 'fix-claude-md'
  | 'generate-claude-md'
  | 'debug-setup'
  | 'health-check'
  | 'explain-error'
  | 'suggest-fix'
  | 'safety-scan'
  | 'ask'

export interface EngineAction {
  type: EngineActionType
  projectId?: string
  payload?: Record<string, unknown>
}

export interface EngineResult {
  ok: boolean
  action: EngineActionType
  output?: string
  artifacts?: Record<string, string>
  error?: string
}

// --- Deploy ---

export type DeployPlatform = 'vercel' | 'railway'

export interface ProjectInfra {
  vercel?: VercelLink
  railway?: RailwayLink
}

export interface VercelLink {
  projectId: string
  projectName: string
  teamId: string | null
  teamSlug: string | null
  productionUrl: string | null
  framework: string | null
  linkedAt: number
}

export interface RailwayLink {
  projectId: string
  projectName: string
  serviceId: string
  environmentId: string
  productionUrl: string | null
  linkedAt: number
}

export interface DeploymentEntry {
  id: string
  platform: DeployPlatform
  status: 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED' | 'QUEUED'
  url: string | null
  branch: string | null
  commitSha: string | null
  commitMessage: string | null
  createdAt: number
}

export interface DeployStatus {
  platform: DeployPlatform
  linked: boolean
  projectName: string | null
  productionUrl: string | null
  latestStatus: string | null
  latestUrl: string | null
  latestBranch: string | null
  latestCreatedAt: number | null
}

export interface DeployAuthStatus {
  vercel: { authenticated: boolean; user: string | null }
  railway: { authenticated: boolean; user: string | null }
}

export interface VercelEnvVar {
  id: string
  key: string
  value: string
  target: string[]
  type: string
}

// --- Shipline ---

export type ShiplineCluster = 'devnet' | 'mainnet-beta'
export type ShiplineRunStatus = 'ready' | 'blocked' | 'running' | 'complete' | 'failed'
export type ShiplineStepStatus = 'pending' | 'ready' | 'running' | 'complete' | 'warning' | 'blocked' | 'failed'
export type ShiplineStepId =
  | 'preflight'
  | 'build'
  | 'tests'
  | 'priority-fees'
  | 'deploy'
  | 'confirm'
  | 'verify'
  | 'idl-export'

export interface ShiplineProgramTarget {
  name: string
  preferredProgramId: string | null
  anchorProgramId: string | null
  declareId: string | null
  idlAddress: string | null
  keypairAddress: string | null
  explorerUrl: string | null
  warnings: string[]
}

export interface ShiplineTimelineStep {
  id: ShiplineStepId
  label: string
  detail: string
  status: ShiplineStepStatus
  command: string | null
  artifacts: Array<{
    label: string
    value: string
    href?: string | null
  }>
  warnings: string[]
  recovery: string[]
  startedAt: number | null
  completedAt: number | null
  terminalId?: string | null
}

export interface ShiplineRun {
  id: string
  projectId: string | null
  projectPath: string
  projectName: string
  cluster: ShiplineCluster
  status: ShiplineRunStatus
  currentStep: ShiplineStepId | null
  summary: string
  warnings: string[]
  recovery: string[]
  programs: ShiplineProgramTarget[]
  steps: ShiplineTimelineStep[]
  createdAt: number
  updatedAt: number
}

export interface ShiplineCreateRunInput {
  projectId?: string | null
  projectPath: string
  projectName?: string | null
  cluster?: ShiplineCluster
}

export interface ShiplineUpdateStepInput {
  runId: string
  stepId: ShiplineStepId
  status: ShiplineStepStatus
  terminalId?: string | null
}

// --- Images ---

export interface ImageRecord {
  id: string
  filename: string
  filepath: string
  prompt: string | null
  model: string | null
  project_id: string | null
  tags: string
  source: string
  created_at: number
}

export type ImageModelTier = 'fast' | 'standard' | 'ultra'
export type ImageAspectRatio = '1:1' | '16:9' | '4:3' | '9:16' | '3:4'

export interface ImageGenerateInput {
  prompt: string
  model: ImageModelTier
  aspectRatio: ImageAspectRatio
  projectId?: string
  tags?: string[]
}

export interface ImageFilter {
  projectId?: string
  source?: string
  model?: string
  limit?: number
  offset?: number
}

// --- ARIA ---

export interface AriaMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  metadata: string
  session_id: string
  created_at: number
}

export interface AriaSession {
  id: string
  title: string | null
  project_id: string | null
  created_at: number
  updated_at: number
  archived: number
}

export interface AriaResponse {
  text: string
  /** @deprecated legacy suggestion chips; superseded by toolCalls. */
  actions: AriaAction[]
  /** Tool calls the operator loop ran for this turn. */
  toolCalls?: AriaToolCallRecord[]
}

export interface AriaAction {
  type: 'spawn_agent' | 'open_file' | 'switch_panel'
  label: string
  value: string
}

// --- ARIA agentic operator ---

export type AriaToolRiskTier = 'read' | 'write' | 'sensitive'
export type AriaToolKindTier = 'read' | 'edit' | 'run'
export type AriaToolCallStatus = 'pending' | 'running' | 'done' | 'error' | 'rejected'

/** A persisted record of one tool the operator loop invoked. */
export interface AriaToolCallRecord {
  callId: string
  name: string
  toolKind: AriaToolKindTier
  risk: AriaToolRiskTier
  status: 'done' | 'error' | 'rejected'
  summary: string
  input: unknown
  result?: unknown
}

/** One ordered step in the operator's plan for a turn (mockup rows 01–04). */
export type AriaPlanStepStatus = 'pending' | 'active' | 'done'
export interface AriaPlanStep {
  index: number
  title: string
  status: AriaPlanStepStatus
}

/** Terminal decision the user can make on a proposed patch. */
export type AriaPatchAction = 'keep' | 'run-tests' | 'discard'

/**
 * Renderer-facing projection of a {@link DaemonAiPatchProposal}: enough to render
 * the patch summary card (title, files, +/− counts, risk) and gate the write.
 */
export interface AriaPatchProposalLite {
  id: string
  title: string
  summary: string | null
  files: string[]
  unifiedDiff: string
  additions: number
  deletions: number
  riskLevel: DaemonAiPatchRiskLevel
  /** Deterministic Guard findings from ProjectSafetyService/PatchProposalService. */
  guardFindings: DaemonAiPatchSafetyFinding[]
  status: DaemonAiPatchProposalStatus
}

/** Snapshot of renderer/app state passed to the operator with each turn. */
export interface AriaContextSnapshot {
  activeProjectId: string | null
  activeProjectPath: string | null
  currentPanelId: string | null
  openFilePath: string | null
  chips: {
    activeFile: boolean
    projectTree: boolean
    gitDiff: boolean
    terminalLogs: boolean
    walletContext: boolean
    /** Inject approved DAEMON Memory facts into the agent prompt. Default off. */
    projectMemory?: boolean
  }
  /** Plan mode: ARIA presents a plan and waits for one approval before any
   *  write action, then auto-runs all write steps. Sensitive money/key tools
   *  still pause for typed confirm. Default off (Build mode). */
  planMode?: boolean
}

/** A renderer-applied effect requested by a tool (navigation, toggles, terminal). */
export type AriaUiEffect =
  | { type: 'open_tool'; toolId: string }
  | { type: 'run_command'; commandId: string }
  | { type: 'open_file'; path: string }
  | { type: 'add_terminal'; terminalId: string; name: string; agentId?: string }
  | { type: 'run_integration'; actionId: string }
  | { type: 'set_integration_enabled'; integrationId: string; enabled: boolean }

/** Streamed transcript events from the operator loop to the renderer. */
export type AriaToolEvent =
  | { kind: 'assistant-text'; messageId: string; text: string }
  | {
      kind: 'tool-call'
      callId: string
      name: string
      label: string
      toolKind: AriaToolKindTier
      risk: AriaToolRiskTier
      status: AriaToolCallStatus
      meta?: string
    }
  | { kind: 'approval-request'; callId: string; name: string; risk: AriaToolRiskTier; summary: string; input: unknown; fee?: { bps: number; lamports: number; treasury: string } }
  | { kind: 'plan'; messageId: string; steps: AriaPlanStep[] }
  | { kind: 'patch-proposal'; messageId: string; proposal: AriaPatchProposalLite }
  | { kind: 'action-result'; proposalId: string; action: AriaPatchAction; status: 'applied' | 'rejected' | 'failed'; meta?: string }
  | { kind: 'memory-suggestion'; messageId: string; suggestion: AriaMemorySuggestionLite }
  | { kind: 'memory-recall'; messageId: string; recalled: AriaMemorySuggestionLite[] }
  | { kind: 'done'; messageId: string; text: string }

/** A memory the operator captured from its own work, pending the user's keep/dismiss. */
export interface AriaMemorySuggestionLite {
  id: string
  kind: MemoryKind
  title: string
  value: string
}

// --- Bridge (external MCP agents) ---

export type BridgeCallStatus = 'done' | 'error' | 'rejected' | 'timeout'

/** Events streamed from the Bridge to the renderer approval surface. */
export type BridgeToolEvent =
  | { kind: 'approval-request'; callId: string; name: string; risk: AriaToolRiskTier; summary: string; input: unknown; source: 'bridge' }
  | { kind: 'approval-expired'; callId: string }
  | { kind: 'call'; callId: string; name: string; risk: AriaToolRiskTier; status: BridgeCallStatus; summary: string }

/** Bridge server status surfaced in Settings. */
export interface BridgeStatus {
  running: boolean
  port: number
  tokenFile: string
  toolCount: number
  error?: string
}

/** One tool as advertised to external MCP clients. */
export interface BridgeToolDescriptor {
  name: string
  description: string
  risk: AriaToolRiskTier
  inputSchema: Record<string, unknown>
}

/** Result of one bridge tool call, returned to the shim. */
export interface BridgeCallResult {
  status: BridgeCallStatus
  summary: string
  result?: unknown
}

// --- Onboarding ---

export type OnboardingStepStatus = 'pending' | 'complete' | 'skipped'

export interface OnboardingProgress {
  profile: OnboardingStepStatus
  project: OnboardingStepStatus
  runtime: OnboardingStepStatus
  ai: OnboardingStepStatus
  firstRun: OnboardingStepStatus
  tour: OnboardingStepStatus
  claude?: OnboardingStepStatus
  gmail?: OnboardingStepStatus
  vercel?: OnboardingStepStatus
  railway?: OnboardingStepStatus
}

// --- Workspace Profile ---

export type WorkspaceProfileName = 'web' | 'solana' | 'custom'

export interface WorkspaceProfile {
  name: WorkspaceProfileName
  toolVisibility: Record<string, boolean>
}

// --- Editor preferences ---

export type EditorThemeId = 'daemon-dark' | 'daemon-light'

export interface EditorPrefs {
  fontFamily: string
  fontSize: number
  tabSize: number
  wordWrap: boolean
  minimap: boolean
  theme: EditorThemeId
}

// --- Engine ---

export interface EngineContext {
  projects: Array<{
    id: string
    name: string
    path: string
    status: string
    hasClaudeMd: boolean
    gitBranch: string | null
    activeSessions: number
  }>
  activeAgents: Array<{ id: string; name: string; projectId: string | null }>
  recentErrors: Array<{ operation: string; message: string; timestamp: number }>
  portMap: Array<{ port: number; serviceName: string; projectName: string }>
  userProfile: Record<string, string>
}

// --- Replay Engine ---

export interface ReplayAccountRef {
  pubkey: string
  isSigner: boolean
  isWritable: boolean
  label?: string | null
}

export interface ReplayInstruction {
  index: number
  programId: string
  programLabel: string | null
  accounts: ReplayAccountRef[]
  rawData: string
  parsed: {
    type: string | null
    info: Record<string, unknown> | null
  } | null
  innerInstructions: ReplayInstruction[]
  error: string | null
}

export interface ReplayAccountDiff {
  pubkey: string
  owner: string | null
  preLamports: number
  postLamports: number
  lamportsDelta: number
  preTokenAmount: string | null
  postTokenAmount: string | null
  tokenMint: string | null
  isWritable: boolean
}

export interface ReplayAnchorError {
  errorCode: string | null
  errorNumber: number | null
  errorMessage: string | null
  account: string | null
  programId: string | null
  raw: string
}

export interface ReplayTrace {
  signature: string
  slot: number
  blockTime: number | null
  success: boolean
  fee: number
  computeUnitsConsumed: number | null
  feePayer: string | null
  programIds: string[]
  instructions: ReplayInstruction[]
  accountDiffs: ReplayAccountDiff[]
  logs: string[]
  errorRaw: unknown | null
  anchorError: ReplayAnchorError | null
  fetchedAt: number
}

export interface ReplayProgramSummary {
  programId: string
  recent: Array<{
    signature: string
    slot: number
    blockTime: number | null
    success: boolean
    error: string | null
  }>
}

export interface ReplayContextHandoff {
  contextMarkdown: string
  promptHeadline: string
  signature: string
}

export interface ReplayAgentHandoff extends ReplayContextHandoff {
  contextPath: string
  promptText: string
  startupCommand: string
}

export interface ReplayVerificationResult {
  signature: string
  command: string
  cwd: string
  status: 'passed' | 'failed'
  exitCode: number | null
  stdout: string
  stderr: string
  startedAt: number
  completedAt: number
  durationMs: number
  resultPath: string
}

// ---------------------------------------------------------------------------
// DAEMON Memory v1 — structured, source-backed, user-approved project facts.
// privacy_class reuses PrivacyDataClass from security/PrivacyGuard so Memory and
// ProjectSafetyService share one notion of "secret"; secret classes are never injected.
// ---------------------------------------------------------------------------

export type MemoryKind =
  | 'project_summary'
  | 'stack'
  | 'package_manager'
  | 'command'
  | 'test_command'
  | 'build_command'
  | 'dev_command'
  | 'mcp_config'
  | 'wallet_context'
  | 'rpc_context'
  | 'decision'
  | 'constraint'
  | 'do_not_touch'
  | 'prior_failure'
  | 'prior_fix'
  | 'deployment_target'
  | 'security_note'
  | 'style_preference'

export type MemoryStatus = 'suggested' | 'approved' | 'rejected' | 'archived'
export type MemoryScope = 'project' | 'global' | 'session' | 'team'
export type MemoryAuthor = 'user' | 'agent' | 'guard' | 'extractor' | 'check_runner'

export type MemoryPrivacyClass = MemoryDataClass

// Local alias kept in sync with PrivacyDataClass (security/PrivacyGuard). Declared here to
// avoid a renderer importing from electron/security; the MemoryService cross-checks at runtime.
export type MemoryDataClass =
  | 'public'
  | 'project_code'
  | 'env_secret'
  | 'wallet_secret'
  | 'email_body'
  | 'browser_content'
  | 'personal_data'
  | 'financial_tx'
  | 'onchain_receipt'

export interface ProjectMemory {
  id: string
  projectId: string | null
  scope: MemoryScope
  kind: MemoryKind
  title: string
  value: string
  sourceType: string
  sourceRef: string
  confidence: number
  status: MemoryStatus
  privacyClass: MemoryPrivacyClass
  tags: string[]
  createdBy: MemoryAuthor
  approvedBy: string | null
  lastUsedAt: number | null
  expiresAt: number | null
  createdAt: number
  updatedAt: number
}

export interface MemorySuggestionInput {
  projectId: string | null
  scope?: MemoryScope
  kind: MemoryKind
  title: string
  value: string
  sourceType: string
  sourceRef: string
  confidence?: number
  privacyClass?: MemoryPrivacyClass
  tags?: string[]
  createdBy?: MemoryAuthor
}

export interface MemoryUpdateInput {
  title?: string
  value?: string
  kind?: MemoryKind
  confidence?: number
  tags?: string[]
}

export interface MemoryContextBundle {
  block: string
  usedMemoryIds: string[]
  totalChars: number
}

/** An approved memory enriched with usage stats for the "What I know" knowledge view. */
export interface KnowledgeItem {
  id: string
  kind: MemoryKind
  title: string
  value: string
  confidence: number
  sourceType: string
  usageCount: number
  createdAt: number
  lastUsedAt: number | null
}

// ---------------------------------------------------------------------------
// CheckRunner — discovered project checks (typecheck/test/build). Never deploy.
// ---------------------------------------------------------------------------

export type CheckKind = 'typecheck' | 'test' | 'build' | 'lint' | 'other'

export interface CheckDefinition {
  id: string
  kind: CheckKind
  label: string
  command: string
  source: 'package_script' | 'framework_default' | 'memory'
  memoryKind: Extract<MemoryKind, 'test_command' | 'build_command'> | null
}

export interface CheckResult {
  check: CheckDefinition
  status: 'passed' | 'failed'
  exitCode: number | null
  durationMs: number
  output: string
}
