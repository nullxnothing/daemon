import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  bridgeInfoFile,
  ensureBridgeToken,
  rotateBridgeToken,
  writeBridgeRuntimeInfo,
} from '../../electron/services/bridge/bridgeToken'

describe('bridgeToken', () => {
  let userData: string

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-bridge-token-'))
  })

  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true })
  })

  it('creates a 256-bit hex token on first run and persists it', () => {
    const first = ensureBridgeToken(userData)
    expect(first.token).toMatch(/^[0-9a-f]{64}$/)
    expect(first.file).toBe(bridgeInfoFile(userData))
    expect(fs.existsSync(first.file)).toBe(true)

    const second = ensureBridgeToken(userData)
    expect(second.token).toBe(first.token)
  })

  it('records the live port without losing the token', () => {
    const { token, file } = ensureBridgeToken(userData)
    writeBridgeRuntimeInfo(userData, { port: 7337, token })

    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(parsed.token).toBe(token)
    expect(parsed.port).toBe(7337)
    expect(parsed.pid).toBe(process.pid)
    expect(typeof parsed.updatedAt).toBe('number')
  })

  it('rotates to a fresh token while keeping the recorded port', () => {
    const { token } = ensureBridgeToken(userData)
    writeBridgeRuntimeInfo(userData, { port: 4242, token })

    const rotated = rotateBridgeToken(userData)
    expect(rotated).toMatch(/^[0-9a-f]{64}$/)
    expect(rotated).not.toBe(token)

    const parsed = JSON.parse(fs.readFileSync(bridgeInfoFile(userData), 'utf8'))
    expect(parsed.token).toBe(rotated)
    expect(parsed.port).toBe(4242)
  })
})
