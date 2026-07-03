// @vitest-environment happy-dom

import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateForm } from '../../src/panels/AgentStation/AgentStation'

let createImpl: () => Promise<unknown>

function installBridge() {
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      agentStation: { create: vi.fn(() => createImpl()) },
    },
  })
}

beforeEach(() => installBridge())
afterEach(() => cleanup())

function fillValidForm() {
  // Name is required; plugins must be non-empty (the default template pre-selects some).
  const nameInput = screen.getByPlaceholderText(/My DeFi Trader/i)
  fireEvent.change(nameInput, { target: { value: 'QA Agent' } })
  // Ensure at least one plugin is active (click 'token' on if not already).
  const tokenBtn = screen.getByRole('button', { name: 'token' })
  if (!tokenBtn.className.includes('Active')) fireEvent.click(tokenBtn)
}

describe('AgentStation CreateForm busy-state (UI_BUGS residual P3)', () => {
  it('re-enables the Create button when the create IPC throws (no wedge on "Creating...")', async () => {
    createImpl = () => Promise.reject(new Error('IPC channel closed'))
    render(<CreateForm onCreated={() => {}} onCancel={() => {}} />)
    fillValidForm()

    const submit = screen.getByRole('button', { name: /Create Agent/i })
    fireEvent.click(submit)

    // After the rejected promise settles, the button must be enabled again and show
    // the error — NOT stuck disabled on "Creating...".
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Create Agent/i })
      expect(btn.hasAttribute('disabled')).toBe(false)
    })
    expect(screen.getByText(/IPC channel closed/i)).toBeTruthy()
  })

  it('re-enables the Create button when the create IPC returns ok:false', async () => {
    createImpl = () => Promise.resolve({ ok: false, error: 'name taken' })
    render(<CreateForm onCreated={() => {}} onCancel={() => {}} />)
    fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: /Create Agent/i }))
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Create Agent/i })
      expect(btn.hasAttribute('disabled')).toBe(false)
    })
    expect(screen.getByText(/name taken/i)).toBeTruthy()
  })
})
