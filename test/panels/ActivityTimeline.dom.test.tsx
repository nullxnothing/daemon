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
          sessionId: null,
          sessionStatus: null,
          projectId: null,
          projectName: null,
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
          sessionId: null,
          sessionStatus: null,
          projectId: null,
          projectName: null,
        },
        {
          id: 'terminal-1',
          kind: 'info',
          message: 'Opened Terminal in C:/work/daemon-app',
          context: 'Terminal',
          createdAt: 1_700_000_000_100,
          sessionId: null,
          sessionStatus: null,
          projectId: 'project-1',
          projectName: 'daemon-app',
        },
        {
          id: 'scaffold-1',
          kind: 'warning',
          message: 'Token launch preflight needs attention for TEST',
          context: 'Runtime',
          createdAt: 1_700_000_000_200,
          sessionId: null,
          sessionStatus: null,
          projectId: null,
          projectName: null,
        },
      ],
    })
  })

  it('filters activity by wallet, terminal, runtime, and errors', async () => {
    render(<ActivityTimeline />)

    expect(screen.getByText('Activity Timeline')).toBeInTheDocument()
    expect(screen.getAllByText('Swap confirmed via RPC with signature abc123').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Opened Terminal in C:/work/daemon-app').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('tab', { name: /Wallet/ }))
    expect(screen.getAllByText('Swap confirmed via RPC with signature abc123').length).toBeGreaterThan(0)
    expect(screen.queryByText('Opened Terminal in C:/work/daemon-app')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /Terminal/ }))
    expect(screen.getAllByText('Opened Terminal in C:/work/daemon-app').length).toBeGreaterThan(0)
    expect(screen.queryByText('Swap confirmed via RPC with signature abc123')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /Errors/ }))
    expect(screen.getAllByText('Token launch preflight needs attention for TEST').length).toBeGreaterThan(0)
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
      sessionId: 'scaffold-demo',
      sessionStatus: 'running',
      projectId: 'project-demo',
      projectName: 'demo',
    })

    expect(useNotificationsStore.getState().toasts).toEqual([])
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'success',
      context: 'Scaffold',
      message: 'Build agent started for demo',
      sessionId: 'scaffold-demo',
      sessionStatus: 'running',
      projectId: 'project-demo',
      projectName: 'demo',
    }))

    render(<ActivityTimeline />)
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(list).toHaveBeenCalledWith(500))
    await waitFor(() => expect(screen.getAllByText('Runtime toolchain check passed').length).toBeGreaterThan(0))

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(clear).toHaveBeenCalled())
    expect(useNotificationsStore.getState().activity).toEqual([])
  })

  it('groups execution-session events and preserves standalone legacy entries', () => {
    useNotificationsStore.setState({
      toasts: [],
      activity: [
        {
          id: 'session-running',
          kind: 'success',
          message: 'Build agent started for demo; runtime preset written.',
          context: 'Scaffold',
          createdAt: 1_700_000_000_200,
          sessionId: 'scaffold-demo',
          sessionStatus: 'running',
          projectId: 'project-demo',
          projectName: 'demo',
        },
        {
          id: 'session-created',
          kind: 'info',
          message: 'Started dApp scaffold for demo at C:/work/demo',
          context: 'Scaffold',
          createdAt: 1_700_000_000_100,
          sessionId: 'scaffold-demo',
          sessionStatus: 'created',
          projectId: 'project-demo',
          projectName: 'demo',
        },
        {
          id: 'legacy-terminal',
          kind: 'info',
          message: 'Opened Terminal in C:/work/daemon-app',
          context: 'Terminal',
          createdAt: 1_700_000_000_000,
          sessionId: null,
          sessionStatus: null,
          projectId: null,
          projectName: null,
        },
      ],
    })

    render(<ActivityTimeline />)

    expect(screen.getByText('demo')).toBeInTheDocument()
    expect(screen.getByText('running')).toBeInTheDocument()
    expect(screen.getAllByText('Started dApp scaffold for demo at C:/work/demo').length).toBeGreaterThan(0)
    expect(screen.getByText('Build agent started for demo; runtime preset written.')).toBeInTheDocument()
    expect(screen.getAllByText('DAEMON execution').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Opened Terminal in C:/work/daemon-app').length).toBeGreaterThan(0)
  })
})
