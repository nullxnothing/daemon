import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSolanaRuntimeStatus, mockListWallets } = vi.hoisted(() => ({
  mockGetSolanaRuntimeStatus: vi.fn(),
  mockListWallets: vi.fn(),
}))

vi.mock('../../electron/services/SolanaRuntimeStatusService', () => ({
  getSolanaRuntimeStatus: mockGetSolanaRuntimeStatus,
}))

vi.mock('../../electron/services/WalletService', () => ({
  listWallets: mockListWallets,
}))

import { previewSolanaTransaction } from '../../electron/services/SolanaTransactionPreviewService'

describe('SolanaTransactionPreviewService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSolanaRuntimeStatus.mockReturnValue({
      rpc: { label: 'Helius', detail: 'Helius key connected', status: 'live' },
      walletPath: { label: 'Phantom-first', detail: 'Phantom flow', status: 'live' },
      swapEngine: { label: 'Jupiter', detail: 'Jupiter ready', status: 'live' },
      executionBackend: { label: 'Shared RPC executor', detail: 'Shared executor', status: 'live' },
      executionCoverage: [],
      troubleshooting: [],
      preflight: {
        ready: true,
        checks: [],
        blockers: [],
      },
      executionPath: {
        mode: 'rpc',
        label: 'Standard RPC submission',
        detail: 'Helius handles reads, transaction construction, submission, and confirmation.',
        submitter: 'Helius key connected',
        confirmation: 'DAEMON confirms signatures through the shared RPC connection.',
      },
    })
    mockListWallets.mockReturnValue([
      {
        id: 'wallet-1',
        name: 'Main Wallet',
        address: '11111111111111111111111111111111',
        is_default: 1,
        created_at: 0,
        assigned_project_ids: [],
      },
    ])
  })

  it('builds a backend preview for SOL sends', () => {
    const preview = previewSolanaTransaction({
      kind: 'send-sol',
      walletId: 'wallet-1',
      destination: '11111111111111111111111111111111',
      amount: 0.5,
    })

    expect(preview.title).toBe('Review SOL Send')
    expect(preview.backendLabel).toBe('Shared RPC executor')
    expect(preview.signerLabel).toContain('Main Wallet')
    expect(preview.amountLabel).toBe('0.5 SOL')
    expect(preview.warnings).toEqual([])
  })

  it('requires acknowledgement for very high impact swaps', () => {
    const preview = previewSolanaTransaction({
      kind: 'swap',
      walletId: 'wallet-1',
      inputSymbol: 'SOL',
      outputSymbol: 'USDC',
      inputAmount: '1',
      outputAmount: '100',
      slippageBps: 50,
      priceImpactPct: '5.5',
    })

    expect(preview.requiresAcknowledgement).toBe(true)
    expect(preview.acknowledgementLabel).toBe('I understand this swap has very high price impact.')
    expect(preview.warnings).toContain('Very high price impact: 5.500%.')
  })

  it('uses structured runtime preflight blockers in previews', () => {
    mockGetSolanaRuntimeStatus.mockReturnValue({
      rpc: { label: 'Helius', detail: 'Helius key missing', status: 'setup' },
      walletPath: { label: 'Phantom-first', detail: 'Phantom flow', status: 'live' },
      swapEngine: { label: 'Jupiter', detail: 'Jupiter key missing', status: 'setup' },
      executionBackend: { label: 'Shared RPC executor', detail: 'Shared executor', status: 'partial' },
      executionCoverage: [],
      troubleshooting: ['Jupiter key missing'],
      preflight: {
        ready: false,
        checks: [
          {
            id: 'swap-api',
            label: 'Jupiter API',
            status: 'setup',
            detail: 'Add a Jupiter API key before requesting quotes or executing swaps.',
            requiredFor: ['swaps', 'scaffolds'],
          },
        ],
        blockers: ['Add a Jupiter API key before requesting quotes or executing swaps.'],
      },
    })

    const preview = previewSolanaTransaction({
      kind: 'swap',
      walletId: 'wallet-1',
      inputSymbol: 'SOL',
      outputSymbol: 'USDC',
      inputAmount: '1',
      outputAmount: '100',
      slippageBps: 50,
      priceImpactPct: '0.1',
    })

    expect(preview.warnings).toEqual(['Add a Jupiter API key before requesting quotes or executing swaps.'])
  })
})
