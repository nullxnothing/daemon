export interface ToolAlias {
  toolId: string
  subView?: string
}

// Legacy / folded tool ids redirect into the sub-view of their pack host panel.
// Keeps deep-links, pins, and ARIA navigation working after consolidation.
export const TOOL_ALIASES: Record<string, ToolAlias> = {
  // Solana pack → SolanaToolbox views
  integrations: { toolId: 'solana-toolbox', subView: 'integrations' },
  'project-readiness': { toolId: 'solana-toolbox', subView: 'start' },
  'block-scanner': { toolId: 'solana-toolbox', subView: 'scanner' },
  'replay-engine': { toolId: 'solana-toolbox', subView: 'replay' },
  'metaplex-demo': { toolId: 'solana-toolbox', subView: 'metaplex' },

  // Wallet pack → WalletPanel tabs
  dashboard: { toolId: 'wallet', subView: 'portfolio' },
  ricomaps: { toolId: 'wallet', subView: 'forensics' },

  // Launch pack → TokenLaunchTool tabs
  'proof-pool': { toolId: 'token-launch', subView: 'proof-pool' },
  clawpump: { toolId: 'token-launch', subView: 'clawpump' },
  flywheel: { toolId: 'token-launch', subView: 'flywheel' },
  degentools: { toolId: 'token-launch', subView: 'degentools' },

  // Agent pack → DaemonAI host tabs
  'agent-station': { toolId: 'daemon-ai', subView: 'station' },
  'agent-work': { toolId: 'daemon-ai', subView: 'work' },
  agentops: { toolId: 'daemon-ai', subView: 'ops' },

  // Markets pack → Signalhouse host tabs
  hackathon: { toolId: 'signalhouse', subView: 'hackathon' },
  meterflow: { toolId: 'signalhouse', subView: 'meterflow' },
  zauth: { toolId: 'signalhouse', subView: 'zauth' },
}

export function resolveToolAlias(toolId: string): ToolAlias {
  return TOOL_ALIASES[toolId] ?? { toolId }
}
