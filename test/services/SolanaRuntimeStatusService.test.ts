import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetWalletInfrastructureSettings, mockGetKey } = vi.hoisted(() => ({
  mockGetWalletInfrastructureSettings: vi.fn(),
  mockGetKey: vi.fn(),
}))

vi.mock('../../electron/services/SettingsService', () => ({
  getWalletInfrastructureSettings: mockGetWalletInfrastructureSettings,
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: mockGetKey,
}))

vi.mock('../../electron/services/LogService', () => ({
  LogService: {
    warn: vi.fn(),
  },
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
    mockGetKey.mockImplementation((key: string) => {
      if (key === 'HELIUS_API_KEY') return 'helius-key'
      if (key === 'JUPITER_API_KEY') return 'jupiter-key'
      return null
    })
  })

  it('reports a live runtime when helius and jupiter are configured', () => {
    const status = getSolanaRuntimeStatus()

    expect(status.rpc.status).toBe('live')
    expect(status.cluster).toBe('devnet')
    expect(status.swapEngine.status).toBe('partial')
    expect(status.executionBackend.label).toBe('DAEMON transaction executor')
    expect(status.executionCoverage.find((item) => item.id === 'wallet-sends')?.status).toBe('live')
    expect(status.executionCoverage.find((item) => item.id === 'jupiter-swaps')?.status).toBe('partial')
    expect(status.executionCoverage.find((item) => item.id === 'launch-adapters')?.status).toBe('partial')
    expect(status.executionCoverage.find((item) => item.id === 'pumpfun')?.status).toBe('live')
    expect(status.executionCoverage.find((item) => item.id === 'recovery')?.status).toBe('partial')
    expect(status.troubleshooting).toEqual([])
  })

  it('shows setup and partial states when provider keys are missing', () => {
    mockGetKey.mockReturnValue(null)

    const status = getSolanaRuntimeStatus()

    expect(status.rpc.status).toBe('setup')
    expect(status.swapEngine.status).toBe('setup')
    expect(status.executionBackend.status).toBe('setup')
    expect(status.executionCoverage.find((item) => item.id === 'wallet-sends')?.status).toBe('setup')
    expect(status.executionCoverage.find((item) => item.id === 'jupiter-swaps')?.status).toBe('setup')
    expect(status.executionCoverage.find((item) => item.id === 'pumpfun')?.status).toBe('setup')
    expect(status.troubleshooting).toContain('Add a Helius API key before using Helius as the Solana runtime provider.')
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
    expect(status.executionBackend.detail).toContain('Jito endpoint')
    expect(status.executionCoverage.find((item) => item.id === 'wallet-sends')?.status).toBe('partial')
    expect(status.troubleshooting).toContain('Jito submission is enabled while reads still use public RPC.')
  })

  it('marks Jito setup incomplete when the block engine URL is blank', () => {
    mockGetWalletInfrastructureSettings.mockReturnValue({
      cluster: 'mainnet-beta',
      rpcProvider: 'helius',
      quicknodeRpcUrl: '',
      customRpcUrl: '',
      swapProvider: 'jupiter',
      preferredWallet: 'phantom',
      executionMode: 'jito',
      jitoBlockEngineUrl: '',
    })

    const status = getSolanaRuntimeStatus()

    expect(status.executionBackend.status).toBe('setup')
    expect(status.executionBackend.detail).toContain('no Jito block engine URL')
    expect(status.troubleshooting).toContain('Add a Jito block engine URL before using Jito execution mode.')
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
    expect(status.rpc.detail).toBe('Add a QuickNode RPC URL before using QuickNode as the Solana runtime provider.')
    expect(status.troubleshooting).toContain('Add a QuickNode RPC URL before using QuickNode as the Solana runtime provider.')
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
    expect(status.rpc.detail).toBe('Add a custom RPC URL before using custom RPC as the Solana runtime provider.')
    expect(status.troubleshooting).toContain('Add a custom RPC URL before using custom RPC as the Solana runtime provider.')
  })
})
