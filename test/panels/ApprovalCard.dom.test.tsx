// @vitest-environment happy-dom

import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApprovalCard } from '../../src/panels/AgentWorkbench/ApprovalCard'
import type { AriaApproval } from '../../src/store/aria'

function makeApproval(over: Partial<AriaApproval>): AriaApproval {
  return { callId: 'c1', name: 'sol_transfer', risk: 'sensitive', summary: 's', input: {}, ...over }
}

afterEach(() => cleanup())

describe('ApprovalCard deterministic confirm target (UI_BUGS residual P3)', () => {
  it('uses the tool name as the confirm target regardless of input argument order', () => {
    const onDecide = vi.fn()
    // First input value is a benign flag — the old code would make the target "false".
    render(<ApprovalCard approval={makeApproval({ name: 'sol_transfer', input: { dryRun: false, wallet: 'treasury' } })} onDecide={onDecide} />)

    const input = screen.getByPlaceholderText('sol_transfer') as HTMLInputElement
    const approve = screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement
    expect(approve.disabled).toBe(true)

    // Typing the old first-arg-derived target ("false") must NOT enable approval.
    fireEvent.change(input, { target: { value: 'false' } })
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)

    // Typing the tool name enables it.
    fireEvent.change(input, { target: { value: 'sol_transfer' } })
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onDecide).toHaveBeenCalledWith('c1', true)
  })

  it('never collapses to a numeric / empty / whitespace target', () => {
    // input whose first value is 0 — old code → target "0" (reflexive to type).
    render(<ApprovalCard approval={makeApproval({ name: 'hl_close_position', input: { amount: 0 } })} onDecide={vi.fn()} />)
    const input = screen.getByPlaceholderText('hl_close_position') as HTMLInputElement

    fireEvent.change(input, { target: { value: '0' } })
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'hl_close_position' } })
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('falls back to CONFIRM when the tool name is somehow empty', () => {
    render(<ApprovalCard approval={makeApproval({ name: '   ', input: { x: 1 } })} onDecide={vi.fn()} />)
    const input = screen.getByPlaceholderText('CONFIRM') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'CONFIRM' } })
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('does not gate non-sensitive (write) approvals with a typed confirm', () => {
    render(<ApprovalCard approval={makeApproval({ risk: 'write', name: 'write_file', input: { path: 'a' } })} onDecide={vi.fn()} />)
    // No confirm input for write-tier; Approve is enabled immediately.
    expect(screen.queryByPlaceholderText(/write_file|CONFIRM/)).toBeNull()
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
