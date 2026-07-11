/**
 * DAEMON Lite packaged smoke: boot the packaged Lite exe with a fresh
 * userData sandbox, assert onboarding renders, bypass it, assert the home
 * shell mounts and aria:models round-trips. Mirrors packaged-app-smoke.mjs.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const defaultExePath = path.join(
  repoRoot, 'release-lite', pkg.version, 'win-unpacked',
  process.platform === 'win32' ? 'DAEMON.exe' : 'DAEMON',
)
const packagedExe = process.env.DAEMON_PACKAGED_EXE || defaultExePath

const sandboxRoot = mkdtempSync(path.join(tmpdir(), 'daemon-lite-smoke-'))
const userDataDir = path.join(sandboxRoot, 'userData')

let appProcess
let browser

function logStep(message) {
  console.log(`[lite-smoke] ${message}`)
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolve(address.port))
    })
  })
}

function waitForPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.connect({ port, host: '127.0.0.1' })
      socket.once('connect', () => { socket.destroy(); resolve() })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for port ${port}`))
        setTimeout(tryConnect, 250)
      })
    }
    tryConnect()
  })
}

async function main() {
  assert.ok(existsSync(packagedExe), `packaged Lite exe missing: ${packagedExe} — run package:lite first`)
  const cdpPort = await getFreePort()

  logStep(`launching ${packagedExe}`)
  appProcess = spawn(packagedExe, [], {
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      DAEMON_SMOKE_TEST: '1',
      DAEMON_SMOKE_CDP_PORT: String(cdpPort),
      DAEMON_USER_DATA_DIR: userDataDir,
    },
    stdio: 'ignore',
    detached: false,
  })

  await waitForPort(cdpPort)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
  const context = browser.contexts()[0]
  const page = context.pages().find((p) => p.url().includes('lite.html')) ?? context.pages()[0]
  assert.ok(page, 'no renderer page found over CDP')

  logStep('waiting for onboarding')
  await page.waitForSelector('text=Your AI coding agent.', { timeout: 30000 })

  logStep('bypassing onboarding')
  await page.evaluate(() => window.daemon.lite.setOnboardingComplete(true))
  await page.reload()

  logStep('waiting for home shell')
  await page.waitForSelector('text=New chat', { timeout: 30000 })
  await page.waitForSelector('textarea', { timeout: 15000 })

  logStep('checking aria:models round-trip')
  const models = await page.evaluate(() => window.daemon.aria.models())
  assert.equal(models.ok, true, `aria:models failed: ${models.error ?? 'unknown'}`)
  assert.ok(Array.isArray(models.data) && models.data.length > 0, 'aria:models returned no models')

  logStep('checking pop-out browser allowlist')
  const disallowed = await page.evaluate(() => window.daemon.lite.popoutOpen('http://evil.example.com'))
  assert.equal(disallowed.data?.opened, false, 'pop-out allowlist should reject remote http')
  const allowed = await page.evaluate(() => window.daemon.lite.popoutOpen('https://example.com'))
  assert.equal(allowed.data?.opened, true, 'pop-out should open an https URL')

  logStep('checking Tools section reveal + Scanner route')
  // Start collapsed, then expand via the Tools header so the state is deterministic.
  await page.evaluate(() => window.daemon.lite.setShowTools(false))
  await page.reload()
  await page.click('text=Tools')
  await page.click('text=Scanner')
  await page.waitForSelector('text=/check authorities, snipers, and bundles/', { timeout: 15000 })

  logStep(`PASS — onboarding, shell, ${models.data.length} models, pop-out, and tools verified`)
}

main()
  .then(() => process.exitCode = 0)
  .catch((err) => {
    console.error('[lite-smoke] FAIL:', err.message)
    process.exitCode = 1
  })
  .finally(async () => {
    try { await browser?.close() } catch { /* already closed */ }
    try { appProcess?.kill() } catch { /* already dead */ }
    setTimeout(() => {
      try { rmSync(sandboxRoot, { recursive: true, force: true }) } catch { /* locked on Windows */ }
      process.exit(process.exitCode ?? 0)
    }, 1500)
  })
