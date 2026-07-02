// @vitest-environment happy-dom

import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BridgeApprovalHost } from '../../src/components/BridgeApprovalHost'
import { useBridgeStore } from '../../src/store/bridge'
import type { BridgeToolEvent } from '../../electron/shared/types'

let emitBridgeEvent: (event: BridgeToolEvent) => void = () => {}
const approveSpy = vi.fn()

beforeEach(() => {
  approveSpy.mockClear()
  ;(window as unknown as { daemon: unknown }).daemon = {
    bridge: {
      approve: approveSpy,
      onEvent: (handler: (event: BridgeToolEvent) => void) => {
        emitBridgeEvent = handler
        return () => { emitBridgeEvent = () => {} }
      },
    },
  }
  useBridgeStore.setState({ approvals: [], activity: [] })
})

function pushApproval(partial: Partial<Extract<BridgeToolEvent, { kind: 'approval-request' }>> = {}) {
  act(() => {
    emitBridgeEvent({
      kind: 'approval-request',
      callId: 'call-1',
      name: 'remember_fact',
      risk: 'write',
      summary: 'remember_fact: Use pnpm',
      input: { title: 'Use pnpm' },
      source: 'bridge',
      ...partial,
    })
  })
}

describe('BridgeApprovalHost', () => {
  it('renders nothing until an external approval arrives', () => {
    const { container } = render(<BridgeApprovalHost />)
    expect(container.firstChild).toBeNull()

    pushApproval()
    expect(screen.getByText('External agent request')).toBeTruthy()
    expect(screen.getByText('remember_fact: Use pnpm')).toBeTruthy()
  })

  it('routes approve to daemon.bridge.approve and drops the card', async () => {
    render(<BridgeApprovalHost />)
    pushApproval()

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(approveSpy).toHaveBeenCalledWith('call-1', true)
    expect(screen.queryByText('External agent request')).toBeNull()
  })

  it('requires typing the tool name to confirm a sensitive tool', async () => {
    // The confirm target is the tool name (deterministic), not the first input
    // value (which was argument-order-dependent and could be a number/empty).
    render(<BridgeApprovalHost />)
    pushApproval({ callId: 'call-2', name: 'generate_wallet', risk: 'sensitive', summary: 'generate_wallet: hot', input: { name: 'hot' } })

    const approveBtn = screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement
    expect(approveBtn.disabled).toBe(true)

    // Typing the old first-arg value must NOT enable approval anymore.
    await userEvent.type(screen.getByPlaceholderText('generate_wallet'), 'hot')
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)

    await userEvent.clear(screen.getByPlaceholderText('generate_wallet'))
    await userEvent.type(screen.getByPlaceholderText('generate_wallet'), 'generate_wallet')
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(approveSpy).toHaveBeenCalledWith('call-2', true)
  })

  it('removes the card when the approval expires server-side', () => {
    render(<BridgeApprovalHost />)
    pushApproval()
    expect(screen.getByText('External agent request')).toBeTruthy()

    act(() => emitBridgeEvent({ kind: 'approval-expired', callId: 'call-1' }))
    expect(screen.queryByText('External agent request')).toBeNull()
  })
})
