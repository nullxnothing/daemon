import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type MacConfig = {
  isAdHoc: boolean
  identity?: string
  hardenedRuntime: boolean
  entitlements?: string
  artifactName: string
}

const require = createRequire(import.meta.url)
const { macSigningConfig } = require('../../build/macPackaging.cjs') as {
  macSigningConfig: (env?: NodeJS.ProcessEnv) => MacConfig
}

describe('macOS packaging configuration', () => {
  it('keeps Developer ID releases on the production entitlements', () => {
    const mac = macSigningConfig({})
    expect(mac.isAdHoc).toBe(false)
    expect(mac.identity).toBeUndefined()
    expect(mac.hardenedRuntime).toBe(true)
    expect(mac.entitlements).toBe('build/entitlements.mac.plist')
    expect(mac.artifactName).toBe('DAEMON-${arch}.${ext}')
    const entitlements = readFileSync(path.resolve(mac.entitlements ?? ''), 'utf8')
    expect(entitlements).not.toContain('com.apple.security.cs.disable-library-validation')
  })

  it('uses explicit ad-hoc signing without hardened runtime', () => {
    const mac = macSigningConfig({ DAEMON_MAC_ADHOC: '1' })
    expect(mac.isAdHoc).toBe(true)
    expect(mac.identity).toBe('-')
    expect(mac.hardenedRuntime).toBe(false)
    expect(mac.entitlements).toBeUndefined()
    expect(mac.artifactName).toBe('DAEMON-unsigned-${arch}.${ext}')
  })
})
