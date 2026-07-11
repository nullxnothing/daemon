// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange?: (value: string) => void }) => (
    <textarea aria-label="Monaco editor" value={value} onChange={(event) => onChange?.(event.currentTarget.value)} />
  ),
  loader: { config: vi.fn() },
}))

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  KeyMod: { CtrlCmd: 1 },
  KeyCode: { KeyS: 2 },
}))
vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({ default: class {} }))
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({ default: class {} }))
vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker?worker', () => ({ default: class {} }))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80
    rows = 24
    loadAddon() {}
    open() {}
    write() {}
    refresh() {}
    onData() { return { dispose() {} } }
    dispose() {}
  },
}))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }))

import LiteApp from '../../src/lite/LiteApp'
import { LiteExplorer } from '../../src/lite/workbench/LiteExplorer'
import { useAriaStore } from '../../src/store/aria'
import { useLiteWorkbenchStore } from '../../src/lite/workbench/liteWorkbenchStore'

const PROJECT = {
  id: 'project-1',
  name: 'solana-monitor',
  path: 'C:\\Projects\\solana-monitor',
  created_at: 1,
}

const SECOND_PROJECT = {
  id: 'project-2',
  name: 'token-launcher',
  path: 'C:\\Projects\\token-launcher',
  created_at: 2,
}

const README_PATH = `${PROJECT.path}\\README.md`
const readDir = vi.fn()
const readFile = vi.fn()
const terminalCreate = vi.fn()
let sessionSequence = 0

function installBridge() {
  readDir.mockResolvedValue({
    ok: true,
    data: [
      { name: 'README.md', path: README_PATH, isDirectory: false },
      { name: 'package.json', path: `${PROJECT.path}\\package.json`, isDirectory: false },
    ],
  })
  readFile.mockResolvedValue({ ok: true, data: { content: '# Solana monitor\n' } })
  terminalCreate.mockResolvedValue({ ok: true, data: { id: 'terminal-1' } })

  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      platform: 'win32',
      lite: {
        isOnboardingComplete: vi.fn().mockResolvedValue({ ok: true, data: true }),
        setOnboardingComplete: vi.fn().mockResolvedValue({ ok: true }),
        getShowTools: vi.fn().mockResolvedValue({ ok: true, data: false }),
        setShowTools: vi.fn().mockResolvedValue({ ok: true }),
        getFlavorInfo: vi.fn().mockResolvedValue({ ok: true, data: { flavor: 'lite', version: '4.7.0', ideInstalled: false } }),
        openInIde: vi.fn().mockResolvedValue({ ok: true, data: { launched: false } }),
      },
      projects: {
        list: vi.fn().mockResolvedValue({ ok: true, data: [PROJECT] }),
        openDialog: vi.fn().mockResolvedValue({ ok: true, data: PROJECT.path }),
        create: vi.fn().mockResolvedValue({ ok: true, data: PROJECT }),
      },
      memeStudio: {
        detect: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            archetype: 'permissionless-market-indexer',
            confidence: 0.8,
            evidence: [{ code: 'market-runtime', path: 'services/keeper/package.json', detail: 'Oracle and keeper runtime detected' }],
            topology: ['frontend', 'indexer', 'keeper'],
            capabilities: ['solana', 'token-2022'],
            gaps: [],
            tokenMints: [],
            clusterSources: [{ source: 'Anchor.toml', value: 'devnet' }],
            inspectedAt: 1,
          },
        }),
        marketContext: vi.fn().mockResolvedValue({ ok: false, error: 'not configured' }),
        tokenPreflight: vi.fn().mockResolvedValue({ ok: false, error: 'not configured' }),
      },
      fs: {
        readDir,
        readFile,
        writeFile: vi.fn().mockResolvedValue({ ok: true }),
        watch: vi.fn().mockResolvedValue({ ok: true }),
        unwatch: vi.fn().mockResolvedValue({ ok: true }),
        onChanged: vi.fn(() => () => {}),
      },
      validator: {
        toolchainStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            solanaCli: { installed: true, version: '2.3.0' },
            anchor: { installed: true, version: '0.32.1' },
            avm: { installed: true, version: '0.32.1' },
            surfpool: { installed: false, version: null },
            testValidator: { installed: true, version: '2.3.0' },
            litesvm: { installed: false, source: 'none' },
          },
        }),
        status: vi.fn().mockResolvedValue({ ok: true, data: { type: null, status: 'stopped', terminalId: null, port: null } }),
        detectProject: vi.fn().mockResolvedValue({ ok: true, data: { isSolanaProject: true, framework: 'anchor', indicators: ['Anchor.toml'], suggestedMcps: [] } }),
        start: vi.fn().mockResolvedValue({ ok: true, data: true }),
      },
      terminal: {
        create: terminalCreate,
        ready: vi.fn().mockResolvedValue({ ok: true }),
        write: vi.fn().mockResolvedValue({ ok: true }),
        resize: vi.fn().mockResolvedValue({ ok: true }),
        kill: vi.fn().mockResolvedValue({ ok: true }),
        onData: vi.fn(() => () => {}),
        onExit: vi.fn(() => () => {}),
      },
      claude: {
        listKeys: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      provider: {
        getPreferences: vi.fn().mockResolvedValue({ ok: true, data: null }),
        verifyAll: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      },
      aria: {
        send: vi.fn().mockResolvedValue({ ok: true, data: { text: 'ok' } }),
        history: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        clear: vi.fn().mockResolvedValue({ ok: true }),
        models: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        approve: vi.fn(),
        patchDecision: vi.fn(),
        toolEffectResult: vi.fn(),
        onToolEvent: () => () => {},
        onUiEffect: () => () => {},
        sessions: {
          list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
          create: vi.fn().mockImplementation(() => {
            sessionSequence += 1
            return Promise.resolve({ ok: true, data: { id: `session-${sessionSequence}`, title: null, project_id: null, created_at: 1, updated_at: 1, archived: 0 } })
          }),
          rename: vi.fn().mockResolvedValue({ ok: true }),
          archive: vi.fn().mockResolvedValue({ ok: true }),
          delete: vi.fn().mockResolvedValue({ ok: true }),
        },
      },
      memory: {
        approve: vi.fn().mockResolvedValue({ ok: true }),
        reject: vi.fn().mockResolvedValue({ ok: true }),
      },
    },
  })
}

describe('DAEMON Lite Workbench', () => {
  beforeEach(() => {
    sessionStorage.clear()
    sessionSequence = 0
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    installBridge()
    useAriaStore.setState({ turns: [], isLoading: false, sessionId: 'global', sessions: [], availableModels: [] })
    useLiteWorkbenchStore.setState({
      projects: [],
      activeProject: null,
      tree: [],
      openFiles: [],
      activeFilePath: null,
      terminalIds: [],
      activeTerminalId: null,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('restores a project, opens a file, and exposes guarded accessible workbench surfaces', async () => {
    render(<LiteApp />)

    expect(await screen.findByRole('button', { name: PROJECT.name })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'DAEMON conversation' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))
    expect(screen.getByText('GUARDED WORKFLOWS: LOCALNET / DEVNET')).toBeTruthy()
    expect(screen.getByText('Workflow actions never deploy to mainnet. Commands typed in the terminal remain under your control.')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Terminal' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Code' }))
    await waitFor(() => expect(readDir).toHaveBeenCalledWith(PROJECT.path, 4))
    const readme = await screen.findByRole('treeitem', { name: /README.md/ })
    readme.focus()
    fireEvent.keyDown(readme, { key: 'ArrowDown' })
    expect(screen.getByRole('treeitem', { name: /package.json/ })).toHaveFocus()
    fireEvent.click(readme)
    await waitFor(() => expect(readFile).toHaveBeenCalledWith(README_PATH))
    expect(await screen.findByRole('region', { name: 'Code editor' })).toBeTruthy()
    expect(screen.getByLabelText('Monaco editor')).toHaveValue('# Solana monitor\n')
  })

  it('keeps one conversation shell and creates a project-scoped terminal', async () => {
    render(<LiteApp />)
    expect(await screen.findByRole('button', { name: PROJECT.name })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(await screen.findByLabelText('Message DAEMON')).toBeTruthy()
    expect(await screen.findByRole('region', { name: 'DAEMON conversation' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await waitFor(() => expect(terminalCreate).toHaveBeenCalledWith({
      cwd: PROJECT.path,
      startupCommand: undefined,
      userInitiated: true,
    }))
    expect(await screen.findByRole('button', { name: /pwsh 1/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
    expect(screen.queryByRole('region', { name: 'Terminal' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))
    expect(await screen.findByRole('button', { name: /pwsh 1/ })).toBeTruthy()
  })

  it('opens Meme Tech Studio and renders evidence without granting write authority', async () => {
    render(<LiteApp />)
    expect(await screen.findByRole('button', { name: PROJECT.name })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Meme Tech' }))

    expect(await screen.findByRole('region', { name: 'Meme Tech workspace' })).toBeTruthy()
    expect(await screen.findByText('Permissionless Market Indexer')).toBeTruthy()
    expect(screen.getByText('Oracle and keeper runtime detected')).toBeTruthy()
    expect(screen.getByText('Attention is not trust.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /launch|buy|sell|deploy/i })).toBeNull()
  })

  it('keeps edits dirty when an older save finishes after newer typing', () => {
    useLiteWorkbenchStore.getState().openFile({ path: README_PATH, name: 'README.md', content: 'first', savedContent: 'base' })
    useLiteWorkbenchStore.getState().updateFile(README_PATH, 'newer')
    useLiteWorkbenchStore.getState().markSaved(README_PATH, 'first')

    const file = useLiteWorkbenchStore.getState().openFiles.find((item) => item.path === README_PATH)
    expect(file).toMatchObject({ content: 'newer', savedContent: 'first' })
  })

  it('restores explorer tab focus when the active project changes', async () => {
    readDir.mockImplementation((path: string) => Promise.resolve({
      ok: true,
      data: [{
        name: path === SECOND_PROJECT.path ? 'Anchor.toml' : 'README.md',
        path: `${path}\\${path === SECOND_PROJECT.path ? 'Anchor.toml' : 'README.md'}`,
        isDirectory: false,
      }],
    }))

    const { rerender } = render(<LiteExplorer project={PROJECT} onOpenProject={vi.fn()} />)
    const firstEntry = await screen.findByRole('treeitem', { name: /README.md/ })
    firstEntry.focus()

    rerender(<LiteExplorer project={SECOND_PROJECT} onOpenProject={vi.fn()} />)
    const nextEntry = await screen.findByRole('treeitem', { name: /Anchor.toml/ })
    expect(nextEntry).toHaveAttribute('tabindex', '0')
  })
})
