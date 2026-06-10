import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getVersion: () => '4.3.0',
    getLocale: () => 'en-US',
  },
}))

const settings = new Map<string, boolean>()
vi.mock('../../electron/services/SettingsService', () => ({
  getBooleanSetting: (key: string, fallback: boolean) => settings.get(key) ?? fallback,
  setBooleanSetting: (key: string, value: boolean) => { settings.set(key, value) },
}))

const state = new Map<string, string>()
vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    exec: () => {},
    prepare: (sql: string) => ({
      get: (key?: string) => {
        if (sql.includes('MIN(timestamp)')) return { firstSeenAt: null }
        return state.has(String(key)) ? { value: state.get(String(key)) } : undefined
      },
      run: (...args: unknown[]) => { state.set(String(args[0]), String(args[1])) },
    }),
  }),
}))

vi.mock('../../electron/security/PrivacyGuard', () => ({
  sanitizeErrorMessage: (err: unknown) => String(err),
}))

import {
  flushRemoteTelemetry,
  isRemoteTelemetryEnabled,
  setRemoteTelemetryEnabled,
} from '../../electron/services/RemoteTelemetryService'

const fetchMock = vi.fn(async () => ({ ok: true }))
vi.stubGlobal('fetch', fetchMock)

function sentBody(callIndex: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[callIndex][1] as unknown as { body: string }
  return JSON.parse(init.body)
}

beforeEach(() => {
  settings.clear()
  state.clear()
  fetchMock.mockClear()
  delete process.env.DAEMON_TELEMETRY_DISABLED
})

describe('RemoteTelemetryService', () => {
  it('defaults to enabled and persists the user toggle', () => {
    expect(isRemoteTelemetryEnabled()).toBe(true)
    setRemoteTelemetryEnabled(false)
    expect(isRemoteTelemetryEnabled()).toBe(false)
    setRemoteTelemetryEnabled(true)
    expect(isRemoteTelemetryEnabled()).toBe(true)
  })

  it('sends first_open and daily_active on first flush', async () => {
    await flushRemoteTelemetry()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sentBody(0).eventName).toBe('first_open')
    expect(sentBody(1).eventName).toBe('daily_active')
  })

  it('dedupes repeat flushes within the same UTC day', async () => {
    await flushRemoteTelemetry()
    fetchMock.mockClear()
    await flushRemoteTelemetry()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends nothing when the user opts out', async () => {
    setRemoteTelemetryEnabled(false)
    await flushRemoteTelemetry()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('payload carries no project paths, prompts, or key material', async () => {
    await flushRemoteTelemetry()
    expect(Object.keys(sentBody(0)).sort()).toEqual(
      ['appVersion', 'arch', 'estimatedFirstSeenAt', 'eventId', 'eventName', 'installId', 'isPackaged', 'locale', 'osVersion', 'platform', 'schemaVersion', 'timestamp'].sort()
    )
  })
})
