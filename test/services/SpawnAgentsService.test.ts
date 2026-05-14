import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetch = vi.fn()

vi.mock('../../electron/services/SolanaService', () => ({
  executeInstructions: vi.fn(),
  getConnection: vi.fn(),
  withKeypair: vi.fn(),
}))

vi.mock('../../electron/db/db', () => ({
  getDb: vi.fn(),
}))

vi.stubGlobal('fetch', mockFetch)

import { initiateSpawn } from '../../electron/services/SpawnAgentsService'
import type { SpawnInput } from '../../electron/services/SpawnAgentsService'

function mockSpawnResponse() {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      payment_id: 'payment-1',
      agent_id: 'agent-1',
      agent_name: 'Edge Test',
      amount: 0.5,
      reference: '11111111111111111111111111111111',
      recipient: '22222222222222222222222222222222',
      dna: {},
    }),
  })
}

function postedBody() {
  const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
  const init = call[1] as RequestInit
  return JSON.parse(String(init.body)) as SpawnInput
}

describe('SpawnAgentsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSpawnResponse()
  })

  it('normalizes prediction edge threshold percent points to API ratio', async () => {
    await initiateSpawn({
      owner_wallet: 'Owner111111111111111111111111111111111',
      name: 'Edge Test',
      sol_amount: 0.5,
      dna: {
        trades_memecoins: true,
        trades_prediction: true,
        pm_edge_threshold: 5,
      },
    })

    expect(postedBody().dna.pm_edge_threshold).toBe(0.05)
  })

  it('keeps already-normalized prediction edge threshold ratios unchanged', async () => {
    await initiateSpawn({
      owner_wallet: 'Owner111111111111111111111111111111111',
      name: 'Edge Test',
      sol_amount: 0.5,
      dna: {
        trades_memecoins: true,
        trades_prediction: true,
        pm_edge_threshold: 0.07,
      },
    })

    expect(postedBody().dna.pm_edge_threshold).toBe(0.07)
  })
})
