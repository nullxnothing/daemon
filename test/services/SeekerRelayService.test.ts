import http, { type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { startRelayServer, stopRelayServer } from '../../electron/services/SeekerRelayService'

describe('SeekerRelayService', () => {
  let external: Server | null = null

  afterEach(async () => {
    await stopRelayServer()
    await new Promise<void>((resolve) => {
      if (!external) return resolve()
      external.close(() => resolve())
      external = null
    })
  })

  it('reuses an existing DAEMON seeker relay instead of logging a port conflict', async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    await stopRelayServer()

    external = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        ok: true,
        data: {
          running: true,
          port: 0,
          relayUrl: 'http://127.0.0.1:0',
          lanUrl: 'http://127.0.0.1:0',
          sessionCount: 2,
        },
      }))
    })
    await new Promise<void>((resolve) => external!.listen(0, '0.0.0.0', resolve))
    const address = external.address()
    if (!address || typeof address === 'string') throw new Error('external server failed to bind')

    const status = await startRelayServer(address.port)

    expect(status.running).toBe(true)
    expect(status.port).toBe(address.port)
    expect(status.sessionCount).toBe(2)
  })
})
