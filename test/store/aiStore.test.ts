import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAiStore } from '../../src/store/aiStore'

describe('useAiStore', () => {
  let chat: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.restoreAllMocks()
    chat = vi.fn()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        daemon: {
          ai: {
            chat,
          },
        },
      },
    })
    ;(globalThis as any).daemon = {
      ai: {
        chat,
      },
    }
    useAiStore.setState({
      messages: [],
      conversationId: null,
      usage: null,
      features: null,
      models: [],
      agentRuns: [],
      approvals: [],
      patchProposals: [],
      loading: false,
      workbenchLoading: false,
      error: null,
      workbenchError: null,
    })
  })

  it('rolls back optimistic Ask messages when the request fails', async () => {
    chat.mockResolvedValueOnce({ ok: false, error: 'provider unavailable' })

    const ok = await useAiStore.getState().send({ message: 'why failing?', mode: 'ask' })

    expect(ok).toBe(false)
    expect(useAiStore.getState().messages).toEqual([])
    expect(useAiStore.getState().error).toBe('provider unavailable')
  })
})
