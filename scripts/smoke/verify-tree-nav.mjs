// Verifies FileExplorer roving-tabindex keyboard navigation in the real app:
// focuses the first treeitem, drives Arrow keys, and asserts focus moves and
// folders expand/collapse.

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
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-tree-'))

let electronProcess
let browser
const log = (m) => console.log(`[tree] ${m}`)

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
  await page.waitForSelector('[role="tree"] [role="treeitem"]', { timeout: 30000 })

  // Focus the first treeitem.
  await page.evaluate(() => {
    const first = document.querySelector('[role="tree"] [role="treeitem"]')
    first?.focus()
  })
  const firstName = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  log(`focused first row: ${firstName}`)

  // ArrowDown moves focus to the next row.
  await page.keyboard.press('ArrowDown')
  const secondName = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  if (secondName === firstName) throw new Error('ArrowDown did not move focus')
  log(`PASS: ArrowDown moved to: ${secondName}`)

  // ArrowUp returns.
  await page.keyboard.press('ArrowUp')
  const backName = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  if (backName !== firstName) throw new Error('ArrowUp did not return focus')
  log('PASS: ArrowUp returned focus')

  // Find a folder row, focus it, ArrowRight to expand.
  const expandedOk = await page.evaluate(async () => {
    const rows = Array.from(document.querySelectorAll('[role="treeitem"]'))
    const folder = rows.find((r) => r.getAttribute('data-dir') === 'true')
    if (!folder) return 'no-folder'
    folder.focus()
    return folder.getAttribute('aria-expanded')
  })
  if (expandedOk === 'no-folder') {
    log('SKIP: no folder at root to expand')
  } else {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(400)
    const nowExpanded = await page.evaluate(() => document.activeElement?.getAttribute('aria-expanded'))
    if (nowExpanded !== 'true') throw new Error('ArrowRight did not expand folder')
    log('PASS: ArrowRight expanded folder')

    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(200)
    const collapsed = await page.evaluate(() => document.activeElement?.getAttribute('aria-expanded'))
    if (collapsed !== 'false') throw new Error('ArrowLeft did not collapse folder')
    log('PASS: ArrowLeft collapsed folder')
  }

  // Single tab stop: exactly one treeitem has tabindex=0.
  const tabbable = await page.evaluate(() =>
    document.querySelectorAll('[role="treeitem"][tabindex="0"]').length,
  )
  if (tabbable !== 1) throw new Error(`expected 1 tabbable treeitem, found ${tabbable}`)
  log('PASS: single tab stop (roving tabindex)')
}

let failed = false
try {
  await run()
  console.log('\n[tree] ALL CHECKS PASSED')
} catch (err) {
  failed = true
  console.error('\n[tree] FAILED:', err.message)
} finally {
  await browser?.close().catch(() => {})
  electronProcess?.kill()
  try { rmSync(userDataDir, { recursive: true, force: true }) } catch {}
  process.exitCode = failed ? 1 : 0
}
