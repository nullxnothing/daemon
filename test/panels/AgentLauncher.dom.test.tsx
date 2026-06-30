// @vitest-environment happy-dom

import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Auto-approve the delete confirmation so the real loadAgents() shrink path runs.
vi.mock('../../src/store/confirm', () => ({ confirm: vi.fn().mockResolvedValue(true) }))

import { AgentLauncher } from '../../src/panels/AgentLauncher/AgentLauncher'
import { useUIStore } from '../../src/store/ui'

type AgentLike = {
  id: string; name: string; system_prompt: string; model: string; mcps: string
  shortcut: string | null; created_at: number; source?: string | null
}

function makeAgent(id: string, name: string): AgentLike {
  return { id, name, system_prompt: '', model: 'claude-haiku-4-5-20251001', mcps: '[]', shortcut: null, created_at: 1, source: 'daemon' }
}

let agentList: AgentLike[] = []
let spawnAgent: ReturnType<typeof vi.fn>
let deleteAgent: ReturnType<typeof vi.fn>

function installBridge() {
  spawnAgent = vi.fn().mockResolvedValue({ ok: true, data: { id: 'term-1', agentName: 'X', agentId: 'a' } })
  deleteAgent = vi.fn((id: string) => {
    agentList = agentList.filter((a) => a.id !== id)
    return Promise.resolve({ ok: true })
  })
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      agents: {
        list: vi.fn(() => Promise.resolve({ ok: true, data: agentList })),
        claudeList: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        delete: deleteAgent,
        create: vi.fn().mockResolvedValue({ ok: true }),
      },
      terminal: { spawnAgent },
    },
  })
}

beforeEach(() => {
  installBridge()
  useUIStore.setState({ activeProjectId: 'p1', activeProjectPath: 'C:/x' })
})
afterEach(() => cleanup())

describe('AgentLauncher keyboard selection clamping (UI_BUGS residual P2)', () => {
  it('clamps selectedIdx when the list shrinks so Enter never launches a stale/undefined agent', async () => {
    agentList = [makeAgent('a1', 'Alpha'), makeAgent('a2', 'Beta'), makeAgent('a3', 'Gamma')]
    render(<AgentLauncher isOpen onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Gamma')).toBeTruthy())

    const dialog = screen.getByRole('dialog')
    // Arrow down to the last item (index 2 → Gamma).
    fireEvent.keyDown(dialog, { key: 'ArrowDown' })
    fireEvent.keyDown(dialog, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(document.querySelector('.agent-launcher-item.selected')?.textContent).toContain('Gamma'),
    )

    // Delete Gamma (the selected row) — this runs the real loadAgents() refresh,
    // shrinking the list out from under selectedIdx (was 2, now max valid is 1).
    fireEvent.click(screen.getByRole('button', { name: /Delete Gamma/i }))
    await waitFor(() => expect(screen.queryByText('Gamma')).toBeNull())

    // The clamp effect must have pulled selectedIdx back into range.
    const selected = document.querySelector('.agent-launcher-item.selected')
    expect(selected).not.toBeNull()
    expect(['Alpha', 'Beta'].some((n) => selected?.textContent?.includes(n))).toBe(true)

    // Enter now spawns a real, in-range agent — never undefined / off-by-end.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' })
    await waitFor(() => expect(spawnAgent).toHaveBeenCalled())
    expect(['a1', 'a2']).toContain(spawnAgent.mock.calls[0][0].agentId)
  })
})
