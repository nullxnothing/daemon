import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRun, mockGet, mockPrepare } = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockGet: vi.fn(),
  mockPrepare: vi.fn(),
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: mockPrepare,
  }),
}))

import { getTokenLaunchSettings, setTokenLaunchSettings } from '../../electron/services/SettingsService'

describe('SettingsService token launch settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT value FROM app_settings')) return { get: mockGet }
      if (sql.includes('INSERT INTO app_settings')) return { run: mockRun }
      return { get: vi.fn(), run: vi.fn() }
    })
    mockGet.mockReturnValue(undefined)
  })

  it('normalizes empty settings from storage', () => {
    expect(getTokenLaunchSettings()).toEqual({
      raydium: { configId: '', quoteMint: '' },
      meteora: { configId: '', quoteMint: '', baseSupply: '' },
    })
  })

  it('rejects invalid public keys', () => {
    expect(() => setTokenLaunchSettings({
      raydium: { configId: 'not-a-key', quoteMint: '' },
      meteora: { configId: '', quoteMint: '', baseSupply: '' },
    })).toThrow('Raydium config ID must be a valid Solana public key')
  })

  it('rejects invalid meteora base supply', () => {
    expect(() => setTokenLaunchSettings({
      raydium: { configId: '', quoteMint: '' },
      meteora: { configId: '', quoteMint: '', baseSupply: 'abc' },
    })).toThrow('Meteora base supply must be a positive integer')
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
    })

    expect(mockRun).toHaveBeenCalledWith(
      'token_launch_settings',
      expect.stringContaining('"configId":"11111111111111111111111111111111"'),
      expect.any(Number),
    )
  })
})
