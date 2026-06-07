import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetWalletInfrastructureSettings, mockGetKey, mockLogWarn } = vi.hoisted(() => ({
  mockGetWalletInfrastructureSettings: vi.fn(),
  mockGetKey: vi.fn(),
  mockLogWarn: vi.fn(),
}))

vi.mock('../../electron/services/SettingsService', () => ({
  getWalletInfrastructureSettings: mockGetWalletInfrastructureSettings,
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: mockGetKey,
}))

vi.mock('../../electron/services/LogService', () => ({
  LogService: {
    warn: mockLogWarn,
  },
}))

import {
  getConnectionStrict,
  getRpcEndpoint,
  resolveSolanaRuntimeConfig,
} from '../../electron/services/SolanaRuntimeConfigService'

function mockInfrastructureSettings(overrides: Record<string, unknown> = {}) {
  mockGetWalletInfrastructureSettings.mockReturnValue({
    cluster: 'devnet',
    rpcProvider: 'helius',
    quicknodeRpcUrl: '',
    customRpcUrl: '',
    swapProvider: 'jupiter',
    preferredWallet: 'phantom',
    executionMode: 'rpc',
    jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
    ...overrides,
  })
}

function mockKeys(keys: Record<string, string | null>) {
  mockGetKey.mockImplementation((key: string) => keys[key] ?? null)
}

describe('SolanaRuntimeConfigService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInfrastructureSettings()
    mockKeys({
      HELIUS_API_KEY: 'helius-key',
      JUPITER_API_KEY: 'jupiter-key',
    })
  })

  it('resolves Helius when the key is present', () => {
    const runtime = resolveSolanaRuntimeConfig()

    expect(runtime.rpcProvider).toBe('helius')
    expect(runtime.rpcEndpoint).toBe('https://devnet.helius-rpc.com/?api-key=helius-key')
    expect(runtime.rpcReady).toBe(true)
    expect(runtime.heliusReady).toBe(true)
    expect(runtime.jupiterReady).toBe(true)
    expect(runtime.blockers).toEqual([])
  })

  it('falls back and blocks strict Helius when the key is missing', () => {
    mockKeys({ HELIUS_API_KEY: null, JUPITER_API_KEY: 'jupiter-key' })

    const runtime = resolveSolanaRuntimeConfig({ warnOnPublicFallback: true })

    expect(runtime.rpcEndpoint).toBe('https://api.devnet.solana.com')
    expect(runtime.rpcReady).toBe(false)
    expect(runtime.isPublicRpcFallback).toBe(true)
    expect(runtime.blockers).toContainEqual(expect.objectContaining({ code: 'missing-helius-key' }))
    expect(() => getConnectionStrict()).toThrow(/Helius API key/i)
    expect(mockLogWarn).toHaveBeenCalledWith(
      'SolanaService',
      expect.stringContaining('Using public Solana RPC fallback'),
      expect.objectContaining({ reason: 'Helius RPC is selected but HELIUS_API_KEY is not configured.' }),
    )
  })

  it('uses QuickNode for generic and strict runtime connections when configured', () => {
    mockInfrastructureSettings({
      rpcProvider: 'quicknode',
      quicknodeRpcUrl: 'https://example.quicknode.test',
    })
    mockKeys({ HELIUS_API_KEY: null, JUPITER_API_KEY: null })

    expect(getRpcEndpoint()).toBe('https://example.quicknode.test')
    expect(getConnectionStrict().rpcEndpoint).toBe('https://example.quicknode.test')
    expect(resolveSolanaRuntimeConfig().blockers).toEqual([])
  })

  it('blocks QuickNode strict runtime when the URL is missing', () => {
    mockInfrastructureSettings({ rpcProvider: 'quicknode', quicknodeRpcUrl: '' })

    const runtime = resolveSolanaRuntimeConfig()

    expect(runtime.rpcEndpoint).toBe('https://api.devnet.solana.com')
    expect(runtime.rpcReady).toBe(false)
    expect(runtime.blockers).toContainEqual(expect.objectContaining({ code: 'missing-quicknode-url' }))
    expect(() => getConnectionStrict()).toThrow(/QuickNode RPC URL/i)
  })

  it('uses custom RPC for generic and strict runtime connections when configured', () => {
    mockInfrastructureSettings({
      rpcProvider: 'custom',
      customRpcUrl: 'https://custom.rpc.test',
    })
    mockKeys({ HELIUS_API_KEY: null, JUPITER_API_KEY: null })

    expect(getRpcEndpoint()).toBe('https://custom.rpc.test')
    expect(getConnectionStrict().rpcEndpoint).toBe('https://custom.rpc.test')
  })

  it('uses localnet endpoint without requiring provider keys', () => {
    mockInfrastructureSettings({
      cluster: 'localnet',
      rpcProvider: 'helius',
    })
    mockKeys({ HELIUS_API_KEY: null, JUPITER_API_KEY: null })

    const runtime = resolveSolanaRuntimeConfig()

    expect(runtime.rpcEndpoint).toBe('http://127.0.0.1:8899')
    expect(runtime.rpcReady).toBe(true)
    expect(runtime.isPublicRpc).toBe(false)
    expect(getConnectionStrict().rpcEndpoint).toBe('http://127.0.0.1:8899')
  })

  it('marks public RPC as degraded for strict runtime flows', () => {
    mockInfrastructureSettings({ rpcProvider: 'public' })

    const runtime = resolveSolanaRuntimeConfig()

    expect(runtime.rpcEndpoint).toBe('https://api.devnet.solana.com')
    expect(runtime.rpcReady).toBe(true)
    expect(runtime.warnings).toContainEqual(expect.objectContaining({ code: 'public-rpc' }))
    expect(runtime.blockers).toContainEqual(expect.objectContaining({ code: 'public-rpc-not-strict' }))
    expect(() => getConnectionStrict()).toThrow(/Public RPC is degraded/i)
  })

  it('makes Jito compatibility explicit', () => {
    mockInfrastructureSettings({
      cluster: 'devnet',
      rpcProvider: 'public',
      executionMode: 'jito',
      jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
    })

    const runtime = resolveSolanaRuntimeConfig()

    expect(runtime.jitoReady).toBe(false)
    expect(runtime.warnings).toContainEqual(expect.objectContaining({ code: 'jito-non-mainnet' }))
    expect(runtime.warnings).toContainEqual(expect.objectContaining({ code: 'jito-public-rpc' }))
  })
})
