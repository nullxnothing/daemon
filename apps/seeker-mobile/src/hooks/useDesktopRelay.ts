import { useCallback, useState } from 'react'
import type { RelayEvent } from '../types'
import { fetchRelaySnapshot, postRelayEvent, type RelaySnapshot } from '../services/desktopRelay'

export function useDesktopRelay(relayUrl: string, sessionCode: string) {
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<RelaySnapshot | null>(null)

  const sendRelayEvent = useCallback(async (event: Omit<RelayEvent, 'sessionCode'>) => {
    const result = await postRelayEvent({ relayUrl, sessionCode }, event)
    if (!result.ok) setLastError(result.error ?? 'Relay event failed')
    else setLastError(null)
    return result
  }, [relayUrl, sessionCode])

  const syncRelaySnapshot = useCallback(async () => {
    const result = await fetchRelaySnapshot({ relayUrl, sessionCode })
    if (result.ok) {
      setSnapshot(result.data)
      setLastError(null)
      setLastSyncAt(Date.now())
    } else {
      setLastError(result.error)
    }
    return result
  }, [relayUrl, sessionCode])

  return {
    snapshot,
    lastSyncAt,
    lastError,
    sendRelayEvent,
    syncRelaySnapshot,
  }
}
