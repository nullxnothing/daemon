import type { IpcMainEvent, IpcMainInvokeEvent, WebFrameMain } from 'electron'

/**
 * IPC sender validation.
 *
 * DAEMON exposes high-privilege IPC channels (wallet signing, fs, shell, env).
 * `<webview>` tags and any cross-origin iframe get their own WebFrameMain and
 * can call `ipcRenderer.invoke` — so a compromised/embedded page could otherwise
 * reach a privileged channel. We require that the caller be the TOP frame of the
 * trusted application origin: the main renderer, never an embedded frame.
 *
 * The trusted origin is the Vite dev server in development and the file:// app
 * bundle in production (custom protocols used for assets are not IPC senders).
 */

let trustedOrigin: string | null = null

/** Set once at window creation. `null`/`'file://'` covers the packaged app. */
export function setTrustedIpcOrigin(origin: string | null): void {
  trustedOrigin = origin
}

function frameOrigin(frame: WebFrameMain | null): string | null {
  if (!frame) return null
  try {
    // Packaged app loads from a file:// URL whose origin serializes to 'null';
    // fall back to the scheme so we can still distinguish app vs remote frames.
    const url = new URL(frame.url)
    if (url.protocol === 'file:') return 'file://'
    return url.origin
  } catch {
    return null
  }
}

function isTopFrame(frame: WebFrameMain | null): boolean {
  if (!frame) return false
  // WebFrameMain.parent is null only for the top frame of a webContents.
  // A <webview> hosts its content in a separate webContents whose top frame
  // is the webview's document — which will not match the trusted origin.
  return frame.parent === null
}

/**
 * True when an IPC event originated from the trusted top-level app frame.
 * Defaults to permissive only in the unexpected case where no origin was ever
 * configured (e.g. a unit-test harness that imports a handler directly) so we
 * never hard-break tests, but production always sets the origin at startup.
 */
export function isTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const frame = event.senderFrame
  if (!frame) return false
  if (!isTopFrame(frame)) return false

  const origin = frameOrigin(frame)
  if (origin === null) return false

  // No configured origin (test/headless): accept top-frame senders only.
  if (trustedOrigin === null) return true

  return origin === trustedOrigin
}

export function assertTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): void {
  if (!isTrustedSender(event)) {
    throw new Error('IPC request rejected: untrusted sender frame')
  }
}
