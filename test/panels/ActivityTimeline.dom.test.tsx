// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActivityTimeline } from '../../src/panels/ActivityTimeline/ActivityTimeline'
import { useNotificationsStore } from '../../src/store/notifications'

function installDaemonBridge() {
  const append = vi.fn().mockResolvedValue({ ok: true })
  const list = vi.fn().mockResolvedValue({
    ok: true,
    data: [
      {
        id: 'remote-1',
        kind: 'success',
        message: 'Runtime toolchain check passed',
        context: 'Runtime',
        createdAt: 1_700_000_000_000,
      },
    ],
  })
  const clear = vi.fn().mockResolvedValue({ ok: true })

  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      activity: { append, list, clear },
    },
  })

  return { append, clear, list }
}

describe('ActivityTimeline', () => {
  beforeEach(() => {
    installDaemonBridge()
    useNotificationsStore.setState({
      toasts: [],
      activity: [
        {
          id: 'wallet-1',
          kind: 'success',
          message: 'Swap confirmed via RPC with signature abc123',
          context: 'Wallet',
          createdAt: 1_700_000_000_000,
        },
        {
          id: 'terminal-1',
          kind: 'info',
          message: 'Opened Terminal in C:/work/daemon-app',
          context: 'Terminal',
          createdAt: 1_700_000_000_100,
        },
        {
          id: 'scaffold-1',
          kind: 'warning',
          message: 'Token launch preflight needs attention for TEST',
          context: 'Runtime',
          createdAt: 1_700_000_000_200,
        },
      ],
    })
  })

  it('filters activity by wallet, terminal, runtime, and errors', async () => {
    render(<ActivityTimeline />)

    expect(screen.getByText('Activity Timeline')).toBeInTheDocument()
    expect(screen.getByText('Swap confirmed via RPC with signature abc123')).toBeInTheDocument()
    expect(screen.getByText('Opened Terminal in C:/work/daemon-app')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /Wallet/ }))
    expect(screen.getByText('Swap confirmed via RPC with signature abc123')).toBeInTheDocument()
    expect(screen.queryByText('Opened Terminal in C:/work/daemon-app')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /Terminal/ }))
    expect(screen.getByText('Opened Terminal in C:/work/daemon-app')).toBeInTheDocument()
    expect(screen.queryByText('Swap confirmed via RPC with signature abc123')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /Errors/ }))
    expect(screen.getByText('Token launch preflight needs attention for TEST')).toBeInTheDocument()
    expect(screen.queryByText('Opened Terminal in C:/work/daemon-app')).not.toBeInTheDocument()
  })

  it('records non-toast activity and can refresh or clear persisted history', async () => {
    const { append, clear, list } = installDaemonBridge()
    useNotificationsStore.setState({ toasts: [], activity: [] })

    useNotificationsStore.getState().addActivity({
      kind: 'success',
      context: 'Scaffold',
      message: 'Build agent started for demo',
      createdAt: 1_700_000_000_000,
    })

    expect(useNotificationsStore.getState().toasts).toEqual([])
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'success',
      context: 'Scaffold',
      message: 'Build agent started for demo',
    }))

    render(<ActivityTimeline />)
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(list).toHaveBeenCalledWith(500))
    expect(await screen.findByText('Runtime toolchain check passed')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(clear).toHaveBeenCalled())
    expect(useNotificationsStore.getState().activity).toEqual([])
  })
})
