import { beforeEach, describe, expect, it } from 'vitest'
import { useUIStore } from '../src/store/ui'
import { useWorkflowShellStore } from '../src/store/workflowShell'

function resetStore() {
  useUIStore.setState({
    activeProjectId: null,
    activeProjectPath: null,
    projects: [],
    openFiles: [],
    activeFilePathByProject: {},
    terminals: [],
    activeTerminalIdByProject: {},
    mcpDirty: false,
    mcpVersion: 0,
    centerMode: 'canvas',
    browserTabOpen: false,
    browserTabActive: false,
    workspaceToolTabs: [],
    activeWorkspaceToolId: null,
    dashboardTabOpen: false,
    dashboardTabActive: false,
    grindPageCount: 1,
    activeGrindPage: 0,
    grindPages: {},
  })

  useWorkflowShellStore.setState({
    drawerTool: null,
    drawerOpen: false,
    drawerFullscreen: false,
    launchWizardOpen: false,
  })
}

describe('useUIStore — initial state', () => {
  beforeEach(resetStore)

  it('has correct defaults', () => {
    const state = useUIStore.getState()
    expect(state.activeProjectId).toBeNull()
    expect(state.activeProjectPath).toBeNull()
    expect(state.projects).toEqual([])
    expect(state.openFiles).toEqual([])
    expect(state.terminals).toEqual([])
    expect(state.mcpDirty).toBe(false)
    expect(state.centerMode).toBe('canvas')
    expect(useWorkflowShellStore.getState().drawerTool).toBeNull()
  })
})

describe('useUIStore — setActiveProject', () => {
  beforeEach(resetStore)

  it('sets project id and path', () => {
    useUIStore.getState().setActiveProject('proj-1', '/projects/my-app')
    const state = useUIStore.getState()
    expect(state.activeProjectId).toBe('proj-1')
    expect(state.activeProjectPath).toBe('/projects/my-app')
  })

  it('clears project when set to null', () => {
    useUIStore.getState().setActiveProject('proj-1', '/projects/my-app')
    useUIStore.getState().setActiveProject(null, null)
    const state = useUIStore.getState()
    expect(state.activeProjectId).toBeNull()
    expect(state.activeProjectPath).toBeNull()
  })
})

describe('useUIStore — openFile / closeFile / setActiveFile', () => {
  beforeEach(resetStore)

  it('opens a new file and sets it as active', () => {
    useUIStore.getState().openFile({ projectId: 'p1', path: '/a.ts', name: 'a.ts', content: 'hello' })
    const state = useUIStore.getState()
    expect(state.openFiles).toHaveLength(1)
    expect(state.openFiles[0].path).toBe('/a.ts')
    expect(state.openFiles[0].isDirty).toBe(false)
    expect(state.activeFilePathByProject['p1']).toBe('/a.ts')
  })

  it('does not duplicate when opening the same file twice', () => {
    const store = useUIStore.getState()
    store.openFile({ projectId: 'p1', path: '/a.ts', name: 'a.ts', content: 'hello' })
    store.openFile({ projectId: 'p1', path: '/a.ts', name: 'a.ts', content: 'hello' })
    expect(useUIStore.getState().openFiles).toHaveLength(1)
  })

  it('switches active file back after closing active tab', () => {
    const store = useUIStore.getState()
    store.openFile({ projectId: 'p1', path: '/a.ts', name: 'a.ts', content: 'a' })
    store.openFile({ projectId: 'p1', path: '/b.ts', name: 'b.ts', content: 'b' })
    expect(useUIStore.getState().activeFilePathByProject['p1']).toBe('/b.ts')

    useUIStore.getState().closeFile('p1', '/b.ts')
    expect(useUIStore.getState().activeFilePathByProject['p1']).toBe('/a.ts')
  })

  it('sets activeFilePath to null when all files are closed', () => {
    useUIStore.getState().openFile({ projectId: 'p1', path: '/a.ts', name: 'a.ts', content: 'a' })
    useUIStore.getState().closeFile('p1', '/a.ts')
    expect(useUIStore.getState().activeFilePathByProject['p1']).toBeNull()
  })

  it('setActiveFile switches which file is active', () => {
    const store = useUIStore.getState()
    store.openFile({ projectId: 'p1', path: '/a.ts', name: 'a.ts', content: 'a' })
    store.openFile({ projectId: 'p1', path: '/b.ts', name: 'b.ts', content: 'b' })
    store.setActiveFile('p1', '/a.ts')
    expect(useUIStore.getState().activeFilePathByProject['p1']).toBe('/a.ts')
  })

  it('marks file dirty on content update', () => {
    useUIStore.getState().openFile({ projectId: 'p1', path: '/a.ts', name: 'a.ts', content: 'a' })
    useUIStore.getState().updateFileContent('/a.ts', 'modified')
    const file = useUIStore.getState().openFiles[0]
    expect(file.content).toBe('modified')
    expect(file.isDirty).toBe(true)
  })

  it('markFileSaved clears dirty flag', () => {
    useUIStore.getState().openFile({ projectId: 'p1', path: '/a.ts', name: 'a.ts', content: 'a' })
    useUIStore.getState().updateFileContent('/a.ts', 'modified')
    useUIStore.getState().markFileSaved('/a.ts')
    expect(useUIStore.getState().openFiles[0].isDirty).toBe(false)
  })

  it('openFile resets centerMode to canvas and closes drawer', () => {
    useUIStore.getState().setCenterMode('grind')
    useWorkflowShellStore.getState().setDrawerTool('git')
    useUIStore.getState().openFile({ projectId: 'p1', path: '/a.ts', name: 'a.ts', content: 'a' })
    const state = useUIStore.getState()
    const shellState = useWorkflowShellStore.getState()
    expect(state.centerMode).toBe('canvas')
    expect(shellState.drawerTool).toBeNull()
    expect(shellState.drawerOpen).toBe(false)
  })
})

describe('useUIStore — addTerminal / removeTerminal', () => {
  beforeEach(resetStore)

  it('adds a terminal and sets it as active', () => {
    useUIStore.getState().addTerminal('p1', 'term-1', 'Shell')
    const state = useUIStore.getState()
    expect(state.terminals).toHaveLength(1)
    expect(state.terminals[0].label).toBe('Shell')
    expect(state.activeTerminalIdByProject['p1']).toBe('term-1')
  })

  it('sets agent id when provided', () => {
    useUIStore.getState().addTerminal('p1', 'term-1', 'Agent', 'agent-42')
    expect(useUIStore.getState().terminals[0].agentId).toBe('agent-42')
  })

  it('defaults agentId to null and label to Terminal', () => {
    useUIStore.getState().addTerminal('p1', 'term-1')
    const t = useUIStore.getState().terminals[0]
    expect(t.agentId).toBeNull()
    expect(t.label).toBe('Terminal')
  })

  it('falls back to previous terminal on remove', () => {
    const store = useUIStore.getState()
    store.addTerminal('p1', 'term-1', 'T1')
    store.addTerminal('p1', 'term-2', 'T2')
    expect(useUIStore.getState().activeTerminalIdByProject['p1']).toBe('term-2')

    useUIStore.getState().removeTerminal('p1', 'term-2')
    expect(useUIStore.getState().activeTerminalIdByProject['p1']).toBe('term-1')
  })

  it('sets active terminal to null when all removed', () => {
    useUIStore.getState().addTerminal('p1', 'term-1')
    useUIStore.getState().removeTerminal('p1', 'term-1')
    expect(useUIStore.getState().activeTerminalIdByProject['p1']).toBeNull()
  })
})

describe('useUIStore / useWorkflowShellStore — drawer and center mode', () => {
  beforeEach(resetStore)

  it('changes drawer tool and opens drawer', () => {
    useWorkflowShellStore.getState().setDrawerTool('git')
    const state = useWorkflowShellStore.getState()
    expect(state.drawerTool).toBe('git')
    expect(state.drawerOpen).toBe(true)
  })

  it('clears drawer tool when set to null', () => {
    useWorkflowShellStore.getState().setDrawerTool('git')
    useWorkflowShellStore.getState().setDrawerTool(null)
    const state = useWorkflowShellStore.getState()
    expect(state.drawerTool).toBeNull()
    expect(state.drawerOpen).toBe(false)
  })

  it('changes center mode', () => {
    useUIStore.getState().setCenterMode('grind')
    expect(useUIStore.getState().centerMode).toBe('grind')
    useUIStore.getState().setCenterMode('canvas')
    expect(useUIStore.getState().centerMode).toBe('canvas')
  })

  it('activating browser closes the drawer and deactivates dashboard', () => {
    useWorkflowShellStore.setState({ drawerTool: 'hackathon', drawerOpen: true, drawerFullscreen: true })
    useUIStore.setState({ dashboardTabOpen: true, dashboardTabActive: true })

    useUIStore.getState().openBrowserTab()

    const state = useUIStore.getState()
    const shellState = useWorkflowShellStore.getState()
    expect(state.browserTabOpen).toBe(true)
    expect(state.browserTabActive).toBe(true)
    expect(state.dashboardTabActive).toBe(false)
    expect(shellState.drawerTool).toBeNull()
    expect(shellState.drawerOpen).toBe(false)
    expect(shellState.drawerFullscreen).toBe(false)
  })

  it('activating dashboard closes the drawer and deactivates browser', () => {
    useWorkflowShellStore.setState({ drawerTool: 'hackathon', drawerOpen: true, drawerFullscreen: true })
    useUIStore.setState({ browserTabOpen: true, browserTabActive: true })

    useUIStore.getState().openDashboardTab()

    const state = useUIStore.getState()
    const shellState = useWorkflowShellStore.getState()
    expect(state.dashboardTabOpen).toBe(true)
    expect(state.dashboardTabActive).toBe(true)
    expect(state.browserTabActive).toBe(false)
    expect(shellState.drawerTool).toBeNull()
    expect(shellState.drawerOpen).toBe(false)
    expect(shellState.drawerFullscreen).toBe(false)
  })
})

describe('useUIStore — MCP dirty state', () => {
  beforeEach(resetStore)

  it('toggles mcpDirty flag', () => {
    useUIStore.getState().setMcpDirty(true)
    expect(useUIStore.getState().mcpDirty).toBe(true)
    useUIStore.getState().setMcpDirty(false)
    expect(useUIStore.getState().mcpDirty).toBe(false)
  })

  it('bumps mcp version', () => {
    const v0 = useUIStore.getState().mcpVersion
    useUIStore.getState().bumpMcpVersion()
    expect(useUIStore.getState().mcpVersion).toBe(v0 + 1)
  })
})

// showOnboarding was removed from useUIStore — onboarding state lives in useOnboardingStore

describe('useUIStore — grind pages', () => {
  beforeEach(resetStore)

  it('initializes grind pages for a project', () => {
    useUIStore.getState().initGrindPages('p1')
    const pages = useUIStore.getState().grindPages['p1']
    expect(pages).toHaveLength(1)
    expect(pages[0]).toHaveLength(4)
    expect(pages[0][0].label).toBe('Agent 1')
  })

  it('does not re-initialize existing grind pages', () => {
    useUIStore.getState().initGrindPages('p1')
    useUIStore.getState().setGrindCell('p1', 0, 0, { label: 'Custom' })
    useUIStore.getState().initGrindPages('p1')
    expect(useUIStore.getState().grindPages['p1'][0][0].label).toBe('Custom')
  })

  it('adds a grind page', () => {
    expect(useUIStore.getState().grindPageCount).toBe(1)
    useUIStore.getState().addGrindPage()
    const state = useUIStore.getState()
    expect(state.grindPageCount).toBe(2)
    expect(state.activeGrindPage).toBe(1)
  })

  it('removes a grind page and adjusts active page', () => {
    useUIStore.getState().addGrindPage()
    useUIStore.getState().setActiveGrindPage(1)
    useUIStore.getState().removeGrindPage(1)
    const state = useUIStore.getState()
    expect(state.grindPageCount).toBe(1)
    expect(state.activeGrindPage).toBe(0)
  })

  it('does not remove the last grind page', () => {
    useUIStore.getState().removeGrindPage(0)
    expect(useUIStore.getState().grindPageCount).toBe(1)
  })
})
