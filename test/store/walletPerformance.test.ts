// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWalletStore } from '../../src/store/wallet'

const emptyDashboard = {
  heliusConfigured: false,
  market: [],
  portfolio: { totalUsd: 0, delta24hUsd: 0, delta24hPct: 0, walletCount: 0 },
  wallets: [],
  activeWallet: null,
  feed: [],
  recentActivity: [],
}

function installDaemonBridge() {
  const dashboard = vi.fn().mockResolvedValue({ ok: true, data: emptyDashboard })
  const setLowPowerMode = vi.fn().mockResolvedValue({ ok: true })

  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      settings: {
        getUi: vi.fn().mockResolvedValue({
          ok: true,
          data: { showMarketTape: true, showTitlebarWallet: true, lowPowerMode: false },
        }),
        setLowPowerMode,
        setShowMarketTape: vi.fn().mockResolvedValue({ ok: true }),
        setShowTitlebarWallet: vi.fn().mockResolvedValue({ ok: true }),
      },
      wallet: {
        dashboard,
      },
    },
  })

  return { dashboard, setLowPowerMode }
}

describe('wallet performance polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    installDaemonBridge()
    useWalletStore.setState({
      dashboard: null,
      showMarketTape: true,
      showTitlebarWallet: true,
      lowPowerMode: false,
      loading: false,
      error: null,
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('fast-polls visible wallet surfaces every 15 seconds by default', async () => {
    const { dashboard } = installDaemonBridge()
    const cleanup = useWalletStore.getState().subscribeFastPoll()

    await vi.advanceTimersByTimeAsync(14_999)
    expect(dashboard).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(dashboard).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('slows visible wallet polling to 60 seconds in low power mode', async () => {
    const { dashboard } = installDaemonBridge()
    useWalletStore.setState({ lowPowerMode: true })
    const cleanup = useWalletStore.getState().subscribeFastPoll()

    await vi.advanceTimersByTimeAsync(59_999)
    expect(dashboard).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(dashboard).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('does not run background wallet polling while low power mode is enabled', async () => {
    const { dashboard } = installDaemonBridge()
    useWalletStore.setState({ lowPowerMode: true })
    const cleanup = useWalletStore.getState().startBackgroundPoll()

    await vi.advanceTimersByTimeAsync(300_000)
    expect(dashboard).not.toHaveBeenCalled()

    cleanup()
  })
})
