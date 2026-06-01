import { IpcMainInvokeEvent } from 'electron'
import { sanitizeErrorMessage } from '../security/PrivacyGuard'
import { isTrustedSender } from '../security/ipcSender'
import * as Voight from './VoightService'

export type IpcResponse<T = unknown> = 
  | { ok: true; data?: T }
  | { ok: false; error: string }

export type IpcHandlerFn<R = unknown> = (
  event: IpcMainInvokeEvent,
  ...args: any[]
) => Promise<R> | R

function trackIpcError(message: string): void {
  try {
    Voight.trackError('daemon-ipc', message, { detail: 'ipc handler error' })
  } catch {
    // observability must not affect IPC
  }
}

/**
 * Wraps an IPC handler with standardized try/catch and response formatting.
 * 
 * Usage:
 * ```typescript
 * ipcMain.handle('agents:list', ipcHandler(async () => {
 *   const agents = db.prepare('SELECT * FROM agents').all()
 *   return agents
 * }))
 * ```
 * 
 * Response: { ok: true, data: agents } or { ok: false, error: "message" }
 */
export function ipcHandler<R = unknown>(
  handler: IpcHandlerFn<R>,
  onError?: (err: unknown) => string | null | undefined
): (event: IpcMainInvokeEvent, ...args: any[]) => Promise<IpcResponse<R>> {
  return async (event: IpcMainInvokeEvent, ...args: any[]) => {
    if (!isTrustedSender(event)) {
      const message = 'IPC request rejected: untrusted sender frame'
      trackIpcError(message)
      return { ok: false, error: message }
    }
    try {
      const result = await handler(event, ...args)
      return { ok: true, data: result }
    } catch (err) {
      const message = sanitizeErrorMessage(
        onError
          ? (onError(err) ?? (err as Error).message ?? String(err))
          : (err as Error).message ?? String(err)
      )
      trackIpcError(message)
      return { ok: false, error: message }
    }
  }
}

/**
 * Higher-order function for conditional validation before handler execution.
 * Returns early with error if validation fails, otherwise executes handler.
 * 
 * Usage:
 * ```typescript
 * const handler = ipcHandler(
 *   withValidation(
 *     (path) => !isPathSafe(path) ? 'Path not authorized' : null,
 *     async (event, path) => {
 *       // Handler only runs if validation passed
 *     }
 *   )
 * )
 * ```
 */
export function withValidation<R>(
  validator: (...args: any[]) => string | null | undefined,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<R> | R
): IpcHandlerFn<R> {
  return async (event: IpcMainInvokeEvent, ...args: any[]) => {
    const error = validator(...args)
    if (error) throw new Error(error)
    return handler(event, ...args)
  }
}

/**
 * Converts a handler that returns IpcResponse<T> into one that re-throws
 * the error if ok: false. Useful for extracting common error handling.
 */
export function unwrapResponse<T>(response: IpcResponse<T>): T {
  if (!response.ok) throw new Error(response.error)
  return response.data as T
}
