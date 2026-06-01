#!/usr/bin/env node

import { spawn } from 'node:child_process'

const apiBase = (process.env.DAEMON_AI_API_BASE ?? '').replace(/\/+$/, '')
const requiredJwtVars = ['DAEMON_PRO_JWT', 'DAEMON_OPERATOR_JWT', 'DAEMON_ULTRA_JWT']
const adminSecret = process.env.DAEMON_PRO_ADMIN_SECRET?.trim() || process.env.DAEMON_ADMIN_SECRET?.trim()

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
if (!adminSecret) {
  fail('Set DAEMON_PRO_ADMIN_SECRET or DAEMON_ADMIN_SECRET to verify production readiness details.')
}

const readyRes = await fetch(`${apiBase}/health/ready`)
const readiness = await readyRes.json().catch(() => null)
if (!readyRes.ok || readiness?.ok !== true) {
  fail('/health/ready is not production-ready.')
}

const detailsRes = await fetch(`${apiBase}/health/ready/details`, {
  headers: { 'x-admin-secret': adminSecret },
})
const details = await detailsRes.json().catch(() => null)
if (!detailsRes.ok || details?.ok !== true || details?.ready !== true) {
  fail('/health/ready/details is not production-ready.')
}

if (!Array.isArray(details.providers) || details.providers.length === 0) {
  fail('/health/ready/details reported no hosted model providers.')
}

if (details.storage?.persistentHint !== true) {
  fail('/health/ready/details did not confirm persistent storage. Attach persistent disk storage and set DAEMON_AI_REQUIRE_PERSISTENT_STORAGE=1.')
}

await runNode(['scripts/smoke/daemon-ai-live.mjs'], {
  DAEMON_AI_RELEASE_FINAL: '1',
  DAEMON_AI_REQUIRE_ALL_LIVE_JWTS: '1',
})

console.log(`[v4-live-gate] passed base=${apiBase} providers=${details.providers.join(',')}`)
