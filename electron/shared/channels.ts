/**
 * Typed channel map for IPC type safety.
 * Maps each IPC channel name to its input and output types.
 * This enables future type-safe IPC wrappers without rewriting the preload.
 */

import type {
  Project,
  Agent,
  FileEntry,
  RuntimeIconTheme,
  ClaudeAgentFile,
  McpEntry,
  SkillEntry,
  AnthropicStatus,
  SessionUsage,
  SecureKeyEntry,
  ClaudeMdData,
  ClaudeConnection,
  ProcessInfo,
  OrphanProcess,
  GitFile,
  GitCommit,
  GitBranches,
  ListeningPort,
  RegisteredPort,
  GhostPort,
  WalletListEntry,
  WalletDashboard,
  TerminalCreateOutput,
  PluginRow,
  PluginCreateInput,
  UiSettings,
  ProjectCreateInput,
  AgentCreateInput,
  McpAddInput,
  ToolRow,
  ToolCreateInput,
} from './types'

export interface ChannelMap {
  // --- Projects ---
  'projects:list': { input: void; output: Project[] }
  'projects:create': { input: { name: string; path: string }; output: Project }
  'projects:delete': { input: string; output: void }
  'projects:openDialog': { input: void; output: string | null }

  // --- Terminal ---
  'terminal:create': { input: { cwd?: string; startupCommand?: string; userInitiated?: boolean }; output: TerminalCreateOutput }
  'terminal:spawnAgent': { input: { agentId: string; projectId: string }; output: TerminalCreateOutput }
  'terminal:kill': { input: string; output: void }
  'terminal:paste-from-clipboard': { input: string; output: { pasted: boolean } }

  // --- File System ---
  'fs:readDir': { input: [dirPath: string, depth?: number]; output: FileEntry[] }
  'fs:readFile': { input: string; output: { path: string; content: string } }
  'fs:writeFile': { input: [filePath: string, content: string]; output: void }
  'fs:createFile': { input: string; output: void }
  'fs:createDir': { input: string; output: void }
  'fs:rename': { input: [oldPath: string, newPath: string]; output: void }
  'fs:delete': { input: string; output: void }
  'fs:reveal': { input: string; output: void }
  'fs:copyPath': { input: string; output: void }
  'fs:iconTheme': { input: void; output: RuntimeIconTheme | null }

  // --- Agents ---
  'agents:list': { input: void; output: Agent[] }
  'agents:claude-list': { input: void; output: ClaudeAgentFile[] }
  'agents:import-claude': { input: string; output: Agent }
  'agents:create': { input: AgentCreateInput; output: Agent }
  'agents:update': { input: [id: string, data: Record<string, unknown>]; output: Agent }
  'agents:delete': { input: string; output: void }

  // --- Git ---
  'git:branch': { input: string; output: string | null }
  'git:branches': { input: string; output: GitBranches }
  'git:status': { input: string; output: GitFile[] }
  'git:stage': { input: [cwd: string, files: string[]]; output: void }
  'git:unstage': { input: [cwd: string, files: string[]]; output: void }
  'git:commit': { input: [cwd: string, message: string]; output: void }
  'git:push': { input: string; output: string }
  'git:log': { input: [cwd: string, count?: number]; output: GitCommit[] }
  'git:diff': { input: [cwd: string, filePath?: string]; output: string }
  'git:diff-staged': { input: string; output: string }

  // --- Claude ---
  'claude:project-mcp-all': { input: string; output: McpEntry[] }
  'claude:global-mcp-all': { input: void; output: McpEntry[] }
  'claude:skills': { input: void; output: SkillEntry[] }
  'claude:status': { input: void; output: AnthropicStatus }
  'claude:usage': { input: string | undefined; output: SessionUsage }
  'claude:list-keys': { input: void; output: SecureKeyEntry[] }
  'claude:claudemd-read': { input: string; output: ClaudeMdData }
  'claude:get-connection': { input: void; output: ClaudeConnection | null }
  'claude:verify-connection': { input: void; output: ClaudeConnection }
  'claude:suggest-commit-message': { input: string; output: string }
  'claude:tidy-markdown': { input: [filePath: string, content: string]; output: string }
  'claude:mcp-add': { input: McpAddInput; output: void }

  // --- Process ---
  'process:list': { input: void; output: ProcessInfo[] }
  'process:orphans': { input: void; output: OrphanProcess[] }
  'process:kill': { input: number; output: void }

  // --- Ports ---
  'ports:scan': { input: void; output: ListeningPort[] }
  'ports:registered': { input: void; output: RegisteredPort[] }
  'ports:ghosts': { input: void; output: GhostPort[] }
  'ports:kill': { input: number; output: void }

  // --- Wallet ---
  'wallet:dashboard': { input: string | null; output: WalletDashboard }
  'wallet:list': { input: void; output: WalletListEntry[] }

  // --- Settings ---
  'settings:get-ui': { input: void; output: UiSettings }
  'settings:is-onboarding-complete': { input: void; output: boolean }

  // --- Plugins ---
  'plugins:list': { input: void; output: PluginRow[] }
  'plugins:add': { input: PluginCreateInput; output: PluginRow }
  'plugins:set-enabled': { input: [string, boolean]; output: void }
  'plugins:set-config': { input: [string, string]; output: void }
  'plugins:reorder': { input: string[]; output: void }

  // --- Tools ---
  'tools:list': { input: void; output: ToolRow[] }
  'tools:get': { input: string; output: ToolRow }
  'tools:create': { input: ToolCreateInput; output: ToolRow }
}

/** Extract the input type for a given channel */
export type ChannelInput<C extends keyof ChannelMap> = ChannelMap[C]['input']

/** Extract the output type for a given channel */
export type ChannelOutput<C extends keyof ChannelMap> = ChannelMap[C]['output']
