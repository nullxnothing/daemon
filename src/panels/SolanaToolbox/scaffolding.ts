/** Dispatch scaffold prompts to the Solana Agent via terminal */

export async function scaffoldX402(projectId: string): Promise<void> {
  await window.daemon.terminal.spawnAgent({
    agentId: 'solana-agent',
    projectId,
    initialPrompt: 'Add x402 payment middleware to this project using @payai/x402-express (or the appropriate framework variant for this project). Check package.json to determine the framework. Set up a basic paid endpoint example with USDC pricing via the PayAI facilitator.',
  })
}

export async function scaffoldMpp(projectId: string): Promise<void> {
  await window.daemon.terminal.spawnAgent({
    agentId: 'solana-agent',
    projectId,
    initialPrompt: 'Add Machine Payments Protocol (MPP) client to this project. Install @solana/mpp and set up a basic MppClient configuration for autonomous USDC payments on Solana. Create a helper module that other parts of the project can import.',
  })
}
