import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const defaultExePath = path.join(repoRoot, 'release', pkg.version, 'win-unpacked', process.platform === 'win32' ? 'DAEMON.exe' : 'DAEMON')
const packagedExe = process.env.DAEMON_PACKAGED_EXE || defaultExePath

const sandboxRoot = mkdtempSync(path.join(tmpdir(), 'daemon-packaged-smoke-'))
const userDataDir = path.join(sandboxRoot, 'userData')
const projectPath = path.join(sandboxRoot, 'project')
const projectName = 'DAEMON Packaged Smoke'

let appProcess
let browser
const rendererFailures = []

function logStep(message) {
  console.log(`[packaged-smoke] ${message}`)
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
    const context = browser?.contexts()?.[0]
    const page = context?.pages()?.[0]
    if (page) return page
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for packaged BrowserWindow page')
}

function attachPageDiagnostics(page) {
  page.on('console', (message) => {
    const entry = `[page-console] ${message.type()}: ${message.text()}`
    console.log(entry)
    if (message.type() === 'error') rendererFailures.push(entry)
  })
  page.on('pageerror', (error) => {
    const entry = `[page-error] ${error.message}`
    console.log(entry)
    rendererFailures.push(entry)
  })
}

async function waitForAppReady(page) {
  await page.waitForFunction(() => !!window.daemon, { timeout: 30000 })
  await page.waitForSelector('.titlebar', { timeout: 30000 })
  await page.waitForSelector('.main-layout', { timeout: 30000 })
  await page.waitForSelector('.app[data-app-ready="true"]', { timeout: 30000 })
}

async function seedAppState(page) {
  await page.evaluate(async ({ projectPath, projectName }) => {
    const mustOk = (res, label) => {
      if (!res?.ok) throw new Error(`${label}: ${res?.error ?? 'unknown failure'}`)
      return res.data
    }
    mustOk(await window.daemon.settings.setOnboardingComplete(true), 'set onboarding complete')
    mustOk(await window.daemon.settings.setWorkspaceProfile({ name: 'custom', toolVisibility: {} }), 'set workspace profile')
    mustOk(await window.daemon.settings.setPinnedTools(['solana-toolbox', 'settings']), 'set pinned tools')

    const projects = mustOk(await window.daemon.projects.list(), 'list projects') ?? []
    if (!projects.some((project) => project.path === projectPath)) {
      mustOk(await window.daemon.projects.create({ name: projectName, path: projectPath }), 'create project')
    }
  }, { projectPath, projectName })
}

async function openToolFromLauncher(page, toolName, readySelector) {
  const drawerVisible = await page.locator('.command-drawer').isVisible().catch(() => false)
  if (!drawerVisible) {
    await page.locator('.sidebar-icon--tools').click()
    await page.waitForSelector('.command-drawer', { timeout: 30000 })
  }

  const drawerSearchVisible = await page.locator('.drawer-search').isVisible().catch(() => false)
  if (!drawerSearchVisible) {
    await page.keyboard.press('Escape')
    await page.waitForSelector('.drawer-search', { timeout: 30000 })
  }

  const clicked = await page.locator('.drawer-tool-card').evaluateAll((nodes, expectedName) => {
    for (const node of nodes) {
      const label = node.querySelector('.drawer-tool-name')?.textContent?.trim()
      if (label === expectedName) {
        node.scrollIntoView({ block: 'center' })
        node.click()
        return true
      }
    }
    return false
  }, toolName)
  if (!clicked) throw new Error(`Could not find drawer tool card for ${toolName}`)
  await page.waitForSelector(readySelector, { timeout: 30000 })
}

function prepareSandbox() {
  mkdirSync(userDataDir, { recursive: true })
  mkdirSync(projectPath, { recursive: true })
  writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({
    name: 'daemon-packaged-smoke-project',
    version: '0.0.0',
    private: true,
  }, null, 2), 'utf8')
}

async function run() {
  assert.equal(existsSync(packagedExe), true, `Packaged executable not found: ${packagedExe}`)
  prepareSandbox()

  const cdpPort = await getFreePort()
  logStep(`launching ${packagedExe}`)
  appProcess = spawn(packagedExe, [], {
    cwd: path.dirname(packagedExe),
    env: {
      ...process.env,
      DAEMON_SMOKE_TEST: '1',
      DAEMON_SMOKE_CDP_PORT: String(cdpPort),
      DAEMON_USER_DATA_DIR: userDataDir,
      DAEMON_LOW_POWER_MODE: '0',
      DAEMON_DISABLE_AUTO_UPDATE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  appProcess.stdout.on('data', (chunk) => process.stdout.write(chunk))
  appProcess.stderr.on('data', (chunk) => process.stderr.write(chunk))

  await waitForPort(cdpPort)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
  const page = await getPage()
  attachPageDiagnostics(page)
  await waitForAppReady(page)

  logStep('seeding packaged app state')
  await seedAppState(page)
  await page.reload()
  await waitForAppReady(page)
  await page.waitForSelector('.project-tab.active', { timeout: 30000 })

  logStep('checking dynamic tool chunks')
  await openToolFromLauncher(page, 'Solana', '.solana-toolbox')
  await page.getByRole('tab', { name: /^Connect\b/ }).click()
  await page.waitForSelector('.solana-service-row', { timeout: 30000 })
  await openToolFromLauncher(page, 'Settings', '.settings-center')

  logStep('checking packaged native terminal module')
  const terminalResult = await page.evaluate(async (projectPath) => {
    const created = await window.daemon.terminal.create({ cwd: projectPath, userInitiated: true })
    if (!created?.ok) throw new Error(created?.error ?? 'terminal create failed')
    const id = created.data?.id
    if (id) await window.daemon.terminal.kill(id)
    return { id, pid: created.data?.pid }
  }, projectPath)
  assert.ok(terminalResult.id, 'terminal create did not return a session id')
  assert.ok(Number(terminalResult.pid) > 0, 'terminal create did not return a valid pid')

  assert.equal(rendererFailures.length, 0, `renderer failures detected:\n${rendererFailures.join('\n')}`)
  console.log('DAEMON packaged app smoke passed')
}

try {
  await run()
} finally {
  await browser?.close().catch(() => {})
  if (appProcess && appProcess.exitCode === null) {
    appProcess.kill('SIGTERM')
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        appProcess.kill('SIGKILL')
        resolve()
      }, 5000)
      appProcess.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
  rmSync(sandboxRoot, { recursive: true, force: true })
}
