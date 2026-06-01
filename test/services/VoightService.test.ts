import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const secureKey = vi.hoisted(() => ({
  value: null as string | null,
  storeKey: vi.fn(),
  deleteKey: vi.fn(),
}))

const dbState = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  rows: [] as Record<string, unknown>[],
  exec: vi.fn(),
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: vi.fn(() => secureKey.value),
  storeKey: secureKey.storeKey,
  deleteKey: secureKey.deleteKey,
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    exec: dbState.exec,
    prepare(sql: string) {
      return {
        get(key?: string) {
          if (sql.includes('SELECT value FROM app_settings')) {
            const value = dbState.settings.get(String(key))
            return value ? { value } : undefined
          }
          if (sql.includes('SUM(CASE WHEN status')) {
            return {
              pending: dbState.rows.filter((row) => row.status === 'pending').length,
              failed: dbState.rows.filter((row) => row.status === 'failed').length,
              sent: dbState.rows.filter((row) => row.status === 'sent').length,
              lastSentAt: null,
            }
          }
          if (sql.includes('SELECT last_error')) return undefined
          return undefined
        },
        run(...args: unknown[]) {
          if (sql.includes('INSERT INTO app_settings')) {
            dbState.settings.set(String(args[0]), String(args[1]))
            return { changes: 1 }
          }
          if (sql.includes('INSERT OR IGNORE INTO voight_event_queue')) {
            dbState.rows.push({
              id: args[0],
              agent_id: args[1],
              type: args[2],
              outcome: args[3],
              dedup_key: args[4],
              payload_json: args[5],
              status: 'pending',
              attempts: 0,
            })
            return { changes: 1 }
          }
          return { changes: 0 }
        },
        all() {
          if (sql.includes('FROM voight_event_queue')) return dbState.rows
          return []
        },
      }
    },
  }),
}))

import {
  deleteKey,
  emitEvent,
  getStatus,
  setPrivacyLevel,
  storeKey,
  testEvent,
} from '../../electron/services/VoightService'

const VOIGHT_FIXTURE_KEY = 'vk_' + '12345678901234567890123456789012'
const VOIGHT_REDACTION_FIXTURE = 'vk_' + 'redaction_fixture_000000000000'

describe('VoightService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.settings.clear()
    dbState.rows.length = 0
    secureKey.value = null
    delete process.env.VOIGHT_KEY
    delete process.env.VOIGHT_ENDPOINT
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('reports unconfigured status with standard privacy by default', () => {
    expect(getStatus()).toMatchObject({
      configured: false,
      keySource: 'none',
      privacyLevel: 'standard',
      pending: 0,
      failed: 0,
      sent: 0,
    })
  })

  it('stores and deletes VOIGHT_KEY through secure storage', () => {
    storeKey(VOIGHT_FIXTURE_KEY)
    expect(secureKey.storeKey).toHaveBeenCalledWith('VOIGHT_KEY', VOIGHT_FIXTURE_KEY)

    deleteKey()
    expect(secureKey.deleteKey).toHaveBeenCalledWith('VOIGHT_KEY')
  })

  it('rejects malformed keys', () => {
    expect(() => storeKey('not-a-voight-key')).toThrow('Voight key must start with vk_')
  })

  it('queues scrubbed standard events only', async () => {
    vi.useFakeTimers()
    secureKey.value = VOIGHT_FIXTURE_KEY

    await emitEvent({
      agentId: 'agent-1',
      type: 'tool',
      toolExecuted: 'bash',
      input: {
        command: `echo ${VOIGHT_REDACTION_FIXTURE}`,
        Authorization: 'Bearer abcdefghijklmnopqrstuvwxyz123456',
      },
      metadata: { sessionId: 'run-1' },
    })

    const payload = String(dbState.rows[0].payload_json)
    expect(payload).toContain('[REDACTED_VOIGHT_KEY]')
    expect(payload).toContain('[REDACTED_SECRET]')
    expect(payload).not.toContain(VOIGHT_REDACTION_FIXTURE)
    expect(payload).not.toContain('abcdefghijklmnopqrstuvwxyz123456')
  })

  it('sends a test event with bearer auth and source metadata', async () => {
    secureKey.value = VOIGHT_FIXTURE_KEY
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await testEvent()

    expect(result).toMatchObject({ accepted: true, status: 202 })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${VOIGHT_FIXTURE_KEY}`)
    const body = JSON.parse(String(init.body))
    expect(body.metadata.source).toBe('daemon')
    expect(body.metadata.privacyLevel).toBe('standard')
  })

  it('persists privacy level selection', () => {
    setPrivacyLevel('minimal')
    expect(getStatus().privacyLevel).toBe('minimal')
  })
})
