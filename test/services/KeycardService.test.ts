import crypto from 'node:crypto'
import { Keypair } from '@solana/web3.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentWorkTask } from '../../electron/shared/types'

const { mockFetch, mockLoadKeypair } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockLoadKeypair: vi.fn(),
}))

vi.stubGlobal('fetch', mockFetch)

vi.mock('../../electron/services/SolanaService', () => ({
  loadKeypair: mockLoadKeypair,
}))

import { createAgentWorkCapsule } from '../../electron/services/KeycardService'

function hashHex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function task(walletAddress: string): AgentWorkTask {
  return {
    id: 'task-keycard-1',
    title: 'Seal private receipt',
    prompt: 'Patch the repo',
    acceptance: 'Tests pass',
    project_id: 'project-1',
    project_name: 'DAEMON',
    project_path: 'C:/work/daemon',
    wallet_id: 'wallet-1',
    wallet_name: 'Owner',
    wallet_address: walletAddress,
    agent_id: 'agent-1',
    agent_name: 'Agent',
    agent_wallet_id: 'agent-wallet-1',
    agent_wallet_address: '11111111111111111111111111111111',
    verifier_wallet: walletAddress,
    repo_hash: 'repo-hash',
    prompt_hash: 'prompt-hash',
    acceptance_hash: 'acceptance-hash',
    bounty_lamports: 1_000,
    bounty_sol: 0.000001,
    deadline_at: Date.now() + 60_000,
    onchain_task_id: '42',
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
    keycard_gate_id: null,
    keycard_open_url: null,
    keycard_capsule_hash: null,
    keycard_created_at: null,
    submitted_at: null,
    approved_at: null,
    settled_signature: null,
    created_at: Date.now() - 120_000,
    updated_at: Date.now() - 60_000,
  }
}

describe('KeycardService', () => {
  const originalKeycardBase = process.env.KEYCARD_API_BASE

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.KEYCARD_API_BASE = 'https://keycard.test'
    const keypair = Keypair.generate()
    mockLoadKeypair.mockReturnValue(keypair)
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          challengeId: 'challenge-1',
          message: [
            'KEYCARD admin action',
            'Version: 2',
            'Domain: keycard.test',
            'Action: create-gate',
            'Gate: new',
            `Wallet: ${keypair.publicKey.toBase58()}`,
            'Issued At: 2026-05-25T00:00:00.000Z',
            'Challenge: challenge-1',
          ].join('\n'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          gate: { id: 'gate-1' },
          openUrl: '/open/gate-1',
          adminUrl: '/gates/gate-1',
        }),
      })
  })

  afterEach(() => {
    if (originalKeycardBase === undefined) delete process.env.KEYCARD_API_BASE
    else process.env.KEYCARD_API_BASE = originalKeycardBase
  })

  it('creates a signed 1M DAEMON KEYCARD gate for an agent work capsule', async () => {
    const walletAddress = mockLoadKeypair().publicKey.toBase58()
    mockLoadKeypair.mockClear()

    const result = await createAgentWorkCapsule(task(walletAddress), {
      commitHash: 'commit-hash',
      diffHash: 'diff-hash',
      testsHash: 'tests-hash',
      diff: 'diff --git a/file.ts b/file.ts',
      status: '{"files":[]}',
      testsOutput: 'passed',
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[0][0]).toBe('https://keycard.test/v1/challenges')

    const form = mockFetch.mock.calls[1][1].body as FormData
    expect(form.get('gateType')).toBe('spl')
    expect(form.get('mint')).toBe('4vpf4qNtNVkvz2dm5qL2mT6jBXH9gDY8qH2QsHN5pump')
    expect(form.get('minAmount')).toBe('1000000')
    expect(form.get('ownerWallet')).toBe(walletAddress)
    expect(form.get('adminChallengeId')).toBe('challenge-1')
    expect(String(form.get('adminSignature'))).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/)

    const file = form.get('file') as File
    const capsule = await file.text()
    expect(result).toMatchObject({
      gateId: 'gate-1',
      openUrl: 'https://keycard.test/open/gate-1',
      adminUrl: 'https://keycard.test/gates/gate-1',
      artifactUri: `keycard://gate-1#sha256=${hashHex(capsule)}`,
      capsuleHash: hashHex(capsule),
    })
  })
})
