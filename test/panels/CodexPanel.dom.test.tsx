// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CodexPanel } from '../../src/panels/CodexPanel/CodexPanel'
import { useUIStore } from '../../src/store/ui'
import { useAppActions } from '../../src/store/appActions'

function installDaemonBridge() {
  const createTerminal = vi.fn().mockResolvedValue({
    ok: true,
    data: { id: 'terminal-codex-login', pid: 123, agentId: null },
  })

  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      terminal: {
        create: createTerminal,
      },
      codex: {
        verifyConnection: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            providerId: 'codex',
            cliPath: 'codex',
            hasApiKey: false,
            isAuthenticated: false,
            authMode: 'none',
          },
        }),
        getModel: vi.fn().mockResolvedValue({ ok: true, data: 'gpt-5.4' }),
        getReasoningEffort: vi.fn().mockResolvedValue({ ok: true, data: 'medium' }),
        mcpAll: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        restartAllSessions: vi.fn().mockResolvedValue({ ok: true, data: { restarted: 0, total: 0 } }),
        agentsMdRead: vi.fn().mockResolvedValue({ ok: true, data: { content: '', diff: '' } }),
      },
      events: {
        on: vi.fn().mockReturnValue(() => {}),
      },
      settings: {
        setLayout: vi.fn().mockResolvedValue({ ok: true }),
      },
    },
  })

  return { createTerminal }
}

describe('CodexPanel', () => {
  beforeEach(() => {
    useUIStore.setState({
      activeProjectId: 'project-1',
      activeProjectPath: 'C:/work/daemon-app',
      terminals: [],
      activeTerminalIdByProject: {},
      centerMode: 'grind',
    })
    useAppActions.setState({ terminalFocusRequestId: 0 })
    vi.restoreAllMocks()
  })

  it('opens and focuses codex login in the active project terminal cwd', async () => {
    const { createTerminal } = installDaemonBridge()

    render(<CodexPanel />)

    await waitFor(() => {
      expect(screen.getByText('Not connected')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(createTerminal).toHaveBeenCalledWith({
      cwd: 'C:/work/daemon-app',
      startupCommand: 'codex login',
      userInitiated: true,
    })
    expect(useUIStore.getState().terminals).toContainEqual({
      id: 'terminal-codex-login',
      label: 'Codex Login',
      agentId: null,
      projectId: 'project-1',
    })
    expect(useUIStore.getState().activeTerminalIdByProject['project-1']).toBe('terminal-codex-login')
    expect(useUIStore.getState().centerMode).toBe('canvas')
    expect(useAppActions.getState().terminalFocusRequestId).toBe(1)
  })
})
