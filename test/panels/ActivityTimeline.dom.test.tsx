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
          sessionSummary: null,
          artifacts: null,
        },
    ],
  })
  const clear = vi.fn().mockResolvedValue({ ok: true })
  const saveSummary = vi.fn().mockResolvedValue({ ok: true })

  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      activity: { append, list, saveSummary, clear },
    },
  })

  return { append, clear, list, saveSummary }
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
          sessionSummary: null,
          artifacts: null,
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
          sessionSummary: null,
          artifacts: null,
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
          sessionSummary: null,
          artifacts: null,
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
      sessionSummary: null,
      artifacts: [
        {
          type: 'project',
          label: 'Project path',
          value: 'C:/work/demo',
        },
      ],
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
      artifacts: [
        {
          type: 'project',
          label: 'Project path',
          value: 'C:/work/demo',
        },
      ],
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
          sessionSummary: null,
          artifacts: null,
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
          sessionSummary: null,
          artifacts: null,
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
          sessionSummary: null,
          artifacts: null,
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

  it('generates, persists, and copies a session handoff report', async () => {
    const { saveSummary } = installDaemonBridge()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    useNotificationsStore.setState({
      toasts: [],
      activity: [
        {
          id: 'session-wallet',
          kind: 'success',
          message: 'Swap confirmed via RPC with signature abc123',
          context: 'Wallet',
          createdAt: 1_700_000_000_300,
          sessionId: 'scaffold-demo',
          sessionStatus: 'running',
          projectId: 'project-demo',
          projectName: 'demo',
          sessionSummary: null,
          artifacts: [
            {
              type: 'transaction',
              label: 'Tx signature',
              value: '5rR5jzJwP5xHhNTRNLpR8XUqz4fRqV7VQqLD3fkGRhY2N1Vy8uKFN6rDc4B7bEBZV1Jr3jbyKQnAorxyuQ9Z7Z6G',
              href: 'https://solscan.io/tx/5rR5jzJwP5xHhNTRNLpR8XUqz4fRqV7VQqLD3fkGRhY2N1Vy8uKFN6rDc4B7bEBZV1Jr3jbyKQnAorxyuQ9Z7Z6G',
            },
          ],
        },
        {
          id: 'session-warning',
          kind: 'warning',
          message: 'Runtime toolchain check found missing tools: Anchor',
          context: 'Runtime',
          createdAt: 1_700_000_000_200,
          sessionId: 'scaffold-demo',
          sessionStatus: 'blocked',
          projectId: 'project-demo',
          projectName: 'demo',
          sessionSummary: null,
          artifacts: null,
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
          sessionSummary: null,
          artifacts: [
            {
              type: 'project',
              label: 'Project path',
              value: 'C:/work/demo',
            },
          ],
        },
      ],
    })

    render(<ActivityTimeline />)

    await userEvent.click(screen.getByRole('button', { name: 'Summarize' }))
    await waitFor(() => expect(saveSummary).toHaveBeenCalledWith('scaffold-demo', expect.stringContaining('DAEMON Session Report: demo')))
    expect(screen.getByText(/Needs attention:/)).toBeInTheDocument()
    expect(screen.getByText(/Wallet\/tx: Swap confirmed via RPC/)).toBeInTheDocument()
    expect(screen.getByText('Tx signature')).toBeInTheDocument()
    expect(screen.getByText('Project path')).toBeInTheDocument()
    expect(screen.getByText(/Launch artifacts:/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Next action: Resolve the warnings/errors above'))
  })
})
