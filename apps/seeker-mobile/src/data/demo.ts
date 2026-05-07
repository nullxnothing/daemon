import type { ApprovalRequest, ProjectSnapshot } from '../types'

export const demoProject: ProjectSnapshot = {
  name: 'Daemon Hackathon Build',
  readiness: 87,
  framework: 'Anchor + Next.js',
  validatorOnline: true,
  enabledIntegrations: 5,
  pendingApprovals: 3,
  lastDeploy: 'Devnet deploy ready',
  walletBalance: '4.21 SOL',
}

export const demoApprovals: ApprovalRequest[] = [
  {
    id: 'agent-diff-001',
    title: 'Agent wants to apply a file diff',
    description: '4 files changed across the Solana toolbox and Seeker companion surface.',
    risk: 'medium',
    status: 'pending',
    source: 'agent',
    diffSummary: '+ Seeker tab, + approval queue, + mobile pairing placeholder',
    createdAt: Date.now() - 1000 * 60 * 2,
  },
  {
    id: 'deploy-devnet-001',
    title: 'Devnet deploy request',
    description: 'Daemon prepared a devnet deploy. Review the command before signing on Seeker.',
    risk: 'high',
    status: 'pending',
    source: 'deploy',
    command: 'anchor build && anchor deploy --provider.cluster devnet',
    createdAt: Date.now() - 1000 * 60 * 7,
  },
  {
    id: 'x402-payment-001',
    title: 'USDC payment test',
    description: 'Run a small x402 payment flow to verify premium agent marketplace access.',
    risk: 'low',
    status: 'pending',
    source: 'wallet',
    createdAt: Date.now() - 1000 * 60 * 11,
  },
]
