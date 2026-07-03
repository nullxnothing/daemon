import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Onboarding chain-safety regression: the first mission's turns are pinned to
 * devnet via snapshot.pinnedCluster. With runtime config deliberately set to
 * MAINNET (the re-entrant wizard scenario), pinned reads must never reach the
 * dashboard/RPC path — they answer from the local wallet inventory and report
 * the cluster as devnet. Unpinned turns keep the existing behavior exactly.
 */
const getDashboard = vi.fn(async () => ({
  activeWallet: { name: 'main', address: 'So1111', id: 'w1' },
  portfolio: { totalUsd: 123, walletCount: 1 },
  heliusConfigured: true,
}))
const getLocalWalletInventory = vi.fn(() => ({ activeWallet: null, address: null, walletCount: 0 }))

vi.mock('../../electron/services/WalletService', () => ({
  getDashboard: (...args: unknown[]) => getDashboard(...args),
  getLocalWalletInventory: (...args: unknown[]) => getLocalWalletInventory(...args),
}))

// Adversarial config: everything stored points at mainnet.
vi.mock('../../electron/services/SettingsService', () => ({
  getWalletInfrastructureSettings: vi.fn(() => ({ cluster: 'mainnet-beta', rpcProvider: 'helius' })),
  getEnabledPacks: vi.fn(() => ({})),
}))

vi.mock('../../electron/services/FeeService', () => ({
  quoteExecutionFee: vi.fn(() => null),
}))

vi.mock('../../electron/services/LogService', () => ({
  LogService: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../../electron/db/db', () => ({
  getDb: vi.fn(() => ({ prepare: vi.fn(() => ({ all: vi.fn(() => []), get: vi.fn() })) })),
}))

import { walletTools } from '../../electron/services/aria/tools/wallet'
import { navigationTools } from '../../electron/services/aria/tools/navigation'

const readWallet = walletTools.find((tool) => tool.name === 'read_wallet')!
const readProjectStatus = navigationTools.find((tool) => tool.name === 'read_project_status')!

function makeCtx(pinnedCluster?: 'devnet') {
  return {
    sessionId: 'test',
    snapshot: {
      activeProjectId: 'p1',
      activeProjectPath: 'C:/work/daemon-first-mission',
      currentPanelId: null,
      openFilePath: null,
      chips: { activeFile: false, projectTree: false, gitDiff: false, terminalLogs: false, walletContext: false },
      ...(pinnedCluster ? { pinnedCluster } : {}),
    },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('first-mission devnet pin — read_wallet', () => {
  it('pinned turn never touches the dashboard/RPC path even with mainnet configured', async () => {
    const result = await readWallet.handler({}, makeCtx('devnet'))

    expect(getDashboard).not.toHaveBeenCalled()
    expect(getLocalWalletInventory).toHaveBeenCalledWith('p1')
    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ cluster: 'devnet', clusterPinned: true, walletCount: 0 })
  })

  it('pinned response documents the skipped live read', async () => {
    const result = await readWallet.handler({}, makeCtx('devnet'))
    expect((result.data as { note: string }).note).toMatch(/devnet-only/i)
  })

  it('unpinned turn keeps the normal dashboard read', async () => {
    const result = await readWallet.handler({}, makeCtx())

    expect(getDashboard).toHaveBeenCalledWith('p1')
    expect(getLocalWalletInventory).not.toHaveBeenCalled()
    expect(result.data).toMatchObject({ walletCount: 1, totalUsd: 123 })
  })
})

describe('first-mission devnet pin — read_project_status', () => {
  it('pinned turn skips the dashboard and reports the cluster as devnet, not the mainnet config', async () => {
    const result = await readProjectStatus.handler({}, makeCtx('devnet'))

    expect(getDashboard).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ cluster: 'devnet', clusterPinned: true })
    expect((result.data as { cluster: string }).cluster).not.toBe('mainnet-beta')
  })

  it('unpinned turn reports the configured cluster and uses the dashboard', async () => {
    const result = await readProjectStatus.handler({}, makeCtx())

    expect(getDashboard).toHaveBeenCalled()
    expect(result.data).toMatchObject({ cluster: 'mainnet-beta' })
  })
})
