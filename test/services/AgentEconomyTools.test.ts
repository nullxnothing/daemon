import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AriaTool, AriaToolContext } from '../../electron/services/aria/AriaTool'

const idleMocks = vi.hoisted(() => ({
  listResources: vi.fn(),
}))

const agentEconomyMocks = vi.hoisted(() => ({
  listProfiles: vi.fn(),
  checkPolicy: vi.fn(),
  listReceipts: vi.fn(),
  executePaidCall: vi.fn(),
}))

const metaplexMocks = vi.hoisted(() => ({
  readAgentIdentity: vi.fn(),
  registerAgentIdentity: vi.fn(),
}))

vi.mock('../../electron/services/AgentEconomyService', () => agentEconomyMocks)
vi.mock('../../electron/services/IdlePaidCallService', () => idleMocks)
vi.mock('../../electron/services/MetaplexOperatorService', () => metaplexMocks)

import { agentEconomyTools } from '../../electron/services/aria/tools/agentEconomy'

function tool(name: string): AriaTool {
  const found = agentEconomyTools.find((item) => item.name === name)
  if (!found) throw new Error(`Missing tool ${name}`)
  return found
}

function ctx(): AriaToolContext {
  return {
    sessionId: 'session-1',
    snapshot: { activeProjectId: 'project-1' } as AriaToolContext['snapshot'],
    runUiEffect: vi.fn(),
  }
}

const policy = {
  maxPerCallUsdc: 0.05,
  maxPerTaskUsdc: 0.1,
  allowedDomains: ['gateway.earnidle.com'],
  allowedNetworks: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
  allowedAssets: ['USDC'],
  allowedPayees: ['7Y12wallet9AbC'],
  receiptRequired: true,
}

describe('agentEconomyTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes paid execution as sensitive and marks human approval only inside the gated handler', async () => {
    agentEconomyMocks.executePaidCall.mockResolvedValue({
      status: 'executed',
      allowed: true,
      reasons: [],
      requiresSignature: false,
      receipt: { status: 'settled', amountUsdc: 0.01, asset: 'USDC', errorMessage: null },
    })

    const paidCall = tool('agenteconomy_execute_paid_call')
    expect(paidCall.risk).toBe('sensitive')

    const result = await paidCall.handler({
      resourceId: 'resource-1',
      profileId: 'profile-1',
      taskId: 'task-1',
      requestBody: { prompt: 'quote' },
      paymentSignature: 'payment-secret',
    }, ctx())

    expect(result.ok).toBe(true)
    expect(agentEconomyMocks.executePaidCall).toHaveBeenCalledWith({
      profileId: 'profile-1',
      resourceId: 'resource-1',
      projectId: 'project-1',
      taskId: 'task-1',
      requestBody: { prompt: 'quote' },
      paymentSignature: 'payment-secret',
      approvedBy: 'aria',
    })
  })

  it('checks paid resource policy as read-only without setting human approval', async () => {
    agentEconomyMocks.checkPolicy.mockReturnValue({
      allowed: false,
      reasons: ['Endpoint host is not on the route allowlist.'],
      resource: null,
      spentThisTaskUsdc: 0,
      remainingTaskBudgetUsdc: 0.1,
    })

    const policyCheck = tool('agenteconomy_check_policy')
    expect(policyCheck.risk).toBe('read')

    const result = await policyCheck.handler({
      profileId: 'profile-1',
      resourceId: 'resource-1',
      taskId: 'task-1',
    }, ctx())

    expect(result.ok).toBe(true)
    expect(agentEconomyMocks.checkPolicy).toHaveBeenCalledWith({
      profileId: 'profile-1',
      resourceId: 'resource-1',
      projectId: 'project-1',
      taskId: 'task-1',
    })
  })

  it('keeps devnet identity registration sensitive and read identity read-only', async () => {
    metaplexMocks.readAgentIdentity.mockResolvedValue({ registered: false, asset: 'asset-1' })
    metaplexMocks.registerAgentIdentity.mockResolvedValue({ asset: 'asset-1', signature: 'sig-1' })

    const readIdentity = tool('agenteconomy_read_devnet_identity')
    const registerIdentity = tool('agenteconomy_register_devnet_identity')

    expect(readIdentity.risk).toBe('read')
    expect(registerIdentity.risk).toBe('sensitive')

    await readIdentity.handler({ assetAddress: 'asset-1' }, ctx())
    await registerIdentity.handler({
      walletId: 'wallet-1',
      assetAddress: 'asset-1',
      agentRegistrationUri: 'https://example.com/agent.json',
      confirmedAt: 123,
      acknowledgement: 'REGISTER AGENT IDENTITY',
    }, ctx())

    expect(metaplexMocks.readAgentIdentity).toHaveBeenCalledWith({
      network: 'devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      assetAddress: 'asset-1',
    })
    expect(metaplexMocks.registerAgentIdentity).toHaveBeenCalledWith({
      walletId: 'wallet-1',
      network: 'devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      assetAddress: 'asset-1',
      agentRegistrationUri: 'https://example.com/agent.json',
      confirmedAt: 123,
      acknowledgement: 'REGISTER AGENT IDENTITY',
    })
  })
})
