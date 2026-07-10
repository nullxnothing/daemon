/**
 * DAEMON Lite preview tool. Opens a sandboxed pop-out browser window at a
 * localhost or https URL. Loopback previews are read-risk (the agent commonly
 * opens a user's local dev server); remote https is write-risk so the user
 * approves before the agent points a window at an external site.
 */
import { openPopout } from '../../PopoutBrowserService'
import { isAllowedWebviewUrl } from '../../../security/externalNavigation'
import type { AriaTool } from '../AriaTool'

function isLoopback(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(u.hostname)
  } catch { return false }
}

export const litePreviewTools: AriaTool[] = [
  {
    name: 'open_preview',
    description: 'Open a preview browser window for a localhost dev server or an https page. Use this to show the user a running local app or a web page you are referencing.',
    kind: 'run',
    // Risk is decided per-URL in the handler wrapper below; loopback = read,
    // remote https = write. Declared as read here; the catalog wrapper upgrades
    // remote URLs. (Kept simple: mark write so remote always gates; the model
    // is told loopback is safe.)
    risk: 'write',
    input: {
      type: 'object',
      properties: { url: { type: 'string', description: 'http://localhost:* or an https URL.' } },
      required: ['url'],
    },
    async handler(input) {
      const url = String(input.url ?? '').trim()
      if (!isAllowedWebviewUrl(url)) {
        return { ok: false, summary: 'Only localhost or https URLs can be previewed.' }
      }
      const result = openPopout(url)
      if (!result.opened) return { ok: false, summary: result.reason ?? 'Could not open the preview.' }
      return { ok: true, summary: `Opened a preview of ${url}${isLoopback(url) ? ' (local)' : ''}.` }
    },
  },
]
