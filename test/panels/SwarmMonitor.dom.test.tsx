// @vitest-environment happy-dom

import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SwarmMonitor } from '../../src/panels/AgentWorkbench/SwarmMonitor'

type SwarmListResult = { ok: true; data: unknown[] } | { ok: false; error: string }

function installBridge(listImpl: () => Promise<SwarmListResult>) {
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      swarm: {
        list: vi.fn(listImpl),
        runDetail: vi.fn().mockResolvedValue({ ok: true, data: { run: {}, lanes: [] } }),
        cancel: vi.fn().mockResolvedValue({ ok: true }),
        onUpdate: vi.fn(() => () => {}),
      },
    },
  })
}

afterEach(() => cleanup())

describe('SwarmMonitor loading / error / empty states (UI_BUGS residual P1)', () => {
  it('shows a distinct loading state before the first list resolves', async () => {
    let resolveList: (v: SwarmListResult) => void = () => {}
    installBridge(() => new Promise((r) => { resolveList = r }))
    render(<SwarmMonitor />)

    // Loading must be shown, NOT the empty "No swarm runs yet" copy.
    expect(screen.getByText(/loading swarm runs/i)).toBeTruthy()
    expect(screen.queryByText(/no swarm runs yet/i)).toBeNull()

    resolveList({ ok: true, data: [] })
    await waitFor(() => expect(screen.getByText(/no swarm runs yet/i)).toBeTruthy())
  })

  it('shows an error state with a retry button when list fails (not the empty state)', async () => {
    installBridge(() => Promise.resolve({ ok: false, error: 'DB locked' }))
    render(<SwarmMonitor />)

    await waitFor(() => expect(screen.getByText(/couldn.t load swarm runs/i)).toBeTruthy())
    expect(screen.getByText('DB locked')).toBeTruthy()
    // A failed load must NOT look like "no runs".
    expect(screen.queryByText(/no swarm runs yet/i)).toBeNull()
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  it('retry re-fetches and recovers to the empty state on success', async () => {
    let call = 0
    installBridge(() => {
      call += 1
      return Promise.resolve(call === 1 ? { ok: false, error: 'transient' } : { ok: true, data: [] })
    })
    render(<SwarmMonitor />)

    await waitFor(() => expect(screen.getByText(/couldn.t load swarm runs/i)).toBeTruthy())
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.getByText(/no swarm runs yet/i)).toBeTruthy())
  })

  it('renders the empty state only after a successful empty list', async () => {
    installBridge(() => Promise.resolve({ ok: true, data: [] }))
    render(<SwarmMonitor />)
    await waitFor(() => expect(screen.getByText(/no swarm runs yet/i)).toBeTruthy())
  })
})
