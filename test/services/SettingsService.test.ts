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

import {
  getPinnedTools,
  getTokenLaunchSettings,
  getWorkspaceProfile,
  maybeRecoverUnstableUiState,
  recoverUiState,
  setTokenLaunchSettings,
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

  it('sanitizes pinned tools from storage', () => {
    mockGet.mockReturnValue({
      value: JSON.stringify(['git', '', 'browser', 'git', 42]),
    })

    expect(getPinnedTools()).toEqual(['git', 'browser'])
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
