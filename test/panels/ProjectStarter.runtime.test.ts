import { describe, expect, it, vi } from 'vitest'
import { buildRuntimeBootstrapFiles, buildRuntimePreset, buildRuntimePrompt } from '../../src/panels/ProjectStarter/ProjectStarter'

describe('ProjectStarter runtime preset helpers', () => {
  it('returns null when no wallet infrastructure settings are available', () => {
    expect(buildRuntimePreset(null)).toBeNull()
    expect(buildRuntimePrompt(null)).toBe('')
    expect(buildRuntimeBootstrapFiles(null)).toEqual([])
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

  it('creates DAEMON-owned bootstrap files that force runtime consumption into the scaffold', () => {
    const files = buildRuntimeBootstrapFiles({
      rpcProvider: 'quicknode',
      quicknodeRpcUrl: 'https://example.quicknode.test',
      customRpcUrl: '',
      swapProvider: 'jupiter',
      preferredWallet: 'phantom',
      executionMode: 'rpc',
      jitoBlockEngineUrl: '',
    })

    expect(files.map((file) => file.path)).toEqual([
      'DAEMON_RUNTIME.md',
      'scripts/read-daemon-runtime.mjs',
    ])

    const docsFile = files.find((file) => file.path === 'DAEMON_RUNTIME.md')
    expect(docsFile?.content).toContain('daemon.solana-runtime.json')
    expect(docsFile?.content).toContain('QuickNode RPC')
    expect(docsFile?.content).toContain('Phantom-first wallet path')
    expect(docsFile?.content).toContain('Do not delete `daemon.solana-runtime.json`.')

    const loaderFile = files.find((file) => file.path === 'scripts/read-daemon-runtime.mjs')
    expect(loaderFile?.content).toContain('readDaemonSolanaRuntime')
    expect(loaderFile?.content).toContain('runtimeFileName')
    expect(loaderFile?.content).toContain('summarizeDaemonSolanaRuntime')
  })
})
