import { BrowserWindow } from 'electron'

/**
 * Broadcast an IPC event to every renderer window. Use for state-change pushes
 * (auth:changed, process:changed, etc.) so renderers can drop polling loops.
 *
 * Keep payloads small and serializable. Channels follow `<domain>:<event>` form.
 */
export function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.send(channel, payload)
      } catch {
        // non-fatal — window may be navigating
      }
    }
  }
}
