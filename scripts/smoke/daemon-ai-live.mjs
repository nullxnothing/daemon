#!/usr/bin/env node

const apiBase = (process.env.DAEMON_AI_API_BASE ?? '').replace(/\/+$/, '')
const token = process.env.DAEMON_PRO_JWT ?? process.env.DAEMON_AI_SMOKE_JWT ?? ''
const runChat = process.env.DAEMON_AI_LIVE_SMOKE_CHAT === '1'

function fail(message) {
  console.error(`[daemon-ai-live] ${message}`)
  process.exit(1)
}

if (!apiBase) fail('Set DAEMON_AI_API_BASE to the hosted DAEMON AI API URL.')
if (!token) fail('Set DAEMON_PRO_JWT or DAEMON_AI_SMOKE_JWT to a valid Pro/holder entitlement token.')

async function api(path, init = {}) {
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

const health = await fetch(`${apiBase}/health`).then((res) => res.json())
if (health?.ok !== true) fail('/health did not return ok=true')

const features = await api('/v1/ai/features')
if (!features.hostedAvailable || !Array.isArray(features.features) || !features.features.includes('daemon-ai')) {
  fail('/v1/ai/features did not confirm hosted daemon-ai access')
}

const usage = await api('/v1/ai/usage')
for (const key of ['monthlyCredits', 'usedCredits', 'remainingCredits', 'resetAt']) {
  if (!Number.isFinite(Number(usage[key]))) fail(`/v1/ai/usage missing numeric ${key}`)
}

const models = await api('/v1/ai/models')
if (!Array.isArray(models) || !models.some((model) => model.lane === 'standard' && model.hosted === true)) {
  fail('/v1/ai/models did not include a hosted standard lane')
}

if (runChat) {
  const chat = await api('/v1/ai/chat', {
    method: 'POST',
    body: JSON.stringify({
      requestId: `live-smoke-${Date.now()}`,
      mode: 'ask',
      message: 'Reply with a one-sentence DAEMON AI live smoke confirmation.',
      prompt: 'This is a production readiness smoke test. Reply with one concise sentence.',
      usedContext: [],
      modelPreference: 'fast',
    }),
  })
  if (!chat.text || !chat.usage || !Number.isFinite(Number(chat.usage.daemonCreditsCharged))) {
    fail('/v1/ai/chat did not return text and charge usage')
  }
  console.log(`[daemon-ai-live] chat ok provider=${chat.provider ?? 'unknown'} model=${chat.model ?? 'unknown'} credits=${chat.usage.daemonCreditsCharged}`)
} else {
  console.log('[daemon-ai-live] contract ok; set DAEMON_AI_LIVE_SMOKE_CHAT=1 to run a paid provider chat smoke')
}

console.log(`[daemon-ai-live] base=${apiBase} plan=${features.plan} remaining=${usage.remainingCredits}/${usage.monthlyCredits} models=${models.length}`)
