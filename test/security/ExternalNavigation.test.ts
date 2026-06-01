import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
}))

describe('external navigation security policy', () => {
  it('allows only safe URLs for host external navigation', async () => {
    const { isSafeExternalUrl, openSafeExternalUrl } = await import('../../electron/security/externalNavigation')

    expect(isSafeExternalUrl('https://solscan.io/tx/abc')).toBe(true)
    expect(isSafeExternalUrl('http://localhost:5173')).toBe(true)
    expect(isSafeExternalUrl('http://127.0.0.1:7777')).toBe(true)
    expect(isSafeExternalUrl('http://example.com')).toBe(false)
    expect(isSafeExternalUrl('https://user:pass@example.com')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('file:///C:/secret.txt')).toBe(false)

    await expect(openSafeExternalUrl('javascript:alert(1)')).resolves.toBe(false)
  })

  it('allows https and loopback http webviews, rejects remote http, credentials, and privileged schemes', async () => {
    const { isAllowedWebviewUrl } = await import('../../electron/security/externalNavigation')

    expect(isAllowedWebviewUrl('https://docs.daemon.test')).toBe(true)
    expect(isAllowedWebviewUrl('http://localhost:5173')).toBe(true)
    expect(isAllowedWebviewUrl('http://127.0.0.1:5173')).toBe(true)
    // Remote cleartext http is no longer embeddable.
    expect(isAllowedWebviewUrl('http://example.com')).toBe(false)
    expect(isAllowedWebviewUrl('https://user:pass@example.com')).toBe(false)
    expect(isAllowedWebviewUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedWebviewUrl('file:///C:/secret.txt')).toBe(false)
    expect(isAllowedWebviewUrl('data:text/html,hello')).toBe(false)
  })
})
