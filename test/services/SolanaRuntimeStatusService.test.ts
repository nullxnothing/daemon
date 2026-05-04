import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetWalletInfrastructureSettings, mockHasHeliusKey, mockHasJupiterKey } = vi.hoisted(() => ({
  mockGetWalletInfrastructureSettings: vi.fn(),
  mockHasHeliusKey: vi.fn(),
  mockHasJupiterKey: vi.fn(),
}))

vi.mock('../../electron/services/SettingsService', () => ({
  getWalletInfrastructureSettings: mockGetWalletInfrastructureSettings,
}))

vi.mock('../../electron/services/WalletService', () => ({
  hasHeliusKey: mockHasHeliusKey,
  hasJupiterKey: mockHasJupiterKey,
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
  })

  it('reports a live runtime when helius and jupiter are configured', () => {
    const status = getSolanaRuntimeStatus()

    expect(status.rpc.status).toBe('live')
    expect(status.swapEngine.status).toBe('live')
    expect(status.executionBackend.label).toBe('Shared RPC executor')
    expect(status.executionCoverage.every((item) => item.status === 'live')).toBe(true)
    expect(status.troubleshooting).toEqual([])
    expect(status.preflight.ready).toBe(true)
    expect(status.executionPath.label).toBe('Standard RPC submission')
  })

  it('shows setup and partial states when provider keys are missing', () => {
    mockHasHeliusKey.mockReturnValue(false)
    mockHasJupiterKey.mockReturnValue(false)

    const status = getSolanaRuntimeStatus()

    expect(status.rpc.status).toBe('setup')
    expect(status.swapEngine.status).toBe('setup')
    expect(status.executionBackend.status).toBe('setup')
    expect(status.executionCoverage.find((item) => item.id === 'jupiter-swaps')?.status).toBe('setup')
    expect(status.preflight.ready).toBe(false)
    expect(status.preflight.blockers).toContain('Helius is selected but is missing the configuration DAEMON needs before using that provider.')
    expect(status.preflight.blockers).toContain('Add a Jupiter API key before requesting quotes or executing swaps.')
    expect(status.troubleshooting).toContain('Helius is selected but no Helius API key is stored. Wallet reads will degrade to non-Helius behavior where possible.')
  })

  it('keeps RPC execution live when only the Jupiter swap key is missing', () => {
    mockHasJupiterKey.mockReturnValue(false)

    const status = getSolanaRuntimeStatus()

    expect(status.rpc.status).toBe('live')
    expect(status.swapEngine.status).toBe('setup')
    expect(status.executionBackend.status).toBe('live')
    expect(status.preflight.ready).toBe(false)
    expect(status.preflight.blockers).toEqual(['Add a Jupiter API key before requesting quotes or executing swaps.'])
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
    expect(status.executionPath.label).toBe('Jito block-engine submission')
    expect(status.preflight.checks.find((check) => check.id === 'execution-backend')?.status).toBe('partial')
    expect(status.troubleshooting).toContain('Jito submission is enabled while reads still use public RPC. For tighter landing and confirmation behavior, pair Jito with Helius or QuickNode.')
  })
})
