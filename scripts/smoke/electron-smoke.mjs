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
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-smoke-'))

const projectPath = repoRoot
const projectName = 'DAEMON Smoke'
const smokeEcho = `DAEMON_SMOKE_${Date.now()}`

let electronProcess
let browser
const rendererConsole = []
const rendererFailures = []

function logStep(message) {
  console.log(`[smoke] ${message}`)
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to allocate port')))
        return
      }
      server.close(() => resolve(address.port))
    })
  })
}

function waitForPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.connect({ port, host: '127.0.0.1' })
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for port ${port}`))
          return
        }
        setTimeout(tryConnect, 250)
      })
    }

    tryConnect()
  })
}

async function getPage() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const context = browser.contexts()[0]
    const page = context?.pages()[0]
    if (page) return page
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for a BrowserWindow page')
}

function attachPageDiagnostics(page) {
  page.on('console', (message) => {
    const entry = `[page-console] ${message.type()}: ${message.text()}`
    rendererConsole.push(entry)
    console.log(entry)
    if (message.type() === 'error') rendererFailures.push(entry)
  })
  page.on('pageerror', (error) => {
    const entry = `[page-error] ${error.message}`
    rendererConsole.push(entry)
    rendererFailures.push(entry)
    console.log(entry)
  })
}

async function seedAppState(page) {
  await page.evaluate(async ({ projectPath, projectName }) => {
    await window.daemon.settings.setOnboardingComplete(true)
    const list = await window.daemon.projects.list()
    const exists = list.ok && list.data?.some((project) => project.path === projectPath)
    if (!exists) {
      await window.daemon.projects.create({ name: projectName, path: projectPath })
    }
  }, { projectPath, projectName })
}

async function waitForAppReady(page) {
  await page.waitForSelector('.titlebar', { timeout: 30000 })
  await page.waitForSelector('.main-layout', { timeout: 30000 })
}

async function openToolFromLauncher(page, toolName) {
  const drawerVisible = await page.locator('.command-drawer').isVisible().catch(() => false)
  if (!drawerVisible) {
    await page.getByRole('button', { name: 'Tools', exact: true }).click()
    await page.waitForSelector('.command-drawer', { timeout: 30000 })
  }
  const drawerSearchVisible = await page.locator('.drawer-search').isVisible().catch(() => false)
  if (!drawerSearchVisible) {
    await closeDrawerToGrid(page)
  }
  const drawer = page.locator('.command-drawer')
  await drawer.locator('.drawer-tool-card', { hasText: toolName }).first().click()
  await page.waitForFunction((expected) => {
    const title = document.querySelector('.drawer-title')?.textContent?.trim()
    return title?.toLowerCase() === String(expected).toLowerCase()
  }, toolName, { timeout: 30000 })
}

async function closeDrawerToGrid(page) {
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => {
    return document.querySelector('.drawer-search') !== null
      && document.querySelector('.drawer-title') === null
  }, { timeout: 30000 })
}

async function cycleDrawerTools(page, toolNames, rounds = 1) {
  for (let round = 0; round < rounds; round += 1) {
    for (const toolName of toolNames) {
      await openToolFromLauncher(page, toolName)
      if (toolName === 'Git') await page.waitForSelector('.git-center', { timeout: 30000 })
      if (toolName === 'Wallet') await page.waitForSelector('.wallet-panel', { timeout: 30000 })
      if (toolName === 'Token Launch') await page.waitForSelector('.token-launch-tool', { timeout: 30000 })
      if (toolName === 'Settings') await page.waitForSelector('.settings-center', { timeout: 30000 })
      await closeDrawerToGrid(page)
    }
  }
}

async function verifySidebarAddToolFlyout(page) {
  const addToolButton = page.getByRole('button', { name: 'Add tool', exact: true })
  await addToolButton.click()
  await page.waitForSelector('.sidebar-submenu--tools', { timeout: 30000 })
  await page.waitForFunction(() => {
    const flyout = document.querySelector('.sidebar-submenu--tools')
    const drawerSearch = document.querySelector('.drawer-search')
    return !!flyout && !drawerSearch
  }, { timeout: 30000 })
  await page.locator('.sidebar-submenu-item--tool', { hasText: 'Wallet' }).first().click()
  await page.waitForFunction(() => document.querySelector('.sidebar-submenu--tools') === null, { timeout: 30000 })
  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll('.icon-sidebar button[aria-label]'))
      .some((button) => button.getAttribute('aria-label') === 'Wallet')
  }, { timeout: 30000 })
}

async function verifyPinnedSidebarToolClicks(page) {
  const clickAndAssert = async (label, selector, readySelector) => {
    await page.getByRole('button', { name: label, exact: true }).click()
    await page.waitForSelector(selector, { timeout: 30000 })
    await page.waitForSelector(readySelector, { timeout: 30000 })
  }

  await clickAndAssert('Git', '.command-drawer', '.git-center')
  await clickAndAssert('Wallet', '.command-drawer', '.wallet-panel')
  await clickAndAssert('Token Launch', '.command-drawer', '.token-launch-tool')
  await clickAndAssert('Solana', '.command-drawer', '.solana-toolbox')
}

async function run() {
  const cdpPort = await getFreePort()
  logStep('spawning electron')
  electronProcess = spawn(electronBinary, [mainEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DAEMON_SMOKE_TEST: '1',
      DAEMON_SMOKE_CDP_PORT: String(cdpPort),
      DAEMON_USER_DATA_DIR: userDataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  electronProcess.stdout.on('data', (chunk) => process.stdout.write(chunk))
  electronProcess.stderr.on('data', (chunk) => process.stderr.write(chunk))

  logStep('waiting for cdp port')
  await waitForPort(cdpPort)
  logStep('connecting over cdp')
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)

  let page = await getPage()
  attachPageDiagnostics(page)
  logStep('window ready')
  await waitForAppReady(page)
  logStep('seeding app state')
  await seedAppState(page)

  await page.reload()
  logStep('reloaded')
  await waitForAppReady(page)
  await page.waitForSelector('.project-tab.active', { timeout: 30000 })

  logStep('creating terminal')
  await page.getByTitle('New tab options').click()
  await page.getByRole('button', { name: 'Standard Terminal' }).click()
  await page.waitForSelector('.terminal-tab.active', { timeout: 30000 })

  const terminalView = page.locator('.terminal-view').first()
  await terminalView.click()
  await page.keyboard.type(`echo ${smokeEcho}`)
  await page.keyboard.press('Enter')
  await page.waitForSelector(`text=${smokeEcho}`, { timeout: 30000 })

  logStep('checking hackathon to browser transition')
  await page.getByRole('button', { name: 'Hackathon' }).click()
  await page.waitForSelector('.command-drawer', { timeout: 30000 })
  await page.waitForFunction(() => document.querySelector('.drawer-title')?.textContent?.includes('Hackathon') ?? false)

  await page.getByRole('button', { name: 'Toggle Browser Tab' }).click()
  await page.waitForSelector('.browser-mode', { timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('.command-drawer'))

  logStep('checking dashboard transition')
  await page.keyboard.press('Control+Shift+D')
  await page.waitForSelector('.dash-canvas', { timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('.command-drawer'))

  const activeEditorTabs = await page.locator('.editor-tab.active').allTextContents()
  assert(activeEditorTabs.some((text) => text.toLowerCase().includes('dashboard')), 'dashboard tab did not become active')

  logStep('checking sidebar add-tool flyout')
  await verifySidebarAddToolFlyout(page)

  logStep('checking pinned sidebar tool transitions')
  await verifyPinnedSidebarToolClicks(page)

  logStep('checking tool launcher transitions')
  await cycleDrawerTools(page, ['Git', 'Wallet', 'Token Launch', 'Settings'], 2)

  assert.equal(rendererFailures.length, 0, `renderer failures detected:\n${rendererFailures.join('\n')}`)
}

try {
  await run()
  console.log('DAEMON smoke test passed')
} finally {
  if (rendererConsole.length > 0) {
    console.log('[smoke] collected renderer diagnostics:')
    for (const line of rendererConsole) console.log(line)
  }
  await browser?.close().catch(() => {})
  if (electronProcess && electronProcess.exitCode === null) {
    electronProcess.kill('SIGTERM')
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        electronProcess.kill('SIGKILL')
        resolve()
      }, 5000)
      electronProcess.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
  rmSync(userDataDir, { recursive: true, force: true })
}
