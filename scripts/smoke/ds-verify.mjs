import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const repoRoot = path.resolve(__dirname, '..', '..')
const electronBinary = require('electron')
const mainEntry = path.join(repoRoot, 'dist-electron', 'main', 'index.js')
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-ds-verify-'))
const outDir = path.join(repoRoot, 'test-results', 'ds-verify')
mkdirSync(outDir, { recursive: true })

const projectPath = repoRoot
const projectName = 'DAEMON DS Verify'

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
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
        if (Date.now() >= deadline) return reject(new Error(`port ${port} timeout`))
        setTimeout(tryConnect, 250)
      })
    }
    tryConnect()
  })
}

async function getPage(browser) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const page = browser?.contexts()?.[0]?.pages()?.[0]
    if (page) return page
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('no page')
}

async function ready(page) {
  await page.waitForFunction(() => !!window.daemon, { timeout: 30000 })
  await page.waitForSelector('.main-layout', { timeout: 30000 })
}

async function seed(page) {
  await page.evaluate(async ({ projectPath, projectName }) => {
    await window.daemon.settings.setOnboardingComplete(true)
    await window.daemon.settings.setDrawerToolOrder([])
    await window.daemon.settings.setShowTitlebarWallet(true)
    await window.daemon.settings.setLowPowerMode(false)
    await window.daemon.settings.setWorkspaceProfile({ name: 'custom', toolVisibility: {} })
    const projects = await window.daemon.projects.list()
    if (!(projects.ok && projects.data?.some((p) => p.path === projectPath))) {
      await window.daemon.projects.create({ name: projectName, path: projectPath })
    }
    const wallets = await window.daemon.wallet.list()
    if (!wallets.ok || !wallets.data?.length) {
      await window.daemon.wallet.generate({ name: 'Smoke Wallet' })
    }
  }, { projectPath, projectName })
}

async function stabilize(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addStyleTag({ content: `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}` })
}

async function openDrawer(page) {
  const visible = await page.locator('.command-drawer').isVisible().catch(() => false)
  if (!visible) {
    await page.locator('.sidebar-icon--tools').click()
    await page.waitForSelector('.command-drawer', { timeout: 30000 })
  }
}

async function openTool(page, name, readySel) {
  await openDrawer(page)
  const clicked = await page.locator('.drawer-tool-card').evaluateAll((nodes, expected) => {
    for (const n of nodes) {
      if (n.querySelector('.drawer-tool-name')?.textContent?.trim() === expected) {
        n.scrollIntoView({ block: 'center' }); n.click(); return true
      }
    }
    return false
  }, name)
  if (!clicked) throw new Error(`tool not found: ${name}`)
  await page.waitForSelector(readySel, { timeout: 30000 })
  await page.waitForTimeout(600)
}

const targets = [
  { tool: 'Wallet', sel: '.wallet-panel', file: 'wallet.png' },
  { tool: 'Integrations', sel: '.icc-shell', file: 'integrations.png' },
  { tool: 'Dashboard', sel: '.dash-canvas', file: 'dashboard.png' },
]

let electronProcess, browser
try {
  const cdpPort = await getFreePort()
  electronProcess = spawn(electronBinary, [mainEntry], {
    cwd: repoRoot,
    env: { ...process.env, DAEMON_SMOKE_TEST: '1', DAEMON_SMOKE_CDP_PORT: String(cdpPort), DAEMON_USER_DATA_DIR: userDataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  electronProcess.stderr.on('data', (c) => process.stderr.write(c))
  await waitForPort(cdpPort)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
  const page = await getPage(browser)
  await page.setViewportSize({ width: 1440, height: 940 })
  await ready(page)
  await seed(page)
  await page.reload()
  await ready(page)
  await stabilize(page)

  for (const t of targets) {
    try {
      await openTool(page, t.tool, t.sel)
      const shot = await page.locator(t.sel).screenshot({ animations: 'disabled', caret: 'hide' })
      writeFileSync(path.join(outDir, t.file), shot)
      console.log(`OK ${t.tool} -> ${t.file}`)
    } catch (e) {
      console.log(`FAIL ${t.tool}: ${e.message}`)
      const full = await page.screenshot()
      writeFileSync(path.join(outDir, `FAIL-${t.file}`), full)
    }
  }
  console.log(`Output: ${outDir}`)
} finally {
  await browser?.close().catch(() => {})
  if (electronProcess && electronProcess.exitCode === null) {
    electronProcess.kill('SIGTERM')
    await new Promise((r) => { const t = setTimeout(() => { electronProcess.kill('SIGKILL'); r() }, 5000); electronProcess.once('exit', () => { clearTimeout(t); r() }) })
  }
  rmSync(userDataDir, { recursive: true, force: true })
}
