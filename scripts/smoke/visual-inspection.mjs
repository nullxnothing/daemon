// Visual inspection walkthrough — launches the real app, simulates a dev
// session across every major surface, screenshots each, and reports console
// errors. Not a pass/fail gate; it's an eyes-on tool.
//
//   pnpm run build && node scripts/smoke/visual-inspection.mjs
//
// Screenshots land in test-results/visual-inspection/.

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync } from 'node:fs'
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
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-inspect-'))
const shotsDir = path.join(repoRoot, 'test-results', 'visual-inspection')
mkdirSync(shotsDir, { recursive: true })

const projectPath = repoRoot
const projectName = 'DAEMON'

let electronProcess
let browser
const consoleErrors = []
const shots = []

const log = (m) => console.log(`[inspect] ${m}`)

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
        if (Date.now() >= deadline) return reject(new Error(`port ${port} timeout`))
        setTimeout(tryConnect, 250)
      })
    }
    tryConnect()
  })
}

async function getPage() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const page = browser.contexts()[0]?.pages()[0]
    if (page) return page
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('no page')
}

async function shot(page, name) {
  const file = path.join(shotsDir, `${name}.png`)
  await page.screenshot({ path: file })
  shots.push(name)
  log(`shot: ${name}`)
}

async function waitReady(page) {
  await page.waitForFunction(() => !!window.daemon, { timeout: 30000 })
  await page.waitForSelector('.app[data-app-ready="true"]', { timeout: 30000 })
}

async function openTool(page, toolName, readySelector) {
  const drawerVisible = await page.locator('.command-drawer').isVisible().catch(() => false)
  if (!drawerVisible) {
    await page.locator('.sidebar-icon--tools').click()
    await page.waitForSelector('.command-drawer', { timeout: 30000 })
  }
  await page.locator('.drawer-tool-card', { hasText: toolName }).first().click()
  if (readySelector) await page.waitForSelector(readySelector, { timeout: 30000 })
  await page.waitForTimeout(500) // let entrance animation settle
}

async function run() {
  const cdpPort = await getFreePort()
  log('spawning electron')
  electronProcess = spawn(electronBinary, [mainEntry], {
    cwd: repoRoot,
    env: { ...process.env, DAEMON_SMOKE_TEST: '1', DAEMON_SMOKE_CDP_PORT: String(cdpPort), DAEMON_USER_DATA_DIR: userDataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  electronProcess.stdout.on('data', (c) => process.stdout.write(c))
  electronProcess.stderr.on('data', (c) => process.stderr.write(c))

  await waitForPort(cdpPort)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
  const page = await getPage()

  page.on('console', (m) => { if (m.type() === 'error') { consoleErrors.push(m.text()); console.log(`[console-error] ${m.text()}`) } })
  page.on('pageerror', (e) => { consoleErrors.push(e.message); console.log(`[page-error] ${e.message}`) })

  await waitReady(page)
  await shot(page, '01-boot-no-project')

  log('seeding project')
  await page.evaluate(async ({ projectPath, projectName }) => {
    await window.daemon.settings.setOnboardingComplete(true)
    await window.daemon.settings.setWorkspaceProfile({ name: 'custom', toolVisibility: {} })
    await window.daemon.settings.setPinnedTools(['git', 'wallet', 'solana-toolbox', 'agent-station', 'daemon-ai', 'settings'])
    const list = await window.daemon.projects.list()
    if (!(list.ok && list.data?.some((p) => p.path === projectPath))) {
      await window.daemon.projects.create({ name: projectName, path: projectPath })
    }
  }, { projectPath, projectName })
  await page.reload()
  await waitReady(page)
  await page.waitForSelector('.project-tab.active', { timeout: 30000 }).catch(() => {})
  await shot(page, '02-editor-welcome')

  // Walk the panels a dev would touch.
  const tour = [
    ['Dashboard', '.dash-canvas', '03-dashboard-empty'],
    ['Agent Station', '.agentops-panel, [class*="agentStation"], .agent-station', '04-agent-station'],
    ['DAEMON AI', '.daemon-ai-panel', '05-daemon-ai'],
    ['Wallet', '.wallet-panel', '06-wallet'],
    ['Solana Workflow', '.solana-toolbox', '07-solana-toolbox'],
    ['Git', '.git-center', '08-git'],
    ['Settings', '.settings-center', '09-settings'],
  ]
  for (const [tool, selector, name] of tour) {
    try {
      await openTool(page, tool, selector)
      await shot(page, name)
    } catch (err) {
      log(`SKIP ${tool}: ${err.message}`)
    }
  }

  // Terminal + command palette as a dev would invoke them.
  try {
    await page.keyboard.press('Control+`')
    await page.waitForSelector('.terminal-panel', { timeout: 10000 })
    await shot(page, '10-terminal')
  } catch (err) { log(`SKIP terminal: ${err.message}`) }

  try {
    await page.keyboard.press('Control+k')
    await page.waitForSelector('.palette-box', { timeout: 8000 })
    await shot(page, '11-command-palette')
    await page.keyboard.press('Escape')
  } catch (err) { log(`SKIP palette: ${err.message}`) }

  log('--- console errors ---')
  if (consoleErrors.length === 0) log('none 🎉')
  else consoleErrors.forEach((e) => log(`  ${e}`))
  log(`--- ${shots.length} screenshots in ${shotsDir} ---`)
}

try {
  await run()
} catch (err) {
  console.error('[inspect] failed:', err)
  process.exitCode = 1
} finally {
  await browser?.close().catch(() => {})
  electronProcess?.kill()
  try { require('node:fs').rmSync(userDataDir, { recursive: true, force: true }) } catch {}
}
