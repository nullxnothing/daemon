import { useUIStore } from '../../store/ui'
import { useWorkflowShellStore } from '../../store/workflowShell'

/** Dispatch scaffold prompts to the Solana Agent via terminal */

async function spawnAndShowAgent(projectId: string, prompt: string, taskLabel: string): Promise<void> {
  const state = useUIStore.getState()

  // Close drawer so terminal is visible
  useWorkflowShellStore.getState().closeDrawer()

  const res = await window.daemon.terminal.spawnAgent({
    agentId: 'solana-agent',
    projectId,
    initialPrompt: prompt,
  })

  if (res.ok && res.data) {
    // Add the terminal tab with a descriptive label
    state.addTerminal(
      projectId,
      res.data.id,
      taskLabel,
      res.data.agentId ?? 'solana-agent',
    )
  }
}

export async function scaffoldX402(projectId: string): Promise<void> {
  await spawnAndShowAgent(
    projectId,
    'Add x402 payment middleware to this project using @payai/x402-express (or the appropriate framework variant for this project). Check package.json to determine the framework. Set up a basic paid endpoint example with USDC pricing via the PayAI facilitator.',
    'x402 Scaffold',
  )
}

export async function scaffoldMpp(projectId: string): Promise<void> {
  await spawnAndShowAgent(
    projectId,
    'Add Machine Payments Protocol (MPP) client to this project. Install @solana/mpp and set up a basic MppClient configuration for autonomous USDC payments on Solana. Create a helper module that other parts of the project can import.',
    'MPP Scaffold',
  )
}

export async function scaffoldLightProtocol(projectId: string): Promise<void> {
  await spawnAndShowAgent(
    projectId,
    [
      'Add a Light Protocol / ZK Compression starter to this project.',
      'Check package.json first, then install @lightprotocol/stateless.js and @lightprotocol/compressed-token if missing.',
      'Add env documentation for RPC_URL or RPC_ENDPOINT pointing at a ZK Compression-enabled RPC, preferably Helius.',
      'Create a small helper module that initializes createRpc from @lightprotocol/stateless.js and exposes read-only helpers for indexer health and getCompressedTokenAccountsByOwner.',
      'Include a simple rent/cost note or estimator for compressed token accounts versus SPL token accounts.',
      'Keep this starter read-only by default: do not send mint, compress, transfer, or airdrop transactions unless the user explicitly confirms a follow-up task.',
      'Document Light-specific constraints in the code or README: keep compressed account batches small, use compute budget instructions for proof verification flows, and preview transaction cost before signing.',
    ].join(' '),
    'Light Protocol Scaffold',
  )
}
