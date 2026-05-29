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
      cluster: 'devnet',
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
    expect(status.cluster).toBe('devnet')
    expect(status.swapEngine.status).toBe('live')
    expect(status.executionBackend.label).toBe('Shared RPC executor')
    expect(status.executionCoverage.every((item) => item.status === 'live')).toBe(true)
    expect(status.troubleshooting).toEqual([])
  })

  it('shows setup and partial states when provider keys are missing', () => {
    mockHasHeliusKey.mockReturnValue(false)
    mockHasJupiterKey.mockReturnValue(false)

    const status = getSolanaRuntimeStatus()

    expect(status.rpc.status).toBe('setup')
    expect(status.swapEngine.status).toBe('setup')
    expect(status.executionBackend.status).toBe('partial')
    expect(status.executionCoverage.find((item) => item.id === 'jupiter-swaps')?.status).toBe('setup')
    expect(status.troubleshooting).toContain('Helius is selected but no Helius API key is stored. Wallet reads will degrade to non-Helius behavior where possible.')
  })

  it('marks jito over public rpc as partial', () => {
    mockGetWalletInfrastructureSettings.mockReturnValue({
      cluster: 'devnet',
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

  it('reports Solflare as the selected wallet path', () => {
    mockGetWalletInfrastructureSettings.mockReturnValue({
      cluster: 'devnet',
      rpcProvider: 'helius',
      quicknodeRpcUrl: '',
      customRpcUrl: '',
      swapProvider: 'jupiter',
      preferredWallet: 'solflare',
      executionMode: 'rpc',
      jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
    })

    const status = getSolanaRuntimeStatus()

    expect(status.walletPath.label).toBe('Solflare')
    expect(status.walletPath.detail).toContain('Solflare Wallet SDK')
  })

  it('marks blank QuickNode RPC as setup instead of live', () => {
    mockGetWalletInfrastructureSettings.mockReturnValue({
      cluster: 'devnet',
      rpcProvider: 'quicknode',
      quicknodeRpcUrl: '',
      customRpcUrl: '',
      swapProvider: 'jupiter',
      preferredWallet: 'phantom',
      executionMode: 'rpc',
      jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
    })

    const status = getSolanaRuntimeStatus()

    expect(status.rpc.status).toBe('setup')
    expect(status.rpc.detail).toBe('QuickNode endpoint not set')
    expect(status.troubleshooting).toContain('QuickNode is selected but the endpoint is blank. Add a QuickNode RPC URL before using this stack.')
  })

  it('marks blank custom RPC as setup instead of live', () => {
    mockGetWalletInfrastructureSettings.mockReturnValue({
      cluster: 'devnet',
      rpcProvider: 'custom',
      quicknodeRpcUrl: '',
      customRpcUrl: '',
      swapProvider: 'jupiter',
      preferredWallet: 'phantom',
      executionMode: 'rpc',
      jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
    })

    const status = getSolanaRuntimeStatus()

    expect(status.rpc.status).toBe('setup')
    expect(status.rpc.detail).toBe('Custom endpoint not set')
    expect(status.troubleshooting).toContain('Custom RPC is selected but no RPC URL is configured.')
  })
})
