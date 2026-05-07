// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentWork } from '../../src/panels/AgentWork/AgentWork'

const overdueTasks = [
  {
    id: 'funded-overdue',
    title: 'Expired funded task',
    prompt: 'Do funded work',
    acceptance: 'Refund when expired',
    project_id: 'project-1',
    project_name: 'Daemon',
    project_path: null,
    wallet_id: 'wallet-1',
    wallet_name: 'Owner',
    wallet_address: '11111111111111111111111111111111',
    agent_id: 'agent-1',
    agent_name: 'Agent',
    agent_wallet_id: 'agent-wallet-1',
    agent_wallet_address: '11111111111111111111111111111111',
    verifier_wallet: '11111111111111111111111111111111',
    repo_hash: 'repo',
    prompt_hash: 'prompt',
    acceptance_hash: 'acceptance',
    bounty_lamports: 1_000,
    bounty_sol: 0.000001,
    deadline_at: Date.now() - 60_000,
    onchain_task_id: '42',
    create_signature: 'create-sig',
    start_signature: null,
    receipt_signature: null,
    review_signature: null,
    status: 'funded',
    session_id: null,
    commit_hash: null,
    diff_hash: null,
    tests_hash: null,
    artifact_uri: null,
    submitted_at: null,
    approved_at: null,
    settled_signature: null,
    created_at: Date.now() - 120_000,
    updated_at: Date.now() - 120_000,
  },
  {
    id: 'running-overdue',
    title: 'Expired running task',
    prompt: 'Do running work',
    acceptance: 'Refund when expired',
    project_id: 'project-1',
    project_name: 'Daemon',
    project_path: null,
    wallet_id: 'wallet-1',
    wallet_name: 'Owner',
    wallet_address: '11111111111111111111111111111111',
    agent_id: 'agent-1',
    agent_name: 'Agent',
    agent_wallet_id: 'agent-wallet-1',
    agent_wallet_address: '11111111111111111111111111111111',
    verifier_wallet: '11111111111111111111111111111111',
    repo_hash: 'repo',
    prompt_hash: 'prompt',
    acceptance_hash: 'acceptance',
    bounty_lamports: 1_000,
    bounty_sol: 0.000001,
    deadline_at: Date.now() - 60_000,
    onchain_task_id: '43',
    create_signature: 'create-sig',
    start_signature: 'start-sig',
    receipt_signature: null,
    review_signature: null,
    status: 'running',
    session_id: 'session-1',
    commit_hash: null,
    diff_hash: null,
    tests_hash: null,
    artifact_uri: null,
    submitted_at: null,
    approved_at: null,
    settled_signature: null,
    created_at: Date.now() - 120_000,
    updated_at: Date.now() - 120_000,
  },
] as AgentWorkTask[]

function installDaemonBridge() {
  const expireAgentWork = vi.fn().mockResolvedValue({ ok: true, data: overdueTasks[0] })
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      registry: {
        listAgentWork: vi.fn().mockResolvedValue({ ok: true, data: overdueTasks }),
        createAgentWork: vi.fn(),
        fundAgentWork: vi.fn(),
        startAgentWork: vi.fn(),
        submitAgentWork: vi.fn(),
        approveAgentWork: vi.fn(),
        rejectAgentWork: vi.fn(),
        settleAgentWork: vi.fn(),
        expireAgentWork,
      },
      projects: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
      wallet: {
        list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        agentWallets: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      agents: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
      terminal: { spawnAgent: vi.fn() },
      shell: { openExternal: vi.fn() },
    },
  })
  return { expireAgentWork }
}

describe('AgentWork', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes overdue funded and running tasks to expiry instead of start or submit', async () => {
    const { expireAgentWork } = installDaemonBridge()

    render(<AgentWork />)

    const expiryButtons = await screen.findAllByRole('button', { name: 'Expire / Refund' })
    expect(expiryButtons).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Start Agent' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit Receipt' })).not.toBeInTheDocument()

    await userEvent.click(expiryButtons[0])

    expect(expireAgentWork).toHaveBeenCalledWith('funded-overdue')
  })
})
