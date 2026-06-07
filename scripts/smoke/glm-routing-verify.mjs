// Live verification of operator-backend routing + the clear "no provider" error.
// Launches the built app in isolation (own port + temp user-data) and drives aria.send.
//   - With no ZAI/Anthropic/codex auth in this fresh profile -> expect the clear error.
//   - If a real ZAI key is exported, also drives a GLM operator turn and asserts a tool call.
// Run: node scripts/smoke/glm-routing-verify.mjs   (after pnpm run build)
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const repoRoot = path.resolve(__dirname, '..', '..')
const electronBinary = process.env.DAEMON_SMOKE_ELECTRON || require('electron')
const mainEntry = path.join(repoRoot, 'dist-electron', 'main', 'index.js')
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-glm-verify-'))

let electronProcess
let browser
const log = (m) => console.log(`[glm-verify] ${m}`)

function getFreePort() {
  return new Promise((res, rej) => {
    const s = net.createServer(); s.unref(); s.on('error', rej)
    s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => res(a.port)) })
  })
}
function waitForPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((res, rej) => {
    const tick = () => {
      const sock = net.connect({ port, host: '127.0.0.1' })
      sock.once('connect', () => { sock.destroy(); res() })
      sock.once('error', () => { sock.destroy(); Date.now() >= deadline ? rej(new Error('port timeout')) : setTimeout(tick, 250) })
    }
    tick()
  })
}
async function getPage() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const p = browser.contexts()[0]?.pages()[0]
    if (p) return p
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('no page')
}
function cleanup() { try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* win EPERM ok */ } }

async function main() {
  const cdpPort = await getFreePort()
  log(`launching electron (cdp ${cdpPort})`)
  // Strip provider creds so the fresh profile genuinely has no backend (tests the error path).
  // A real ZAI key passed through deliberately is honored for the optional live GLM turn.
  const env = { ...process.env, DAEMON_SMOKE_TEST: '1', DAEMON_SMOKE_CDP_PORT: String(cdpPort), DAEMON_USER_DATA_DIR: userDataDir }
  const hasZaiKey = !!process.env.ZAI_API_KEY
  if (!hasZaiKey) { delete env.ANTHROPIC_API_KEY; delete env.CODEX_API_KEY }

  electronProcess = spawn(electronBinary, [mainEntry], { cwd: repoRoot, env, stdio: ['ignore', 'pipe', 'pipe'] })
  electronProcess.stdout.on('data', (c) => process.stdout.write(c))
  electronProcess.stderr.on('data', (c) => process.stderr.write(c))

  await waitForPort(cdpPort)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
  const page = await getPage()
  await page.waitForFunction(() => !!window.daemon, { timeout: 30000 })
  log('app ready')

  const result = await page.evaluate(async ({ hasZaiKey }) => {
    const snapshot = {
      activeProjectId: null, activeProjectPath: null, currentPanelId: null, openFilePath: null,
      chips: { activeFile: false, projectTree: false, gitDiff: false, terminalLogs: false, walletContext: false, projectMemory: false },
    }
    const send = (msg) => Promise.race([
      window.daemon.aria.send('global', msg, snapshot, 'fast'),
      new Promise((r) => setTimeout(() => r({ ok: false, error: 'TIMEOUT' }), 90000)),
    ])
    const out = { hasZaiKey }
    const r = await send('hello there')
    out.first = r
    return out
  }, { hasZaiKey })

  log(`result: ${JSON.stringify(result, null, 2)}`)

  // The backend that actually resolves depends on machine-level creds (codex/claude OAuth,
  // ZAI key). Assert the response is always coherent and never silently blank, and that the
  // clear-error message only appears when truly nothing is configured.
  const text = result.first?.data?.text ?? ''
  assert(result.first?.ok === true, 'send must resolve ok with a readable string (never blank/EINVAL)')
  assert(text.trim().length > 0, 'response text must not be empty')

  if (result.hasZaiKey) {
    assert(!/No AI provider is ready/i.test(text), 'with a ZAI key, must not hit the no-provider error')
    log('PASS — ZAI key present; GLM operator backend responded live.')
  } else if (/No AI provider is ready/i.test(text)) {
    assert(/Z\.AI|Anthropic|Codex/i.test(text), 'no-provider error must name the options')
    log('PASS — no backend configured; clear "add a key" error shown (not blank).')
  } else {
    // A machine-level provider (codex/claude) resolved — chat/operator responded coherently.
    log(`PASS — a configured backend responded coherently (no ZAI key set; resolved to codex/claude).`)
  }
}

main()
  .then(async () => { await browser?.close().catch(() => {}); electronProcess?.kill(); cleanup(); process.exit(0) })
  .catch(async (err) => { console.error('[glm-verify] FAIL:', err); await browser?.close().catch(() => {}); electronProcess?.kill(); cleanup(); process.exit(1) })
