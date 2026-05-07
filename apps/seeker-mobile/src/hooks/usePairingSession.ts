import { useCallback, useEffect, useMemo, useState } from 'react'
import { Linking } from 'react-native'
import type { PairingSession, SessionStatus } from '../types'

function randomSegment() {
  return Math.random().toString(36).slice(2, 6).toUpperCase()
}

function createPairingCode() {
  return `DMN-${randomSegment()}-${Math.floor(10 + Math.random() * 89)}`
}

function parsePairingUrl(url: string | null) {
  if (!url) return null

  try {
    const parsed = new URL(url)
    const pairingCode = parsed.searchParams.get('code') ?? parsed.searchParams.get('pair')
    const relayUrl = parsed.searchParams.get('relay') ?? parsed.searchParams.get('relayUrl')
    const desktopId = parsed.searchParams.get('desktopId') ?? parsed.searchParams.get('desktop')
    const projectName = parsed.searchParams.get('project') ?? parsed.searchParams.get('projectName')

    if (!pairingCode && !relayUrl && !desktopId && !projectName) return null

    return {
      pairingCode: pairingCode ?? createPairingCode(),
      relayUrl: relayUrl ?? '',
      desktopId: desktopId ?? null,
      projectName: projectName ?? 'Daemon Project',
    }
  } catch {
    return null
  }
}

export function usePairingSession(initialRelayUrl = '') {
  const [status, setStatus] = useState<SessionStatus>('idle')
  const [session, setSession] = useState<PairingSession>(() => ({
    status: 'idle',
    pairingCode: createPairingCode(),
    relayUrl: initialRelayUrl,
    desktopId: null,
    projectName: 'Daemon Project',
    updatedAt: Date.now(),
  }))

  const updateSession = useCallback((patch: Partial<PairingSession>) => {
    setSession((current) => {
      const nextStatus = patch.status ?? current.status
      setStatus(nextStatus)
      return {
        ...current,
        ...patch,
        status: nextStatus,
        updatedAt: Date.now(),
      }
    })
  }, [])

  const pairManually = useCallback((pairingCode: string, relayUrl: string) => {
    updateSession({
      status: 'paired',
      pairingCode: pairingCode.trim() || createPairingCode(),
      relayUrl: relayUrl.trim(),
      desktopId: 'manual-desktop',
    })
  }, [updateSession])

  const pairFromUrl = useCallback((url: string | null) => {
    const parsed = parsePairingUrl(url)
    if (!parsed) return false
    updateSession({ status: 'paired', ...parsed })
    return true
  }, [updateSession])

  const resetPairing = useCallback(() => {
    updateSession({
      status: 'idle',
      pairingCode: createPairingCode(),
      relayUrl: initialRelayUrl,
      desktopId: null,
      projectName: 'Daemon Project',
    })
  }, [initialRelayUrl, updateSession])

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) pairFromUrl(url)
    }).catch(() => {})

    const subscription = Linking.addEventListener('url', ({ url }) => {
      pairFromUrl(url)
    })

    return () => subscription.remove()
  }, [pairFromUrl])

  const deepLink = useMemo(() => {
    const params = new URLSearchParams({
      code: session.pairingCode,
      relay: session.relayUrl,
      project: session.projectName,
    })
    return `daemonseeker://pair?${params.toString()}`
  }, [session.pairingCode, session.projectName, session.relayUrl])

  return {
    status,
    session,
    deepLink,
    updateSession,
    pairManually,
    pairFromUrl,
    resetPairing,
  }
}
