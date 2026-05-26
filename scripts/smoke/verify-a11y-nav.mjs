// Verifies the new keyboard/focus features in the real app:
//  - '?' opens the keyboard-shortcuts overlay (and Escape closes it)
//  - command drawer grid responds to ArrowRight (focus moves between cards)
//  - AgentLauncher modal traps Tab (focus stays inside the dialog)

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
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-a11y-'))

let electronProcess
let browser
const log = (m) => console.log(`[a11y] ${m}`)

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
      sock.once('error', () => { sock.destroy(); Date.now() >= deadline ? rej(new Error('timeout')) : setTimeout(tick, 250) })
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

async function run() {
  const cdpPort = await getFreePort()
  electronProcess = spawn(electronBinary, [mainEntry], {
    cwd: repoRoot,
    env: { ...process.env, DAEMON_SMOKE_TEST: '1', DAEMON_SMOKE_CDP_PORT: String(cdpPort), DAEMON_USER_DATA_DIR: userDataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  electronProcess.stdout.on('data', () => {})
  electronProcess.stderr.on('data', () => {})

  await waitForPort(cdpPort)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
  const page = await getPage()
  await page.waitForFunction(() => !!window.daemon, { timeout: 30000 })

  await page.evaluate(async (projectPath) => {
    await window.daemon.settings.setOnboardingComplete(true)
    const list = await window.daemon.projects.list()
    if (!(list.ok && list.data?.some((p) => p.path === projectPath))) {
      await window.daemon.projects.create({ name: 'DAEMON', path: projectPath })
    }
  }, repoRoot)
  await page.reload()
  await page.waitForSelector('.app[data-app-ready="true"]', { timeout: 30000 })

  // 1) '?' opens the shortcuts overlay; Escape closes it.
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur())
  await page.keyboard.press('?')
  await page.waitForSelector('.shortcuts-modal', { timeout: 8000 })
  log('PASS: "?" opened keyboard-shortcuts overlay')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.shortcuts-modal', { state: 'detached', timeout: 8000 })
  log('PASS: Escape closed the overlay')

  // 2) Command drawer grid: ArrowRight moves focus between cards.
  await page.keyboard.press('Control+k')
  await page.waitForSelector('.drawer-tool-card', { timeout: 8000 })
  await page.evaluate(() => {
    const first = document.querySelector('.drawer-tool-card')
    if (first instanceof HTMLElement) first.focus()
  })
  const before = await page.evaluate(() => document.activeElement?.textContent?.slice(0, 24))
  await page.keyboard.press('ArrowRight')
  const after = await page.evaluate(() => document.activeElement?.textContent?.slice(0, 24))
  if (before === after) throw new Error('ArrowRight did not move focus in drawer grid')
  log(`PASS: drawer ArrowRight moved focus (${before?.trim()} -> ${after?.trim()})`)
  await page.keyboard.press('Escape').catch(() => {})
  // Ensure the drawer is fully gone before opening the next modal.
  await page.waitForSelector('.command-drawer', { state: 'detached', timeout: 8000 }).catch(() => {})

  // 3) AgentLauncher traps Tab: focus stays within the dialog after many tabs.
  await page.keyboard.press('Control+Shift+A')
  await page.waitForSelector('.agent-launcher[role="dialog"]', { timeout: 8000 })
  // Wait for the trap/auto-focus to land inside the dialog before tabbing.
  await page.waitForFunction(() => {
    const dialog = document.querySelector('.agent-launcher[role="dialog"]')
    return dialog?.contains(document.activeElement) ?? false
  }, { timeout: 5000 }).catch(() => {})
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('Tab')
  const diag = await page.evaluate(() => {
    const dialog = document.querySelector('.agent-launcher[role="dialog"]')
    const ae = document.activeElement
    return {
      inside: dialog?.contains(ae) ?? false,
      active: ae ? `${ae.tagName}.${(ae.className || '').toString().slice(0, 30)}` : 'none',
      dialogPresent: !!dialog,
      focusables: dialog ? dialog.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])').length : 0,
    }
  })
  log(`diag: ${JSON.stringify(diag)}`)
  if (!diag.inside) throw new Error('focus escaped the AgentLauncher modal')
  log('PASS: AgentLauncher traps Tab focus')
  await page.keyboard.press('Escape').catch(() => {})
}

let failed = false
try {
  await run()
  console.log('\n[a11y] ALL CHECKS PASSED')
} catch (err) {
  failed = true
  console.error('\n[a11y] FAILED:', err.message)
} finally {
  await browser?.close().catch(() => {})
  electronProcess?.kill()
  try { rmSync(userDataDir, { recursive: true, force: true }) } catch {}
  process.exitCode = failed ? 1 : 0
}
