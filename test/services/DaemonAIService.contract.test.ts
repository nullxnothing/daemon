import { describe, expect, it } from 'vitest'
import { normalizeChatRequest } from '../../electron/services/DaemonAIService'

describe('DaemonAIService contract helpers', () => {
  it('normalizes chat requests to safe defaults', () => {
    const request = normalizeChatRequest({
      message: '  explain this build error  ',
      accessMode: 'hosted',
      mode: 'plan',
      modelPreference: 'reasoning',
      context: {
        activeFile: false,
        gitDiff: true,
        terminalLogs: true,
      },
    })

    expect(request.message).toBe('explain this build error')
    expect(request.accessMode).toBe('hosted')
    expect(request.mode).toBe('plan')
    expect(request.modelPreference).toBe('reasoning')
    expect(request.context).toMatchObject({
      activeFile: false,
      projectTree: true,
      gitDiff: true,
      terminalLogs: true,
      walletContext: false,
    })
  })

  it('rejects empty and oversized messages', () => {
    expect(() => normalizeChatRequest({ message: '   ' })).toThrow('message required')
    expect(() => normalizeChatRequest({ message: 'x'.repeat(24_001) })).toThrow('message is too large')
  })

  it('falls back to BYOK ask auto for invalid optional fields', () => {
    const request = normalizeChatRequest({
      message: 'hello',
      accessMode: 'bad' as any,
      mode: 'bad' as any,
      modelPreference: 'bad' as any,
    })

    expect(request.accessMode).toBe('byok')
    expect(request.mode).toBe('ask')
    expect(request.modelPreference).toBe('auto')
  })
})
