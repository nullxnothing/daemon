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

import { createMeteoraDbcLaunchAdapter } from '../../electron/services/token-launch/adapters/MeteoraDbcLaunchAdapter'

describe('MeteoraDbcLaunchAdapter', () => {
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
    const adapter = createMeteoraDbcLaunchAdapter({
      env: {} as NodeJS.ProcessEnv,
      loadSdk: () => ({}),
    })

    expect(adapter.definition.enabled).toBe(false)
    expect(adapter.definition.reason).toContain('config ID')
  })

  it('accepts saved settings even without env config', () => {
    const adapter = createMeteoraDbcLaunchAdapter({
      env: {} as NodeJS.ProcessEnv,
      settings: {
        configId: '11111111111111111111111111111111',
        quoteMint: '',
        baseSupply: '',
      },
      loadSdk: () => ({}),
    })

    expect(adapter.definition.enabled).toBe(true)
  })

  it('reports on-chain config, quote mint, and base supply during preflight', async () => {
    const getAccountInfo = vi.fn(async () => ({ lamports: 1 }))
    getConnectionStrictMock.mockReturnValue({
      getLatestBlockhash: vi.fn(),
      sendTransaction: vi.fn(),
      confirmTransaction: vi.fn(),
      getAccountInfo,
    })

    const adapter = createMeteoraDbcLaunchAdapter({
      env: {
        METEORA_DBC_CONFIG: '11111111111111111111111111111111',
      } as NodeJS.ProcessEnv,
      loadSdk: () => ({}),
    })

    const checks = await adapter.preflight?.({
      launchpad: 'meteora',
      walletId: 'wallet-1',
      name: 'Meteora Token',
      symbol: 'METX',
      description: 'DBC token',
      imagePath: null,
      initialBuySol: 0.2,
      slippageBps: 900,
      priorityFeeSol: 0.005,
    })

    expect(checks).toEqual([
      expect.objectContaining({ id: 'meteora-config', status: 'pass' }),
      expect.objectContaining({ id: 'meteora-quote-mint', status: 'pass' }),
      expect.objectContaining({ id: 'meteora-base-supply', status: 'pass' }),
    ])
    expect(getAccountInfo).toHaveBeenCalledTimes(2)
  })

  it('returns protocol-specific failures when RPC is unavailable', async () => {
    getConnectionStrictMock.mockImplementation(() => {
      throw new Error('HELIUS_API_KEY not configured. Add it in Wallet settings.')
    })

    const adapter = createMeteoraDbcLaunchAdapter({
      env: {
        METEORA_DBC_CONFIG: '11111111111111111111111111111111',
      } as NodeJS.ProcessEnv,
      loadSdk: () => ({}),
    })

    const checks = await adapter.preflight?.({
      launchpad: 'meteora',
      walletId: 'wallet-1',
      name: 'Meteora Token',
      symbol: 'METX',
      description: 'DBC token',
      imagePath: null,
      initialBuySol: 0.2,
      slippageBps: 900,
      priorityFeeSol: 0.005,
    })

    expect(checks).toEqual([
      expect.objectContaining({ id: 'meteora-config', status: 'fail' }),
      expect.objectContaining({ id: 'meteora-quote-mint', status: 'fail' }),
      expect.objectContaining({ id: 'meteora-base-supply', status: 'pass' }),
    ])
  })

  it('routes launches through createPool and execute', async () => {
    const execute = vi.fn(async () => ({ txId: 'meteora-sig-123' }))
    const createPool = vi.fn(async () => ({
      execute,
      poolAddress: 'meteora-pool-123456789012345678901',
      bondingCurveAddress: 'meteora-curve-12345678901234567',
    }))

    class FakeDynamicBondingCurve {
      createPool = createPool
      constructor(_connection: unknown, _commitment: string) {}
    }

    const adapter = createMeteoraDbcLaunchAdapter({
      env: {
        METEORA_DBC_CONFIG: '11111111111111111111111111111111',
      } as NodeJS.ProcessEnv,
      loadSdk: () => ({ DynamicBondingCurve: FakeDynamicBondingCurve }),
      uploadMetadata: vi.fn(async () => ({ metadataUri: 'https://meta.example/meteora.json' })),
    })

    const result = await adapter.createLaunch({
      launchpad: 'meteora',
      walletId: 'wallet-1',
      name: 'Meteora Token',
      symbol: 'METX',
      description: 'DBC token',
      imagePath: null,
      initialBuySol: 0.2,
      slippageBps: 900,
      priorityFeeSol: 0.005,
    })

    expect(createPool).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Meteora Token',
      symbol: 'METX',
      uri: 'https://meta.example/meteora.json',
    }))
    expect(execute).toHaveBeenCalled()
    expect(result.signature).toBe('meteora-sig-123')
    expect(result.poolAddress).toContain('meteora-pool')
  })

  it('blocks direct launch when the configured DBC config is not on-chain', async () => {
    const getAccountInfo = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ lamports: 1 })
    getConnectionStrictMock.mockReturnValue({
      getLatestBlockhash: vi.fn(),
      sendTransaction: vi.fn(),
      confirmTransaction: vi.fn(),
      getAccountInfo,
    })
    const uploadMetadata = vi.fn(async () => ({ metadataUri: 'https://meta.example/meteora.json' }))
    const loadSdk = vi.fn(() => ({}))

    const adapter = createMeteoraDbcLaunchAdapter({
      env: {
        METEORA_DBC_CONFIG: '11111111111111111111111111111111',
      } as NodeJS.ProcessEnv,
      loadSdk,
      uploadMetadata,
    })

    await expect(adapter.createLaunch({
      launchpad: 'meteora',
      walletId: 'wallet-1',
      name: 'Meteora Token',
      symbol: 'METX',
      description: 'DBC token',
      imagePath: null,
      initialBuySol: 0.2,
      slippageBps: 900,
      priorityFeeSol: 0.005,
    })).rejects.toThrow(/DBC config .*not found on-chain/i)

    expect(uploadMetadata).not.toHaveBeenCalled()
    expect(loadSdk).not.toHaveBeenCalled()
  })
})
