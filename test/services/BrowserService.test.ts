import { beforeEach, describe, expect, it } from 'vitest'
import { clearHistory, getLatestPage, navigate } from '../../electron/services/BrowserService'

describe('BrowserService.navigate', () => {
  beforeEach(() => {
    clearHistory()
  })

  it('accepts standard public https urls', async () => {
    const result = await navigate('example.com')
    expect(result.url).toBe('https://example.com')
    expect(getLatestPage()?.url).toBe('https://example.com')
  })

  it('accepts local dev preview urls without fetching server-side content', async () => {
    const result = await navigate('http://localhost:3000')
    expect(result.url).toBe('http://localhost:3000')
    expect(getLatestPage()?.url).toBe('http://localhost:3000')
  })

  it('rejects private network targets', async () => {
    await expect(navigate('http://192.168.1.10')).rejects.toThrow(/blocked/i)
    await expect(navigate('http://172.20.1.5')).rejects.toThrow(/blocked/i)
    await expect(navigate('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/blocked/i)
  })

  it('rejects internal domains and credentialed urls', async () => {
    await expect(navigate('http://db.internal')).rejects.toThrow(/blocked/i)
    await expect(navigate('https://user:pass@example.com')).rejects.toThrow(/blocked/i)
  })

  it('rejects non-http protocols', async () => {
    await expect(navigate('file:///etc/passwd')).rejects.toThrow(/blocked/i)
  })
})
