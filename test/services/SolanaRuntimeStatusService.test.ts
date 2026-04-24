import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetWalletInfrastructureSettings, mockHasHeliusKey, mockHasJupiterKey, mockDetectToolchain } = vi.hoisted(() => ({
  mockGetWalletInfrastructureSettings: vi.fn(),
  mockHasHeliusKey: vi.fn(),
  mockHasJupiterKey: vi.fn(),
  mockDetectToolchain: vi.fn(),
}))

vi.mock('../../electron/services/SettingsService', () => ({
  getWalletInfrastructureSettings: mockGetWalletInfrastructureSettings,
}))

vi.mock('../../electron/services/WalletService', () => ({
  hasHeliusKey: mockHasHeliusKey,
  hasJupiterKey: mockHasJupiterKey,
}))

vi.mock('../../electron/services/ValidatorManager', () => ({
  detectToolchain: mockDetectToolchain,
}))

import { getSolanaRuntimeStatus } from '../../electron/services/SolanaRuntimeStatusService'

describe('SolanaRuntimeStatusService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetWalletInfrastructureSettings.mockReturnValue({
      rpcProvider: 'helius',
      quicknodeRpcUrl: '',
      customRpcUrl: '',
      swapProvider: 'jupiter',
      preferredWallet: 'phantom',
      executionMode: 'rpc',
      jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
    })
    mockHasHeliusKey.mockReturnValue(true)
    mockHasJupiterKey.mockReturnValue(true)
    mockDetectToolchain.mockReturnValue({
      solanaCli: { installed: true, version: 'solana-cli 2.1.0' },
      anchor: { installed: true, version: 'anchor-cli 0.32.1' },
      avm: { installed: true, version: 'avm 0.31.0' },
      surfpool: { installed: true, version: 'surfpool 0.2.0' },
      testValidator: { installed: true, version: 'solana-test-validator 2.1.0' },
      litesvm: { installed: true, source: 'project' },
    })
  })

  it('reports a live runtime when helius and jupiter are configured', () => {
    const status = getSolanaRuntimeStatus()

    expect(status.rpc.status).toBe('live')
    expect(status.swapEngine.status).toBe('live')
    expect(status.executionBackend.label).toBe('Shared RPC executor')
    expect(status.environmentDiagnostics.every((item) => item.status === 'live')).toBe(true)
    expect(status.executionCoverage.every((item) => item.status === 'live')).toBe(true)
    expect(status.troubleshooting).toEqual([])
  })

  it('shows setup and partial states when provider keys are missing', () => {
    mockHasHeliusKey.mockReturnValue(false)
    mockHasJupiterKey.mockReturnValue(false)
    mockDetectToolchain.mockReturnValue({
      solanaCli: { installed: false, version: null },
      anchor: { installed: false, version: null },
      avm: { installed: false, version: null },
      surfpool: { installed: false, version: null },
      testValidator: { installed: true, version: 'solana-test-validator 2.1.0' },
      litesvm: { installed: false, source: 'none' },
    })

    const status = getSolanaRuntimeStatus('C:/work/daemon-app')

    expect(status.rpc.status).toBe('setup')
    expect(status.swapEngine.status).toBe('setup')
    expect(status.executionBackend.status).toBe('partial')
    expect(status.environmentDiagnostics.find((item) => item.id === 'solana-cli')?.status).toBe('setup')
    expect(status.environmentDiagnostics.find((item) => item.id === 'surfpool')?.status).toBe('partial')
    expect(status.executionCoverage.find((item) => item.id === 'jupiter-swaps')?.status).toBe('setup')
    expect(status.troubleshooting).toContain('Helius is selected but no Helius API key is stored. Wallet reads will degrade to non-Helius behavior where possible.')
    expect(status.troubleshooting).toContain('Install the Solana CLI and make `solana` available on PATH.')
  })

  it('marks jito over public rpc as partial', () => {
    mockGetWalletInfrastructureSettings.mockReturnValue({
      rpcProvider: 'public',
      quicknodeRpcUrl: '',
      customRpcUrl: '',
      swapProvider: 'jupiter',
      preferredWallet: 'wallet-standard',
      executionMode: 'jito',
      jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
    })

    const status = getSolanaRuntimeStatus()

    expect(status.rpc.status).toBe('partial')
    expect(status.walletPath.label).toBe('Wallet Standard')
    expect(status.executionBackend.status).toBe('partial')
    expect(status.executionBackend.detail).toContain('Jito-backed executor')
    expect(status.troubleshooting).toContain('Jito submission is enabled while reads still use public RPC. For tighter landing and confirmation behavior, pair Jito with Helius or QuickNode.')
  })
})
