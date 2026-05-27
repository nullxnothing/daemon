#!/usr/bin/env node

const apiBase = (process.env.DAEMON_AI_API_BASE ?? '').replace(/\/+$/, '')
const runChat = process.env.DAEMON_AI_LIVE_SMOKE_CHAT === '1'
const requireAllLiveJwts = process.env.DAEMON_AI_REQUIRE_ALL_LIVE_JWTS === '1'
const releaseFinal = process.env.DAEMON_AI_RELEASE_FINAL === '1'
const allowNonProduction = process.env.DAEMON_AI_LIVE_ALLOW_NON_PRODUCTION === '1'

function envValue(name) {
  return process.env[name]?.trim() || ''
}

const smokeJwt = envValue('DAEMON_AI_SMOKE_JWT')
const proJwt = envValue('DAEMON_PRO_JWT')
const operatorJwt = envValue('DAEMON_OPERATOR_JWT')
const ultraJwt = envValue('DAEMON_ULTRA_JWT')
const adminSecret = envValue('DAEMON_PRO_ADMIN_SECRET') || envValue('DAEMON_ADMIN_SECRET')

const entitlementInputs = [
  {
    label: 'pro',
    token: proJwt || smokeJwt,
    expectedPlan: smokeJwt && !proJwt ? null : 'pro',
    allowedLane: 'standard',
    deniedLane: 'premium',
    chatLane: 'fast',
  },
  {
    label: 'operator',
    token: operatorJwt,
    expectedPlan: 'operator',
    allowedLane: 'reasoning',
    deniedLane: 'premium',
    chatLane: 'reasoning',
  },
  {
    label: 'ultra',
    token: ultraJwt,
    expectedPlan: 'ultra',
    allowedLane: 'premium',
    deniedLane: null,
    chatLane: 'premium',
  },
].filter((entry) => entry.token)

function fail(message) {
  console.error(`[daemon-ai-live] ${message}`)
  process.exit(1)
}

function isNonProductionBase(base) {
  try {
    const url = new URL(base)
    return [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
    ].includes(url.hostname) || /(?:^|[-.])(staging|preview|dev|test)(?:[-.]|$)/i.test(url.hostname)
  } catch {
    return true
  }
}

if (!apiBase) fail('Set DAEMON_AI_API_BASE to the hosted DAEMON AI API URL.')
if (releaseFinal && !allowNonProduction && isNonProductionBase(apiBase)) {
  fail('DAEMON_AI_RELEASE_FINAL=1 requires a production DAEMON_AI_API_BASE. Set DAEMON_AI_LIVE_ALLOW_NON_PRODUCTION=1 only for an intentional staging rehearsal.')
}
if (entitlementInputs.length === 0) {
  fail('Set DAEMON_PRO_JWT, DAEMON_OPERATOR_JWT, DAEMON_ULTRA_JWT, or DAEMON_AI_SMOKE_JWT to valid entitlement tokens.')
}
if (requireAllLiveJwts && entitlementInputs.some((entry) => entry.label === 'pro' && smokeJwt && !proJwt)) {
  fail('DAEMON_AI_REQUIRE_ALL_LIVE_JWTS=1 requires DAEMON_PRO_JWT, not only DAEMON_AI_SMOKE_JWT.')
}
if (requireAllLiveJwts) {
  for (const name of ['DAEMON_PRO_JWT', 'DAEMON_OPERATOR_JWT', 'DAEMON_ULTRA_JWT']) {
    if (!envValue(name)) fail(`DAEMON_AI_REQUIRE_ALL_LIVE_JWTS=1 requires ${name}.`)
  }
}

async function api(path, token, init = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-daemon-client': 'desktop-v4-live-smoke',
      ...(init.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || body?.ok === false) {
    throw new Error(`${path} failed with HTTP ${res.status}: ${body?.code ? `${body.code}: ` : ''}${body?.error ?? 'unknown error'}`)
  }
  return body?.data ?? body
}

async function expectForbidden(path, token, init = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-daemon-client': 'desktop-v4-live-smoke',
      ...(init.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => null)
  if (res.status !== 403 || body?.ok !== false) {
    throw new Error(`${path} should have returned HTTP 403, got HTTP ${res.status}`)
  }
  if (!body.requestId || typeof body.requestId !== 'string') {
    throw new Error(`${path} did not return a trace requestId`)
  }
  return body
}

async function expectUnauthorized(path, token, init = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-daemon-client': 'desktop-v4-live-smoke',
      ...(init.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => null)
  if (res.status !== 401 || body?.ok !== false || body?.code !== 'daemon_ai_auth_required') {
    throw new Error(`${path} should have returned sanitized HTTP 401 auth error, got HTTP ${res.status}`)
  }
  if (/subscription|signature|revoked|database|sql/i.test(String(body.error ?? ''))) {
    throw new Error(`${path} leaked verifier details in auth error`)
  }
  return body
}

function assertAllowedLanes(label, features, requiredLane) {
  if (!Array.isArray(features.allowedLanes)) {
    fail(`${label} /v1/ai/features did not return allowedLanes`)
  }
  if (!features.allowedLanes.includes(requiredLane)) {
    fail(`${label} JWT did not expose ${requiredLane} in allowedLanes`)
  }
  if (!features.lane || typeof features.lane !== 'string') {
    fail(`${label} /v1/ai/features did not return lane`)
  }
}

async function smokeEntitlement(entry, models) {
  const features = await api('/v1/ai/features', entry.token)
  if (!features.hostedAvailable || !Array.isArray(features.features) || !features.features.includes('daemon-ai')) {
    fail(`${entry.label} /v1/ai/features did not confirm hosted daemon-ai access`)
  }
  if (entry.expectedPlan && features.plan !== entry.expectedPlan) {
    fail(`${entry.label} JWT reported plan=${features.plan}, expected ${entry.expectedPlan}`)
  }
  assertAllowedLanes(entry.label, features, entry.allowedLane)

  const usage = await api('/v1/ai/usage', entry.token)
  for (const key of ['monthlyCredits', 'usedCredits', 'remainingCredits', 'resetAt']) {
    if (!Number.isFinite(Number(usage[key]))) fail(`${entry.label} /v1/ai/usage missing numeric ${key}`)
  }
  if (Array.isArray(usage.allowedLanes) && !usage.allowedLanes.includes(entry.allowedLane)) {
    fail(`${entry.label} /v1/ai/usage did not include ${entry.allowedLane} in allowedLanes`)
  }

  if (!models.some((model) => model.lane === entry.allowedLane && model.hosted === true)) {
    fail(`/v1/ai/models did not include hosted ${entry.allowedLane} lane`)
  }

  if (entry.deniedLane) {
    await expectForbidden('/v1/ai/chat', entry.token, {
      method: 'POST',
      body: JSON.stringify({
        requestId: `live-smoke-deny-${entry.label}-${Date.now()}`,
        mode: 'ask',
        message: `Verify ${entry.label} cannot use ${entry.deniedLane}.`,
        prompt: `Production entitlement denial smoke for ${entry.deniedLane}.`,
        usedContext: [],
        modelPreference: entry.deniedLane,
      }),
    })
  }

  if (runChat) {
    const chat = await api('/v1/ai/chat', entry.token, {
      method: 'POST',
      body: JSON.stringify({
        requestId: `live-smoke-${entry.label}-${Date.now()}`,
        mode: 'ask',
        message: 'Reply with a one-sentence DAEMON AI live smoke confirmation.',
        prompt: 'This is a production readiness smoke test. Reply with one concise sentence.',
        usedContext: [],
        modelPreference: entry.chatLane,
      }),
    })
    if (!chat.text || !chat.usage || !Number.isFinite(Number(chat.usage.daemonCreditsCharged))) {
      fail(`${entry.label} /v1/ai/chat did not return text and charge usage`)
    }
    if (!chat.requestId || typeof chat.requestId !== 'string') {
      fail(`${entry.label} /v1/ai/chat did not return a trace requestId`)
    }
    console.log(`[daemon-ai-live] ${entry.label} chat ok provider=${chat.provider ?? 'unknown'} model=${chat.model ?? 'unknown'} credits=${chat.usage.daemonCreditsCharged}`)
  }

  console.log(`[daemon-ai-live] ${entry.label} ok plan=${features.plan} lane=${features.lane} remaining=${usage.remainingCredits}/${usage.monthlyCredits}`)
}

const health = await fetch(`${apiBase}/health`).then((res) => res.json())
if (health?.ok !== true) fail('/health did not return ok=true')

const readyRes = await fetch(`${apiBase}/health/ready`)
const readiness = await readyRes.json().catch(() => null)
if (!readyRes.ok || readiness?.ok !== true) {
  fail('/health/ready did not return ok=true')
}

if (releaseFinal) {
  if (!adminSecret) fail('DAEMON_AI_RELEASE_FINAL=1 requires DAEMON_PRO_ADMIN_SECRET or DAEMON_ADMIN_SECRET for readiness details.')
  const detailsRes = await fetch(`${apiBase}/health/ready/details`, {
    headers: { 'x-admin-secret': adminSecret },
  })
  const details = await detailsRes.json().catch(() => null)
  if (!detailsRes.ok || details?.ok !== true || details?.ready !== true) {
    fail('/health/ready/details did not return ready=true.')
  }
  if (!Array.isArray(details.providers) || details.providers.length === 0) {
    fail('/health/ready/details reported no hosted model providers.')
  }
  if (details.storage?.persistentHint !== true) {
    fail('/health/ready/details did not confirm persistent storage. Set DAEMON_AI_CLOUD_DB_PATH to a persistent disk path and DAEMON_AI_REQUIRE_PERSISTENT_STORAGE=1.')
  }
}

await expectUnauthorized('/v1/ai/features', 'invalid-live-smoke-token')

const models = await api('/v1/ai/models', entitlementInputs[0].token)
if (!Array.isArray(models) || !models.some((model) => model.lane === 'standard' && model.hosted === true)) {
  fail('/v1/ai/models did not include a hosted standard lane')
}

for (const entry of entitlementInputs) {
  await smokeEntitlement(entry, models)
}

if (!runChat) {
  console.log('[daemon-ai-live] contract ok; set DAEMON_AI_LIVE_SMOKE_CHAT=1 to run paid provider chat smokes')
}

console.log(`[daemon-ai-live] base=${apiBase} entitlements=${entitlementInputs.map((entry) => entry.label).join(',')} models=${models.length}`)
