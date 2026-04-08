import { describe, expect, it } from 'vitest'
import { isBlockedBrowserHost, isBlockedBrowserUrl, navigate } from '../../electron/services/BrowserService'

describe('BrowserService SSRF guard', () => {
  it('blocks private, loopback, metadata, and cluster-local hosts', () => {
    for (const host of [
      'localhost',
      'app.localhost',
      '127.0.0.1',
      '10.0.0.42',
      '172.16.8.9',
      '192.168.1.10',
      '169.254.169.254',
      '168.63.129.16',
      '::1',
      'fe80::1',
      'fd00::1',
      'metadata.google.internal',
      'metadata.azure.internal',
      'kubernetes.default.svc.cluster.local',
    ]) {
      expect(isBlockedBrowserHost(host)).toBe(true)
    }
  })

  it('allows normal public hosts', () => {
    for (const host of ['example.com', 'solana.com', 'api.github.com', '1.1.1.1']) {
      expect(isBlockedBrowserHost(host)).toBe(false)
    }
  })

  it('rejects unsafe URLs and accepts public https URLs', () => {
    expect(isBlockedBrowserUrl('file:///etc/passwd')).toBe(true)
    expect(isBlockedBrowserUrl('http://localhost:3000')).toBe(true)
    expect(isBlockedBrowserUrl('https://user:pass@example.com')).toBe(true)
    expect(isBlockedBrowserUrl('https://example.com')).toBe(false)
  })

  it('throws on blocked navigation targets', async () => {
    await expect(navigate('http://127.0.0.1:8899')).rejects.toThrow(
      'Navigation to private, local, or metadata endpoints is blocked'
    )
  })
})
