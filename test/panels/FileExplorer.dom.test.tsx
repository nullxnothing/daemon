// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileExplorer } from '../../src/panels/FileExplorer/FileExplorer'
import { useUIStore } from '../../src/store/ui'

function installDaemonBridge() {
  const createFile = vi.fn().mockResolvedValue({ ok: true })
  const createDir = vi.fn().mockResolvedValue({ ok: true })

  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      fs: {
        readDir: vi.fn().mockResolvedValue({
          ok: true,
          data: [
            { name: 'src', path: 'C:/work/daemon-app/src', isDirectory: true, children: [] },
            { name: 'package.json', path: 'C:/work/daemon-app/package.json', isDirectory: false },
          ],
        }),
        readFile: vi.fn().mockResolvedValue({ ok: true, data: { path: '', content: '' } }),
        createFile,
        createDir,
        delete: vi.fn().mockResolvedValue({ ok: true }),
        reveal: vi.fn().mockResolvedValue({ ok: true }),
        copyPath: vi.fn().mockResolvedValue({ ok: true }),
        rename: vi.fn().mockResolvedValue({ ok: true }),
      },
      git: {
        status: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      terminal: {
        create: vi.fn().mockResolvedValue({ ok: true, data: { id: 'terminal-1' } }),
      },
    },
  })

  return { createDir, createFile }
}

function resetStore() {
  useUIStore.setState({
    activeProjectId: 'project-1',
    activeProjectPath: 'C:/work/daemon-app',
    activePanel: 'claude',
    terminals: [],
  })
}

describe('FileExplorer', () => {
  beforeEach(() => {
    installDaemonBridge()
    resetStore()
  })

  it('keeps root file and folder creation reachable from the explorer toolbar', async () => {
    const user = userEvent.setup()
    const { createDir, createFile } = installDaemonBridge()

    render(<FileExplorer />)

    expect(await screen.findByLabelText('New file')).toBeInTheDocument()
    expect(screen.getByLabelText('New folder')).toBeInTheDocument()

    await user.click(screen.getByLabelText('New file'))
    await user.type(screen.getByPlaceholderText('filename'), 'README.md{Enter}')

    await waitFor(() => {
      expect(createFile).toHaveBeenCalledWith('C:/work/daemon-app/README.md')
    })

    await user.click(screen.getByLabelText('New folder'))
    await user.type(screen.getByPlaceholderText('folder name'), 'docs{Enter}')

    await waitFor(() => {
      expect(createDir).toHaveBeenCalledWith('C:/work/daemon-app/docs')
    })
  })
})
