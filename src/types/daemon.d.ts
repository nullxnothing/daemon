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
  MoonpayKeysInput,
  MoonpayOnrampInput,
  MoonpayOnrampResult,
  MoonpayStatus,
  ForensicsBlacklistResult,
  ForensicsExpandInput,
  ForensicsExpandResult,
  ForensicsHolderPollResult,
  ForensicsScanInput,
  ForensicsScanResult,
  ForensicsGraphData,
  ForensicsGraphNode,
  RicoMapsEmbedStatus,
  SaidIdentity,
  SaidTrustScore,
  SynapseSapAgent,
  SynapseSapCluster,
  SynapseSapDiscoveryInput,
  SynapseSapDiscoveryResult,
  SynapseSapRegisterInput,
  SynapseSapRegisterResult,
  SynapseSapStatus,
  AllowanceState,
  SubscriptionEnrollment,
  SignalhouseHealth,
  SignalhouseStatus,
  SignalhouseStrategy,
  SignalhouseStrategyDetail,
  SignalhouseEquityPoint,
  SignalhouseVerdict,
  SignalhousePosition,
  FlywheelConfig,
  FlywheelConfigureInput,
  FlywheelPreview,
  FlywheelState,
  JupiterTokenSearchResult,
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
  ExternalSolTransferDraft,
  SubmitExternalSignedTransactionInput,
  TransferSOLInput,
  TransferTokenInput,
  SolanaTransactionPreview,
  SolanaTransactionPreviewInput,
  AgentWorkCreateInput,
  AgentWorkSubmitInput,
  AgentWorkTask,
  McpAddInput,
  DeployPlatform,
  DeployAuthStatus,
  DeployStatus,
  DeploymentEntry,
  ShiplineCreateRunInput,
  ShiplineRun,
  ShiplineUpdateStepInput,
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
  AriaSession,
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
  ReplayTrace,
  ReplayProgramSummary,
  ReplayContextHandoff,
  ReplayAgentHandoff,
  ReplayVerificationResult,
  LspCompletionResult,
  LspDiagnosticEvent,
  LspDocumentInput,
  LspDocumentSyncResult,
  LspHoverResult,
  LspLocation,
  LspPosition,
  LspServerStatus,
  DaemonAiChatRequest,
  DaemonAiChatResponse,
  DaemonAiFeatureState,
  DaemonAiAgentRun,
  DaemonAiAgentRunInput,
  DaemonAiModelInfo,
  DaemonAiPatchApplyInput,
  DaemonAiPatchApplyResult,
  DaemonAiPatchDecisionInput,
  DaemonAiPatchProposal,
  DaemonAiPatchProposalInput,
  DaemonAiToolApprovalDecisionInput,
  DaemonAiToolApprovalRequest,
  DaemonAiToolCallInput,
  DaemonAiUsageSnapshot,
  MeterflowAgentSession,
  MeterflowBudget,
  MeterflowCsvExport,
  MeterflowDemoWallet,
  MeterflowMeter,
  MeterflowOverview,
  MeterflowPaidAgentReadinessInput,
  MeterflowPaidAgentReadinessResult,
  MeterflowReceipt,
  MeterflowReceiptDetail,
  MeterflowReceiptGraph,
  MeterflowReceiptsQuery,
  MeterflowRevenueRow,
  MeterflowStatus,
  MeterflowWalletReadiness,
  MeterflowWatchProjectResult,
  MeterflowWebhook,
  VoightPrivacyLevel,
  VoightStatus,
  VoightTestResult,
  ProjectMemory,
  MemoryStatus,
  MemoryKind,
  MemorySuggestionInput,
  MemoryUpdateInput,
  MemoryContextBundle,
  CheckDefinition,
  CheckResult,
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
  MoonpayKeysInput,
  MoonpayOnrampInput,
  MoonpayOnrampResult,
  MoonpayStatus,
  ForensicsBlacklistResult,
  ForensicsExpandInput,
  ForensicsExpandResult,
  ForensicsHolderPollResult,
  ForensicsScanInput,
  ForensicsScanResult,
  ForensicsGraphData,
  ForensicsGraphNode,
  RicoMapsEmbedStatus,
  SaidIdentity,
  SaidTrustScore,
  SynapseSapAgent,
  SynapseSapCluster,
  SynapseSapDiscoveryInput,
  SynapseSapDiscoveryResult,
  SynapseSapRegisterInput,
  SynapseSapRegisterResult,
  SynapseSapStatus,
  AllowanceState,
  SubscriptionEnrollment,
  SignalhouseHealth,
  SignalhouseStatus,
  SignalhouseStrategy,
  SignalhouseStrategyDetail,
  SignalhouseEquityPoint,
  SignalhouseVerdict,
  SignalhousePosition,
  FlywheelConfig,
  FlywheelConfigureInput,
  FlywheelPreview,
  FlywheelState,
  JupiterTokenSearchResult,
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
  ExternalSolTransferDraft,
  SubmitExternalSignedTransactionInput,
  TransferSOLInput,
  TransferTokenInput,
  SolanaTransactionPreview,
  SolanaTransactionPreviewInput,
  AgentWorkCreateInput,
  AgentWorkSubmitInput,
  AgentWorkTask,
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
  AriaSession,
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
  LspCompletionResult,
  LspDiagnosticEvent,
  LspDocumentInput,
  LspDocumentSyncResult,
  LspHoverResult,
  LspLocation,
  LspPosition,
  LspServerStatus,
  DaemonAiChatRequest,
  DaemonAiChatResponse,
  DaemonAiFeatureState,
  DaemonAiAgentRun,
  DaemonAiAgentRunInput,
  DaemonAiModelInfo,
  DaemonAiPatchApplyInput,
  DaemonAiPatchApplyResult,
  DaemonAiPatchDecisionInput,
  DaemonAiPatchProposal,
  DaemonAiPatchProposalInput,
  DaemonAiToolApprovalDecisionInput,
  DaemonAiToolApprovalRequest,
  DaemonAiToolCallInput,
  DaemonAiUsageSnapshot,
  MeterflowAgentSession,
  MeterflowBudget,
  MeterflowCsvExport,
  MeterflowDemoWallet,
  MeterflowMeter,
  MeterflowOverview,
  MeterflowPaidAgentReadinessInput,
  MeterflowPaidAgentReadinessResult,
  MeterflowReceipt,
  MeterflowReceiptDetail,
  MeterflowReceiptGraph,
  MeterflowReceiptsQuery,
  MeterflowRevenueRow,
  MeterflowStatus,
  MeterflowWalletReadiness,
  MeterflowWatchProjectResult,
  MeterflowWebhook,
  VoightPrivacyLevel,
  VoightStatus,
  VoightTestResult,
}

declare global {
  type LaunchWalletOption = {
    id: string
    name: string
    address: string
    isDefault: boolean
    walletType: string
    ecosystemRole: 'daemon-deployer' | null
    hasKeypair: boolean
    isAssignedToActiveProject: boolean
    assignedProjectIds: string[]
  }

  type TokenLaunchSettings = {
    raydium: {
      configId: string
      quoteMint: string
    }
    meteora: {
      configId: string
      quoteMint: string
      baseSupply: string
    }
    printr: {
      apiBaseUrl: string
      apiKey: string
      apiKeyConfigured?: boolean
      apiKeyHint?: string
      apiKeySource?: 'secure' | 'env' | 'none'
      apiKeyAction?: 'keep' | 'replace' | 'clear'
      quotePath: string
      createPath: string
      chain: string
    }
    openbid: {
      apiBaseUrl: string
      chainId: string
      dex: 'meteora' | 'raydium' | ''
      feeTier: string
      packageType: 'based' | 'super_based' | 'ultra_based' | ''
      marketCap: string
      totalSupply: string
      maxAllocationPerUser: string
      referrer: string
      board: string
      boardOwner: string
    }
  }

  type OpenBidLaunchInputConfig = {
    chain?: 'solana'
    apiBaseUrl?: string
    chainId?: string
    dex?: 'meteora' | 'raydium' | ''
    feeTier?: string
    packageType?: 'based' | 'super_based' | 'ultra_based' | ''
    marketCap?: string
    totalSupply?: string
    maxAllocationPerUser?: string
    initialBuyPercent?: number
    referrer?: string
    board?: string
    boardOwner?: string
    saleStartTime?: number | null
    softCap?: string
    endTime?: number | null
    whitelistedAddresses?: string[]
    buyFeePercent?: number
    sellFeePercent?: number
    referralFeePercent?: number
    graduationFeePercent?: number
    dynamicFee?: boolean
  }

  type WalletInfrastructureSettings = {
    cluster: 'devnet' | 'mainnet-beta' | 'localnet'
    rpcProvider: 'helius' | 'public' | 'quicknode' | 'custom'
    quicknodeRpcUrl: string
    customRpcUrl: string
    swapProvider: 'jupiter'
    preferredWallet: 'phantom' | 'solflare' | 'wallet-standard'
    executionMode: 'rpc' | 'jito'
    jitoBlockEngineUrl: string
  }

  type WalletExecutionResult = {
    id?: string
    status?: 'confirmed'
    signature: string
    transport: 'rpc' | 'jito' | 'jupiter'
  }

  type SolanaTransactionPreviewInput = import('../../electron/shared/types').SolanaTransactionPreviewInput
  type SolanaTransactionPreview = import('../../electron/shared/types').SolanaTransactionPreview
  type AgentWorkCreateInput = import('../../electron/shared/types').AgentWorkCreateInput
  type AgentWorkSubmitInput = import('../../electron/shared/types').AgentWorkSubmitInput
  type AgentWorkTask = import('../../electron/shared/types').AgentWorkTask

  type SolanaRuntimeStatusLevel = 'live' | 'partial' | 'setup'

  type SolanaExecutionCoverageItem = {
    id: 'wallet-sends' | 'jupiter-swaps' | 'launch-adapters' | 'pumpfun' | 'recovery'
    label: string
    status: SolanaRuntimeStatusLevel
    detail: string
  }

  type SolanaRuntimeStatusSummary = {
    cluster: 'devnet' | 'mainnet-beta' | 'localnet'
    rpc: {
      label: string
      detail: string
      status: SolanaRuntimeStatusLevel
    }
    walletPath: {
      label: string
      detail: string
      status: SolanaRuntimeStatusLevel
    }
    swapEngine: {
      label: string
      detail: string
      status: SolanaRuntimeStatusLevel
    }
    executionBackend: {
      label: string
      detail: string
      status: SolanaRuntimeStatusLevel
    }
    executionCoverage: SolanaExecutionCoverageItem[]
    troubleshooting: string[]
  }

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
  type MoonpayKeysInput = import('../../electron/shared/types').MoonpayKeysInput
  type MoonpayOnrampInput = import('../../electron/shared/types').MoonpayOnrampInput
  type MoonpayOnrampResult = import('../../electron/shared/types').MoonpayOnrampResult
  type MoonpayStatus = import('../../electron/shared/types').MoonpayStatus
  type JupiterTokenSearchResult = import('../../electron/shared/types').JupiterTokenSearchResult
  type MarketTickerEntry = import('../../electron/shared/types').MarketTickerEntry
  type ClaudeMdData = import('../../electron/shared/types').ClaudeMdData
  type ClaudeConnection = import('../../electron/shared/types').ClaudeConnection
  type PluginRow = import('../../electron/shared/types').PluginRow
  type PluginCreateInput = import('../../electron/shared/types').PluginCreateInput
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
  type ShiplineCreateRunInput = import('../../electron/shared/types').ShiplineCreateRunInput
  type ShiplineRun = import('../../electron/shared/types').ShiplineRun
  type ShiplineUpdateStepInput = import('../../electron/shared/types').ShiplineUpdateStepInput
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
  type AriaContextSnapshot = import('../../electron/shared/types').AriaContextSnapshot
  type AriaToolEvent = import('../../electron/shared/types').AriaToolEvent
  type AriaToolCallRecord = import('../../electron/shared/types').AriaToolCallRecord
  type AriaUiEffectPayload = import('../../electron/shared/types').AriaUiEffect
  type AriaPlanStep = import('../../electron/shared/types').AriaPlanStep
  type AriaPatchProposalLite = import('../../electron/shared/types').AriaPatchProposalLite
  type AriaPatchAction = import('../../electron/shared/types').AriaPatchAction
  type DaemonAiModelLane = import('../../electron/shared/types').DaemonAiModelLane
  type OnboardingProgress = import('../../electron/shared/types').OnboardingProgress
  type OnboardingStepStatus = import('../../electron/shared/types').OnboardingStepStatus
  type WorkspaceProfile = import('../../electron/shared/types').WorkspaceProfile
  type WorkspaceProfileName = import('../../electron/shared/types').WorkspaceProfileName
  type ProSubscriptionState = import('../../electron/shared/types').ProSubscriptionState
  type ProPriceInfo = import('../../electron/shared/types').ProPriceInfo
  type ArenaSubmission = import('../../electron/shared/types').ArenaSubmission
  type ArenaSubmissionInput = import('../../electron/shared/types').ArenaSubmissionInput
  type ProSkillManifest = import('../../electron/shared/types').ProSkillManifest
  type DaemonAiChatRequest = import('../../electron/shared/types').DaemonAiChatRequest
  type DaemonAiChatResponse = import('../../electron/shared/types').DaemonAiChatResponse
  type DaemonAiFeatureState = import('../../electron/shared/types').DaemonAiFeatureState
  type DaemonAiAgentRun = import('../../electron/shared/types').DaemonAiAgentRun
  type DaemonAiAgentRunInput = import('../../electron/shared/types').DaemonAiAgentRunInput
  type DaemonAiModelInfo = import('../../electron/shared/types').DaemonAiModelInfo
  type DaemonAiPatchApplyInput = import('../../electron/shared/types').DaemonAiPatchApplyInput
  type DaemonAiPatchApplyResult = import('../../electron/shared/types').DaemonAiPatchApplyResult
  type DaemonAiPatchDecisionInput = import('../../electron/shared/types').DaemonAiPatchDecisionInput
  type DaemonAiPatchProposal = import('../../electron/shared/types').DaemonAiPatchProposal
  type DaemonAiPatchProposalInput = import('../../electron/shared/types').DaemonAiPatchProposalInput
  type DaemonAiToolApprovalDecisionInput = import('../../electron/shared/types').DaemonAiToolApprovalDecisionInput
  type DaemonAiToolApprovalRequest = import('../../electron/shared/types').DaemonAiToolApprovalRequest
  type DaemonAiToolCallInput = import('../../electron/shared/types').DaemonAiToolCallInput
  type DaemonAiUsageSnapshot = import('../../electron/shared/types').DaemonAiUsageSnapshot
  type SeekerApprovalRequest = import('../../electron/services/SeekerRelayService').SeekerApprovalRequest
  type SeekerApprovalStatus = import('../../electron/services/SeekerRelayService').SeekerApprovalStatus
  type SeekerProjectSnapshot = import('../../electron/services/SeekerRelayService').SeekerProjectSnapshot
  type SeekerRelayStatus = import('../../electron/services/SeekerRelayService').SeekerRelayStatus

  interface SeekerSessionSnapshot {
    session: {
      id: string
      pairingCode: string
      relayUrl: string
      deepLink: string
      projectName: string
      status: 'pairing' | 'paired' | 'expired'
      expiresAt: number
      pairedAt: number | null
      pairedDevice: string | null
    }
    project: SeekerProjectSnapshot
    approvals: SeekerApprovalRequest[]
    events: Array<{ type: string; payload?: Record<string, unknown>; receivedAt?: number }>
  }

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
    spawnAgent: (opts: { agentId: string; projectId: string; initialPrompt?: string }) => Promise<IpcResponse<{ id: string; pid: number; agentId: string; agentName: string; localSessionId?: string | null }>>
    spawnProvider: (opts: { providerId: 'claude' | 'codex' | 'spettro'; projectId?: string; cwd?: string; initialPrompt?: string }) => Promise<IpcResponse<{ id: string; pid: number; agentId: string | null; agentName?: string }>>
    ready: (id: string, cols?: number, rows?: number) => void
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
    diffStaged: (cwd: string, filePath?: string) => Promise<IpcResponse<string>>
    checkout: (cwd: string, branch: string) => Promise<IpcResponse>
    createBranch: (cwd: string, branchName: string) => Promise<IpcResponse<{ branch: string }>>
    fetch: (cwd: string) => Promise<IpcResponse>
    pull: (cwd: string) => Promise<IpcResponse>
    createTag: (cwd: string, tagName: string) => Promise<IpcResponse<{ tag: string }>>
    stashSave: (cwd: string, message?: string) => Promise<IpcResponse<{ message: string }>>
    stashPop: (cwd: string) => Promise<IpcResponse>
    stashList: (cwd: string) => Promise<IpcResponse<Array<{ hash: string; message: string }>>>
    discard: (cwd: string, filePath: string) => Promise<IpcResponse>
    worktreeAdd: (cwd: string, worktreePath: string, branch: string, base?: string) => Promise<IpcResponse<{ worktreePath: string; branch: string }>>
    worktreeList: (cwd: string) => Promise<IpcResponse<Array<{ path: string; branch: string | null; head: string | null }>>>
    worktreeRemove: (cwd: string, worktreePath: string) => Promise<IpcResponse>
    worktreePrune: (cwd: string) => Promise<IpcResponse>
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
    readPickedImageBase64: (filePath: string) => Promise<IpcResponse<{ dataUrl: string; size: number }>>
    writeImageFromBase64: (filePath: string, base64: string) => Promise<IpcResponse>
    pickImage: () => Promise<IpcResponse<string | null>>
    writeFile: (filePath: string, content: string) => Promise<IpcResponse>
    createFile: (filePath: string) => Promise<IpcResponse>
    createDir: (dirPath: string) => Promise<IpcResponse>
    importPaths: (sourcePaths: string[], destDir: string) => Promise<IpcResponse<string[]>>
    rename: (oldPath: string, newPath: string) => Promise<IpcResponse>
    delete: (targetPath: string) => Promise<IpcResponse>
    reveal: (targetPath: string) => Promise<IpcResponse>
    copyPath: (targetPath: string) => Promise<IpcResponse>
    iconTheme: () => Promise<IpcResponse<RuntimeIconTheme | null>>
  }

  interface DaemonLsp {
    status: (projectPath?: string) => Promise<IpcResponse<LspServerStatus[]>>
    openDocument: (input: LspDocumentInput) => Promise<IpcResponse<LspDocumentSyncResult>>
    changeDocument: (input: LspDocumentInput) => Promise<IpcResponse<LspDocumentSyncResult>>
    closeDocument: (input: Pick<LspDocumentInput, 'projectPath' | 'filePath' | 'languageId'>) => Promise<IpcResponse<void>>
    hover: (projectPath: string, filePath: string, languageId: string, position: LspPosition) => Promise<IpcResponse<LspHoverResult | null>>
    definition: (projectPath: string, filePath: string, languageId: string, position: LspPosition) => Promise<IpcResponse<LspLocation[]>>
    completion: (projectPath: string, filePath: string, languageId: string, position: LspPosition) => Promise<IpcResponse<LspCompletionResult>>
    diagnostics: (filePath: string) => Promise<IpcResponse<LspDiagnosticEvent>>
    shutdownProject: (projectPath: string) => Promise<IpcResponse<void>>
    onDiagnostics: (callback: (payload: LspDiagnosticEvent) => void) => () => void
  }

  interface DaemonProjects {
    list: () => Promise<IpcResponse<Project[]>>
    create: (project: { name: string; path: string }) => Promise<IpcResponse<Project>>
    delete: (id: string) => Promise<IpcResponse>
    openDialog: () => Promise<IpcResponse<string | null>>
    setPinned: (input: { id: string; pinned: boolean }) => Promise<IpcResponse<Project>>
  }

  interface AgentOpsOpenRequest {
    asset?: string
    network?: 'solana-devnet' | 'solana-mainnet'
    service?: string
    price?: string
    sourceUrl: string
    receivedAt: string
  }

  interface AgentOpsDerivedAccounts {
    agentIdentityPda?: string
    assetSignerPda?: string
  }

  interface DaemonAgentOps {
    getPendingOpenRequest: () => Promise<AgentOpsOpenRequest | null>
    ackOpenRequest: (receivedAt: string) => Promise<boolean>
    deriveAccounts: (assetAddress: string) => Promise<IpcResponse<AgentOpsDerivedAccounts>>
    onOpenRequest: (callback: (payload: AgentOpsOpenRequest) => void) => () => void
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
    storeJupiterKey: (value: string) => Promise<IpcResponse>
    deleteJupiterKey: () => Promise<IpcResponse>
    hasJupiterKey: () => Promise<IpcResponse<boolean>>
    moonpayStatus: () => Promise<IpcResponse<MoonpayStatus>>
    storeMoonpayKeys: (input: MoonpayKeysInput) => Promise<IpcResponse<MoonpayStatus>>
    deleteMoonpayKeys: () => Promise<IpcResponse>
    openMoonpayOnramp: (input: MoonpayOnrampInput) => Promise<IpcResponse<MoonpayOnrampResult>>
    generate: (input: { name: string; walletType?: string; agentId?: string }) => Promise<IpcResponse<WalletListEntry>>
    importSigningWallet: (input: { name: string; privateKey?: string }) => Promise<IpcResponse<WalletListEntry | null>>
    importKeypair: (walletId: string, privateKey?: string) => Promise<IpcResponse<boolean>>
    sendSol: (input: { fromWalletId: string; toAddress: string; amountSol?: number; sendMax?: boolean }) => Promise<IpcResponse<WalletExecutionResult>>
    prepareExternalSolTransfer: (input: { fromWalletId: string; toAddress: string; amountSol?: number; sendMax?: boolean }) => Promise<IpcResponse<ExternalSolTransferDraft>>
    submitExternalSignedTransaction: (input: SubmitExternalSignedTransactionInput) => Promise<IpcResponse<WalletExecutionResult>>
    cancelExternalTransaction: (id: string, reason?: string) => Promise<IpcResponse>
    sendToken: (input: { fromWalletId: string; toAddress: string; mint: string; amount?: number; sendMax?: boolean }) => Promise<IpcResponse<WalletExecutionResult>>
    balance: (walletId: string) => Promise<IpcResponse<{ sol: number; lamports: number }>>
    holdings: (walletId: string) => Promise<IpcResponse<Array<{ mint: string; symbol: string; name: string; amount: number; priceUsd: number; valueUsd: number; logoUri: string | null }>>>
    swapQuote: (input: { walletId: string; inputMint: string; outputMint: string; amount: number; slippageBps: number }) => Promise<IpcResponse<{ inputMint: string; outputMint: string; inAmount: string; outAmount: string; requestId: string; quoteId: string; messageHash: string; priceImpactPct: string; routePlan: Array<{ label: string; percent: number }>; rawQuoteResponse: unknown }>>
    searchJupiterTokens: (query: string) => Promise<IpcResponse<JupiterTokenSearchResult[]>>
    transactionPreview: (input: SolanaTransactionPreviewInput) => Promise<IpcResponse<SolanaTransactionPreview>>
    swapExecute: (input: { walletId: string; inputMint: string; outputMint: string; amount: number; slippageBps: number; rawQuoteResponse?: unknown; confirmedAt: number; acknowledgedImpact: boolean }) => Promise<IpcResponse<WalletExecutionResult>>
    agentWallets: (agentId?: string) => Promise<IpcResponse<Array<{ id: string; name: string; address: string; is_default: number; agent_id: string; wallet_type: string; created_at: number; assigned_project_ids: string[] }>>>
    createAgentWallet: (agentId: string, agentName: string) => Promise<IpcResponse<{ id: string; name: string; address: string; is_default: number; wallet_type: string; agent_id: string | null; created_at: number }>>
    hasKeypair: (walletId: string) => Promise<IpcResponse<boolean>>
    signMessage: (walletId: string, message: string) => Promise<IpcResponse<{ walletAddress: string; signatureBase58: string; message: string }>>
    transactionHistory: (walletId: string, limit?: number) => Promise<IpcResponse<Array<{ id: string; wallet_id: string; type: string; signature: string | null; from_address: string; to_address: string; amount: number; mint: string | null; symbol: string | null; status: string; error: string | null; created_at: number }>>>
    exportPrivateKey: (walletId: string) => Promise<IpcResponse<boolean>>
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

  interface UiRecoveryResult {
    clearedKeys: string[]
    clearedActiveSessions: number
    ranAt: number
  }

  interface AppMeta {
    version: string
    electronVersion: string
    platform: string
    updateChannel: string
    releaseUrl: string
  }

  interface DaemonSettings {
    getUi: () => Promise<IpcResponse<UiSettings>>
    getAppMeta: () => Promise<IpcResponse<AppMeta>>
    setShowMarketTape: (enabled: boolean) => Promise<IpcResponse>
    setShowTitlebarWallet: (enabled: boolean) => Promise<IpcResponse>
    setLowPowerMode: (enabled: boolean) => Promise<IpcResponse>
    isOnboardingComplete: () => Promise<IpcResponse<boolean>>
    setOnboardingComplete: (complete: boolean) => Promise<IpcResponse>
    getOnboardingProgress: () => Promise<IpcResponse<OnboardingProgress>>
    setOnboardingProgress: (progress: OnboardingProgress) => Promise<IpcResponse>
    reportCrash: (data: { type: string; message: string; stack: string }) => Promise<IpcResponse>
    getCrashes: () => Promise<IpcResponse<AppCrashEntry[]>>
    clearCrashes: () => Promise<IpcResponse>
    recoverUiState: () => Promise<IpcResponse<UiRecoveryResult>>
    getPinnedTools: () => Promise<IpcResponse<string[]>>
    setPinnedTools: (tools: string[]) => Promise<IpcResponse>
    getDrawerToolOrder: () => Promise<IpcResponse<string[]>>
    setDrawerToolOrder: (order: string[]) => Promise<IpcResponse>
    getWorkspaceProfile: () => Promise<IpcResponse<WorkspaceProfile | null>>
    setWorkspaceProfile: (profile: WorkspaceProfile) => Promise<IpcResponse>
    getEnabledPacks: () => Promise<IpcResponse<Record<string, boolean>>>
    setEnabledPacks: (packs: Record<string, boolean>) => Promise<IpcResponse>
    getTokenLaunchSettings: () => Promise<IpcResponse<TokenLaunchSettings>>
    setTokenLaunchSettings: (settings: TokenLaunchSettings) => Promise<IpcResponse>
    getWalletInfrastructureSettings: () => Promise<IpcResponse<WalletInfrastructureSettings>>
    getSolanaRuntimeStatus: () => Promise<IpcResponse<SolanaRuntimeStatusSummary>>
    setWalletInfrastructureSettings: (settings: WalletInfrastructureSettings) => Promise<IpcResponse>
    getLayout: () => Promise<IpcResponse<{ centerMode: string | null; rightPanelTab: string | null; consoleDock: string | null }>>
    setLayout: (layout: { centerMode?: string; rightPanelTab?: string; consoleDock?: string }) => Promise<IpcResponse>
    onCrashWarning: (callback: (count: number) => void) => () => void
    onUiRecoveryApplied: (callback: (result: UiRecoveryResult) => void) => () => void
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

  interface DaemonShipline {
    createTimeline: (input: ShiplineCreateRunInput) => Promise<IpcResponse<ShiplineRun>>
    listTimelines: (projectId?: string | null, limit?: number) => Promise<IpcResponse<ShiplineRun[]>>
    getTimeline: (id: string) => Promise<IpcResponse<ShiplineRun | null>>
    updateStep: (input: ShiplineUpdateStepInput) => Promise<IpcResponse<ShiplineRun>>
    onTimelineUpdated: (callback: (run: ShiplineRun) => void) => () => void
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

  type ProofPool = import('../../electron/shared/types').ProofPool
  type ProofPoolDetail = import('../../electron/shared/types').ProofPoolDetail
  type ProofEscrowStatus = import('../../electron/shared/types').ProofEscrowStatus
  type CreateProofPoolInput = import('../../electron/shared/types').CreateProofPoolInput
  type VerifyProofBackingInput = import('../../electron/shared/types').VerifyProofBackingInput
  type ImportProofVanityMintInput = import('../../electron/shared/types').ImportProofVanityMintInput
  type ProofBackingActionInput = import('../../electron/shared/types').ProofBackingActionInput
  type ProofPoolLaunchResult = import('../../electron/shared/types').ProofPoolLaunchResult
  type ProofCollectFeesResult = import('../../electron/shared/types').ProofCollectFeesResult
  type ProofEscrowExportResult = import('../../electron/shared/types').ProofEscrowExportResult
  type ProofPartnerCredentialStatus = import('../../electron/shared/types').ProofPartnerCredentialStatus
  type ConfigureProofPartnerCredentialsInput = import('../../electron/shared/types').ConfigureProofPartnerCredentialsInput
  type CreateProofPartnerSessionInput = import('../../electron/shared/types').CreateProofPartnerSessionInput
  type ProofPartnerSession = import('../../electron/shared/types').ProofPartnerSession

  interface DaemonProof {
    escrowStatus: () => Promise<IpcResponse<ProofEscrowStatus>>
    configureEscrow: (input?: { privateKeyBase58?: string | null; allowRotation?: boolean | null }) => Promise<IpcResponse<ProofEscrowStatus>>
    exportEscrow: () => Promise<IpcResponse<ProofEscrowExportResult>>
    listPools: () => Promise<IpcResponse<ProofPool[]>>
    getPool: (poolId: string) => Promise<IpcResponse<ProofPoolDetail>>
    createPool: (input: CreateProofPoolInput) => Promise<IpcResponse<ProofPoolDetail>>
    verifyBacking: (input: VerifyProofBackingInput) => Promise<IpcResponse<ProofPoolDetail>>
    launchPool: (poolId: string) => Promise<IpcResponse<ProofPoolLaunchResult>>
    distributePool: (poolId: string) => Promise<IpcResponse<ProofPoolDetail>>
    distributeBacking: (input: ProofBackingActionInput) => Promise<IpcResponse<ProofPoolDetail>>
    refundPool: (poolId: string) => Promise<IpcResponse<ProofPoolDetail>>
    refundBacking: (input: ProofBackingActionInput) => Promise<IpcResponse<ProofPoolDetail>>
    collectFees: (poolId: string) => Promise<IpcResponse<ProofCollectFeesResult>>
    claimFees: (input: { backingId: string }) => Promise<IpcResponse<{ signature: string; amountSol: number }>>
    importVanityMint: (input: ImportProofVanityMintInput) => Promise<IpcResponse<{ id: string; address: string }>>
    pickImage: () => Promise<IpcResponse<string | null>>
    partnerConfigStatus: () => Promise<IpcResponse<ProofPartnerCredentialStatus>>
    configurePartnerCredentials: (input: ConfigureProofPartnerCredentialsInput) => Promise<IpcResponse<ProofPartnerCredentialStatus>>
    listPartnerSessions: () => Promise<IpcResponse<ProofPartnerSession[]>>
    createPartnerSession: (input: CreateProofPartnerSessionInput) => Promise<IpcResponse<ProofPartnerSession>>
    getPartnerSession: (sessionId: string) => Promise<IpcResponse<ProofPartnerSession>>
    pollPartnerSession: (sessionId: string) => Promise<IpcResponse<ProofPartnerSession>>
    partnerPrefill: (sessionId: string) => Promise<IpcResponse<unknown>>
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
    add: (input: PluginCreateInput) => Promise<IpcResponse<PluginRow>>
    setEnabled: (id: string, enabled: boolean) => Promise<IpcResponse<void>>
    setConfig: (id: string, config: string) => Promise<IpcResponse<void>>
    reorder: (orderedIds: string[]) => Promise<IpcResponse<void>>
  }

  interface DaemonPacks {
    getEnabled: () => Promise<IpcResponse<Record<string, boolean>>>
    setEnabled: (id: string, enabled: boolean) => Promise<IpcResponse<Record<string, boolean>>>
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
    send: (sessionId: string, message: string, snapshot: AriaContextSnapshot, modelLane?: DaemonAiModelLane) => Promise<IpcResponse<AriaResponse>>
    history: (sessionId: string, limit?: number) => Promise<IpcResponse<AriaMessage[]>>
    clear: (sessionId: string) => Promise<IpcResponse<void>>
    models: () => Promise<IpcResponse<DaemonAiModelInfo[]>>
    sessions: {
      list: (projectId?: string | null) => Promise<IpcResponse<AriaSession[]>>
      create: (projectId?: string | null, title?: string | null) => Promise<IpcResponse<AriaSession>>
      rename: (sessionId: string, title: string) => Promise<IpcResponse<void>>
      archive: (sessionId: string) => Promise<IpcResponse<void>>
      delete: (sessionId: string) => Promise<IpcResponse<void>>
    }
    approve: (callId: string, approved: boolean) => void
    patchDecision: (proposalId: string, action: AriaPatchAction) => void
    toolEffectResult: (callId: string, data: unknown) => void
    onToolEvent: (handler: (event: AriaToolEvent) => void) => () => void
    onUiEffect: (handler: (payload: { callId: string; effect: AriaUiEffectPayload; awaitData: boolean }) => void) => () => void
  }

  interface SwarmRun {
    id: string
    session_id: string | null
    project_id: string | null
    project_path: string
    base_branch: string | null
    status: 'running' | 'done' | 'failed' | 'cancelled'
    created_at: number
    updated_at: number
  }

  interface SwarmLane {
    id: string
    run_id: string
    task: string
    worktree_path: string
    branch: string
    pid: number | null
    status: 'pending' | 'spawning' | 'running' | 'done' | 'failed' | 'cancelled'
    results_path: string | null
    exit_code: number | null
    created_at: number
    updated_at: number
    results?: string | null
  }

  interface SwarmLaunchRequest {
    sessionId?: string | null
    projectId?: string | null
    projectPath: string
    baseBranch?: string | null
    tasks: string[]
  }

  interface DaemonSwarm {
    launch: (req: SwarmLaunchRequest) => Promise<IpcResponse<{ runId: string }>>
    list: (limit?: number) => Promise<IpcResponse<SwarmRun[]>>
    runDetail: (runId: string) => Promise<IpcResponse<{ run: SwarmRun; lanes: SwarmLane[] }>>
    cancel: (runId: string) => Promise<IpcResponse<void>>
    onUpdate: (handler: (payload: { runId: string; laneId?: string; status?: string; pid?: number | null; exitCode?: number | null }) => void) => () => void
  }

  interface DaemonMemory {
    list: (projectId: string | null, opts?: { status?: MemoryStatus; kind?: MemoryKind }) => Promise<IpcResponse<ProjectMemory[]>>
    suggest: (input: MemorySuggestionInput) => Promise<IpcResponse<ProjectMemory>>
    approve: (id: string, approvedBy?: string) => Promise<IpcResponse<ProjectMemory>>
    update: (id: string, patch: MemoryUpdateInput) => Promise<IpcResponse<ProjectMemory>>
    reject: (id: string) => Promise<IpcResponse<ProjectMemory>>
    delete: (id: string) => Promise<IpcResponse<void>>
    extract: (projectPath: string, projectId: string | null) => Promise<IpcResponse<ProjectMemory[]>>
    buildContextBundle: (projectId: string | null, opts?: { charBudget?: number; sessionRef?: string | null }) => Promise<IpcResponse<MemoryContextBundle>>
    discoverChecks: (projectPath: string) => Promise<IpcResponse<CheckDefinition[]>>
    runCheck: (projectPath: string, check: CheckDefinition) => Promise<IpcResponse<CheckResult>>
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
    bonding_curve_address: string | null
    create_signature: string | null
    initial_buy_sol: number | null
    launchpad_config_json: string
    protocol_receipts_json: string
    status: string
    error_message: string | null
    confirmed_at: number | null
    updated_at: number | null
    created_at: number
  }

  type LaunchpadId = 'pumpfun' | 'raydium' | 'meteora' | 'printr' | 'openbid' | 'bags' | 'bonk'
  type LaunchpadStatus = 'available' | 'planned'

  type PulseTokenCategory = 'newly-created' | 'almost-graduated' | 'graduated'

  interface PulseTokenMetrics {
    trend: number | null
    graduationProgress: number | null
    marketCapUsd: number | null
    volume24Usd: number | null
    holders: number | null
    txnCount24: number | null
    buyCount24: number | null
    sellCount24: number | null
  }

  interface PulseToken {
    id: string
    category: PulseTokenCategory
    name: string
    symbol: string
    imageUrl: string | null
    creator: string | null
    createdAt: number | null
    deployments: number | null
    contractAddress: string
    contractAddressByChain: Record<string, string>
    graduatedChains: string[]
    externalUrlX: string | null
    externalUrlWebsite: string | null
    metrics: PulseTokenMetrics
  }

  interface PulseTokenFeed {
    category: PulseTokenCategory
    pageNumber: number
    pageSize: number
    fetchedAt: number
    tokens: PulseToken[]
  }

  interface LaunchpadDefinition {
    id: LaunchpadId
    name: string
    description: string
    status: LaunchpadStatus
    enabled: boolean
    reason: string | null
  }

  interface TokenLaunchResult {
    launch: LaunchedToken
    signature: string
    mint: string
    metadataUri: string | null
    poolAddress: string | null
    bondingCurveAddress: string | null
  }

  interface TokenLaunchCheck {
    id: string
    label: string
    status: 'pass' | 'warn' | 'fail'
    detail: string
  }

  interface TokenLaunchPreflight {
    ready: boolean
    estimatedTotalSol: number
    walletBalanceSol: number | null
    checks: TokenLaunchCheck[]
  }

  interface DaemonLaunch {
    listLaunchpads: () => Promise<IpcResponse<LaunchpadDefinition[]>>
    listWalletOptions: (projectId?: string | null) => Promise<IpcResponse<LaunchWalletOption[]>>
    ensureDaemonDeployerWallet: (projectId?: string | null) => Promise<IpcResponse<LaunchWalletOption>>
    listPulseTokens: (input?: { category?: PulseTokenCategory; pageNumber?: number; pageSize?: number }) => Promise<IpcResponse<PulseTokenFeed>>
    pickImage: () => Promise<IpcResponse<string | null>>
    preflightToken: (input: {
      launchpad: LaunchpadId
      walletId: string
      projectId?: string
      name: string
      symbol: string
      description: string
      imagePath: string | null
      twitter?: string
      telegram?: string
      website?: string
      initialBuySol: number
      slippageBps: number
      priorityFeeSol: number
      mayhemMode?: boolean
      openbid?: OpenBidLaunchInputConfig
    }) => Promise<IpcResponse<TokenLaunchPreflight>>
    createToken: (input: {
      launchpad: LaunchpadId
      walletId: string
      projectId?: string
      name: string
      symbol: string
      description: string
      imagePath: string | null
      twitter?: string
      telegram?: string
      website?: string
      initialBuySol: number
      slippageBps: number
      priorityFeeSol: number
      mayhemMode?: boolean
      openbid?: OpenBidLaunchInputConfig
    }) => Promise<IpcResponse<TokenLaunchResult>>
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
      poolAddress?: string
      bondingCurveAddress?: string
      launchpadConfigJson?: string
      protocolReceiptsJson?: string
      status?: string
      errorMessage?: string
      confirmedAt?: number
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
    listAgentWork: (limit?: number) => Promise<IpcResponse<AgentWorkTask[]>>
    createAgentWork: (input: AgentWorkCreateInput) => Promise<IpcResponse<AgentWorkTask>>
    fundAgentWork: (taskId: string) => Promise<IpcResponse<AgentWorkTask>>
    startAgentWork: (taskId: string, sessionId?: string | null) => Promise<IpcResponse<AgentWorkTask>>
    submitAgentWork: (taskId: string, input?: AgentWorkSubmitInput) => Promise<IpcResponse<AgentWorkTask>>
    approveAgentWork: (taskId: string) => Promise<IpcResponse<AgentWorkTask>>
    rejectAgentWork: (taskId: string) => Promise<IpcResponse<AgentWorkTask>>
    settleAgentWork: (taskId: string, signature?: string | null) => Promise<IpcResponse<AgentWorkTask>>
    expireAgentWork: (taskId: string) => Promise<IpcResponse<AgentWorkTask>>
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

  type IdleResource = import('../../electron/shared/types').IdleResource
  type IdleBudgetPolicy = import('../../electron/shared/types').IdleBudgetPolicy
  type IdlePolicyCheckInput = import('../../electron/shared/types').IdlePolicyCheckInput
  type IdlePolicyCheckResult = import('../../electron/shared/types').IdlePolicyCheckResult
  type IdlePaidCallInput = import('../../electron/shared/types').IdlePaidCallInput
  type IdlePaidCallReceipt = import('../../electron/shared/types').IdlePaidCallReceipt
  type IdleRegistryStatus = import('../../electron/shared/types').IdleRegistryStatus
  type MeterflowStatus = import('../../electron/shared/types').MeterflowStatus
  type MeterflowOverview = import('../../electron/shared/types').MeterflowOverview
  type MeterflowReceipt = import('../../electron/shared/types').MeterflowReceipt
  type MeterflowReceiptsQuery = import('../../electron/shared/types').MeterflowReceiptsQuery
  type MeterflowReceiptDetail = import('../../electron/shared/types').MeterflowReceiptDetail
  type MeterflowReceiptGraph = import('../../electron/shared/types').MeterflowReceiptGraph
  type MeterflowMeter = import('../../electron/shared/types').MeterflowMeter
  type MeterflowBudget = import('../../electron/shared/types').MeterflowBudget
  type MeterflowAgentSession = import('../../electron/shared/types').MeterflowAgentSession
  type MeterflowWebhook = import('../../electron/shared/types').MeterflowWebhook
  type MeterflowRevenueRow = import('../../electron/shared/types').MeterflowRevenueRow
  type MeterflowCsvExport = import('../../electron/shared/types').MeterflowCsvExport
  type MeterflowDemoWallet = import('../../electron/shared/types').MeterflowDemoWallet
  type MeterflowWalletReadiness = import('../../electron/shared/types').MeterflowWalletReadiness
  type VoightPrivacyLevel = import('../../electron/shared/types').VoightPrivacyLevel
  type VoightStatus = import('../../electron/shared/types').VoightStatus
  type VoightTestResult = import('../../electron/shared/types').VoightTestResult
  type MeterflowPaidAgentReadinessInput = import('../../electron/shared/types').MeterflowPaidAgentReadinessInput
  type MeterflowPaidAgentReadinessResult = import('../../electron/shared/types').MeterflowPaidAgentReadinessResult
  type MeterflowWatchProjectResult = import('../../electron/shared/types').MeterflowWatchProjectResult

  interface DaemonIdle {
    status: (registryUrl?: string | null) => Promise<IpcResponse<IdleRegistryStatus>>
    refreshRegistry: (input?: { registryUrl?: string | null }) => Promise<IpcResponse<IdleResource[]>>
    listResources: (limit?: number) => Promise<IpcResponse<IdleResource[]>>
    checkPolicy: (input: IdlePolicyCheckInput) => Promise<IpcResponse<IdlePolicyCheckResult>>
    executePaidCall: (input: IdlePaidCallInput) => Promise<IpcResponse<IdlePaidCallReceipt>>
    listReceipts: (limit?: number) => Promise<IpcResponse<IdlePaidCallReceipt[]>>
  }

  interface DaemonMeterflow {
    status: () => Promise<IpcResponse<MeterflowStatus>>
    storeApiKey: (apiKey: string) => Promise<IpcResponse<MeterflowStatus>>
    deleteApiKey: () => Promise<IpcResponse<{ deleted: boolean }>>
    overview: () => Promise<IpcResponse<MeterflowOverview>>
    listReceipts: (input?: MeterflowReceiptsQuery | number) => Promise<IpcResponse<MeterflowReceipt[]>>
    getReceipt: (receiptId: string) => Promise<IpcResponse<MeterflowReceiptDetail>>
    ingestReceipt: (receipt: object) => Promise<IpcResponse<MeterflowReceipt>>
    createDemoWallet: () => Promise<IpcResponse<MeterflowDemoWallet>>
    getDemoWallet: () => Promise<IpcResponse<MeterflowDemoWallet | null>>
    checkDemoWalletReadiness: () => Promise<IpcResponse<MeterflowWalletReadiness>>
    callPaidAgentReadiness: (input: MeterflowPaidAgentReadinessInput) => Promise<IpcResponse<MeterflowPaidAgentReadinessResult>>
    watchProject: (projectPath: string) => Promise<IpcResponse<MeterflowWatchProjectResult>>
    getReceiptGraph: (receiptId: string) => Promise<IpcResponse<MeterflowReceiptGraph>>
    listMeters: () => Promise<IpcResponse<MeterflowMeter[]>>
    testMeter: (meterId: string) => Promise<IpcResponse<Record<string, unknown>>>
    listBudgets: () => Promise<IpcResponse<MeterflowBudget[]>>
    listAgentSessions: () => Promise<IpcResponse<MeterflowAgentSession[]>>
    listWebhooks: () => Promise<IpcResponse<MeterflowWebhook[]>>
    providerRevenue: () => Promise<IpcResponse<MeterflowRevenueRow[]>>
    registrySummary: () => Promise<IpcResponse<Record<string, unknown>>>
    exportReceiptsCsv: () => Promise<IpcResponse<MeterflowCsvExport>>
  }

  interface MetaplexCoreAgentAssetReceipt {
    id: string
    createdAt: string
    action: 'metaplex-core-agent-asset-create'
    network: 'devnet'
    wallet: string
    asset: string
    signature: string
    explorerUrl: string
    docsUrl: string
    postWriteRead: {
      ok: boolean
      name?: string
      uri?: string
      owner?: string
      error?: string
    }
    safety: {
      walletApproval: true
      liveWrite: true
      mainnetBlocked: true
      nextBlockedActions: string[]
    }
  }

  interface MetaplexRegisteredAgentReceipt {
    id: string
    createdAt: string
    action: 'metaplex-agent-mint-and-register'
    network: 'devnet'
    wallet: string
    asset: string
    signature: string
    explorerUrl: string
    docsUrl: string
    agentMetadata: {
      type: 'agent'
      name: string
      description: string
      services: Array<{ name: string; endpoint: string }>
      registrations: Array<{ agentId: string; agentRegistry: string }>
      supportedTrust: string[]
    }
  }

  interface MetaplexRegisterAgentIdentityReceipt {
    id: string
    createdAt: string
    action: 'metaplex-agent-register-identity'
    network: 'devnet'
    wallet: string
    asset: string
    agentIdentityPda: string
    signature: string
    explorerUrl: string
    docsUrl: string
  }

  interface MetaplexReadAgentIdentityResult {
    registered: boolean
    network: 'devnet' | 'mainnet-beta'
    asset: string
    agentIdentityPda: string
    identity?: {
      publicKey: string
      bump: number
      asset: string
    }
  }

  interface DaemonMetaplex {
    createCoreAgentAsset: (input: {
      walletId: string
      network: 'devnet'
      rpcUrl: string
      name: string
      uri: string
      confirmedAt: number
      acknowledgement: string
    }) => Promise<IpcResponse<MetaplexCoreAgentAssetReceipt>>
    mintRegisteredAgent: (input: {
      walletId: string
      network: 'devnet'
      rpcUrl: string
      name: string
      description: string
      uri: string
      serviceUrl: string
      priceUsdc: string
      confirmedAt: number
      acknowledgement: string
    }) => Promise<IpcResponse<MetaplexRegisteredAgentReceipt>>
    registerAgentIdentity: (input: {
      walletId: string
      network: 'devnet'
      rpcUrl: string
      assetAddress: string
      agentRegistrationUri: string
      confirmedAt: number
      acknowledgement: string
    }) => Promise<IpcResponse<MetaplexRegisterAgentIdentityReceipt>>
    readAgentIdentity: (input: {
      network: 'devnet' | 'mainnet-beta'
      rpcUrl: string
      assetAddress: string
    }) => Promise<IpcResponse<MetaplexReadAgentIdentityResult>>
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

  type ProviderId = 'claude' | 'codex'
  type ProviderFeatureId = 'aria' | 'daemonAi' | 'agents' | 'terminal'
  interface ProviderPreferences {
    aria: {
      provider: ProviderId
      model: 'fast' | 'standard' | 'reasoning'
    }
    daemonAi: {
      accessMode: 'auto' | 'hosted' | 'byok'
      byokProvider: ProviderId
      modelLane: 'auto' | 'fast' | 'standard' | 'reasoning' | 'premium'
    }
    agents: {
      defaultProvider: ProviderId
    }
    terminal: {
      defaultProvider: ProviderId
    }
  }

  interface DaemonProvider {
    verifyAll: () => Promise<IpcResponse<ProviderConnectionMap>>
    getAllConnections: () => Promise<IpcResponse<ProviderConnectionMap>>
    getDefault: () => Promise<IpcResponse<string>>
    setDefault: (id: string) => Promise<IpcResponse<{ defaultProvider: string }>>
    getPreferences: () => Promise<IpcResponse<ProviderPreferences>>
    setPreferences: (preferences: Partial<ProviderPreferences>) => Promise<IpcResponse<ProviderPreferences>>
    resolveFeatureProvider: (featureId: ProviderFeatureId) => Promise<IpcResponse<ProviderId>>
  }

  interface DaemonActivityEntry {
    id: string
    kind: 'info' | 'success' | 'warning' | 'error'
    message: string
    context: string | null
    createdAt: number
    sessionId?: string | null
    sessionStatus?: 'created' | 'running' | 'blocked' | 'failed' | 'complete' | null
    projectId?: string | null
    projectName?: string | null
    sessionSummary?: string | null
    artifacts?: DaemonActivityArtifact[] | null
  }

  interface DaemonActivityArtifact {
    type: 'transaction' | 'program' | 'explorer' | 'project' | 'deploy' | 'wallet' | 'other'
    label: string
    value: string
    href?: string | null
  }

  interface DaemonActivity {
    append: (entry: DaemonActivityEntry) => Promise<IpcResponse<void>>
    list: (limit?: number) => Promise<IpcResponse<DaemonActivityEntry[]>>
    saveSummary: (targetId: string, summary: string) => Promise<IpcResponse<void>>
    clear: () => Promise<IpcResponse<void>>
  }

  type DaemonEventChannel = 'auth:changed' | 'process:changed' | 'port:changed' | 'wallet:changed'

  interface DaemonEvents {
    on: (channel: DaemonEventChannel, callback: (payload: unknown) => void) => () => void
  }

  interface TelemetrySessionInfo {
    sessionId: string | null
  }

  interface TelemetrySessionStats {
    eventsCount: number
    sessionDuration: number
  }

  interface TelemetryEventRecord {
    eventId: string
    eventName: string
    userId: string | null
    sessionId: string
    timestamp: number
    properties: Record<string, unknown>
    version: string
  }

  interface DaemonTelemetry {
    track: (eventName: string, properties?: Record<string, unknown>) => Promise<IpcResponse<{ ok: boolean }>>
    timing: (eventName: string, durationMs: number, properties?: Record<string, unknown>) => Promise<IpcResponse<{ ok: boolean }>>
    session: () => Promise<IpcResponse<TelemetrySessionInfo>>
    stats: () => Promise<IpcResponse<TelemetrySessionStats>>
    recent: (limit?: number) => Promise<IpcResponse<TelemetryEventRecord[]>>
  }

  interface DaemonVoight {
    status: () => Promise<IpcResponse<VoightStatus>>
    storeKey: (value: string) => Promise<IpcResponse<VoightStatus>>
    deleteKey: () => Promise<IpcResponse<VoightStatus>>
    testEvent: () => Promise<IpcResponse<VoightTestResult>>
    setPrivacyLevel: (level: VoightPrivacyLevel) => Promise<IpcResponse<VoightStatus>>
    flushQueue: () => Promise<IpcResponse<{ sent: number; failed: number; pending: number }>>
  }

  interface DaemonPro {
    status: () => Promise<IpcResponse<ProSubscriptionState>>
    refreshStatus: (walletAddress: string) => Promise<IpcResponse<ProSubscriptionState>>
    fetchPrice: () => Promise<IpcResponse<ProPriceInfo>>
    subscribe: (walletId: string) => Promise<IpcResponse<{ state: ProSubscriptionState; price: ProPriceInfo }>>
    claimHolderAccess: (walletId: string) => Promise<IpcResponse<{ state: ProSubscriptionState }>>
    signOut: () => Promise<IpcResponse<void>>
    arenaList: () => Promise<IpcResponse<ArenaSubmission[]>>
    arenaSubmit: (input: ArenaSubmissionInput) => Promise<IpcResponse<{ id: string }>>
    arenaVote: (submissionId: string) => Promise<IpcResponse<void>>
    skillsManifest: () => Promise<IpcResponse<ProSkillManifest>>
    skillsSync: () => Promise<IpcResponse<{ installed: string[]; skipped: string[] }>>
    skillsDownload: (skillId: string) => Promise<IpcResponse<{ fileCount: number; path: string }>>
    quota: () => Promise<IpcResponse<{ quota: number; used: number; remaining: number }>>
    mcpPush: () => Promise<IpcResponse<{ count: number }>>
    mcpPull: () => Promise<IpcResponse<{ count: number }>>
  }

  interface DaemonSeeker {
    relayStart: (port?: number) => Promise<IpcResponse<SeekerRelayStatus>>
    relayStop: () => Promise<IpcResponse<{ stopped: boolean }>>
    relayStatus: () => Promise<IpcResponse<SeekerRelayStatus>>
    createSession: (input?: {
      projectId?: string | null
      projectPath?: string | null
      projectName?: string | null
      project?: Partial<SeekerProjectSnapshot> | null
      seedDemoApprovals?: boolean
    }) => Promise<IpcResponse<SeekerSessionSnapshot>>
    getSession: (pairingCode: string) => Promise<IpcResponse<SeekerSessionSnapshot | null>>
    listSessions: () => Promise<IpcResponse<SeekerSessionSnapshot[]>>
    updateProject: (pairingCode: string, project: Partial<SeekerProjectSnapshot>) => Promise<IpcResponse<SeekerSessionSnapshot>>
    addApproval: (pairingCode: string, approval: Omit<SeekerApprovalRequest, 'id' | 'status' | 'createdAt'> & Partial<Pick<SeekerApprovalRequest, 'id' | 'status' | 'createdAt'>>) => Promise<IpcResponse<SeekerSessionSnapshot>>
    updateApprovalStatus: (pairingCode: string, approvalId: string, status: SeekerApprovalStatus) => Promise<IpcResponse<SeekerSessionSnapshot>>
    clearSession: (pairingCode: string) => Promise<IpcResponse<{ cleared: boolean }>>
  }

  interface DaemonAI {
    chat: (input: DaemonAiChatRequest) => Promise<IpcResponse<DaemonAiChatResponse>>
    streamChat: (input: DaemonAiChatRequest) => Promise<IpcResponse<DaemonAiChatResponse>>
    getUsage: () => Promise<IpcResponse<DaemonAiUsageSnapshot>>
    getModels: () => Promise<IpcResponse<DaemonAiModelInfo[]>>
    getFeatures: () => Promise<IpcResponse<DaemonAiFeatureState>>
    summarizeContext: (input: DaemonAiChatRequest) => Promise<IpcResponse<{ usedContext: string[]; preview: string }>>
    createAgentRun: (input: DaemonAiAgentRunInput) => Promise<IpcResponse<DaemonAiAgentRun>>
    getAgentRun: (runId: string) => Promise<IpcResponse<DaemonAiAgentRun>>
    listAgentRuns: (limit?: number) => Promise<IpcResponse<DaemonAiAgentRun[]>>
    cancelAgentRun: (runId: string) => Promise<IpcResponse<DaemonAiAgentRun>>
    requestToolApproval: (input: DaemonAiToolCallInput) => Promise<IpcResponse<DaemonAiToolApprovalRequest>>
    approveToolCall: (input: DaemonAiToolApprovalDecisionInput) => Promise<IpcResponse<DaemonAiToolApprovalRequest>>
    listToolApprovals: (runId: string) => Promise<IpcResponse<DaemonAiToolApprovalRequest[]>>
    createPatchProposal: (input: DaemonAiPatchProposalInput) => Promise<IpcResponse<DaemonAiPatchProposal>>
    getPatchProposal: (proposalId: string) => Promise<IpcResponse<DaemonAiPatchProposal>>
    listPatchProposals: (runId: string) => Promise<IpcResponse<DaemonAiPatchProposal[]>>
    decidePatchProposal: (input: DaemonAiPatchDecisionInput) => Promise<IpcResponse<DaemonAiPatchProposal>>
    applyPatchProposal: (input: DaemonAiPatchApplyInput) => Promise<IpcResponse<DaemonAiPatchApplyResult>>
  }

  interface DaemonAPI {
    platform: 'aix' | 'android' | 'darwin' | 'freebsd' | 'haiku' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd'
    getPathForFile: (file: File) => string
    window: DaemonWindow
    agentops: DaemonAgentOps
    terminal: DaemonTerminal
    tools: DaemonTools
    engine: DaemonEngine
    env: DaemonEnv
    process: DaemonProcess
    ports: DaemonPorts
    wallet: DaemonWallet
    settings: DaemonSettings
    fs: DaemonFs
    lsp: DaemonLsp
    git: DaemonGit
    projects: DaemonProjects
    agents: DaemonAgents
    claude: DaemonClaude
    codex: DaemonCodex
    provider: DaemonProvider
    activity: DaemonActivity
    events: DaemonEvents
    telemetry: DaemonTelemetry
    voight: DaemonVoight
    tweets: DaemonTweets
    plugins: DaemonPlugins
    packs: DaemonPacks
    browser: DaemonBrowser
    recovery: DaemonRecovery
    deploy: DaemonDeploy
    shipline: DaemonShipline
    shell: DaemonShell
    pumpfun: DaemonPumpFun
    proof: DaemonProof
    email: DaemonEmail
    images: DaemonImages
    aria: DaemonAria
    swarm: DaemonSwarm
    memory: DaemonMemory
    launch: DaemonLaunch
    dashboard: DaemonDashboard
    forensics: DaemonForensics
    said: DaemonSaid
    synapse: DaemonSynapse
    allowances: DaemonAllowances
    signalhouse: DaemonSignalhouse
    flywheel: DaemonFlywheel
    registry: DaemonRegistry
    colosseum: DaemonColosseum
    idle: DaemonIdle
    meterflow: DaemonMeterflow
    metaplex: DaemonMetaplex
    vault: DaemonVault
    validator: DaemonValidator
    pnl: DaemonPnl
    pro: DaemonPro
    seeker: DaemonSeeker
    ai: DaemonAI
    feedback: DaemonFeedback
    agentStation: DaemonAgentStation
    replay: DaemonReplay
    clawpump: DaemonClawpump
    degentools: DaemonDegenTools
  }

  type ClawpumpSkill = import('../../electron/services/ClawpumpService').ClawpumpSkill
  type ClawpumpAgent = import('../../electron/services/ClawpumpService').ClawpumpAgent
  type ClawpumpMessage = import('../../electron/services/ClawpumpService').ClawpumpMessage
  type ClawpumpChatReply = import('../../electron/services/ClawpumpService').ClawpumpChatReply
  type CreateAgentInput = import('../../electron/services/ClawpumpService').CreateAgentInput

  interface DaemonClawpump {
    isConfigured: () => Promise<IpcResponse<boolean>>
    storeKey: (key: string) => Promise<IpcResponse<{ ok: boolean }>>
    clearKey: () => Promise<IpcResponse<{ ok: boolean }>>
    skills: () => Promise<IpcResponse<ClawpumpSkill[]>>
    list: () => Promise<IpcResponse<ClawpumpAgent[]>>
    get: (agentId: string) => Promise<IpcResponse<ClawpumpAgent>>
    messages: (agentId: string, limit?: number) => Promise<IpcResponse<ClawpumpMessage[]>>
    create: (input: CreateAgentInput) => Promise<IpcResponse<ClawpumpAgent>>
    start: (agentId: string) => Promise<IpcResponse<ClawpumpAgent>>
    stop: (agentId: string) => Promise<IpcResponse<ClawpumpAgent>>
    delete: (agentId: string) => Promise<IpcResponse<{ deleted: boolean }>>
    chat: (agentId: string, message: string) => Promise<IpcResponse<ClawpumpChatReply>>
  }

  type DegenToolsToolResult = import('../../electron/services/DegenToolsService').DegenToolsToolResult
  type GenerateMemeInput = import('../../electron/services/DegenToolsService').GenerateMemeInput
  type GenerateShillCopyInput = import('../../electron/services/DegenToolsService').GenerateShillCopyInput
  type GetTokenDataInput = import('../../electron/services/DegenToolsService').GetTokenDataInput
  type LaunchTokenInput = import('../../electron/services/DegenToolsService').LaunchTokenInput

  interface DaemonDegenTools {
    isConfigured: () => Promise<IpcResponse<boolean>>
    storeKey: (key: string) => Promise<IpcResponse<{ ok: boolean }>>
    clearKey: () => Promise<IpcResponse<{ ok: boolean }>>
    initialize: () => Promise<IpcResponse<unknown>>
    tools: () => Promise<IpcResponse<unknown>>
    callTool: (name: string, args: object) => Promise<IpcResponse<DegenToolsToolResult>>
    generateMeme: (input: GenerateMemeInput) => Promise<IpcResponse<DegenToolsToolResult>>
    generateShillCopy: (input: GenerateShillCopyInput) => Promise<IpcResponse<DegenToolsToolResult>>
    getTokenData: (input: GetTokenDataInput) => Promise<IpcResponse<DegenToolsToolResult>>
    launchToken: (input: LaunchTokenInput) => Promise<IpcResponse<DegenToolsToolResult>>
  }

  interface DaemonReplay {
    fetchTrace: (signature: string, force?: boolean) => Promise<IpcResponse<ReplayTrace>>
    fetchProgram: (programId: string, limit?: number) => Promise<IpcResponse<ReplayProgramSummary>>
    buildContext: (signature: string) => Promise<IpcResponse<ReplayContextHandoff>>
    createHandoff: (projectPath: string, signature: string) => Promise<IpcResponse<ReplayAgentHandoff>>
    verifyFix: (projectPath: string, signature: string, command: string) => Promise<IpcResponse<ReplayVerificationResult>>
    rpcLabel: () => Promise<IpcResponse<string>>
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
    status: () => Promise<IpcResponse<{
      type: 'surfpool' | 'test-validator' | null
      status: 'stopped' | 'starting' | 'running' | 'error' | 'stopping'
      terminalId: string | null
      port: number | null
      pid?: number | null
      startedAt?: number | null
      lastHealthCheckAt?: number | null
      error?: string | null
      outputExcerpt?: string | null
    }>>
    detect: () => Promise<IpcResponse<{ surfpool: boolean; testValidator: boolean }>>
    toolchainStatus: (projectPath?: string) => Promise<IpcResponse<{
      solanaCli: { installed: boolean; version: string | null }
      anchor: { installed: boolean; version: string | null }
      avm: { installed: boolean; version: string | null }
      surfpool: { installed: boolean; version: string | null }
      testValidator: { installed: boolean; version: string | null }
      litesvm: { installed: boolean; source: 'project' | 'none' }
    }>>
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
    tokenPrice: (mint: string) => Promise<IpcResponse<{ price: number; priceChange24h: number | null; confidenceLevel?: string | null }>>
    tokenMetadata: (mint: string) => Promise<IpcResponse<{ name: string; symbol: string; image: string | null; supply: number; decimals: number }>>
    tokenHolders: (mint: string) => Promise<IpcResponse<{ count: number; topHolders: Array<{ address: string; amount: number }> }>>
    detectTokens: (walletAddress: string) => Promise<IpcResponse<DetectedToken[]>>
    importToken: (mint: string, walletId: string) => Promise<IpcResponse<{ id: string; alreadyExists: boolean }>>
  }

  interface DaemonForensics {
    scan: (input: ForensicsScanInput) => Promise<IpcResponse<ForensicsScanResult>>
    expand: (input: ForensicsExpandInput) => Promise<IpcResponse<ForensicsExpandResult>>
    blacklist: () => Promise<IpcResponse<ForensicsBlacklistResult>>
    exportBlacklist: () => Promise<IpcResponse<{ csv: string; copied: boolean }>>
    pollHolders: (mint: string) => Promise<IpcResponse<ForensicsHolderPollResult>>
    ricoMapsStatus: () => Promise<IpcResponse<RicoMapsEmbedStatus>>
    startRicoMaps: () => Promise<IpcResponse<RicoMapsEmbedStatus>>
  }

  interface DaemonSaid {
    getIdentity: (wallet: string) => Promise<IpcResponse<SaidIdentity>>
    getTrust: (wallet: string) => Promise<IpcResponse<SaidTrustScore>>
  }

  interface DaemonSynapse {
    status: (input?: { cluster?: SynapseSapCluster }) => Promise<IpcResponse<SynapseSapStatus>>
    getAgent: (wallet: string, input?: { cluster?: SynapseSapCluster }) => Promise<IpcResponse<SynapseSapAgent | null>>
    discoverByCapability: (input: SynapseSapDiscoveryInput) => Promise<IpcResponse<SynapseSapDiscoveryResult>>
    discoverByProtocol: (input: SynapseSapDiscoveryInput) => Promise<IpcResponse<SynapseSapDiscoveryResult>>
    registerAgent: (input: SynapseSapRegisterInput) => Promise<IpcResponse<SynapseSapRegisterResult>>
  }

  interface DaemonAllowances {
    getState: (wallet: string, mint: string) => Promise<IpcResponse<AllowanceState>>
    getSubscription: (wallet: string, mint: string) => Promise<IpcResponse<SubscriptionEnrollment>>
  }

  interface DaemonSignalhouse {
    getHealth: () => Promise<IpcResponse<SignalhouseHealth>>
    getStatus: () => Promise<IpcResponse<SignalhouseStatus>>
    getLeaderboard: (opts?: {
      window?: '24h' | '7d' | '30d' | 'all'
      sort?: 'proof_of_edge' | 'realized_pnl' | 'drawdown' | 'copy_safety' | 'stake'
      market?: string
      riskLevel?: string
      limit?: number
    }) => Promise<IpcResponse<SignalhouseStrategy[]>>
    getStrategy: (id: string) => Promise<IpcResponse<SignalhouseStrategyDetail | null>>
    getHistory: (id: string) => Promise<IpcResponse<SignalhouseEquityPoint[]>>
    getVerdicts: (limit?: number) => Promise<IpcResponse<SignalhouseVerdict[]>>
    getPositions: (limit?: number) => Promise<IpcResponse<SignalhousePosition[]>>
  }

  interface DaemonFlywheel {
    preview: (input: FlywheelConfigureInput) => Promise<IpcResponse<FlywheelPreview>>
    configure: (input: FlywheelConfigureInput) => Promise<IpcResponse<FlywheelConfig>>
    state: (configId: string) => Promise<IpcResponse<FlywheelState>>
    claim: (configId: string) => Promise<IpcResponse<{ signature: string; claimedLamports: number; settlementId: string }>>
    distribute: (configId: string, amountSol: number) => Promise<IpcResponse<{ payoutSignature: string | null; buybackSignature: string | null; buybackLamports: number }>>
    buyback: (configId: string, slippageBps?: number) => Promise<IpcResponse<{ swapSignature: string | null; burnSignature: string | null; status: 'swapped' | 'swap-failed' | 'no-jupiter-key' | 'nothing-to-swap'; swapError?: string }>>
    run: (configId: string) => Promise<IpcResponse<{ claimSignature: string | null; claimedSol: number; payoutSignature: string | null; buybackTransferSignature: string | null; swapSignature: string | null; burnSignature: string | null; status: 'swapped' | 'swap-failed' | 'no-jupiter-key' | 'nothing-to-swap'; swapError?: string }>>
    runAll: () => Promise<IpcResponse<Array<{ configId: string; label: string | null; ok: boolean; claimedSol?: number; status?: 'swapped' | 'swap-failed' | 'no-jupiter-key' | 'nothing-to-swap'; error?: string }>>>
    list: () => Promise<IpcResponse<FlywheelConfig[]>>
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

  type AgentTemplate = 'basic' | 'defi-trader' | 'portfolio-monitor' | 'nft-minter' | 'metaplex-meterflow-operator'
  type AgentStationStatus = 'idle' | 'running' | 'stopped'

  interface AgentStationConfig {
    id: string
    name: string
    description: string | null
    template: AgentTemplate
    wallet_id: string | null
    plugins: string
    rpc_url: string | null
    model: string
    project_path: string | null
    status: AgentStationStatus
    created_at: number
    updated_at: number
  }

  interface DaemonAgentStation {
    list: () => Promise<IpcResponse<AgentStationConfig[]>>
    get: (id: string) => Promise<IpcResponse<AgentStationConfig>>
    create: (input: { name: string; description?: string; template: AgentTemplate; wallet_id?: string | null; plugins?: string[]; rpc_url?: string | null; model?: string }) => Promise<IpcResponse<AgentStationConfig>>
    delete: (id: string) => Promise<IpcResponse>
    scaffold: (configId: string, outputDir: string) => Promise<IpcResponse<{ projectPath: string; envPath: string }>>
    pickOutputDir: () => Promise<IpcResponse<string | null>>
    storeKey: (configId: string, privateKey: string) => Promise<IpcResponse>
    hasKey: (configId: string) => Promise<IpcResponse<boolean>>
    deleteKey: (configId: string) => Promise<IpcResponse>
    updateStatus: (id: string, status: AgentStationStatus) => Promise<IpcResponse>
  }
}
