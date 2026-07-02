// @vitest-environment happy-dom

import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentEconomyPanel } from '../../src/panels/AgentEconomy/AgentEconomyPanel'

type ListResult = { ok: true; data: unknown[] } | { ok: false; error: string }

function installBridge(profiles: () => Promise<ListResult>) {
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      agentEconomy: {
        listProfiles: vi.fn(profiles),
        listReceipts: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        getProfile: vi.fn().mockResolvedValue({ ok: false, error: 'n/a' }),
        registerDevnetAgent: vi.fn().mockResolvedValue({ ok: false, error: 'n/a' }),
      },
      idle: {
        listResources: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
    },
  })
}

afterEach(() => cleanup())

describe('AgentEconomyPanel', () => {
  it('shows an error + retry when the profiles load fails, not a fake empty state', async () => {
    installBridge(() => Promise.resolve({ ok: false, error: 'boom' }))
    render(<AgentEconomyPanel />)

    await waitFor(() => expect(screen.getByText(/could not load the agent economy/i)).toBeTruthy())
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
    // A failed load must NOT masquerade as "No profiles".
    expect(screen.queryByText(/^No profiles$/)).toBeNull()
  })

  it('renders the empty state only on a genuine empty result', async () => {
    installBridge(() => Promise.resolve({ ok: true, data: [] }))
    render(<AgentEconomyPanel />)

    await waitFor(() => expect(screen.getByText(/^No profiles$/)).toBeTruthy())
    expect(screen.queryByText(/could not load the agent economy/i)).toBeNull()
  })

  it('does not pre-satisfy the registry acknowledgement gate', async () => {
    installBridge(() => Promise.resolve({ ok: true, data: [] }))
    render(<AgentEconomyPanel />)
    await waitFor(() => expect(screen.getByText(/^No profiles$/)).toBeTruthy())

    // Switch to the Devnet Registry tab.
    await userEvent.click(screen.getByRole('button', { name: /devnet registry/i }))

    // The acknowledgement input must start EMPTY (placeholder shows the required phrase),
    // and Register must be disabled until it is typed exactly.
    const ackInput = screen.getByPlaceholderText(/type MINT REGISTERED AGENT to confirm/i) as HTMLInputElement
    expect(ackInput.value).toBe('')
    const register = screen.getByRole('button', { name: /^Register$/ }) as HTMLButtonElement
    expect(register.disabled).toBe(true)
  })
})
