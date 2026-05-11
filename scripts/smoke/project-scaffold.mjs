import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
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
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-scaffold-user-'))
const scaffoldRoot = mkdtempSync(path.join(tmpdir(), 'daemon-scaffold-target-'))
const projectName = `SmokeScaffold${Date.now()}`
const projectPath = path.join(scaffoldRoot, projectName)
const displayProjectPath = `${scaffoldRoot}/${projectName}`

let electronProcess
let browser
const rendererFailures = []

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
  throw new Error('Timed out waiting for a BrowserWindow page')
}

function attachPageDiagnostics(page) {
  page.on('pageerror', (error) => {
    rendererFailures.push(error.message)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') rendererFailures.push(message.text())
  })
}

async function waitForAppReady(page) {
  await page.waitForFunction(() => !!window.daemon, { timeout: 30000 })
  await page.waitForSelector('.titlebar', { timeout: 30000 })
  await page.waitForSelector('.main-layout', { timeout: 30000 })
  await page.waitForSelector('.app[data-app-ready="true"]', { timeout: 30000 })
}

async function seedAppState(page) {
  await page.evaluate(async () => {
    await window.daemon.settings.setOnboardingComplete(true)
    await window.daemon.settings.setWorkspaceProfile({ name: 'custom', toolVisibility: {} })
  })
}

async function openNewProject(page) {
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

  await page.locator('.drawer-tool-card', { hasText: 'New Project' }).first().click()
  await page.waitForSelector('.starter-panel', { timeout: 30000 })
}

async function runScaffoldFlow(page) {
  await page.getByRole('button', { name: /Trading Bot Jupiter swap bot/i }).click()
  await page.getByPlaceholder('my-solana-project').fill(projectName)
  await page.getByRole('button', { name: 'Browse' }).click()
  await page.waitForFunction((expectedPath) => {
    return document.body.textContent?.includes(expectedPath)
  }, displayProjectPath, { timeout: 30000 })
  await page.getByRole('button', { name: 'Build Project' }).click()
  await page.waitForSelector('.terminal-tab.active', { timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('.starter-panel'), { timeout: 30000 })
}

function verifyScaffoldFiles() {
  const expectedFiles = [
    'package.json',
    'README.md',
    '.env.example',
    'tsconfig.json',
    path.join('src', 'config.ts'),
    path.join('src', 'index.ts'),
    path.join('src', 'strategy.ts'),
  ]

  for (const file of expectedFiles) {
    assert.equal(existsSync(path.join(projectPath, file)), true, `${file} was not written`)
  }

  const packageJson = JSON.parse(readFileSync(path.join(projectPath, 'package.json'), 'utf8'))
  assert.equal(packageJson.name, projectName.toLowerCase())

  const combined = expectedFiles
    .filter((file) => file.endsWith('.json') || file.endsWith('.md') || file.endsWith('.ts') || file.endsWith('.example'))
    .map((file) => readFileSync(path.join(projectPath, file), 'utf8'))
    .join('\n')
  assert.equal(combined.includes('claude --model'), false, 'scaffold includes old Claude terminal command')
  assert.equal(combined.includes('dangerously-skip-permissions'), false, 'scaffold includes unsafe agent flag')
}

async function run() {
  const cdpPort = await getFreePort()
  const electronArgs = process.platform === 'linux' || process.env.CI
    ? ['--no-sandbox', mainEntry]
    : [mainEntry]

  electronProcess = spawn(electronBinary, electronArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      DAEMON_SMOKE_TEST: '1',
      DAEMON_SMOKE_CDP_PORT: String(cdpPort),
      DAEMON_SMOKE_PROJECT_DIALOG_PATH: scaffoldRoot,
      DAEMON_USER_DATA_DIR: userDataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  electronProcess.stdout.on('data', (chunk) => process.stdout.write(chunk))
  electronProcess.stderr.on('data', (chunk) => process.stderr.write(chunk))

  await waitForPort(cdpPort)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)

  const page = await getPage()
  attachPageDiagnostics(page)
  await waitForAppReady(page)
  await seedAppState(page)
  await page.reload()
  await waitForAppReady(page)

  await openNewProject(page)
  await runScaffoldFlow(page)
  verifyScaffoldFiles()

  assert.equal(rendererFailures.length, 0, `renderer failures detected:\n${rendererFailures.join('\n')}`)
}

try {
  await run()
  console.log('Project scaffold smoke passed')
} finally {
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
  rmSync(scaffoldRoot, { recursive: true, force: true })
}
