#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const root = process.cwd()
const secret = `daemon-ai-local-smoke-${crypto.randomUUID()}`
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-ai-cloud-'))
let cloudProcess = null
let fakeOpenAiServer = null
let cloudExited = false

function log(message) {
  console.log(`[daemon-ai-cloud-local] ${message}`)
}

function fail(message) {
  throw new Error(`[daemon-ai-cloud-local] ${message}`)
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function signJwt(claims) {
  const header = base64urlJson({ alg: 'HS256', typ: 'JWT' })
  const payload = base64urlJson(claims)
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') reject(new Error('Server did not bind to a TCP port'))
      else resolve(address.port)
    })
  })
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

async function reservePort() {
  const server = http.createServer()
  const port = await listen(server)
  await closeServer(server)
  return port
}

async function startFakeOpenAi() {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/responses') {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'not found' } }))
      return
    }

    let rawBody = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      rawBody += chunk
    })
    req.on('end', () => {
      const request = JSON.parse(rawBody || '{}')
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        id: `resp_${Date.now()}`,
        output_text: `DAEMON AI cloud local smoke confirmed for ${request.metadata?.daemon_model_lane ?? 'unknown'}.`,
        usage: {
          input_tokens: 24,
          output_tokens: 11,
          input_tokens_details: { cached_tokens: 0 },
        },
      }))
    })
  })
  const port = await listen(server)
  return { server, baseUrl: `http://127.0.0.1:${port}` }
}

function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
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

async function waitForReady(baseUrl, child) {
  const deadline = Date.now() + 15_000
  let childExit = null
  child.once('exit', (code, signal) => {
    childExit = signal ?? code
  })

  while (Date.now() < deadline) {
    if (childExit !== null) fail(`cloud server exited before readiness: ${childExit}`)
    try {
      const res = await fetch(`${baseUrl}/health/ready`)
      const body = await res.json().catch(() => null)
      if (res.ok && body?.ok === true) return body
    } catch {
      // Server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  fail('timed out waiting for /health/ready')
}

async function cleanup() {
  if (cloudProcess && !cloudExited && !cloudProcess.killed) {
    cloudProcess.kill()
    await Promise.race([
      new Promise((resolve) => cloudProcess.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ])
  }
  await closeServer(fakeOpenAiServer)
  fs.rmSync(tempDir, { recursive: true, force: true })
}

process.once('SIGINT', async () => {
  await cleanup()
  process.exit(130)
})

try {
  const fakeOpenAi = await startFakeOpenAi()
  fakeOpenAiServer = fakeOpenAi.server
  const cloudPort = await reservePort()
  const baseUrl = `http://127.0.0.1:${cloudPort}`
  const env = {
    DAEMON_AI_CLOUD_HOST: '127.0.0.1',
    DAEMON_AI_CLOUD_PORT: String(cloudPort),
    DAEMON_AI_CLOUD_DB_PATH: path.join(tempDir, 'daemon-ai-cloud.db'),
    DAEMON_AI_JWT_SECRET: secret,
    DAEMON_PRO_JWT_SECRET: '',
    DAEMON_PRO_PAY_TO: '11111111111111111111111111111111',
    DAEMON_PRO_ADMIN_SECRET: `admin-${secret}`,
    SOLANA_RPC_URL: 'http://127.0.0.1:8899',
    DAEMON_AI_ALLOW_UNBACKED_JWT: '1',
    OPENAI_API_KEY: 'local-smoke-openai-key',
    OPENAI_BASE_URL: fakeOpenAi.baseUrl,
    ANTHROPIC_API_KEY: '',
  }

  cloudProcess = spawn(process.execPath, ['dist-cloud/daemon-ai-cloud-server.mjs'], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  cloudProcess.stdout.on('data', (chunk) => process.stdout.write(chunk))
  cloudProcess.stderr.on('data', (chunk) => process.stderr.write(chunk))
  cloudProcess.once('exit', () => {
    cloudExited = true
  })
  cloudProcess.once('error', (error) => {
    cloudExited = true
    throw error
  })

  const readiness = await waitForReady(baseUrl, cloudProcess)
  log(`ready providers=${readiness.providers.join(',') || 'none'}`)

  const token = signJwt({
    sub: 'local-smoke-user',
    walletAddress: 'local-smoke-wallet',
    plan: 'pro',
    lane: 'standard',
    allowedLanes: ['auto', 'fast', 'standard'],
    accessSource: 'payment',
    features: ['daemon-ai'],
    monthlyCredits: 1000,
    usedCredits: 0,
    exp: Math.floor(Date.now() / 1000) + 300,
  })

  await runNode(['scripts/smoke/daemon-ai-live.mjs'], {
    DAEMON_AI_API_BASE: baseUrl,
    DAEMON_AI_SMOKE_JWT: token,
    DAEMON_AI_LIVE_SMOKE_CHAT: '1',
  })

  log('passed')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await cleanup()
}
