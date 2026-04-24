import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrepare } = vi.hoisted(() => ({
  mockPrepare: vi.fn(),
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: mockPrepare,
  }),
}))

vi.mock('../../electron/services/SettingsService', () => ({
  getWalletInfrastructureSettings: vi.fn(() => ({
    rpcProvider: 'helius',
    quicknodeRpcUrl: '',
    customRpcUrl: '',
    swapProvider: 'jupiter',
    preferredWallet: 'phantom',
    executionMode: 'jito',
    jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
  })),
}))

import {
  createSolanaActivity,
  listSolanaActivity,
  markSolanaActivityConfirmed,
  markSolanaActivityFailed,
} from '../../electron/services/SolanaActivityService'

describe('SolanaActivityService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a pending Solana activity with shared runtime metadata', () => {
    const run = vi.fn()
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO solana_activity')) return { run }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
    })

    const id = createSolanaActivity({
      walletId: 'wallet-1',
      kind: 'send-sol',
      title: 'SOL transfer',
      detail: 'Preparing to send SOL.',
      fromAddress: 'from-wallet',
      toAddress: 'to-wallet',
      inputSymbol: 'SOL',
      inputAmount: 1.25,
    })

    expect(id).toMatch(/[0-9a-f-]{36}/)
    expect(run).toHaveBeenCalledWith(
      expect.any(String),
      'wallet-1',
      'send-sol',
      'pending',
      'helius',
      'jito',
      null,
      null,
      'SOL transfer',
      'Preparing to send SOL.',
      'from-wallet',
      'to-wallet',
      null,
      null,
      'SOL',
      null,
      1.25,
      null,
      null,
      '{}',
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('updates a Solana activity as confirmed and preserves metadata', () => {
    const run = vi.fn()
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT metadata_json FROM solana_activity')) {
        return { get: vi.fn().mockReturnValue({ metadata_json: '{"quote":"kept"}' }) }
      }
      if (sql.includes('UPDATE solana_activity')) return { run }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
    })

    markSolanaActivityConfirmed('activity-1', {
      signature: 'sig-123',
      transport: 'rpc',
      detail: 'Confirmed.',
      metadata: { route: 'jupiter' },
    })

    expect(run).toHaveBeenCalledWith(
      'confirmed',
      'sig-123',
      'rpc',
      'Confirmed.',
      null,
      JSON.stringify({ quote: 'kept', route: 'jupiter' }),
      expect.any(Number),
      'activity-1',
    )
  })

  it('lists Solana activity rows as renderer-safe entries', () => {
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM solana_activity')) {
        return {
          all: vi.fn().mockReturnValue([{
            id: 'activity-1',
            wallet_id: 'wallet-1',
            kind: 'swap',
            status: 'failed',
            provider: 'public',
            execution_mode: 'rpc',
            transport: null,
            signature: null,
            title: 'Jupiter swap',
            detail: 'Swap failed.',
            from_address: 'from-wallet',
            to_address: null,
            input_mint: 'sol',
            output_mint: 'usdc',
            input_symbol: 'SOL',
            output_symbol: 'USDC',
            input_amount: 1,
            output_amount: 145,
            error: 'route failed',
            metadata_json: '{"slippageBps":50}',
            created_at: 10,
            updated_at: 11,
          }]),
        }
      }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
    })

    expect(listSolanaActivity(10, 'wallet-1')).toEqual([{
      id: 'activity-1',
      walletId: 'wallet-1',
      kind: 'swap',
      status: 'failed',
      provider: 'public',
      executionMode: 'rpc',
      transport: null,
      signature: null,
      title: 'Jupiter swap',
      detail: 'Swap failed.',
      fromAddress: 'from-wallet',
      toAddress: null,
      inputMint: 'sol',
      outputMint: 'usdc',
      inputSymbol: 'SOL',
      outputSymbol: 'USDC',
      inputAmount: 1,
      outputAmount: 145,
      error: 'route failed',
      metadataJson: '{"slippageBps":50}',
      createdAt: 10,
      updatedAt: 11,
    }])
  })

  it('marks a Solana activity as failed with the failure detail', () => {
    const run = vi.fn()
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT metadata_json FROM solana_activity')) {
        return { get: vi.fn().mockReturnValue({ metadata_json: '{}' }) }
      }
      if (sql.includes('UPDATE solana_activity')) return { run }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
    })

    markSolanaActivityFailed('activity-2', 'timeout', {
      detail: 'Swap failed: timeout',
      metadata: { stage: 'confirm' },
    })

    expect(run).toHaveBeenCalledWith(
      'failed',
      'Swap failed: timeout',
      'timeout',
      JSON.stringify({ stage: 'confirm' }),
      expect.any(Number),
      'activity-2',
    )
  })

  it('supports deterministic runtime warnings without a wallet id', () => {
    const run = vi.fn()
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO solana_activity')) return { run }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
    })

    const id = createSolanaActivity({
      id: 'runtime-warning:missing-validator',
      kind: 'runtime-warning',
      status: 'failed',
      title: 'Local validator missing',
      detail: 'Neither Surfpool nor solana-test-validator is installed.',
      fromAddress: 'daemon-runtime',
    })

    expect(id).toBe('runtime-warning:missing-validator')
    expect(run).toHaveBeenCalledWith(
      'runtime-warning:missing-validator',
      null,
      'runtime-warning',
      'failed',
      'helius',
      'jito',
      null,
      null,
      'Local validator missing',
      'Neither Surfpool nor solana-test-validator is installed.',
      'daemon-runtime',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      '{}',
      expect.any(Number),
      expect.any(Number),
    )
  })
})
