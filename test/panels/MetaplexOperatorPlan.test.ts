import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_TOKEN_OPERATOR_DRAFT,
  DEFAULT_DAS_INSPECTOR_INPUT,
  buildAgentTokenOperatorPlan,
  buildDasInspectorRequest,
  buildOperatorReceipt,
} from '../../src/panels/MetaplexDemo/operatorPlan'
import { createCoreAgentAsset } from '../../electron/services/MetaplexOperatorService'

describe('Metaplex operator plan', () => {
  it('keeps agent token launch execution behind a wallet gate', () => {
    const plan = buildAgentTokenOperatorPlan(DEFAULT_AGENT_TOKEN_OPERATOR_DRAFT, '2026-05-19T00:00:00.000Z')

    expect(plan.status).toBe('preview-only')
    expect(plan.walletApprovalGate.requiredBefore).toContain('set token')
    expect(plan.walletApprovalGate.requiredBefore).toContain('create Genesis launch')
    expect(plan.warnings.join(' ')).toMatch(/irreversible/)
    expect(plan.stages.map((stage) => stage.id)).toEqual([
      'agent-core-asset',
      'agent-registry',
      'genesis-launch-config',
      'set-token-warning',
      'post-write-das',
    ])
  })

  it('stores preview receipts without pretending execution happened', () => {
    const plan = buildAgentTokenOperatorPlan(DEFAULT_AGENT_TOKEN_OPERATOR_DRAFT, '2026-05-19T00:00:00.000Z')
    const receipt = buildOperatorReceipt(plan, '2026-05-19T00:00:01.000Z')

    expect(receipt.status).toBe('previewed')
    expect(receipt.signatures).toEqual([])
    expect(receipt.notes.join(' ')).toMatch(/not an execution receipt/)
  })

  it('builds DAS requests only when the selected target is present', () => {
    expect(buildDasInspectorRequest(DEFAULT_DAS_INSPECTOR_INPUT)).toBeNull()
    expect(buildDasInspectorRequest({
      ...DEFAULT_DAS_INSPECTOR_INPUT,
      method: 'getAssetsByOwner',
      owner: '11111111111111111111111111111111',
    })).toEqual({
      jsonrpc: '2.0',
      id: 'daemon-metaplex-getAssetsByOwner',
      method: 'getAssetsByOwner',
      params: { ownerAddress: '11111111111111111111111111111111', page: 1, limit: 10 },
    })
  })

  it('blocks live Metaplex writes before wallet and acknowledgement gates', async () => {
    await expect(createCoreAgentAsset({
      walletId: '',
      network: 'devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      name: 'DAEMON Operator Agent',
      uri: 'https://example.com/daemon-agent-metadata.json',
      confirmedAt: Date.now(),
      acknowledgement: '',
    })).rejects.toThrow(/Select a DAEMON signing wallet/)

    await expect(createCoreAgentAsset({
      walletId: 'wallet-1',
      network: 'devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      name: 'DAEMON Operator Agent',
      uri: 'https://example.com/daemon-agent-metadata.json',
      confirmedAt: Date.now(),
      acknowledgement: 'wrong',
    })).rejects.toThrow(/CREATE DEVNET CORE ASSET/)
  })
})
