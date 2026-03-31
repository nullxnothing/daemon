import { beforeEach, describe, expect, it } from 'vitest'
import { useUIStore } from '../src/store/ui'

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      activePanel: 'claude',
      activeProjectId: null,
      activeProjectPath: null,
      openFiles: [],
      activeFilePathByProject: {},
      terminals: [],
      activeTerminalIdByProject: {},
      mcpDirty: false,
    })
  })

  it('keeps terminal state scoped to each project', () => {
    const state = useUIStore.getState()

    state.addTerminal('project-a', 'term-a1', 'A1')
    state.addTerminal('project-b', 'term-b1', 'B1')
    state.addTerminal('project-a', 'term-a2', 'A2')

    const current = useUIStore.getState()
    expect(current.terminals.filter((tab) => tab.projectId === 'project-a')).toHaveLength(2)
    expect(current.terminals.filter((tab) => tab.projectId === 'project-b')).toHaveLength(1)
    expect(current.activeTerminalIdByProject['project-a']).toBe('term-a2')
    expect(current.activeTerminalIdByProject['project-b']).toBe('term-b1')

    current.removeTerminal('project-a', 'term-a2')

    const afterRemove = useUIStore.getState()
    expect(afterRemove.activeTerminalIdByProject['project-a']).toBe('term-a1')
    expect(afterRemove.activeTerminalIdByProject['project-b']).toBe('term-b1')
  })

  it('drops only one project state when removing a project', () => {
    const state = useUIStore.getState()

    state.openFile({ projectId: 'project-a', path: '/a/index.ts', name: 'index.ts', content: 'a' })
    state.openFile({ projectId: 'project-b', path: '/b/index.ts', name: 'index.ts', content: 'b' })
    state.addTerminal('project-a', 'term-a1', 'A1')
    state.addTerminal('project-b', 'term-b1', 'B1')

    state.removeProjectState('project-a')

    const current = useUIStore.getState()
    expect(current.openFiles.map((file) => file.projectId)).toEqual(['project-b'])
    expect(current.terminals.map((tab) => tab.projectId)).toEqual(['project-b'])
    expect(current.activeFilePathByProject['project-a']).toBeUndefined()
    expect(current.activeTerminalIdByProject['project-a']).toBeUndefined()
    expect(current.activeFilePathByProject['project-b']).toBe('/b/index.ts')
    expect(current.activeTerminalIdByProject['project-b']).toBe('term-b1')
  })
})
