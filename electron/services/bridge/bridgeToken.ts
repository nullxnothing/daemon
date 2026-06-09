/**
 * Bridge token + runtime-info file. The shim authenticates to the loopback
 * bridge server with a bearer token it reads from `<userData>/bridge/bridge.json`.
 *
 * Windows note: chmod 0o600 is a no-op on NTFS. The file lives under the user's
 * profile (%APPDATA%), whose default ACLs already block other non-admin users;
 * explicit `icacls` hardening is a documented follow-up, not v1.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export interface BridgeRuntimeInfo {
  token: string
  port: number
  pid: number
  version: string
  updatedAt: number
}

function bridgeDir(userDataDir: string): string {
  return path.join(userDataDir, 'bridge')
}

export function bridgeInfoFile(userDataDir: string): string {
  return path.join(bridgeDir(userDataDir), 'bridge.json')
}

function readInfo(file: string): Partial<BridgeRuntimeInfo> {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<BridgeRuntimeInfo>
  } catch {
    return {}
  }
}

function writeInfo(file: string, info: BridgeRuntimeInfo): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(info, null, 2), { encoding: 'utf8', mode: 0o600 })
}

/** Return the persisted token, creating one on first run. */
export function ensureBridgeToken(userDataDir: string): { token: string; file: string } {
  const file = bridgeInfoFile(userDataDir)
  const existing = readInfo(file)
  if (typeof existing.token === 'string' && existing.token.length >= 32) {
    return { token: existing.token, file }
  }
  const token = crypto.randomBytes(32).toString('hex')
  writeInfo(file, {
    token,
    port: typeof existing.port === 'number' ? existing.port : 0,
    pid: process.pid,
    version: process.env.npm_package_version ?? '0.0.0',
    updatedAt: Date.now(),
  })
  return { token, file }
}

/** Record the live port/pid so shims can discover the running server. */
export function writeBridgeRuntimeInfo(userDataDir: string, info: { port: number; token: string; version?: string }): void {
  const file = bridgeInfoFile(userDataDir)
  writeInfo(file, {
    token: info.token,
    port: info.port,
    pid: process.pid,
    version: info.version ?? process.env.npm_package_version ?? '0.0.0',
    updatedAt: Date.now(),
  })
}

/** Replace the token. Shims re-read bridge.json per process start, so rotation is safe. */
export function rotateBridgeToken(userDataDir: string): string {
  const file = bridgeInfoFile(userDataDir)
  const existing = readInfo(file)
  const token = crypto.randomBytes(32).toString('hex')
  writeInfo(file, {
    token,
    port: typeof existing.port === 'number' ? existing.port : 0,
    pid: process.pid,
    version: typeof existing.version === 'string' ? existing.version : '0.0.0',
    updatedAt: Date.now(),
  })
  return token
}
