import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('landing page health metadata', () => {
  const html = readFileSync('index.html', 'utf8')
  const vercelConfig = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
    headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
  }
  const ogImage = readFileSync('public-og-image.png')

  it('serves crawler-friendly title, description, and social image metadata', () => {
    expect(html).toContain('<title>Daemon | The Solana Operator Console</title>')
    expect(html).toContain('meta name="description"')
    expect(html).toContain('meta property="og:image" content="https://daemon-landing.vercel.app/public-og-image.png"')
    expect(html).toContain('meta property="og:image:type" content="image/png"')
    expect(html).toContain('meta name="twitter:card" content="summary_large_image"')
    expect(ogImage.length).toBeGreaterThan(1000)
    expect(ogImage.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  })

  it('defines hardened static response headers for Vercel', () => {
    const responseHeaders = vercelConfig.headers?.find((entry) => entry.source === '/(.*)')?.headers ?? []
    const headerMap = new Map(responseHeaders.map(({ key, value }) => [key, value]))
    expect(headerMap.get('Content-Security-Policy')).toContain("default-src 'self'")
    expect(headerMap.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
    expect(headerMap.get('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains; preload')
    expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headerMap.get('X-Frame-Options')).toBe('DENY')
    expect(headerMap.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(headerMap.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()')
  })
})
