import { create } from 'zustand'
import type { BridgeToolEvent } from '../../electron/shared/types'
import { daemon } from '../lib/daemonBridge'
import type { AriaApproval } from './aria'

const MAX_ACTIVITY = 50

interface BridgeState {
  /** External-agent approvals awaiting a decision, oldest first. */
  approvals: AriaApproval[]
  /** Recent completed bridge calls, newest first (activity feed for Settings). */
  activity: Array<Extract<BridgeToolEvent, { kind: 'call' }>>
  approve: (callId: string, approved: boolean) => void
  subscribe: () => () => void
}

export const useBridgeStore = create<BridgeState>((set) => ({
  approvals: [],
  activity: [],

  approve: (callId, approved) => {
    daemon.bridge.approve(callId, approved)
    set((s) => ({ approvals: s.approvals.filter((a) => a.callId !== callId) }))
  },

  subscribe: () => {
    return daemon.bridge.onEvent((event) => {
      switch (event.kind) {
        case 'approval-request':
          set((s) => ({
            approvals: [...s.approvals, {
              callId: event.callId, name: event.name, risk: event.risk,
              summary: event.summary, input: event.input,
            }],
          }))
          break
        case 'approval-expired':
          set((s) => ({ approvals: s.approvals.filter((a) => a.callId !== event.callId) }))
          break
        case 'call':
          set((s) => ({ activity: [event, ...s.activity].slice(0, MAX_ACTIVITY) }))
          break
      }
    })
  },
}))
