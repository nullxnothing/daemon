import { beforeEach, describe, expect, it, vi } from 'vitest'

const { withKeypairMock, getConnectionStrictMock } = vi.hoisted(() => ({
  withKeypairMock: vi.fn(async (_walletId: string, fn: (kp: { publicKey: { toBase58: () => string } }) => Promise<unknown>) => {
    return fn({ publicKey: { toBase58: () => 'creator-public-key' } })
  }),
  getConnectionStrictMock: vi.fn(() => ({
    getLatestBlockhash: vi.fn(),
    sendTransaction: vi.fn(),
    confirmTransaction: vi.fn(),
    getAccountInfo: vi.fn(async () => ({ lamports: 1 })),
  })),
}))

vi.mock('../../electron/services/SolanaService', () => ({
  withKeypair: withKeypairMock,
  getConnectionStrict: getConnectionStrictMock,
}))

import { createRaydiumLaunchLabAdapter } from '../../electron/services/token-launch/adapters/RaydiumLaunchLabAdapter'

describe('RaydiumLaunchLabAdapter', () => {
  beforeEach(() => {
    getConnectionStrictMock.mockReset()
    getConnectionStrictMock.mockReturnValue({
      getLatestBlockhash: vi.fn(),
      sendTransaction: vi.fn(),
      confirmTransaction: vi.fn(),
      getAccountInfo: vi.fn(async () => ({ lamports: 1 })),
    })
  })

  it('stays disabled until config is present', () => {
    const adapter = createRaydiumLaunchLabAdapter({
      env: {} as NodeJS.ProcessEnv,
      loadSdk: () => ({}),
    })

    expect(adapter.definition.enabled).toBe(false)
    expect(adapter.definition.reason).toContain('config ID')
  })

  it('accepts saved settings even without env config', () => {
    const adapter = createRaydiumLaunchLabAdapter({
      env: {} as NodeJS.ProcessEnv,
      settings: {
        configId: '11111111111111111111111111111111',
        quoteMint: '',
      },
      loadSdk: () => ({}),
    })

    expect(adapter.definition.enabled).toBe(true)
  })

  it('reports on-chain config and quote mint readiness during preflight', async () => {
    const getAccountInfo = vi.fn(async () => ({ lamports: 1 }))
    getConnectionStrictMock.mockReturnValue({
      getLatestBlockhash: vi.fn(),
      sendTransaction: vi.fn(),
      confirmTransaction: vi.fn(),
      getAccountInfo,
    })

    const adapter = createRaydiumLaunchLabAdapter({
      env: {
        RAYDIUM_LAUNCHLAB_CONFIG: '11111111111111111111111111111111',
      } as NodeJS.ProcessEnv,
      loadSdk: () => ({}),
    })

    const checks = await adapter.preflight?.({
      launchpad: 'raydium',
      walletId: 'wallet-1',
      name: 'Ray Token',
      symbol: 'RAYX',
      description: 'LaunchLab token',
      imagePath: null,
      initialBuySol: 0.25,
      slippageBps: 800,
      priorityFeeSol: 0.005,
    })

    expect(checks).toEqual([
      expect.objectContaining({ id: 'raydium-config', status: 'pass' }),
      expect.objectContaining({ id: 'raydium-quote-mint', status: 'pass' }),
    ])
    expect(getAccountInfo).toHaveBeenCalledTimes(2)
  })

  it('returns protocol-specific failures when RPC is unavailable', async () => {
    getConnectionStrictMock.mockImplementation(() => {
      throw new Error('HELIUS_API_KEY not configured. Add it in Wallet settings.')
    })

    const adapter = createRaydiumLaunchLabAdapter({
      env: {
        RAYDIUM_LAUNCHLAB_CONFIG: '11111111111111111111111111111111',
      } as NodeJS.ProcessEnv,
      loadSdk: () => ({}),
    })

    const checks = await adapter.preflight?.({
      launchpad: 'raydium',
      walletId: 'wallet-1',
      name: 'Ray Token',
      symbol: 'RAYX',
      description: 'LaunchLab token',
      imagePath: null,
      initialBuySol: 0.25,
      slippageBps: 800,
      priorityFeeSol: 0.005,
    })

    expect(checks).toEqual([
      expect.objectContaining({ id: 'raydium-config', status: 'fail' }),
      expect.objectContaining({ id: 'raydium-quote-mint', status: 'fail' }),
    ])
  })

  it('routes launches through createLaunchpad and execute', async () => {
    const execute = vi.fn(async () => ({ signature: 'raydium-sig-123' }))
    const createLaunchpad = vi.fn(async () => ({
      execute,
      poolId: 'raydium-pool-123456789012345678901',
      curveAddress: 'raydium-curve-123456789012345678',
    }))
    const load = vi.fn(async () => ({
      launchpad: { createLaunchpad },
    }))

    const adapter = createRaydiumLaunchLabAdapter({
      env: {
        RAYDIUM_LAUNCHLAB_CONFIG: '11111111111111111111111111111111',
      } as NodeJS.ProcessEnv,
      loadSdk: () => ({ Raydium: { load } }),
      uploadMetadata: vi.fn(async () => ({ metadataUri: 'https://meta.example/raydium.json' })),
    })

    const result = await adapter.createLaunch({
      launchpad: 'raydium',
      walletId: 'wallet-1',
      name: 'Ray Token',
      symbol: 'RAYX',
      description: 'LaunchLab token',
      imagePath: null,
      initialBuySol: 0.25,
      slippageBps: 800,
      priorityFeeSol: 0.005,
    })

    expect(load).toHaveBeenCalled()
    expect(createLaunchpad).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        name: 'Ray Token',
        symbol: 'RAYX',
        uri: 'https://meta.example/raydium.json',
      }),
      slippageBps: 800,
    }))
    expect(execute).toHaveBeenCalled()
    expect(result.signature).toBe('raydium-sig-123')
    expect(result.poolAddress).toContain('raydium-pool')
  })
})
