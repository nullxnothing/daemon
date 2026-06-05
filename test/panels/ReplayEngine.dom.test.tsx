// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReplayEngine } from '../../src/panels/ReplayEngine/ReplayEngine'
import { REPLAY_HANDOFF_KEY } from '../../src/lib/surfaceHandoffs'

const MINT = 'So11111111111111111111111111111111111111112'

function installDaemonBridge() {
  const replay = {
    rpcLabel: vi.fn().mockResolvedValue({ ok: true, data: 'https://api.devnet.solana.com' }),
    fetchProgram: vi.fn().mockResolvedValue({
      ok: true,
      data: { programId: MINT, recent: [] },
    }),
    fetchTrace: vi.fn().mockResolvedValue({ ok: false, error: 'not used' }),
    buildContext: vi.fn().mockResolvedValue({ ok: false, error: 'not used' }),
    createHandoff: vi.fn().mockResolvedValue({ ok: false, error: 'not used' }),
    verifyFix: vi.fn().mockResolvedValue({ ok: false, error: 'not used' }),
  }

  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      replay,
      terminal: { create: vi.fn().mockResolvedValue({ ok: false, error: 'not used' }) },
    },
  })

  return replay
}

describe('ReplayEngine', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('consumes a queued account handoff as recent activity', async () => {
    const replay = installDaemonBridge()
    window.localStorage.setItem(REPLAY_HANDOFF_KEY, JSON.stringify({ address: MINT }))

    render(<ReplayEngine />)

    await waitFor(() => {
      expect(replay.fetchProgram).toHaveBeenCalledWith(MINT, 15)
    })
    expect(screen.getByDisplayValue(MINT)).toBeInTheDocument()
    expect(window.localStorage.getItem(REPLAY_HANDOFF_KEY)).toBeNull()
  })
})
