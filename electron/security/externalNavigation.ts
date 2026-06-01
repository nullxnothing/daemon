import { shell } from 'electron'

const LOCALHOST_NAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function parseUrl(input: unknown): URL | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null

  try {
    return new URL(trimmed)
  } catch {
    return null
  }
}

function isLocalHttpUrl(url: URL): boolean {
  return url.protocol === 'http:' && LOCALHOST_NAMES.has(url.hostname)
}

export function isSafeExternalUrl(input: unknown): boolean {
  const url = parseUrl(input)
  if (!url) return false
  if (url.username || url.password) return false
  return url.protocol === 'https:' || isLocalHttpUrl(url)
}

export async function openSafeExternalUrl(input: unknown): Promise<boolean> {
  if (!isSafeExternalUrl(input)) return false
  await shell.openExternal(String(input).trim())
  return true
}

export function isAllowedWebviewUrl(input: unknown): boolean {
  const url = parseUrl(input)
  if (!url) return false
  if (url.username || url.password) return false

  // Only https, or plain http to loopback (local dev/tool previews). Remote
  // http is rejected — an embedded cleartext page is both downgradeable and a
  // needless RCE/credential-leak surface.
  return url.protocol === 'https:' || isLocalHttpUrl(url)
}
