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
})
