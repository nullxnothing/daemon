import { beforeEach, describe, expect, it } from 'vitest'
import { isTrustedSender, setTrustedIpcOrigin } from '../../electron/security/ipcSender'

type FakeFrame = { url: string; parent: FakeFrame | null }

function event(frame: FakeFrame | null) {
  return { senderFrame: frame } as unknown as Parameters<typeof isTrustedSender>[0]
}

function frame(url: string, parent: FakeFrame | null = null): FakeFrame {
  return { url, parent }
}

describe('isTrustedSender', () => {
  beforeEach(() => setTrustedIpcOrigin(null))

  it('accepts the top frame at the configured dev origin', () => {
    setTrustedIpcOrigin('http://127.0.0.1:7777')
    expect(isTrustedSender(event(frame('http://127.0.0.1:7777/index.html')))).toBe(true)
  })

  it('accepts the top frame for the packaged file:// app', () => {
    setTrustedIpcOrigin('file://')
    expect(isTrustedSender(event(frame('file:///C:/app/dist/index.html')))).toBe(true)
  })

  it('rejects a different origin (e.g. a navigated/remote page)', () => {
    setTrustedIpcOrigin('http://127.0.0.1:7777')
    expect(isTrustedSender(event(frame('https://evil.example.com/')))).toBe(false)
  })

  it('rejects a sub-frame even at the trusted origin (iframe/webview document)', () => {
    setTrustedIpcOrigin('http://127.0.0.1:7777')
    const top = frame('http://127.0.0.1:7777/index.html')
    const child = frame('http://127.0.0.1:7777/embedded', top)
    expect(isTrustedSender(event(child))).toBe(false)
  })

  it('rejects a webview top frame whose origin differs from the app', () => {
    setTrustedIpcOrigin('file://')
    // A <webview> hosts a separate webContents; its top frame is a remote page.
    expect(isTrustedSender(event(frame('https://some-embedded-site.com/')))).toBe(false)
  })

  it('rejects when there is no sender frame', () => {
    setTrustedIpcOrigin('file://')
    expect(isTrustedSender(event(null))).toBe(false)
  })

  it('rejects an unparseable frame url', () => {
    setTrustedIpcOrigin('file://')
    expect(isTrustedSender(event(frame('::::not-a-url')))).toBe(false)
  })

  it('with no configured origin, accepts a top frame but still rejects sub-frames', () => {
    setTrustedIpcOrigin(null)
    expect(isTrustedSender(event(frame('http://127.0.0.1:7777/')))).toBe(true)
    const top = frame('http://127.0.0.1:7777/')
    expect(isTrustedSender(event(frame('http://127.0.0.1:7777/child', top)))).toBe(false)
  })
})
