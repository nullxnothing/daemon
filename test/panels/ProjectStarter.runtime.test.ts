import { describe, expect, it, vi } from 'vitest'
import { buildRuntimePreset, buildRuntimePrompt } from '../../src/panels/ProjectStarter/ProjectStarter'

describe('ProjectStarter runtime preset helpers', () => {
  it('returns null when no wallet infrastructure settings are available', () => {
    expect(buildRuntimePreset(null)).toBeNull()
    expect(buildRuntimePrompt(null)).toBe('')
  })

  it('serializes the active DAEMON Solana runtime into a scaffold preset', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00.000Z'))

    const preset = buildRuntimePreset({
      rpcProvider: 'helius',
      quicknodeRpcUrl: '',
      customRpcUrl: '',
      swapProvider: 'jupiter',
      preferredWallet: 'wallet-standard',
      executionMode: 'jito',
      jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
    })

    expect(preset).toEqual({
      version: 1,
      generatedBy: 'DAEMON',
      generatedAt: '2026-04-10T12:00:00.000Z',
      transport: {
        provider: 'helius',
        quicknodeRpcUrl: null,
        customRpcUrl: null,
      },
      wallet: {
        preferredWallet: 'wallet-standard',
      },
      execution: {
        mode: 'jito',
        jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
      },
      swaps: {
        provider: 'jupiter',
      },
    })

    vi.useRealTimers()
  })

  it('embeds execution path and readiness when runtime status is available', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00.000Z'))

    const runtime = {
      rpc: { label: 'Helius', detail: 'Helius key missing', status: 'setup' as const },
      walletPath: { label: 'Phantom-first', detail: 'Phantom flow', status: 'live' as const },
      swapEngine: { label: 'Jupiter', detail: 'Jupiter key missing', status: 'setup' as const },
      executionBackend: { label: 'Shared RPC executor', detail: 'Shared executor', status: 'partial' as const },
      executionCoverage: [],
      troubleshooting: ['Jupiter key missing'],
      preflight: {
        ready: false,
        checks: [
          {
            id: 'swap-api' as const,
            label: 'Jupiter API',
            status: 'setup' as const,
            detail: 'Add a Jupiter API key before requesting quotes or executing swaps.',
            requiredFor: ['swaps' as const, 'scaffolds' as const],
          },
        ],
        blockers: ['Add a Jupiter API key before requesting quotes or executing swaps.'],
      },
      executionPath: {
        mode: 'rpc' as const,
        label: 'Standard RPC submission',
        detail: 'Helius handles reads, transaction construction, submission, and confirmation.',
        submitter: 'Helius key missing',
        confirmation: 'DAEMON confirms signatures through the shared RPC connection.',
      },
    }

    const settings = {
      rpcProvider: 'helius' as const,
      quicknodeRpcUrl: '',
      customRpcUrl: '',
      swapProvider: 'jupiter' as const,
      preferredWallet: 'phantom' as const,
      executionMode: 'rpc' as const,
      jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
    }

    const preset = buildRuntimePreset(settings, runtime)
    const prompt = buildRuntimePrompt(settings, runtime)

    expect(preset).toMatchObject({
      executionPath: { label: 'Standard RPC submission' },
      readiness: {
        ready: false,
        blockers: ['Add a Jupiter API key before requesting quotes or executing swaps.'],
      },
    })
    expect(prompt).toContain('Runtime execution path: Standard RPC submission')
    expect(prompt).toContain('Current DAEMON setup blockers to document')

    vi.useRealTimers()
  })
})
