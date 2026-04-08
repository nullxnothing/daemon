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
  })
  page.on('pageerror', (error) => {
    const entry = `[page-error] ${error.message}`
    rendererConsole.push(entry)
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
