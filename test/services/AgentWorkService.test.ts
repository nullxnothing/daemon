import { beforeEach, describe, expect, it, vi } from 'vitest'

type TaskRow = Record<string, unknown> & {
  id: string
  status: string
  settled_signature: string | null
  updated_at: number
}

const state = vi.hoisted(() => ({
  tasks: new Map<string, TaskRow>(),
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: (sql: string) => ({
      get: (id: string) => {
        if (sql.includes('FROM agent_work_tasks t')) return state.tasks.get(id)
        return undefined
      },
      all: () => [],
      run: (...args: unknown[]) => {
        if (sql.includes("SET status = 'settled'")) {
          const [settledSignature, updatedAt, id] = args as [string, number, string]
          const row = state.tasks.get(id)
          if (row) {
            row.status = 'settled'
            row.settled_signature = settledSignature
            row.updated_at = updatedAt
          }
        }
      },
    }),
  }),
}))

vi.mock('../../electron/services/SolanaService', () => ({
  loadKeypair: vi.fn(),
}))

vi.mock('../../electron/services/SessionRegistryService', () => ({
  agentWorkTaskIdToU64: vi.fn(() => 1n),
  getRegistryConnection: vi.fn(),
  publishApproveWork: vi.fn(),
  publishCreateTask: vi.fn(),
  publishExpireTask: vi.fn(),
  publishRejectWork: vi.fn(),
  publishSettleTask: vi.fn(),
  publishStartTaskSession: vi.fn(),
  publishSubmitWorkReceipt: vi.fn(),
}))

import { expireTask, submitReceipt } from '../../electron/services/AgentWorkService'

function insertTask(overrides: Partial<TaskRow> = {}): void {
  const row: TaskRow = {
    id: 'task-1',
    title: 'Fix registry',
    prompt: 'Patch the registry',
    acceptance: 'Tests pass',
    project_id: null,
    project_name: null,
    project_path: null,
    wallet_id: null,
    wallet_name: null,
    wallet_address: null,
    agent_id: null,
    agent_name: null,
    agent_wallet_id: null,
    agent_wallet_address: null,
    verifier_wallet: null,
    repo_hash: 'repo',
    prompt_hash: 'prompt',
    acceptance_hash: 'acceptance',
    bounty_lamports: 1_000,
    deadline_at: Date.now() - 1_000,
    onchain_task_id: null,
    create_signature: null,
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
    created_at: Date.now() - 10_000,
    updated_at: Date.now() - 10_000,
    ...overrides,
  }
  state.tasks.set(row.id, row)
}

describe('AgentWorkService expiry handling', () => {
  beforeEach(() => {
    state.tasks.clear()
  })

  it('settles overdue local funded tasks with an expiry proof', async () => {
    insertTask()

    const task = await expireTask('task-1')

    expect(task.status).toBe('settled')
    expect(task.settled_signature).toMatch(/^local:expired:/)
  })

  it('rejects expiry before the deadline has passed', async () => {
    insertTask({ deadline_at: Date.now() + 60_000 })

    await expect(expireTask('task-1')).rejects.toThrow('Task deadline has not passed yet')
  })

  it('rejects late work receipts before creating receipt metadata', async () => {
    insertTask({ status: 'running' })

    await expect(submitReceipt('task-1')).rejects.toThrow(
      'Cannot submit work receipt: task deadline has passed',
    )
  })
})
