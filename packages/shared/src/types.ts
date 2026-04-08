// Portable types shared between desktop and mobile.
// Desktop-only types (TerminalSession, IPty-dependent) remain in electron/shared/types.ts.

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

// --- Wallet ---

export interface WalletListEntry {
  id: string
  name: string
  address: string
  is_default: number
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

export interface WalletBalanceResult {
  sol: number
  lamports: number
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

export interface TransferSOLInput {
  fromWalletId: string
  toAddress: string
  amountSol: number
}

export interface TransferTokenInput {
  fromWalletId: string
  toAddress: string
  mint: string
  amount: number
}

// --- Claude / AI ---

export interface AnthropicStatus {
  indicator: 'none' | 'minor' | 'major' | 'critical'
  description: string
}

export interface SessionUsage {
  lastCost: number
  models: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; costUSD: number }>
}

export interface ClaudeConnection {
  claudePath: string
  hasApiKey: boolean
  isAuthenticated: boolean
  authMode: 'api' | 'cli' | 'both' | 'none'
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

// --- Process Manager ---

export interface ProcessInfo {
  id: string
  pid: number
  name: string
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

// --- Plugins ---

export interface PluginRow {
  id: string
  enabled: number
  sort_order: number
  config: string
  updated_at: number
}

// --- MCP ---

export interface McpEntry {
  name: string
  config: { command?: string; args?: string[]; env?: Record<string, string>; type?: string }
  source: string
  enabled: boolean
}

// --- UI Settings ---

export interface UiSettings {
  showMarketTape: boolean
  showTitlebarWallet: boolean
}

// --- Daemon Pro ---

export type ProFeature = 'arena' | 'pro-skills' | 'mcp-sync' | 'priority-api'

export interface ProSubscriptionState {
  active: boolean
  walletId: string | null
  walletAddress: string | null
  expiresAt: number | null
  features: ProFeature[]
  tier: 'pro' | null
  priceUsdc: number | null
  durationDays: number | null
}

export interface ProPriceInfo {
  priceUsdc: number
  durationDays: number
  network: string
  payTo: string
}

export interface ArenaSubmission {
  id: string
  title: string
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
  previewImage?: string
}

export interface ArenaSubmissionInput {
  title: string
  description: string
  category: ArenaSubmission['category']
  githubUrl: string
}

export interface ProSkillManifestEntry {
  id: string
  name: string
  version: string
  description: string
  downloadUrl: string
  sha256: string
  size: number
  updatedAt: number
}

export interface ProSkillManifest {
  version: 1
  skills: ProSkillManifestEntry[]
}

// --- Deploy ---

export type DeployPlatform = 'vercel' | 'railway'

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
