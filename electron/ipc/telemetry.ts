import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as TelemetryService from '../services/TelemetryService'

export function initTelemetry(version: string) {
  return TelemetryService.initTelemetry(version)
}

export function registerTelemetryHandlers() {
  ipcMain.handle('telemetry:track', ipcHandler(async (_event, eventName: string, properties?: Record<string, unknown>) => {
    TelemetryService.trackEvent(eventName, properties)
    return { ok: true }
  }))

  ipcMain.handle('telemetry:timing', ipcHandler(async (_event, eventName: string, durationMs: number, properties?: Record<string, unknown>) => {
    TelemetryService.trackTiming(eventName, durationMs, properties)
    return { ok: true }
  }))

  ipcMain.handle('telemetry:session', ipcHandler(async () => {
    return { ok: true, data: { sessionId: TelemetryService.getSessionId() } }
  }))

  ipcMain.handle('telemetry:stats', ipcHandler(async () => {
    return { ok: true, data: TelemetryService.getSessionStats() }
  }))

  ipcMain.handle('telemetry:recent', ipcHandler(async (_event, limit?: number) => {
    return { ok: true, data: TelemetryService.getRecentEvents(limit || 50) }
  }))
}
