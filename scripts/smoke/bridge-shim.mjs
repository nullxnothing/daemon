/**
 * Bridge shim smoke — drives the built MCP shim (dist-bridge/daemon-bridge-shim.mjs)
 * over real stdio against an in-process fake of the DAEMON bridge server.
 * No Electron involved: this validates the shim half of the contract —
 * MCP handshake, tools/list from the live endpoint, tools/call round-trip
 * (including bearer auth), and the "DAEMON is not running" path.
 *
 * Run: pnpm run test:bridge-shim
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const shimPath = path.join(repoRoot, 'dist-bridge', 'daemon-bridge-shim.mjs')

const TOKEN = 'f'.repeat(64)
const TOOLS = [
  { name: 'read_wallet', description: 'List wallets', risk: 'read', inputSchema: { type: 'object', properties: {} } },
  { name: 'remember_fact', description: 'Store a fact', risk: 'write', inputSchema: { type: 'object', properties: { title: { type: 'string' }, value: { type: 'string' } }, required: ['title', 'value'] } },
]

function log(message) {
  console.log(`[bridge-shim-smoke] ${message}`)
}

// --- Fake DAEMON bridge server ---------------------------------------------
const seenCalls = []
const fakeServer = http.createServer((req, res) => {
  const send = (code, payload) => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(payload))
  }
  const authed = req.headers.authorization === `Bearer ${TOKEN}`
  if (req.method === 'GET' && req.url === '/bridge/ping') {
    return send(200, { ok: true, data: { app: 'daemon', version: 'smoke', running: true } })
  }
  if (!authed) return send(404, { ok: false, error: 'Not found' })
  if (req.method === 'GET' && req.url === '/bridge/tools') {
    return send(200, { ok: true, data: TOOLS })
  }
  if (req.method === 'POST' && req.url === '/bridge/call') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      const call = JSON.parse(body)
      seenCalls.push(call)
      if (call.toolName === 'remember_fact') {
        return send(200, { ok: true, data: { status: 'rejected', summary: 'User rejected this action.' } })
      }
      return send(200, { ok: true, data: { status: 'done', summary: '2 wallets', result: { count: 2 } } })
    })
    return
  }
  return send(404, { ok: false, error: 'Not found' })
})

await new Promise((resolve) => fakeServer.listen(0, '127.0.0.1', resolve))
const port = fakeServer.address().port
log(`fake bridge listening on ${port}`)

// --- Temp bridge.json --------------------------------------------------------
const sandbox = mkdtempSync(path.join(tmpdir(), 'daemon-bridge-smoke-'))
const infoFile = path.join(sandbox, 'bridge.json')
writeFileSync(infoFile, JSON.stringify({ token: TOKEN, port, pid: 0, version: 'smoke', updatedAt: Date.now() }))

// --- Spawn shim and speak newline-delimited JSON-RPC -------------------------
const shim = spawn(process.execPath, [shimPath], {
  env: { ...process.env, DAEMON_BRIDGE_INFO: infoFile },
  stdio: ['pipe', 'pipe', 'pipe'],
})
shim.stderr.on('data', (chunk) => process.stderr.write(`[shim] ${chunk}`))

let buffer = ''
const pending = new Map()
shim.stdout.on('data', (chunk) => {
  buffer += chunk.toString()
  let index
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (!line) continue
    const message = JSON.parse(line)
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    }
  }
})

let nextId = 0
function rpc(method, params, timeoutMs = 15_000) {
  const id = ++nextId
  const payload = { jsonrpc: '2.0', id, method, params }
  shim.stdin.write(JSON.stringify(payload) + '\n')
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeoutMs)
    pending.set(id, (message) => { clearTimeout(timer); resolve(message) })
  })
}

function notify(method, params) {
  shim.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
}

let exitCode = 0
try {
  // 1. MCP handshake
  const init = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'bridge-shim-smoke', version: '1.0.0' },
  })
  assert.equal(init.result.serverInfo.name, 'daemon-bridge')
  notify('notifications/initialized', {})
  log('handshake ok')

  // 2. tools/list reflects the live endpoint, with approval note on write tools
  const list = await rpc('tools/list', {})
  const names = list.result.tools.map((t) => t.name)
  assert.deepEqual(names, ['read_wallet', 'remember_fact'])
  assert.match(
    list.result.tools.find((t) => t.name === 'remember_fact').description,
    /Requires user approval inside the DAEMON app/,
  )
  log(`tools/list ok (${names.join(', ')})`)

  // 3. tools/call round-trip carries cwd + auth and renders the result
  const call = await rpc('tools/call', { name: 'read_wallet', arguments: {} })
  assert.equal(call.result.isError, undefined)
  assert.match(call.result.content[0].text, /2 wallets/)
  assert.equal(seenCalls[0].toolName, 'read_wallet')
  assert.ok(typeof seenCalls[0].cwd === 'string' && seenCalls[0].cwd.length > 0, 'cwd forwarded')
  log('tools/call ok')

  // 4. rejection surfaces as a clear isError result
  const rejected = await rpc('tools/call', { name: 'remember_fact', arguments: { title: 't', value: 'v' } })
  assert.equal(rejected.result.isError, true)
  assert.match(rejected.result.content[0].text, /rejected this action in DAEMON/)
  log('rejection path ok')

  // 5. DAEMON down → clear "not running" error
  await new Promise((resolve) => fakeServer.close(resolve))
  const down = await rpc('tools/call', { name: 'read_wallet', arguments: {} })
  assert.equal(down.result.isError, true)
  assert.match(down.result.content[0].text, /DAEMON is not running/)
  log('not-running path ok')

  log('PASS')
} catch (error) {
  exitCode = 1
  console.error('[bridge-shim-smoke] FAIL:', error)
} finally {
  shim.kill()
  await new Promise((resolve) => fakeServer.close(() => resolve())).catch(() => {})
  rmSync(sandbox, { recursive: true, force: true })
}
process.exit(exitCode)
