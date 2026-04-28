import type { IPty } from 'node-pty'

// Single source of truth for all entity types shared between main and renderer.
// Both tsconfigs include the electron/ directory, so these types are importable everywhere.

// --- IPC ---

export interface IpcResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
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

// --- Daemon Pro ---

export type ProFeature = 'arena' | 'pro-skills' | 'mcp-sync' | 'priority-api'
export type ProAccessSource = 'payment' | 'holder'

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
  walletId: string | null
  walletAddress: string | null
  expiresAt: number | null
  features: ProFeature[]
  tier: 'pro' | null
  accessSource: ProAccessSource | null
  holderStatus: ProHolderStatus
  priceUsdc: number | null
  durationDays: number | null
}

export interface ProPriceInfo {
  priceUsdc: number
  durationDays: number
  network: string
  payTo: string
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
  slippageBps?: number
  priceImpactPct?: string
  protocol?: string
}

export interface SolanaTransactionPreview {
  title: string
  backendLabel: string
  signerLabel: string
  targetLabel: string
  amountLabel: string
  feeLabel: string
  notes: string[]
  warnings: string[]
  requiresAcknowledgement: boolean
  acknowledgementLabel: string | null
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
  /** Buffers PTY data until renderer signals ready */
  dataBuffer?: string[]
  /** True once renderer has attached its xterm onData listener */
  rendererReady?: boolean
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

export interface AriaResponse {
  text: string
  actions: AriaAction[]
}

export interface AriaAction {
  type: 'spawn_agent' | 'open_file' | 'switch_panel'
  label: string
  value: string
}

// --- Onboarding ---

export type OnboardingStepStatus = 'pending' | 'complete' | 'skipped'

export interface OnboardingProgress {
  profile: OnboardingStepStatus
  claude: OnboardingStepStatus
  gmail: OnboardingStepStatus
  vercel: OnboardingStepStatus
  railway: OnboardingStepStatus
  tour: OnboardingStepStatus
}

// --- Workspace Profile ---

export type WorkspaceProfileName = 'web' | 'solana' | 'custom'

export interface WorkspaceProfile {
  name: WorkspaceProfileName
  toolVisibility: Record<string, boolean>
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
