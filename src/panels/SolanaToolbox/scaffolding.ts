import { useUIStore } from '../../store/ui'

/** Dispatch scaffold prompts to the Solana Agent via terminal */

async function spawnAndShowAgent(projectId: string, prompt: string, taskLabel: string): Promise<void> {
  const state = useUIStore.getState()

  // Close drawer so terminal is visible
  state.closeDrawer()

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
