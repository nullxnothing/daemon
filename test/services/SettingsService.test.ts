import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRun, mockGet, mockPrepare, mockStoreKey, mockGetKey, mockDeleteKey, mockListKeys } = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockGet: vi.fn(),
  mockPrepare: vi.fn(),
  mockStoreKey: vi.fn(),
  mockGetKey: vi.fn(),
  mockDeleteKey: vi.fn(),
  mockListKeys: vi.fn(),
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: mockPrepare,
  }),
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  storeKey: mockStoreKey,
  getKey: mockGetKey,
  deleteKey: mockDeleteKey,
  listKeys: mockListKeys,
}))

import {
  getDrawerToolOrder,
  getPinnedTools,
  getTokenLaunchRuntimeSettings,
  getTokenLaunchSettings,
  getUiSettings,
  getWalletInfrastructureSettings,
  getWorkspaceProfile,
  maybeRecoverUnstableUiState,
  recoverUiState,
  setDrawerToolOrder,
  setTokenLaunchSettings,
  setWalletInfrastructureSettings,
} from '../../electron/services/SettingsService'

describe('SettingsService token launch settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT value FROM app_settings')) return { get: mockGet }
      if (sql.includes('INSERT INTO app_settings')) return { run: mockRun }
      if (sql.includes('DELETE FROM app_settings WHERE key = ?')) return { run: mockRun }
      if (sql.includes('DELETE FROM active_sessions')) return { run: () => ({ changes: 2 }) }
      return { get: vi.fn(), run: vi.fn() }
    })
    mockGet.mockReturnValue(undefined)
    mockGetKey.mockReturnValue(null)
    mockListKeys.mockReturnValue([])
  })

  it('normalizes empty settings from storage', () => {
    expect(getTokenLaunchSettings()).toEqual({
      raydium: { configId: '', quoteMint: '' },
      meteora: { configId: '', quoteMint: '', baseSupply: '' },
      printr: { apiBaseUrl: '', apiKey: '', apiKeyConfigured: false, apiKeyHint: '', apiKeySource: 'none', quotePath: '', createPath: '', chain: '' },
      openbid: { apiBaseUrl: '', chainId: '', dex: '', feeTier: '', packageType: '', marketCap: '', totalSupply: '', maxAllocationPerUser: '', referrer: '', board: '', boardOwner: '' },
    })
  })

  it('stores Printr API keys in secure storage instead of app settings', () => {
    setTokenLaunchSettings({
      raydium: { configId: '', quoteMint: '' },
      meteora: { configId: '', quoteMint: '', baseSupply: '' },
      printr: {
        apiBaseUrl: 'https://api-preview.printr.money',
        apiKey: 'printr_secret',
        quotePath: '',
        createPath: '',
        chain: '',
      },
      openbid: { apiBaseUrl: '', chainId: '', dex: '', feeTier: '', packageType: '', marketCap: '', totalSupply: '', maxAllocationPerUser: '', referrer: '', board: '', boardOwner: '' },
    })

    expect(mockStoreKey).toHaveBeenCalledWith('PRINTR_API_KEY', 'printr_secret')
    const persisted = mockRun.mock.calls.find((call) => call[0] === 'token_launch_settings')?.[1] as string
    expect(persisted).toContain('"apiKey":""')
    expect(persisted).not.toContain('printr_secret')
  })

  it('scrubs legacy plaintext Printr keys during settings reads', () => {
    mockGet.mockReturnValue({
      value: JSON.stringify({
        raydium: { configId: '', quoteMint: '' },
        meteora: { configId: '', quoteMint: '', baseSupply: '' },
        printr: {
          apiBaseUrl: 'https://api-preview.printr.money',
          apiKey: 'legacy_printr_secret',
          quotePath: '',
          createPath: '',
          chain: '',
        },
        openbid: { apiBaseUrl: '', chainId: '', dex: '', feeTier: '', packageType: '', marketCap: '', totalSupply: '', maxAllocationPerUser: '', referrer: '', board: '', boardOwner: '' },
      }),
    })

    expect(getTokenLaunchSettings().printr.apiKey).toBe('')
    expect(mockStoreKey).toHaveBeenCalledWith('PRINTR_API_KEY', 'legacy_printr_secret')
    const persisted = mockRun.mock.calls.find((call) => call[0] === 'token_launch_settings')?.[1] as string
    expect(persisted).not.toContain('legacy_printr_secret')
  })

  it('keeps secure Printr keys available to runtime launch adapters only', () => {
    mockGetKey.mockImplementation((keyName: string) => keyName === 'PRINTR_API_KEY' ? 'secure_printr_secret' : null)
    mockListKeys.mockReturnValue([{ key_name: 'PRINTR_API_KEY', hint: '...cret' }])

    expect(getTokenLaunchSettings().printr).toMatchObject({
      apiKey: '',
      apiKeyConfigured: true,
      apiKeyHint: '...cret',
      apiKeySource: 'secure',
    })
    expect(getTokenLaunchRuntimeSettings().printr.apiKey).toBe('secure_printr_secret')
  })

  it('includes persisted low power mode in UI settings', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'low_power_mode') return { value: 'true' }
      return undefined
    })

    expect(getUiSettings()).toMatchObject({
      showMarketTape: true,
      showTitlebarWallet: true,
      lowPowerMode: true,
    })
  })

  it('rejects invalid public keys', () => {
    expect(() => setTokenLaunchSettings({
      raydium: { configId: 'not-a-key', quoteMint: '' },
      meteora: { configId: '', quoteMint: '', baseSupply: '' },
      printr: { apiBaseUrl: '', apiKey: '', quotePath: '', createPath: '', chain: '' },
      openbid: { apiBaseUrl: '', chainId: '', dex: '', feeTier: '', packageType: '', marketCap: '', totalSupply: '', maxAllocationPerUser: '', referrer: '', board: '', boardOwner: '' },
    })).toThrow('Raydium config ID must be a valid Solana public key')
  })

  it('rejects invalid meteora base supply', () => {
    expect(() => setTokenLaunchSettings({
      raydium: { configId: '', quoteMint: '' },
      meteora: { configId: '', quoteMint: '', baseSupply: 'abc' },
      printr: { apiBaseUrl: '', apiKey: '', quotePath: '', createPath: '', chain: '' },
      openbid: { apiBaseUrl: '', chainId: '', dex: '', feeTier: '', packageType: '', marketCap: '', totalSupply: '', maxAllocationPerUser: '', referrer: '', board: '', boardOwner: '' },
    })).toThrow('Meteora base supply must be a positive integer')
  })

  it('rejects basedbid settings outside documented Solana ranges', () => {
    expect(() => setTokenLaunchSettings({
      raydium: { configId: '', quoteMint: '' },
      meteora: { configId: '', quoteMint: '', baseSupply: '' },
      printr: { apiBaseUrl: '', apiKey: '', quotePath: '', createPath: '', chain: '' },
      openbid: { apiBaseUrl: '', chainId: '', dex: 'raydium', feeTier: '3', packageType: '', marketCap: '', totalSupply: '', maxAllocationPerUser: '', referrer: '', board: '', boardOwner: '' },
    })).toThrow('basedbid Raydium fee tier must be 0, 1, or 2')

    expect(() => setTokenLaunchSettings({
      raydium: { configId: '', quoteMint: '' },
      meteora: { configId: '', quoteMint: '', baseSupply: '' },
      printr: { apiBaseUrl: '', apiKey: '', quotePath: '', createPath: '', chain: '' },
      openbid: { apiBaseUrl: '', chainId: '', dex: '', feeTier: '', packageType: '', marketCap: '9000', totalSupply: '', maxAllocationPerUser: '', referrer: '', board: '', boardOwner: '' },
    })).toThrow('basedbid market cap must be between 11000 and 10000000')
  })

  it('persists validated settings', () => {
    setTokenLaunchSettings({
      raydium: {
        configId: '11111111111111111111111111111111',
        quoteMint: '',
      },
      meteora: {
        configId: '11111111111111111111111111111111',
        quoteMint: 'So11111111111111111111111111111111111111112',
        baseSupply: '1000000',
      },
      printr: {
        apiBaseUrl: '',
        apiKey: '',
        quotePath: '',
        createPath: '',
        chain: '',
      },
      openbid: {
        apiBaseUrl: '',
        chainId: '',
        dex: '',
        feeTier: '',
        packageType: '',
        marketCap: '',
        totalSupply: '',
        maxAllocationPerUser: '',
        referrer: '',
        board: '',
        boardOwner: '',
      },
    })

    expect(mockRun).toHaveBeenCalledWith(
      'token_launch_settings',
      expect.stringContaining('"configId":"11111111111111111111111111111111"'),
      expect.any(Number),
    )
  })

  it('preserves Solflare as the preferred wallet setting', () => {
    mockGet.mockReturnValue({
      value: JSON.stringify({
        cluster: 'devnet',
        rpcProvider: 'helius',
        quicknodeRpcUrl: '',
        customRpcUrl: '',
        swapProvider: 'jupiter',
        preferredWallet: 'solflare',
        executionMode: 'rpc',
        jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
      }),
    })

    expect(getWalletInfrastructureSettings().preferredWallet).toBe('solflare')
  })

  it('persists Solflare as the preferred wallet setting', () => {
    setWalletInfrastructureSettings({
      cluster: 'devnet',
      rpcProvider: 'helius',
      quicknodeRpcUrl: '',
      customRpcUrl: '',
      swapProvider: 'jupiter',
      preferredWallet: 'solflare',
      executionMode: 'rpc',
      jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
    })

    expect(mockRun).toHaveBeenCalledWith(
      'wallet_infrastructure_settings',
      expect.stringContaining('"preferredWallet":"solflare"'),
      expect.any(Number),
    )
  })

  it('sanitizes stored pins and appends the pack-host pins once', () => {
    mockGet.mockReturnValue({
      value: JSON.stringify(['git', '', 'browser', 'git', 42]),
    })

    // Sanitizes (dedupes, drops blanks/non-strings) then appends the 5 pack-host
    // pins via the one-time migration.
    expect(getPinnedTools()).toEqual([
      'git', 'browser',
      'solana-toolbox', 'wallet', 'token-launch', 'daemon-ai', 'signalhouse',
    ])
    expect(mockRun).toHaveBeenCalledWith('pinned_tools_pack_hosts_added', 'true', expect.any(Number))
  })

  it('allows an empty drawer tool order to preserve registry ordering', () => {
    mockGet.mockReturnValue({
      value: JSON.stringify([]),
    })

    expect(getDrawerToolOrder()).toEqual([])
  })

  it('sanitizes drawer tool order without falling back to pinned tools', () => {
    mockGet.mockReturnValue({
      value: JSON.stringify(['wallet', '', 'git', 'wallet', 42]),
    })

    expect(getDrawerToolOrder()).toEqual(['wallet', 'git'])
  })

  it('persists an explicitly empty drawer tool order', () => {
    setDrawerToolOrder([])

    expect(mockRun).toHaveBeenCalledWith(
      'drawer_tool_order',
      JSON.stringify([]),
      expect.any(Number),
    )
  })

  it('drops invalid workspace profiles from storage', () => {
    mockGet.mockReturnValue({
      value: JSON.stringify({ name: 'broken', toolVisibility: { git: true } }),
    })

    expect(getWorkspaceProfile()).toBeNull()
  })

  it('recovers unstable UI state by clearing persisted layout keys and sessions', () => {
    const result = recoverUiState()

    expect(mockRun).toHaveBeenCalledWith('layout_center_mode')
    expect(mockRun).toHaveBeenCalledWith('layout_right_panel_tab')
    expect(mockRun).toHaveBeenCalledWith('workspace_profile')
    expect(mockRun).toHaveBeenCalledWith('pinned_tools')
    expect(mockRun).toHaveBeenCalledWith('drawer_tool_order')
    expect(mockRun).toHaveBeenCalledWith('ui_recovery_last_run_at', expect.any(String), expect.any(Number))
    expect(result.clearedActiveSessions).toBe(2)
  })

  it('auto-recovers once crash threshold is exceeded', () => {
    mockGet.mockReturnValueOnce(undefined)

    const result = maybeRecoverUnstableUiState(4)

    expect(result?.clearedKeys).toContain('workspace_profile')
  })
})
