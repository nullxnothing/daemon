#!/usr/bin/env node

import { spawn } from 'node:child_process'

const apiBase = (process.env.DAEMON_AI_API_BASE ?? '').replace(/\/+$/, '')
const requiredJwtVars = ['DAEMON_PRO_JWT', 'DAEMON_OPERATOR_JWT', 'DAEMON_ULTRA_JWT']

function fail(message) {
  console.error(`[v4-live-gate] ${message}`)
  process.exit(1)
}

function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${args.join(' ')} exited with ${signal ?? code}`))
    })
    child.once('error', reject)
  })
}

if (!apiBase) {
  fail('Set DAEMON_AI_API_BASE to the production DAEMON AI Cloud URL.')
}

for (const name of requiredJwtVars) {
  if (!process.env[name]?.trim()) {
    fail(`Set ${name} to a real wallet-issued live entitlement JWT.`)
  }
}

const readyRes = await fetch(`${apiBase}/health/ready`)
const readiness = await readyRes.json().catch(() => null)
if (!readyRes.ok || readiness?.ok !== true || readiness?.ready !== true) {
  const missing = Array.isArray(readiness?.missing) && readiness.missing.length
    ? ` Missing: ${readiness.missing.join(', ')}.`
    : ''
  fail(`/health/ready is not production-ready.${missing}`)
}

if (!Array.isArray(readiness.providers) || readiness.providers.length === 0) {
  fail('/health/ready reported no hosted model providers.')
}

if (readiness.storage?.persistentHint !== true) {
  fail('/health/ready did not confirm persistent storage. Attach persistent disk storage and set DAEMON_AI_REQUIRE_PERSISTENT_STORAGE=1.')
}

await runNode(['scripts/smoke/daemon-ai-live.mjs'], {
  DAEMON_AI_RELEASE_FINAL: '1',
  DAEMON_AI_REQUIRE_ALL_LIVE_JWTS: '1',
})

console.log(`[v4-live-gate] passed base=${apiBase} providers=${readiness.providers.join(',')}`)
