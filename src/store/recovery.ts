import { create } from 'zustand'
import type { RecoveryProgressEvent, RecoveryWalletInfo } from '../../electron/shared/types'

export interface RecoveryLogEntry {
  timestamp: number
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
}

// Node states for canvas renderer
export const NODE_IDLE = 0
export const NODE_SCANNING = 1
export const NODE_HAS_FUNDS = 2
export const NODE_PROCESSING = 3
export const NODE_COMPLETE = 4
export const NODE_FAILED = 5

interface RecoveryState {
  status: 'idle' | 'scanning' | 'executing' | 'complete' | 'error'
  currentPhase: number

  wallets: RecoveryWalletInfo[]
  walletStates: Uint8Array
  walletPubkeys: string[]

  scanned: number
  withFunds: number
  processing: number
  completed: number
  failed: number
  totalRecovered: number

  logEntries: RecoveryLogEntry[]

  // Subscribers get notified on state array changes (for canvas)
  stateVersion: number

  setWallets: (wallets: RecoveryWalletInfo[]) => void
  handleProgress: (event: RecoveryProgressEvent) => void
  setStatus: (status: RecoveryState['status']) => void
  addLog: (level: RecoveryLogEntry['level'], message: string) => void
  reset: () => void
}

export const useRecoveryStore = create<RecoveryState>((set, get) => ({
  status: 'idle',
  currentPhase: 0,
  wallets: [],
  walletStates: new Uint8Array(0),
  walletPubkeys: [],
  scanned: 0,
  withFunds: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  totalRecovered: 0,
  logEntries: [],
  stateVersion: 0,

  setWallets: (wallets) => {
    const states = new Uint8Array(wallets.length)
    const pubkeys = wallets.map((w) => w.pubkey)
    set({ wallets, walletStates: states, walletPubkeys: pubkeys })
  },

  handleProgress: (event) => {
    const state = get()
    const states = state.walletStates
    const idx = event.walletIndex ?? -1

    switch (event.type) {
      case 'scan-progress': {
        const newStates = new Uint8Array(states)
        if (idx >= 0 && idx < newStates.length) {
          const info = state.wallets[idx]
          const hasFunds = info && (info.emptyTokenAccounts > 0 || info.solLamports > 5000 || info.hasPammFees)
          newStates[idx] = hasFunds ? NODE_HAS_FUNDS : NODE_COMPLETE
        }
        set((s) => ({
          walletStates: newStates,
          scanned: s.scanned + 1,
          withFunds: idx >= 0 && newStates[idx] === NODE_HAS_FUNDS ? s.withFunds + 1 : s.withFunds,
          stateVersion: s.stateVersion + 1,
          logEntries: event.message
            ? [...s.logEntries.slice(-200), { timestamp: Date.now(), level: 'info', message: event.message }]
            : s.logEntries,
        }))
        break
      }

      case 'scan-complete':
        set((s) => ({
          status: 'idle',
          stateVersion: s.stateVersion + 1,
          logEntries: event.message
            ? [...s.logEntries, { timestamp: Date.now(), level: 'success', message: event.message }]
            : s.logEntries,
        }))
        break

      case 'phase-start':
        set((s) => ({
          currentPhase: event.phase ?? s.currentPhase,
          logEntries: event.message
            ? [...s.logEntries, { timestamp: Date.now(), level: 'info', message: event.message }]
            : s.logEntries,
        }))
        break

      case 'wallet-start': {
        const wsStates = new Uint8Array(states)
        if (idx >= 0 && idx < wsStates.length) wsStates[idx] = NODE_PROCESSING
        set((s) => ({ walletStates: wsStates, processing: s.processing + 1, stateVersion: s.stateVersion + 1 }))
        break
      }

      case 'flow':
        set((s) => ({
          totalRecovered: event.totalRecovered ?? s.totalRecovered + (event.amount ?? 0),
          stateVersion: s.stateVersion + 1,
        }))
        break

      case 'wallet-complete': {
        const wcStates = new Uint8Array(states)
        if (idx >= 0 && idx < wcStates.length) wcStates[idx] = NODE_COMPLETE
        set((s) => ({
          walletStates: wcStates,
          processing: Math.max(0, s.processing - 1),
          completed: s.completed + 1,
          stateVersion: s.stateVersion + 1,
          logEntries: event.message
            ? [...s.logEntries.slice(-200), { timestamp: Date.now(), level: 'success', message: event.message }]
            : s.logEntries,
        }))
        break
      }

      case 'wallet-error': {
        const weStates = new Uint8Array(states)
        if (idx >= 0 && idx < weStates.length) weStates[idx] = NODE_FAILED
        set((s) => ({
          walletStates: weStates,
          processing: Math.max(0, s.processing - 1),
          failed: s.failed + 1,
          stateVersion: s.stateVersion + 1,
          logEntries: [...s.logEntries.slice(-200), {
            timestamp: Date.now(),
            level: 'error',
            message: event.error ?? event.message ?? 'Unknown error',
          }],
        }))
        break
      }

      case 'complete':
        set((s) => ({
          status: 'complete',
          totalRecovered: event.totalRecovered ?? s.totalRecovered,
          stateVersion: s.stateVersion + 1,
          logEntries: [...s.logEntries, {
            timestamp: Date.now(),
            level: 'success',
            message: event.message ?? `Recovery complete: ${(event.totalRecovered ?? s.totalRecovered).toFixed(6)} SOL`,
          }],
        }))
        break
    }
  },

  setStatus: (status) => set({ status }),

  addLog: (level, message) =>
    set((s) => ({
      logEntries: [...s.logEntries.slice(-200), { timestamp: Date.now(), level, message }],
    })),

  reset: () =>
    set({
      status: 'idle',
      currentPhase: 0,
      wallets: [],
      walletStates: new Uint8Array(0),
      walletPubkeys: [],
      scanned: 0,
      withFunds: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      totalRecovered: 0,
      logEntries: [],
      stateVersion: 0,
    }),
}))
