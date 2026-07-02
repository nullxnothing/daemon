// @vitest-environment happy-dom

import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorWelcome } from '../../src/panels/Editor/EditorWelcome'
import { useUIStore } from '../../src/store/ui'
import type { Project } from '../../electron/shared/types'

function makeProject(over: Partial<Project>): Project {
  return {
    id: 'p1',
    name: 'project-one',
    path: 'C:/Users/offic/Projects/project-one',
    git_remote: null,
    default_agent_id: null,
    status: 'idle',
    session_summary: null,
    infra: '{}',
    aliases: '[]',
    wallet_id: null,
    created_at: 1,
    last_active: 2,
    pinned: 0,
    branch: 'main',
    ...over,
  }
}

const LONG_BRANCH = 'fix/chart-stability-and-redis-logout'

beforeEach(() => {
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      git: { branch: vi.fn().mockResolvedValue({ ok: true, data: 'main' }) },
    },
  })
})

afterEach(() => {
  cleanup()
  useUIStore.setState({ projects: [], activeProjectId: null, activeProjectPath: null })
})

describe('EditorWelcome recent-project branch truncation', () => {
  it('renders the branch name inside the ellipsis-bearing inner span (not the inline-flex parent)', async () => {
    // Regression for UI_BUGS B1: text-overflow:ellipsis does not apply to the
    // inline-flex `.editor-empty-recent-branch` parent, so a long branch name
    // must be wrapped in `.editor-empty-recent-branch-name` to truncate cleanly.
    useUIStore.setState({
      projects: [makeProject({ id: 'long', name: 'respawn-trade', branch: LONG_BRANCH })],
      activeProjectId: 'long',
      activeProjectPath: 'C:/Users/offic/Projects/respawn-trade',
    })

    render(<EditorWelcome activeProjectId="long" />)

    const inner = await screen.findByText(LONG_BRANCH)
    expect(inner).toHaveClass('editor-empty-recent-branch-name')

    // The parent wrapper exists and exposes the full branch name on hover.
    const parent = inner.closest('.editor-empty-recent-branch')
    expect(parent).not.toBeNull()
    expect(parent).toHaveAttribute('title', LONG_BRANCH)
  })

  it('omits the branch element entirely when a project has no branch', () => {
    useUIStore.setState({
      projects: [makeProject({ id: 'nobranch', name: 'no-branch', branch: null })],
      activeProjectId: 'nobranch',
      activeProjectPath: 'C:/Users/offic/Projects/no-branch',
    })

    render(<EditorWelcome activeProjectId="nobranch" />)

    expect(document.querySelector('.editor-empty-recent-branch')).toBeNull()
  })
})
