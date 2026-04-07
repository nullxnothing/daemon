import { useNotificationsStore } from '../store/notifications'

interface IpcResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

interface RunIpcOptions {
  /** Short label shown in the toast (e.g. "Wallet", "Git push") */
  context: string
  /** Suppress the auto-toast on failure (caller will handle it) */
  silent?: boolean
}

/**
 * Wraps an IPC call so:
 *   - Successful responses return `data`
 *   - Failed responses are auto-toasted with the context, and return `null`
 *   - Thrown errors are caught, toasted, and return `null`
 *
 * Usage:
 *   const data = await runIpc(window.daemon.wallet.list(), { context: 'Wallet' })
 *   if (!data) return // error already shown
 */
export async function runIpc<T>(
  call: Promise<IpcResponse<T>>,
  opts: RunIpcOptions,
): Promise<T | null> {
  try {
    const res = await call
    if (res.ok) return res.data ?? null
    if (!opts.silent) {
      useNotificationsStore.getState().pushError(res.error ?? 'Unknown error', opts.context)
    }
    return null
  } catch (err) {
    if (!opts.silent) {
      useNotificationsStore.getState().pushError(err, opts.context)
    }
    return null
  }
}
