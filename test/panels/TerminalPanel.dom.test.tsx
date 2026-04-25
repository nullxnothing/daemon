// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUIStore } from '../../src/store/ui'
import { useWorkflowShellStore } from '../../src/store/workflowShell'

vi.mock('../../src/panels/Terminal/TerminalInstance', () => ({
  TerminalInstance: ({ id, isVisible }: { id: string; isVisible: boolean }) => (
    <div data-testid={`terminal-instance-${id}`} data-visible={String(isVisible)} />
  ),
}))

const { TerminalPanel } = await import('../../src/panels/Terminal/Terminal')

function installDaemonBridge(createTerminal = vi.fn()) {
  let terminalId = 0
  const terminalCreate = createTerminal
  if (!terminalCreate.getMockImplementation()) {
    terminalCreate.mockImplementation(async () => {
      terminalId += 1
      return { ok: true, data: { id: `term-${terminalId}` } }
    })
  }

  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      activity: {
        append: vi.fn().mockResolvedValue({ ok: true }),
      },
      agents: {
        list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      fs: {
        readFile: vi.fn().mockResolvedValue({ ok: false }),
      },
      settings: {
        setLayout: vi.fn().mockResolvedValue({ ok: true }),
      },
      terminal: {
        create: terminalCreate,
        kill: vi.fn().mockResolvedValue({ ok: true }),
        onData: vi.fn(() => () => {}),
        onExit: vi.fn(() => () => {}),
        pasteFromClipboard: vi.fn().mockResolvedValue({ ok: true }),
        ready: vi.fn().mockResolvedValue({ ok: true }),
        resize: vi.fn().mockResolvedValue({ ok: true }),
        spawnAgent: vi.fn().mockResolvedValue({ ok: false }),
        write: vi.fn().mockResolvedValue({ ok: true }),
      },
    },
  })

  return terminalCreate
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function resetStores() {
  useUIStore.setState({
    activeProjectId: 'project-1',
    activeProjectPath: 'C:/work/daemon-app',
    projects: [{ id: 'project-1', name: 'daemon-app', path: 'C:/work/daemon-app', last_active: 10 } as Project],
    terminals: [],
    activeTerminalIdByProject: {},
    centerMode: 'canvas',
  })
  useWorkflowShellStore.setState({
    drawerTool: null,
    drawerOpen: false,
    drawerFullscreen: false,
    launchWizardOpen: false,
  })
}

describe('TerminalPanel DOM behavior', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetStores()
  })

  it('auto-creates a plain shell terminal without a Claude startup command', async () => {
    const terminalCreate = installDaemonBridge()

    render(<TerminalPanel />)

    await waitFor(() => expect(terminalCreate).toHaveBeenCalledTimes(1))

    expect(terminalCreate).toHaveBeenCalledWith({ cwd: 'C:/work/daemon-app', startupCommand: undefined })

    await waitFor(() => {
      const terminal = useUIStore.getState().terminals[0]
      expect(terminal).toMatchObject({
        id: 'term-1',
        label: 'Terminal',
        agentId: null,
        projectId: 'project-1',
      })
    })

    expect(JSON.stringify(terminalCreate.mock.calls)).not.toContain('claude')
  })

  it('keeps agent launches behind explicit launcher actions', async () => {
    installDaemonBridge()
    render(<TerminalPanel />)

    await userEvent.click(screen.getAllByTitle('New tab options')[0])

    expect(screen.getByRole('menu', { name: 'New terminal options' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Standard Terminal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Claude Chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solana Agent' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Surfpool' })).toBeInTheDocument()
  })

  it('opens a second active terminal from the launcher while one is already running', async () => {
    const terminalCreate = installDaemonBridge()
    render(<TerminalPanel />)

    await waitFor(() => expect(terminalCreate).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getAllByTitle('New tab options')[0])
    await userEvent.click(screen.getByRole('button', { name: 'Standard Terminal' }))

    await waitFor(() => expect(terminalCreate).toHaveBeenCalledTimes(2))
    expect(useUIStore.getState().terminals.map((terminal) => terminal.id)).toEqual(['term-1', 'term-2'])
    expect(useUIStore.getState().activeTerminalIdByProject['project-1']).toBe('term-2')
    expect(screen.getByTestId('terminal-instance-term-2')).toHaveAttribute('data-visible', 'true')
  })

  it('does not duplicate the first terminal when the empty state is clicked while auto-create is pending', async () => {
    const pendingTerminal = deferred<{ ok: true; data: { id: string } }>()
    const terminalCreate = installDaemonBridge(vi.fn().mockReturnValueOnce(pendingTerminal.promise))
    render(<TerminalPanel />)

    await waitFor(() => expect(terminalCreate).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByText('Click to start a terminal'))
    expect(terminalCreate).toHaveBeenCalledTimes(1)

    pendingTerminal.resolve({ ok: true, data: { id: 'term-1' } })
    await waitFor(() => expect(useUIStore.getState().terminals.map((terminal) => terminal.id)).toEqual(['term-1']))
  })

  it('does not create duplicate split terminals from rapid split clicks', async () => {
    const pendingSplit = deferred<{ ok: true; data: { id: string } }>()
    let createCount = 0
    const terminalCreate = installDaemonBridge(vi.fn().mockImplementation(() => {
      createCount += 1
      if (createCount === 1) return Promise.resolve({ ok: true, data: { id: 'term-1' } })
      if (createCount === 2) return pendingSplit.promise
      return Promise.resolve({ ok: true, data: { id: `term-${createCount}` } })
    }))
    render(<TerminalPanel />)

    await waitFor(() => expect(terminalCreate).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByTitle('Split vertical'))
    await userEvent.click(screen.getByTitle('Split vertical'))
    expect(terminalCreate).toHaveBeenCalledTimes(2)

    pendingSplit.resolve({ ok: true, data: { id: 'term-2' } })
    await waitFor(() => expect(useUIStore.getState().terminals.map((terminal) => terminal.id)).toEqual(['term-1', 'term-2']))
  })

  it('falls back to the most recent project when the user starts a terminal without an active project', async () => {
    const terminalCreate = installDaemonBridge()
    useUIStore.setState({
      activeProjectId: null,
      activeProjectPath: null,
      projects: [{ id: 'project-2', name: 'docs', path: 'C:/Users/offic/Documents/test', last_active: 42 } as Project],
      terminals: [],
      activeTerminalIdByProject: {},
    })

    render(<TerminalPanel />)

    await userEvent.click(screen.getByText('Click to start a terminal'))

    await waitFor(() => expect(terminalCreate).toHaveBeenCalledTimes(1))
    expect(terminalCreate).toHaveBeenCalledWith({ cwd: 'C:/Users/offic/Documents/test', startupCommand: undefined })
    expect(useUIStore.getState().activeProjectId).toBe('project-2')
  })
})
