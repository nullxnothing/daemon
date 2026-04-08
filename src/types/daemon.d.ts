import type {
  IpcResponse,
  Project,
  Agent,
  FileEntry,
  RuntimeIconTheme,
  ClaudeAgentFile,
  McpRegistryEntry,
  McpEntry,
  AnthropicStatus,
  SessionUsage,
  SecureKeyEntry,
  WalletListEntry,
  WalletDashboard,
  ClaudeMdData,
  ClaudeConnection,
  CodexConnection,
  ProviderConnectionInfo,
  ProcessInfo,
  OrphanProcess,
  GitFile,
  GitCommit,
  GitBranches,
  ListeningPort,
  RegisteredPort,
  GhostPort,
  UnifiedKey,
  EnvFile,
  EnvDiff,
  SkillEntry,
  UiSettings,
  MarketTickerEntry,
  PluginRow,
  Tweet,
  VoiceProfile,
  RecoveryWalletInfo,
  RecoveryProgressEvent,
  RecoveryStatus,
  TerminalSession,
  TerminalCreateInput,
  TerminalSpawnAgentInput,
  TerminalCreateOutput,
  AgentCreateInput,
  ProjectCreateInput,
  TweetUpdateInput,
  WalletCreateInput,
  WalletGenerateInput,
  TransferSOLInput,
  TransferTokenInput,
  McpAddInput,
  DeployPlatform,
  DeployAuthStatus,
  DeployStatus,
  DeploymentEntry,
  VercelLink,
  RailwayLink,
  VercelEnvVar,
  EmailAccount,
  EmailMessage,
  ExtractionResult,
  ExtractedItem,
  ImageRecord,
  ImageGenerateInput,
  ImageFilter,
  ImageModelTier,
  ImageAspectRatio,
  AriaMessage,
  AriaResponse,
  AriaAction,
  OnboardingProgress,
  OnboardingStepStatus,
  WorkspaceProfile,
  WorkspaceProfileName,
  PnlPortfolio,
  PnlHolding,
  PnlTokenDetail,
  PnlSyncResult,
  TradeRecord,
  CostBasisEntry,
} from '../../electron/shared/types'

export type {
  IpcResponse,
  Project,
  Agent,
  FileEntry,
  RuntimeIconTheme,
  ClaudeAgentFile,
  McpRegistryEntry,
  McpEntry,
  AnthropicStatus,
  SessionUsage,
  SecureKeyEntry,
  WalletListEntry,
  WalletDashboard,
  ClaudeMdData,
  ClaudeConnection,
  CodexConnection,
  ProviderConnectionInfo,
  ProcessInfo,
  OrphanProcess,
  GitFile,
  GitCommit,
  GitBranches,
  ListeningPort,
  RegisteredPort,
  GhostPort,
  UnifiedKey,
  EnvFile,
  EnvDiff,
  SkillEntry,
  UiSettings,
  MarketTickerEntry,
  PluginRow,
  Tweet,
  VoiceProfile,
  RecoveryWalletInfo,
  RecoveryProgressEvent,
  RecoveryStatus,
  TerminalSession,
  TerminalCreateInput,
  TerminalSpawnAgentInput,
  TerminalCreateOutput,
  AgentCreateInput,
  ProjectCreateInput,
  TweetUpdateInput,
  WalletCreateInput,
  WalletGenerateInput,
  TransferSOLInput,
  TransferTokenInput,
  McpAddInput,
  DeployPlatform,
  DeployAuthStatus,
  DeployStatus,
  DeploymentEntry,
  VercelLink,
  RailwayLink,
  VercelEnvVar,
  EmailAccount,
  EmailMessage,
  ExtractionResult,
  ExtractedItem,
  ImageRecord,
  ImageGenerateInput,
  ImageFilter,
  ImageModelTier,
  ImageAspectRatio,
  AriaMessage,
  AriaResponse,
  AriaAction,
  OnboardingProgress,
  OnboardingStepStatus,
  WorkspaceProfile,
  WorkspaceProfileName,
  PnlPortfolio,
  PnlHolding,
  PnlTokenDetail,
  PnlSyncResult,
  TradeRecord,
  CostBasisEntry,
}

declare global {
  // Re-export shared types as global ambient types so existing code
  // that references them without explicit imports continues to work.
  type Project = import('../../electron/shared/types').Project
  type Agent = import('../../electron/shared/types').Agent
  type FileEntry = import('../../electron/shared/types').FileEntry
  type RuntimeIconTheme = import('../../electron/shared/types').RuntimeIconTheme
  type ClaudeAgentFile = import('../../electron/shared/types').ClaudeAgentFile
  type McpRegistryEntry = import('../../electron/shared/types').McpRegistryEntry
  type AnthropicStatus = import('../../electron/shared/types').AnthropicStatus
  type SecureKeyEntry = import('../../electron/shared/types').SecureKeyEntry
  type WalletListEntry = import('../../electron/shared/types').WalletListEntry
  type WalletDashboard = import('../../electron/shared/types').WalletDashboard
  type MarketTickerEntry = import('../../electron/shared/types').MarketTickerEntry
  type ClaudeMdData = import('../../electron/shared/types').ClaudeMdData
  type ClaudeConnection = import('../../electron/shared/types').ClaudeConnection
  type PluginRow = import('../../electron/shared/types').PluginRow
  type Tweet = import('../../electron/shared/types').Tweet
  type VoiceProfile = import('../../electron/shared/types').VoiceProfile
  type IpcResponse<T = unknown> = import('../../electron/shared/types').IpcResponse<T>
  type RecoveryWalletInfo = import('../../electron/shared/types').RecoveryWalletInfo
  type RecoveryProgressEvent = import('../../electron/shared/types').RecoveryProgressEvent
  type RecoveryStatus = import('../../electron/shared/types').RecoveryStatus
  type DeployPlatform = import('../../electron/shared/types').DeployPlatform
  type DeployAuthStatus = import('../../electron/shared/types').DeployAuthStatus
  type DeployStatus = import('../../electron/shared/types').DeployStatus
  type DeploymentEntry = import('../../electron/shared/types').DeploymentEntry
  type VercelLink = import('../../electron/shared/types').VercelLink
  type RailwayLink = import('../../electron/shared/types').RailwayLink
  type VercelEnvVar = import('../../electron/shared/types').VercelEnvVar
  type EmailAccount = import('../../electron/shared/types').EmailAccount
  type EmailMessage = import('../../electron/shared/types').EmailMessage
  type ExtractionResult = import('../../electron/shared/types').ExtractionResult
  type ExtractedItem = import('../../electron/shared/types').ExtractedItem
  type ImageRecord = import('../../electron/shared/types').ImageRecord
  type ImageGenerateInput = import('../../electron/shared/types').ImageGenerateInput
  type ImageFilter = import('../../electron/shared/types').ImageFilter
  type ImageModelTier = import('../../electron/shared/types').ImageModelTier
  type ImageAspectRatio = import('../../electron/shared/types').ImageAspectRatio
  type AriaMessage = import('../../electron/shared/types').AriaMessage
  type AriaResponse = import('../../electron/shared/types').AriaResponse
  type AriaAction = import('../../electron/shared/types').AriaAction
  type OnboardingProgress = import('../../electron/shared/types').OnboardingProgress
  type OnboardingStepStatus = import('../../electron/shared/types').OnboardingStepStatus
  type WorkspaceProfile = import('../../electron/shared/types').WorkspaceProfile
  type WorkspaceProfileName = import('../../electron/shared/types').WorkspaceProfileName

  interface DaemonWindow {
    minimize: () => void
    maximize: () => void
    close: () => void
    reload: () => void
    isMaximized: () => Promise<boolean>
    onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void
  }

  interface DaemonTerminal {
    create: (opts?: { cwd?: string; startupCommand?: string; userInitiated?: boolean; isAgent?: boolean }) => Promise<IpcResponse<{ id: string; pid: number; agentId: string | null }>>
    spawnAgent: (opts: { agentId: string; projectId: string; initialPrompt?: string }) => Promise<IpcResponse<{ id: string; pid: number; agentId: string; agentName: string }>>
    spawnProvider: (opts: { providerId: 'claude' | 'codex'; projectId?: string; cwd?: string }) => Promise<IpcResponse<{ id: string; pid: number; agentId: string | null }>>
    ready: (id: string) => void
    write: (id: string, data: string) => void
    resize: (id: string, cols: number, rows: number) => void
    kill: (id: string) => Promise<IpcResponse>
    pasteFromClipboard: (id: string) => Promise<IpcResponse<{ pasted: boolean }>>
    checkClaude: () => Promise<IpcResponse<{ installed: boolean; claudePath: string }>>
    onData: (callback: (payload: { id: string; data: string }) => void) => () => void
    onExit: (callback: (payload: { id: string; exitCode: number }) => void) => () => void
  }

  interface DaemonGit {
    branch: (cwd: string) => Promise<IpcResponse<string | null>>
    branches: (cwd: string) => Promise<IpcResponse<GitBranches>>
    status: (cwd: string) => Promise<IpcResponse<GitFile[]>>
    stage: (cwd: string, files: string[]) => Promise<IpcResponse>
    unstage: (cwd: string, files: string[]) => Promise<IpcResponse>
    commit: (cwd: string, message: string) => Promise<IpcResponse>
    push: (cwd: string) => Promise<IpcResponse<string>>
    log: (cwd: string, count?: number) => Promise<IpcResponse<GitCommit[]>>
    diff: (cwd: string, filePath?: string) => Promise<IpcResponse<string>>
    diffStaged: (cwd: string) => Promise<IpcResponse<string>>
    checkout: (cwd: string, branch: string) => Promise<IpcResponse>
    createBranch: (cwd: string, branchName: string) => Promise<IpcResponse<{ branch: string }>>
    fetch: (cwd: string) => Promise<IpcResponse>
    pull: (cwd: string) => Promise<IpcResponse>
    createTag: (cwd: string, tagName: string) => Promise<IpcResponse<{ tag: string }>>
    stashSave: (cwd: string, message?: string) => Promise<IpcResponse<{ message: string }>>
    stashPop: (cwd: string) => Promise<IpcResponse>
    stashList: (cwd: string) => Promise<IpcResponse<Array<{ hash: string; message: string }>>>
    discard: (cwd: string, filePath: string) => Promise<IpcResponse>
  }

  interface DaemonPorts {
    scan: () => Promise<IpcResponse<ListeningPort[]>>
    registered: () => Promise<IpcResponse<RegisteredPort[]>>
    register: (port: number, projectId: string, serviceName: string) => Promise<IpcResponse>
    unregister: (port: number, projectId: string) => Promise<IpcResponse>
    ghosts: () => Promise<IpcResponse<GhostPort[]>>
    kill: (port: number) => Promise<IpcResponse>
  }

  interface DaemonEnv {
    scanAll: () => Promise<IpcResponse<UnifiedKey[]>>
    projectVars: (projectPath: string) => Promise<IpcResponse<EnvFile[]>>
    updateVar: (filePath: string, key: string, value: string) => Promise<IpcResponse>
    addVar: (key: string, value: string, projectPaths: string[]) => Promise<IpcResponse<{ added: number }>>
    deleteVar: (filePath: string, key: string) => Promise<IpcResponse>
    diff: (pathA: string, pathB: string) => Promise<IpcResponse<EnvDiff>>
    copyValue: (value: string) => Promise<IpcResponse>
    propagate: (key: string, value: string, projectPaths: string[]) => Promise<IpcResponse<{ updated: number }>>
    pullVercel: (projectPath: string, environment?: string) => Promise<IpcResponse<{ pulledFile: string; onlyVercel: Array<{ key: string; value: string }>; onlyLocal: Array<{ key: string; value: string }>; different: Array<{ key: string; vercelValue: string; localValue: string }>; totalPulled: number }>>
    projects: () => Promise<IpcResponse<Array<{ id: string; name: string; path: string }>>>
    vercelVars: (projectId: string) => Promise<IpcResponse<VercelEnvVar[]>>
    vercelCreateVar: (projectId: string, key: string, value: string, target: string[], type?: string) => Promise<IpcResponse<void>>
    vercelUpdateVar: (projectId: string, envVarId: string, value: string, target?: string[]) => Promise<IpcResponse<void>>
    vercelDeleteVar: (projectId: string, envVarId: string) => Promise<IpcResponse<void>>
  }

  interface DaemonProcess {
    list: () => Promise<IpcResponse<ProcessInfo[]>>
    orphans: () => Promise<IpcResponse<OrphanProcess[]>>
    kill: (pid: number) => Promise<IpcResponse>
  }

  interface DaemonFs {
    readDir: (dirPath: string, depth?: number) => Promise<IpcResponse<FileEntry[]>>
    readFile: (filePath: string) => Promise<IpcResponse<{ content: string; path: string }>>
    readImageBase64: (filePath: string) => Promise<IpcResponse<{ dataUrl: string; size: number }>>
    writeImageFromBase64: (filePath: string, base64: string) => Promise<IpcResponse>
    pickImage: () => Promise<IpcResponse<string | null>>
    writeFile: (filePath: string, content: string) => Promise<IpcResponse>
    createFile: (filePath: string) => Promise<IpcResponse>
    createDir: (dirPath: string) => Promise<IpcResponse>
    rename: (oldPath: string, newPath: string) => Promise<IpcResponse>
    delete: (targetPath: string) => Promise<IpcResponse>
    reveal: (targetPath: string) => Promise<IpcResponse>
    copyPath: (targetPath: string) => Promise<IpcResponse>
    iconTheme: () => Promise<IpcResponse<RuntimeIconTheme | null>>
  }

  interface DaemonProjects {
    list: () => Promise<IpcResponse<Project[]>>
    create: (project: { name: string; path: string }) => Promise<IpcResponse<Project>>
    delete: (id: string) => Promise<IpcResponse>
    openDialog: () => Promise<IpcResponse<string | null>>
  }

  interface DaemonWallet {
    dashboard: (projectId?: string | null) => Promise<IpcResponse<WalletDashboard>>
    list: () => Promise<IpcResponse<WalletListEntry[]>>
    create: (wallet: { name: string; address: string }) => Promise<IpcResponse<WalletListEntry>>
    delete: (id: string) => Promise<IpcResponse>
    rename: (id: string, name: string) => Promise<IpcResponse>
    setDefault: (id: string) => Promise<IpcResponse>
    assignProject: (projectId: string, walletId: string | null) => Promise<IpcResponse>
    storeHeliusKey: (value: string) => Promise<IpcResponse>
    deleteHeliusKey: () => Promise<IpcResponse>
    hasHeliusKey: () => Promise<IpcResponse<boolean>>
    generate: (input: { name: string; walletType?: string; agentId?: string }) => Promise<IpcResponse<WalletListEntry>>
    sendSol: (input: { fromWalletId: string; toAddress: string; amountSol: number }) => Promise<IpcResponse<{ signature: string }>>
    sendToken: (input: { fromWalletId: string; toAddress: string; mint: string; amount: number }) => Promise<IpcResponse<{ signature: string }>>
    balance: (walletId: string) => Promise<IpcResponse<{ sol: number; lamports: number }>>
    swapQuote: (input: { inputMint: string; outputMint: string; amount: number; slippageBps: number }) => Promise<IpcResponse<{ inputMint: string; outputMint: string; inAmount: string; outAmount: string; priceImpactPct: string; routePlan: Array<{ label: string; percent: number }>; rawQuoteResponse: unknown }>>
    swapExecute: (input: { walletId: string; inputMint: string; outputMint: string; amount: number; slippageBps: number; rawQuoteResponse?: unknown; confirmedAt: number; acknowledgedImpact: boolean }) => Promise<IpcResponse<{ signature: string }>>
    agentWallets: (agentId?: string) => Promise<IpcResponse<Array<{ id: string; name: string; address: string; is_default: number; agent_id: string; wallet_type: string; created_at: number; assigned_project_ids: string[] }>>>
    createAgentWallet: (agentId: string, agentName: string) => Promise<IpcResponse<{ id: string; name: string; address: string; is_default: number; wallet_type: string; agent_id: string | null; created_at: number }>>
    hasKeypair: (walletId: string) => Promise<IpcResponse<boolean>>
    transactionHistory: (walletId: string, limit?: number) => Promise<IpcResponse<Array<{ id: string; wallet_id: string; type: string; signature: string | null; from_address: string; to_address: string; amount: number; mint: string | null; symbol: string | null; status: string; error: string | null; created_at: number }>>>
    exportPrivateKey: (walletId: string) => Promise<IpcResponse<string>>
  }

  interface DaemonPnl {
    syncHistory: (walletAddress?: string) => Promise<IpcResponse<PnlSyncResult>>
    getPortfolio: (walletAddress: string, holdings: Array<{ mint: string; symbol: string; name: string; amount: number; logoUri: string | null }>) => Promise<IpcResponse<PnlPortfolio>>
    getTokenDetail: (walletAddress: string, mint: string) => Promise<IpcResponse<PnlTokenDetail>>
    refreshPrices: (mints: string[]) => Promise<IpcResponse<{ refreshed: number }>>
  }

  interface AppCrashEntry {
    id: string
    type: string
    message: string
    stack: string
    created_at: number
  }

  interface DaemonSettings {
    getUi: () => Promise<IpcResponse<UiSettings>>
    setShowMarketTape: (enabled: boolean) => Promise<IpcResponse>
    setShowTitlebarWallet: (enabled: boolean) => Promise<IpcResponse>
    isOnboardingComplete: () => Promise<IpcResponse<boolean>>
    setOnboardingComplete: (complete: boolean) => Promise<IpcResponse>
    getOnboardingProgress: () => Promise<IpcResponse<OnboardingProgress>>
    setOnboardingProgress: (progress: OnboardingProgress) => Promise<IpcResponse>
    reportCrash: (data: { type: string; message: string; stack: string }) => Promise<IpcResponse>
    getCrashes: () => Promise<IpcResponse<AppCrashEntry[]>>
    clearCrashes: () => Promise<IpcResponse>
    getPinnedTools: () => Promise<IpcResponse<string[]>>
    setPinnedTools: (tools: string[]) => Promise<IpcResponse>
    getDrawerToolOrder: () => Promise<IpcResponse<string[]>>
    setDrawerToolOrder: (order: string[]) => Promise<IpcResponse>
    getWorkspaceProfile: () => Promise<IpcResponse<WorkspaceProfile | null>>
    setWorkspaceProfile: (profile: WorkspaceProfile) => Promise<IpcResponse>
    getLayout: () => Promise<IpcResponse<{ centerMode: string | null; rightPanelTab: string | null }>>
    setLayout: (layout: { centerMode?: string; rightPanelTab?: string }) => Promise<IpcResponse>
    onCrashWarning: (callback: (count: number) => void) => () => void
  }

  interface DaemonAgents {
    list: () => Promise<IpcResponse<Agent[]>>
    claudeList: () => Promise<IpcResponse<ClaudeAgentFile[]>>
    importClaude: (filePath: string) => Promise<IpcResponse<Agent>>
    syncClaude: (filePath: string) => Promise<IpcResponse<Agent>>
    create: (agent: { name: string; systemPrompt: string; model: string; mcps: string[]; provider?: string; shortcut?: string; source?: string; externalPath?: string | null }) => Promise<IpcResponse<Agent>>
    update: (id: string, data: Record<string, unknown>) => Promise<IpcResponse<Agent>>
    delete: (id: string) => Promise<IpcResponse>
  }

  interface DaemonClaude {
    projectMcpAll: (projectPath: string) => Promise<IpcResponse<McpEntry[]>>
    projectMcpToggle: (projectPath: string, name: string, enabled: boolean) => Promise<IpcResponse>
    globalMcpAll: () => Promise<IpcResponse<McpEntry[]>>
    globalMcpToggle: (name: string, enabled: boolean) => Promise<IpcResponse>
    skills: () => Promise<IpcResponse<SkillEntry[]>>
    restartSession: (terminalId: string) => Promise<IpcResponse<{ id: string }>>
    restartAllSessions: () => Promise<IpcResponse<{ restarted: number; total: number }>>
    status: () => Promise<IpcResponse<AnthropicStatus>>
    usage: (projectPath?: string) => Promise<IpcResponse<SessionUsage>>
    storeKey: (name: string, value: string) => Promise<IpcResponse>
    listKeys: () => Promise<IpcResponse<SecureKeyEntry[]>>
    deleteKey: (name: string) => Promise<IpcResponse>
    claudeMdRead: (projectPath: string) => Promise<IpcResponse<ClaudeMdData>>
    claudeMdGenerate: (projectPath: string) => Promise<IpcResponse<string>>
    claudeMdWrite: (projectPath: string, content: string) => Promise<IpcResponse>
    verifyConnection: () => Promise<IpcResponse<ClaudeConnection>>
    getConnection: () => Promise<IpcResponse<ClaudeConnection | null>>
    installCli: () => Promise<IpcResponse<{ stdout: string; stderr: string }>>
    authLogin: () => Promise<IpcResponse<{ success: boolean }>>
    disconnect: () => Promise<IpcResponse<{ disconnected: boolean }>>
    suggestCommitMessage: (diff: string) => Promise<IpcResponse<string>>
    tidyMarkdown: (filePath: string, content: string) => Promise<IpcResponse<string>>
    mcpAdd: (mcp: { name: string; config: string; description: string; isGlobal: boolean }) => Promise<IpcResponse>
  }

  interface DaemonDeploy {
    authStatus: () => Promise<IpcResponse<DeployAuthStatus>>
    connectVercel: (token: string) => Promise<IpcResponse<{ name: string; email: string }>>
    connectRailway: (token: string) => Promise<IpcResponse<{ name: string; email: string }>>
    disconnect: (platform: DeployPlatform) => Promise<IpcResponse>
    vercelProjects: (teamId?: string) => Promise<IpcResponse<unknown[]>>
    railwayProjects: () => Promise<IpcResponse<unknown[]>>
    link: (projectId: string, platform: DeployPlatform, linkData: VercelLink | RailwayLink) => Promise<IpcResponse>
    unlink: (projectId: string, platform: DeployPlatform) => Promise<IpcResponse>
    status: (projectId: string) => Promise<IpcResponse<DeployStatus[]>>
    deployments: (projectId: string, platform: DeployPlatform, limit?: number) => Promise<IpcResponse<DeploymentEntry[]>>
    redeploy: (projectId: string, platform: DeployPlatform) => Promise<IpcResponse>
    envVars: (projectId: string, platform: DeployPlatform) => Promise<IpcResponse<unknown>>
    autoDetect: (projectPath: string) => Promise<IpcResponse<Record<string, unknown[]>>>
  }

  interface DaemonShell {
    openExternal: (url: string) => Promise<void>
  }

  interface DaemonPumpFun {
    bondingCurve: (mint: string) => Promise<IpcResponse<{
      mint: string
      currentPriceLamports: string
      marketCapLamports: string
      graduationBps: number
      virtualSolReserves: string
      virtualTokenReserves: string
      realTokenReserves: string
      realSolReserves: string
      isGraduated: boolean
    }>>
    createToken: (input: object) => Promise<IpcResponse<{ signature: string; success: boolean }>>
    buy: (input: object) => Promise<IpcResponse<{ signature: string; success: boolean }>>
    sell: (input: object) => Promise<IpcResponse<{ signature: string; success: boolean }>>
    collectFees: (walletId: string) => Promise<IpcResponse<{ signature: string; success: boolean }>>
    pickImage: () => Promise<IpcResponse<string | null>>
    hasKeypair: (walletId: string) => Promise<IpcResponse<boolean>>
    importKeypair: (walletId: string) => Promise<IpcResponse<boolean>>
  }

  interface DaemonTweets {
    generate: (prompt: string, mode: string, sourceTweet?: string) => Promise<IpcResponse<{ tweets: Tweet[]; draftPath: string }>>
    list: (limit?: number) => Promise<IpcResponse<Tweet[]>>
    update: (id: string, updates: { content?: string; status?: string }) => Promise<IpcResponse<Tweet>>
    delete: (id: string) => Promise<IpcResponse>
    voiceGet: () => Promise<IpcResponse<VoiceProfile | null>>
    voiceUpdate: (systemPrompt: string, examples: string[]) => Promise<IpcResponse>
  }

  interface DaemonImages {
    generate: (input: { prompt: string; model: string; aspectRatio: string; projectId?: string; tags?: string[] }) => Promise<IpcResponse<ImageRecord>>
    list: (filter?: { projectId?: string; source?: string; model?: string; limit?: number; offset?: number }) => Promise<IpcResponse<ImageRecord[]>>
    get: (id: string) => Promise<IpcResponse<ImageRecord | null>>
    delete: (id: string) => Promise<IpcResponse>
    updateTags: (id: string, tags: string[]) => Promise<IpcResponse<ImageRecord>>
    getBase64: (id: string) => Promise<IpcResponse<{ data: string; mimeType: string }>>
    importFile: () => Promise<IpcResponse<ImageRecord | null>>
    reveal: (id: string) => Promise<IpcResponse>
    startWatcher: () => Promise<IpcResponse>
    stopWatcher: () => Promise<IpcResponse>
    watcherStatus: () => Promise<IpcResponse<boolean>>
    hasApiKey: () => Promise<IpcResponse<boolean>>
    onWatcherNew: (callback: (payload: { id: string; filename: string; source: string }) => void) => () => void
  }

  interface DaemonEmail {
    accounts: () => Promise<IpcResponse<EmailAccount[]>>
    hasGmailCreds: () => Promise<IpcResponse<boolean>>
    storeGmailCreds: (clientId: string, clientSecret: string) => Promise<IpcResponse<void>>
    addGmail: (clientId?: string, clientSecret?: string) => Promise<IpcResponse<EmailAccount>>
    addICloud: (email: string, appPassword: string) => Promise<IpcResponse<EmailAccount>>
    remove: (accountId: string) => Promise<IpcResponse<void>>
    messages: (accountId: string, query?: string, max?: number) => Promise<IpcResponse<EmailMessage[]>>
    read: (accountId: string, messageId: string) => Promise<IpcResponse<EmailMessage>>
    send: (accountId: string, to: string, subject: string, body: string, cc?: string, bcc?: string) => Promise<IpcResponse<{ messageId: string }>>
    markRead: (accountId: string, messageIds: string[]) => Promise<IpcResponse<void>>
    markAllRead: (accountId?: string) => Promise<IpcResponse<{ count: number }>>
    extract: (accountId: string, messageId: string) => Promise<IpcResponse<ExtractionResult>>
    summarize: (accountId: string, messageId: string) => Promise<IpcResponse<{ summary: string }>>
    sync: (accountId: string) => Promise<IpcResponse<void>>
    unreadCounts: () => Promise<IpcResponse<Record<string, number>>>
    settings: (accountId: string, settings: string) => Promise<IpcResponse<void>>
  }

  interface DaemonPlugins {
    list: () => Promise<IpcResponse<PluginRow[]>>
    setEnabled: (id: string, enabled: boolean) => Promise<IpcResponse<void>>
    setConfig: (id: string, config: string) => Promise<IpcResponse<void>>
    reorder: (orderedIds: string[]) => Promise<IpcResponse<void>>
  }

  interface DaemonRecovery {
    importCsv: () => Promise<IpcResponse<{ count: number; path: string } | null>>
    scan: () => Promise<IpcResponse<RecoveryWalletInfo[]>>
    execute: (masterAddress: string) => Promise<IpcResponse<{ totalRecovered: number }>>
    status: () => Promise<IpcResponse<RecoveryStatus>>
    stop: () => Promise<IpcResponse>
    onProgress: (callback: (event: RecoveryProgressEvent) => void) => () => void
  }

  interface ToolRow {
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

  interface DaemonTools {
    list: () => Promise<IpcResponse<ToolRow[]>>
    get: (id: string) => Promise<IpcResponse<ToolRow>>
    create: (input: { name: string; description?: string; category: string; language: string }) => Promise<IpcResponse<ToolRow>>
    delete: (id: string, deleteFiles: boolean) => Promise<IpcResponse>
    runCommand: (id: string) => Promise<IpcResponse<{ command: string; args: string[]; cwd: string; toolId: string }>>
    markRunning: (id: string, terminalId: string, pid: number) => Promise<IpcResponse>
    markStopped: (toolId: string) => Promise<IpcResponse>
    update: (id: string, data: Record<string, unknown>) => Promise<IpcResponse>
    discover: () => Promise<IpcResponse>
    status: (id: string) => Promise<IpcResponse>
    basePath: () => Promise<IpcResponse<string>>
    openFolder: (id: string) => Promise<IpcResponse>
    import: () => Promise<IpcResponse<ToolRow | null>>
  }

  interface DaemonEngine {
    run: (action: { type: string; projectId?: string; payload?: Record<string, unknown> }) => Promise<IpcResponse<{ ok: boolean; action: string; output?: string; artifacts?: Record<string, string>; error?: string }>>
    context: () => Promise<IpcResponse<{ projects: Array<{ id: string; name: string; path: string; status: string; hasClaudeMd: boolean; gitBranch: string | null; activeSessions: number }>; activeAgents: Array<{ id: string; name: string; projectId: string | null }>; recentErrors: unknown[]; portMap: unknown[]; userProfile: Record<string, string> }>>
    fixClaudeMd: (projectId: string) => Promise<IpcResponse<{ ok: boolean; action: string; output?: string; artifacts?: Record<string, string> }>>
    generateClaudeMd: (projectId: string) => Promise<IpcResponse<{ ok: boolean; action: string; output?: string; artifacts?: Record<string, string> }>>
    debugSetup: (projectId: string, question?: string) => Promise<IpcResponse<{ ok: boolean; action: string; output?: string }>>
    healthCheck: () => Promise<IpcResponse<{ ok: boolean; action: string; output?: string }>>
    explainError: (error: string, projectId?: string) => Promise<IpcResponse<{ ok: boolean; action: string; output?: string }>>
    ask: (question: string, projectId?: string) => Promise<IpcResponse<{ ok: boolean; action: string; output?: string }>>
  }

  interface DaemonAria {
    send: (sessionId: string, message: string) => Promise<IpcResponse<AriaResponse>>
    history: (sessionId: string, limit?: number) => Promise<IpcResponse<AriaMessage[]>>
    clear: (sessionId: string) => Promise<IpcResponse<void>>
  }

  interface LaunchedToken {
    id: string
    project_id: string | null
    wallet_id: string
    mint: string
    name: string
    symbol: string
    image_uri: string | null
    metadata_uri: string | null
    launchpad: string
    pool_address: string | null
    create_signature: string | null
    initial_buy_sol: number | null
    status: string
    created_at: number
  }

  interface DaemonLaunch {
    saveToken: (input: {
      walletId: string
      projectId?: string
      mint: string
      name: string
      symbol: string
      imagePath?: string
      metadataUri?: string
      launchpad?: string
      createSignature?: string
      initialBuySol?: number
    }) => Promise<IpcResponse<{ id: string }>>
    listTokens: (walletId?: string) => Promise<IpcResponse<LaunchedToken[]>>
    getToken: (idOrMint: string) => Promise<IpcResponse<LaunchedToken | null>>
  }

  interface LocalAgentSession {
    id: string
    project_id: string | null
    agent_id: string | null
    agent_name: string | null
    model: string | null
    started_at: number
    ended_at: number | null
    status: 'active' | 'completed' | 'cancelled'
    lines_generated: number
    tools_used: string[]
    published_signature: string | null
    created_at: number
    terminal_id: string | null
    custom_name: string | null
  }

  interface AgentSessionProfile {
    totalSessions: number
    totalDuration: number
    totalAgentsSpawned: number
    projectsCount: number
    unpublishedCount: number
  }

  interface DaemonRegistry {
    listSessions: (limit?: number) => Promise<IpcResponse<LocalAgentSession[]>>
    getProfile: () => Promise<IpcResponse<AgentSessionProfile>>
    publishSession: (sessionId: string) => Promise<IpcResponse<{ startSignature: string; endSignature: string }>>
    publishAll: () => Promise<IpcResponse<{ published: number; failed: number }>>
    renameSession: (sessionId: string, name: string) => Promise<IpcResponse<null>>
  }

  interface ColosseumProject {
    slug: string
    name: string
    oneLiner: string
    similarity: number
    hackathon: { name: string; slug: string; startDate: string }
    tracks: Array<{ name: string; key: string }>
    prize: { type: string; name: string; amount: number | null } | null
    tags: { problemTags: string[]; solutionTags: string[]; techStack: string[] }
  }

  interface DaemonColosseum {
    status: () => Promise<IpcResponse<{ authenticated: boolean; expiresAt: string }>>
    searchProjects: (query: string, limit?: number, filters?: object) => Promise<IpcResponse<{ results: ColosseumProject[]; totalFound: number }>>
    searchArchives: (query: string, limit?: number) => Promise<IpcResponse<{ results: Array<{ title: string; snippet: string; source: string }> }>>
    projectDetail: (slug: string) => Promise<IpcResponse<unknown>>
    filters: () => Promise<IpcResponse<{ hackathons: Array<{ name: string; slug: string; startDate: string }> }>>
    storePat: (pat: string) => Promise<IpcResponse>
    isConfigured: () => Promise<IpcResponse<boolean>>
  }

  interface DaemonCodex {
    verifyConnection: () => Promise<IpcResponse<CodexConnection>>
    getConnection: () => Promise<IpcResponse<CodexConnection | null>>
    mcpAll: () => Promise<IpcResponse<Array<{ name: string; config: { command: string; args?: string[]; env?: Record<string, string> }; enabled: boolean; source: string }>>>
    mcpToggle: (name: string, enabled: boolean) => Promise<IpcResponse>
    mcpAdd: (name: string, command: string, args?: string[], env?: Record<string, string>) => Promise<IpcResponse>
    restartSession: (terminalId: string) => Promise<IpcResponse<{ id: string }>>
    restartAllSessions: () => Promise<IpcResponse<{ restarted: number; total: number }>>
    storeKey: (name: string, value: string) => Promise<IpcResponse>
    agentsMdRead: (projectPath: string) => Promise<IpcResponse<{ content: string; diff: string }>>
    agentsMdWrite: (projectPath: string, content: string) => Promise<IpcResponse>
    installCli: () => Promise<IpcResponse<{ stdout: string; stderr: string }>>
    logout: () => Promise<IpcResponse<{ removedAuthFile: boolean }>>
    getModel: () => Promise<IpcResponse<string>>
    getReasoningEffort: () => Promise<IpcResponse<string>>
  }

  interface ProviderConnectionMap {
    claude: { providerId: 'claude'; cliPath: string; hasApiKey: boolean; isAuthenticated: boolean; authMode: string } | null
    codex: { providerId: 'codex'; cliPath: string; hasApiKey: boolean; isAuthenticated: boolean; authMode: string } | null
  }

  interface DaemonProvider {
    verifyAll: () => Promise<IpcResponse<ProviderConnectionMap>>
    getAllConnections: () => Promise<IpcResponse<ProviderConnectionMap>>
    getDefault: () => Promise<IpcResponse<string>>
    setDefault: (id: string) => Promise<IpcResponse<{ defaultProvider: string }>>
  }

  interface DaemonActivityEntry {
    id: string
    kind: 'info' | 'success' | 'warning' | 'error'
    message: string
    context: string | null
    createdAt: number
  }

  interface DaemonActivity {
    append: (entry: DaemonActivityEntry) => Promise<IpcResponse<void>>
    list: (limit?: number) => Promise<IpcResponse<DaemonActivityEntry[]>>
    clear: () => Promise<IpcResponse<void>>
  }

  type DaemonEventChannel = 'auth:changed' | 'process:changed' | 'port:changed' | 'wallet:changed'

  interface DaemonEvents {
    on: (channel: DaemonEventChannel, callback: (payload: unknown) => void) => () => void
  }

  interface DaemonAPI {
    window: DaemonWindow
    terminal: DaemonTerminal
    tools: DaemonTools
    engine: DaemonEngine
    env: DaemonEnv
    process: DaemonProcess
    ports: DaemonPorts
    wallet: DaemonWallet
    settings: DaemonSettings
    fs: DaemonFs
    git: DaemonGit
    projects: DaemonProjects
    agents: DaemonAgents
    claude: DaemonClaude
    codex: DaemonCodex
    provider: DaemonProvider
    activity: DaemonActivity
    events: DaemonEvents
    tweets: DaemonTweets
    plugins: DaemonPlugins
    browser: DaemonBrowser
    recovery: DaemonRecovery
    deploy: DaemonDeploy
    shell: DaemonShell
    pumpfun: DaemonPumpFun
    email: DaemonEmail
    images: DaemonImages
    aria: DaemonAria
    launch: DaemonLaunch
    dashboard: DaemonDashboard
    registry: DaemonRegistry
    colosseum: DaemonColosseum
    vault: DaemonVault
    validator: DaemonValidator
    pnl: DaemonPnl
    feedback: DaemonFeedback
  }

  interface DaemonFeedback {
    submit: (input: {
      title: string
      description: string
      activePanel?: string
      logs?: string
    }) => Promise<IpcResponse<{ number?: number; url?: string }>>
    openUrl: (url: string) => Promise<IpcResponse<{ ok: boolean }>>
  }

  interface VaultFileMeta {
    id: string
    name: string
    file_type: string
    size_bytes: number
    owner_wallet: string | null
    created_at: number
  }

  interface VaultFileImport {
    name: string
    data: string
    fileType: string
    size: number
  }

  interface DaemonValidator {
    start: (type: string) => Promise<IpcResponse<{ terminalId: string; port: number }>>
    stop: () => Promise<IpcResponse<{ stopped: boolean }>>
    status: () => Promise<IpcResponse<{ type: string | null; status: string; terminalId: string | null; port: number | null }>>
    detect: () => Promise<IpcResponse<{ surfpool: boolean; testValidator: boolean }>>
    detectProject: (projectPath: string) => Promise<IpcResponse<{ isSolanaProject: boolean; framework: string | null; indicators: string[]; suggestedMcps: string[] }>>
    onStatusChange: (callback: (state: unknown) => void) => () => void
  }

  interface DaemonVault {
    list: () => Promise<IpcResponse<VaultFileMeta[]>>
    get: (id: string) => Promise<IpcResponse<VaultFileMeta | null>>
    store: (opts: { name: string; data: string; fileType: string; ownerWallet?: string }) => Promise<IpcResponse<VaultFileMeta>>
    retrieve: (id: string) => Promise<IpcResponse<{ name: string; data: string; file_type: string }>>
    delete: (id: string) => Promise<IpcResponse>
    setOwner: (id: string, ownerWallet: string | null) => Promise<IpcResponse>
    importFile: () => Promise<IpcResponse<VaultFileImport | null>>
  }

  interface DetectedToken {
    mint: string
    name: string
    symbol: string
    image: string | null
    decimals: number
    supply: number
  }

  interface DaemonDashboard {
    tokenPrice: (mint: string) => Promise<IpcResponse<{ price: number; priceChange24h: number | null }>>
    tokenMetadata: (mint: string) => Promise<IpcResponse<{ name: string; symbol: string; image: string | null; supply: number; decimals: number }>>
    tokenHolders: (mint: string) => Promise<IpcResponse<{ count: number; topHolders: Array<{ address: string; amount: number }> }>>
    detectTokens: (walletAddress: string) => Promise<IpcResponse<DetectedToken[]>>
    importToken: (mint: string, walletId: string) => Promise<IpcResponse<{ id: string; alreadyExists: boolean }>>
  }

  interface DaemonBrowser {
    navigate: (url: string) => Promise<IpcResponse<{ pageId: string; url: string; title: string; status: number; contentLength: number }>>
    capture: (pageId: string, url: string, title: string, content: string) => Promise<IpcResponse<void>>
    content: (pageId: string) => Promise<IpcResponse<{ id: string; url: string; title: string; content: string; timestamp: number }>>
    analyze: (pageId: string, type: string, target?: string) => Promise<IpcResponse<{ url: string; summary: string; findings: string[]; type: string }>>
    audit: (pageId: string) => Promise<IpcResponse<{ url: string; summary: string; findings: string[]; type: string }>>
    history: () => Promise<IpcResponse<Array<{ id: string; url: string; title: string; timestamp: number }>>>
    clear: () => Promise<IpcResponse<void>>
    chat: (sessionId: string, message: string, browserContext?: string) => Promise<IpcResponse<{ text: string; navigateUrl: string | null }>>
    chatReset: (sessionId: string) => Promise<IpcResponse<void>>
  }

  interface Window {
    daemon: DaemonAPI
  }
}
