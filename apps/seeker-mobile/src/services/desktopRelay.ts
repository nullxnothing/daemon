import type { ApprovalRequest, PairingSession, ProjectSnapshot, RelayEvent } from '../types'

export interface RelaySnapshot {
  session?: Partial<PairingSession>
  project?: Partial<ProjectSnapshot>
  approvals?: ApprovalRequest[]
}

export interface RelayClientOptions {
  relayUrl: string
  sessionCode: string
}

function normalizeRelayUrl(relayUrl: string) {
  const trimmed = relayUrl.trim().replace(/\/$/, '')
  return trimmed.length > 0 ? trimmed : null
}

export async function postRelayEvent({ relayUrl, sessionCode }: RelayClientOptions, event: Omit<RelayEvent, 'sessionCode'>) {
  const base = normalizeRelayUrl(relayUrl)
  if (!base) return { ok: false, error: 'Missing relay URL' }

  try {
    const res = await fetch(`${base}/api/seeker/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...event, sessionCode }),
    })

    if (!res.ok) return { ok: false, error: `Relay returned ${res.status}` }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Relay request failed' }
  }
}

export async function fetchRelaySnapshot({ relayUrl, sessionCode }: RelayClientOptions) {
  const base = normalizeRelayUrl(relayUrl)
  if (!base) return { ok: false, error: 'Missing relay URL', data: null as RelaySnapshot | null }

  try {
    const res = await fetch(`${base}/api/seeker/session/${encodeURIComponent(sessionCode)}`)
    if (!res.ok) return { ok: false, error: `Relay returned ${res.status}`, data: null }
    const data = await res.json() as RelaySnapshot
    return { ok: true, data, error: null }
  } catch (error) {
    return {
      ok: false,
      data: null,
      error: error instanceof Error ? error.message : 'Relay snapshot failed',
    }
  }
}
