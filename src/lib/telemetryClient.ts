import * as React from 'react'
import { daemon } from './daemonBridge'

export interface ClientTelemetryEvent {
  eventName: string
  properties?: Record<string, unknown>
}

export interface ClientTelemetryTiming {
  eventName: string
  durationMs: number
  properties?: Record<string, unknown>
}

/**
 * Track a user event (e.g., button click, panel open, feature used)
 * @param eventName - Event identifier (e.g., 'editor:file-opened')
 * @param properties - Additional metadata
 */
export async function trackEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  try {
    await daemon.telemetry.track(eventName, properties)
  } catch (err) {
    console.warn('[telemetry] Failed to track event:', err)
  }
}

/**
 * Track a timed operation (e.g., API call, file save, compilation)
 * @param eventName - Event identifier
 * @param durationMs - Duration in milliseconds
 * @param properties - Additional metadata
 */
export async function trackTiming(
  eventName: string,
  durationMs: number,
  properties: Record<string, unknown> = {},
): Promise<void> {
  try {
    await daemon.telemetry.timing(eventName, durationMs, properties)
  } catch (err) {
    console.warn('[telemetry] Failed to track timing:', err)
  }
}

/**
 * Get current session ID
 */
export async function getSessionId(): Promise<string | null> {
  try {
    const result = await daemon.telemetry.session()
    return result.data?.sessionId ?? null
  } catch (err) {
    console.warn('[telemetry] Failed to get session ID:', err)
    return null
  }
}

/**
 * React hook to track page/panel view
 * Usage: useTrackView('panel:editor-opened')
 */
export function useTrackView(viewName: string) {
  React.useEffect(() => {
    trackEvent(`view:${viewName}`, { timestamp: Date.now() })
  }, [viewName])
}

/**
 * React hook to track timing of a component lifecycle
 * Usage: useTrackTiming('component:editor-render')
 */
export function useTrackTiming(eventName: string) {
  const startTime = React.useRef(Date.now())

  React.useEffect(() => {
    return () => {
      const duration = Date.now() - startTime.current
      trackTiming(eventName, duration)
    }
  }, [eventName])
}

/**
 * Higher-order hook to measure async operation duration
 * Usage:
 * const { startTimer, endTimer } = useAsyncTimer()
 * await operation()
 * endTimer('operation:name')
 */
export function useAsyncTimer() {
  const timers = React.useRef<Record<string, number>>({})

  return {
    startTimer: (key: string) => {
      timers.current[key] = Date.now()
    },
    endTimer: async (key: string, properties: Record<string, unknown> = {}) => {
      const startTime = timers.current[key]
      if (startTime) {
        const duration = Date.now() - startTime
        await trackTiming(key, duration, properties)
        delete timers.current[key]
      }
    },
  }
}
