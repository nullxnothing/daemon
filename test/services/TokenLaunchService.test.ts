import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRun,
  mockGet,
  mockPrepare,
  createTokenMock,
  pickImageMock,
  listWalletsMock,
  getProjectWalletIdMock,
  hasKeypairMock,
  getBalanceMock,
  hasHeliusKeyMock,
  getTokenLaunchSettingsMock,
} = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockGet: vi.fn(),
  mockPrepare: vi.fn(),
  createTokenMock: vi.fn(),
  pickImageMock: vi.fn(),
  listWalletsMock: vi.fn(),
  getProjectWalletIdMock: vi.fn(),
  hasKeypairMock: vi.fn(),
  getBalanceMock: vi.fn(),
  hasHeliusKeyMock: vi.fn(),
  getTokenLaunchSettingsMock: vi.fn(),
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: mockPrepare,
  }),
}))

vi.mock('../../electron/services/PumpFunService', () => ({
  createToken: createTokenMock,
  pickImage: pickImageMock,
}))

vi.mock('../../electron/services/WalletService', () => ({
  listWallets: listWalletsMock,
  getProjectWalletId: getProjectWalletIdMock,
  hasKeypair: hasKeypairMock,
  getBalance: getBalanceMock,
  hasHeliusKey: hasHeliusKeyMock,
}))

vi.mock('../../electron/services/SettingsService', () => ({
  getTokenLaunchSettings: getTokenLaunchSettingsMock,
}))

import { createLaunch, listLaunchWallets, listLaunchpads, preflightLaunch } from '../../electron/services/TokenLaunchService'

describe('TokenLaunchService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pickImageMock.mockResolvedValue(null)
    listWalletsMock.mockReturnValue([])
    getProjectWalletIdMock.mockReturnValue(null)
    hasKeypairMock.mockReturnValue(true)
    getBalanceMock.mockResolvedValue({ sol: 1.5, lamports: 1_500_000_000 })
    hasHeliusKeyMock.mockReturnValue(true)
    getTokenLaunchSettingsMock.mockReturnValue({
      raydium: { configId: '', quoteMint: '' },
      meteora: { configId: '', quoteMint: '', baseSupply: '' },
    })
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO launched_tokens')) return { run: mockRun }
      if (sql.includes('SELECT * FROM launched_tokens WHERE id = ? OR mint = ? LIMIT 1')) {
        return { get: mockGet }
      }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
    })
  })

  it('exposes one live launchpad and planned placeholders', () => {
    const launchpads = listLaunchpads()
    expect(launchpads.map((entry) => entry.id)).toEqual(['pumpfun', 'raydium', 'meteora', 'bonk'])
    expect(launchpads.find((entry) => entry.id === 'pumpfun')?.enabled).toBe(true)
    expect(launchpads.filter((entry) => !entry.enabled)).toHaveLength(3)
  })

  it('enables configured launchpads from saved settings', () => {
    getTokenLaunchSettingsMock.mockReturnValue({
      raydium: { configId: '11111111111111111111111111111111', quoteMint: '' },
      meteora: { configId: '11111111111111111111111111111111', quoteMint: '', baseSupply: '' },
    })

    const launchpads = listLaunchpads()

    expect(launchpads.find((entry) => entry.id === 'raydium')?.enabled).toBe(true)
    expect(launchpads.find((entry) => entry.id === 'meteora')?.enabled).toBe(true)
  })

  it('returns wallet launch options with project and keypair flags', () => {
    listWalletsMock.mockReturnValue([
      {
        id: 'wallet-default',
        name: 'Default Wallet',
        address: 'So11111111111111111111111111111111111111112',
        is_default: 1,
        assigned_project_ids: [],
      },
      {
        id: 'wallet-project',
        name: 'Project Wallet',
        address: '11111111111111111111111111111111',
        is_default: 0,
        assigned_project_ids: ['project-1'],
      },
    ])
    getProjectWalletIdMock.mockReturnValue('wallet-project')
    hasKeypairMock.mockImplementation((walletId: string) => walletId === 'wallet-project')

    const options = listLaunchWallets('project-1')

    expect(options).toEqual([
      expect.objectContaining({
        id: 'wallet-default',
        isDefault: true,
        hasKeypair: false,
        isAssignedToActiveProject: false,
      }),
      expect.objectContaining({
        id: 'wallet-project',
        isDefault: false,
        hasKeypair: true,
        isAssignedToActiveProject: true,
      }),
    ])
  })

  it('creates a pumpfun launch and persists wallet/project linkage', async () => {
    createTokenMock.mockResolvedValue({
      signature: 'sig-123',
      mint: 'mint-123',
      metadataUri: 'https://meta.example/token.json',
      bondingCurveAddress: 'curve-123',
      associatedBondingCurveAddress: 'assoc-curve-123',
    })
    hasKeypairMock.mockReturnValue(true)
    mockGet.mockReturnValue({
      id: 'launch-1',
      project_id: 'project-123',
      wallet_id: 'wallet-123',
      mint: 'mint-123',
      name: 'Daemon',
      symbol: 'DMN',
      image_uri: 'C:\\tmp\\daemon.png',
      metadata_uri: 'https://meta.example/token.json',
      launchpad: 'pumpfun',
      pool_address: null,
      bonding_curve_address: 'curve-123',
      create_signature: 'sig-123',
      initial_buy_sol: 0.25,
      launchpad_config_json: '{}',
      protocol_receipts_json: '{}',
      status: 'active',
      error_message: null,
      confirmed_at: 1710000000000,
      updated_at: 1710000000000,
      created_at: 1710000000000,
    })

    const result = await createLaunch({
      launchpad: 'pumpfun',
      walletId: 'wallet-123',
      projectId: 'project-123',
      name: 'Daemon',
      symbol: 'DMN',
      description: 'Daemon launch token',
      imagePath: 'C:\\tmp\\daemon.png',
      twitter: 'https://x.com/daemon',
      telegram: 'https://t.me/daemon',
      website: 'https://daemon.app',
      initialBuySol: 0.25,
      slippageBps: 1000,
      priorityFeeSol: 0.005,
      mayhemMode: true,
    })

    expect(createTokenMock).toHaveBeenCalledWith(expect.objectContaining({
      walletId: 'wallet-123',
      name: 'Daemon',
      symbol: 'DMN',
      mayhemMode: true,
    }))
    expect(mockRun).toHaveBeenCalledWith(
      expect.any(String),
      'wallet-123',
      'project-123',
      'mint-123',
      'Daemon',
      'DMN',
      'C:\\tmp\\daemon.png',
      'https://meta.example/token.json',
      'pumpfun',
      null,
      'curve-123',
      'sig-123',
      0.25,
      expect.any(String),
      expect.any(String),
      'active',
      null,
      expect.any(Number),
      expect.any(Number),
    )
    expect(result.mint).toBe('mint-123')
    expect(result.launch.wallet_id).toBe('wallet-123')
    expect(result.launch.project_id).toBe('project-123')
  })

  it('returns a passing preflight when wallet and launchpad are ready', async () => {
    const result = await preflightLaunch({
      launchpad: 'pumpfun',
      walletId: 'wallet-123',
      projectId: 'project-123',
      name: 'Daemon',
      symbol: 'DMN',
      description: 'Daemon launch token',
      imagePath: null,
      twitter: '',
      telegram: '',
      website: '',
      initialBuySol: 0.25,
      slippageBps: 1000,
      priorityFeeSol: 0.005,
      mayhemMode: false,
    })

    expect(result.ready).toBe(true)
    expect(result.walletBalanceSol).toBe(1.5)
    expect(result.checks.find((check) => check.id === 'launchpad')?.status).toBe('pass')
    expect(result.checks.find((check) => check.id === 'wallet-balance')?.status).toBe('pass')
  })

  it('rejects launch attempts from watch-only wallets', async () => {
    hasKeypairMock.mockReturnValue(false)

    await expect(createLaunch({
      launchpad: 'pumpfun',
      walletId: 'wallet-watch-only',
      projectId: 'project-123',
      name: 'Daemon',
      symbol: 'DMN',
      description: 'Daemon launch token',
      imagePath: null,
      twitter: '',
      telegram: '',
      website: '',
      initialBuySol: 0.25,
      slippageBps: 1000,
      priorityFeeSol: 0.005,
      mayhemMode: false,
    })).rejects.toThrow('Selected wallet does not have a keypair imported')
  })

  it('returns a failing preflight when helius or balance requirements are missing', async () => {
    hasHeliusKeyMock.mockReturnValue(false)
    getBalanceMock.mockResolvedValue({ sol: 0.1, lamports: 100_000_000 })

    const result = await preflightLaunch({
      launchpad: 'pumpfun',
      walletId: 'wallet-123',
      projectId: 'project-123',
      name: 'Daemon',
      symbol: 'DMN',
      description: 'Daemon launch token',
      imagePath: null,
      twitter: '',
      telegram: '',
      website: '',
      initialBuySol: 0.25,
      slippageBps: 1000,
      priorityFeeSol: 0.005,
      mayhemMode: false,
    })

    expect(result.ready).toBe(false)
    expect(result.checks.find((check) => check.id === 'helius')?.status).toBe('warn')
    expect(result.checks.find((check) => check.id === 'wallet-balance')?.status).toBe('fail')
  })
})
