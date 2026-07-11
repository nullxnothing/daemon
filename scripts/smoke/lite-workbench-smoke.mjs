import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const defaultExePath = path.join(
  repoRoot,
  'release-lite',
  pkg.version,
  'win-unpacked',
  process.platform === 'win32' ? 'DAEMON.exe' : 'DAEMON',
)
const packagedExe = process.env.DAEMON_PACKAGED_EXE || defaultExePath
const sandboxRoot = mkdtempSync(path.join(tmpdir(), 'daemon-lite-workbench-'))
const userDataDir = path.join(sandboxRoot, 'userData')
const projectDir = path.join(sandboxRoot, 'solana-monitor')
const readmePath = path.join(projectDir, 'README.md')
const outputDir = path.join(repoRoot, 'output', 'playwright')
const savedMarker = '# Solana monitor\n\nSaved from packaged DAEMON Workbench.\n'

let appProcess
let browser
const rendererFailures = []

function logStep(message) {
  console.log(`[lite-workbench-smoke] ${message}`)
}

function createFixture() {
  mkdirSync(path.join(projectDir, 'src'), { recursive: true })
  writeFileSync(readmePath, '# Solana monitor\n\nLocal devnet fixture.\n', 'utf8')
  writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
    name: 'solana-monitor',
    private: true,
    scripts: { test: 'node --test' },
  }, null, 2), 'utf8')
  writeFileSync(path.join(projectDir, 'src', 'index.js'), "console.log('devnet')\n", 'utf8')
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to allocate a CDP port')))
        return
      }
      server.close(() => resolve(address.port))
    })
  })
}

function waitForPort(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const connect = () => {
      const socket = net.connect({ port, host: '127.0.0.1' })
      socket.once('connect', () => { socket.destroy(); resolve() })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for CDP port ${port}`))
          return
        }
        setTimeout(connect, 250)
      })
    }
    connect()
  })
}

function attachDiagnostics(page) {
  page.on('pageerror', (error) => rendererFailures.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') rendererFailures.push(`console: ${message.text()}`)
  })
}

async function getLitePage() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const context = browser?.contexts()?.[0]
    const page = context?.pages().find((candidate) => candidate.url().includes('lite.html'))
    if (page) return page
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for the DAEMON renderer')
}

async function waitForFile(expected, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (readFileSync(readmePath, 'utf8') === expected) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.equal(readFileSync(readmePath, 'utf8'), expected, 'Ctrl+S did not save the edited README')
}

async function runTerminalCommand(page, command, expected) {
  const input = page.locator('.xterm-helper-textarea').first()
  await input.focus()
  await page.keyboard.type(command)
  await page.keyboard.press('Enter')
  await page.waitForFunction((needle) => document.querySelector('.xterm-rows')?.textContent?.includes(needle), expected, { timeout: 20_000 })
}

async function run() {
  assert.ok(existsSync(packagedExe), `packaged Lite executable missing: ${packagedExe}`)
  createFixture()
  mkdirSync(outputDir, { recursive: true })
  const cdpPort = await getFreePort()

  logStep(`launching ${packagedExe}`)
  appProcess = spawn(packagedExe, [], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      DAEMON_SMOKE_TEST: '1',
      DAEMON_SMOKE_CDP_PORT: String(cdpPort),
      DAEMON_SMOKE_PROJECT_DIALOG_PATH: projectDir,
      DAEMON_USER_DATA_DIR: userDataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  appProcess.stdout.on('data', (chunk) => process.stdout.write(chunk))
  appProcess.stderr.on('data', (chunk) => process.stderr.write(chunk))

  await waitForPort(cdpPort)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
  const page = await getLitePage()
  attachDiagnostics(page)

  logStep('bypassing first-run provider setup')
  await page.waitForSelector('text=Your AI coding agent.', { timeout: 30_000 })
  await page.evaluate(() => window.daemon.lite.setOnboardingComplete(true))
  await page.reload()

  logStep('importing the isolated project fixture')
  await page.getByRole('button', { name: 'New chat' }).waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await page.getByRole('button', { name: path.basename(projectDir), exact: true }).waitFor({ timeout: 20_000 })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: path.join(outputDir, 'lite-simple-chat-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 820, height: 720 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(outputDir, 'lite-simple-chat-compact.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'Terminal', exact: true }).click()
  await page.getByText('GUARDED WORKFLOWS: LOCALNET / DEVNET', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Build', exact: true }).isDisabled(), true, 'non-Solana project must not enable Anchor build')
  assert.equal(await page.getByRole('button', { name: 'Local validator', exact: true }).isDisabled(), true, 'non-Solana project must not enable validator')

  logStep('opening and saving README.md')
  await page.getByRole('button', { name: 'Code', exact: true }).click()
  await page.getByRole('treeitem', { name: /README.md/ }).click()
  await page.getByRole('region', { name: 'Code editor' }).waitFor()
  const editorSurface = page.locator('.monaco-editor .view-lines').first()
  await editorSurface.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(savedMarker)
  await page.getByRole('button', { name: 'Save' }).waitFor({ state: 'visible' })
  await page.waitForFunction(() => {
    const save = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Save')
    return save instanceof HTMLButtonElement && !save.disabled
  })
  await page.keyboard.press('Control+S')
  await waitForFile(savedMarker)
  await page.screenshot({ path: path.join(outputDir, 'lite-simple-code-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 820, height: 720 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(outputDir, 'lite-simple-code-compact.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  logStep('creating a project terminal and running Node')
  await page.getByRole('button', { name: 'Terminal', exact: true }).click()
  await page.getByRole('button', { name: 'New terminal' }).click()
  await page.locator('.xterm-helper-textarea').first().waitFor({ timeout: 20_000 })
  await runTerminalCommand(page, 'node -p "process.cwd()"', projectDir)
  await runTerminalCommand(page, 'node --version', `v${process.versions.node.split('.')[0]}.`)
  await page.screenshot({ path: path.join(outputDir, 'lite-simple-terminal-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 820, height: 720 })
  await page.waitForTimeout(500)
  await runTerminalCommand(page, 'Write-Output "PS C:\\ compact terminal ready"', 'PS C:\\ compact terminal ready')
  await page.screenshot({ path: path.join(outputDir, 'lite-simple-terminal-compact.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  logStep('opening Meme Tech Studio and inspecting live benchmark evidence')
  await page.getByRole('button', { name: 'Meme Tech', exact: true }).click()
  await page.getByRole('region', { name: 'Meme Tech workspace' }).waitFor()
  await page.getByText('Unknown', { exact: true }).first().waitFor()
  if (process.env.BIRDEYE_API_KEY) {
    await page.getByRole('button', { name: 'Inspect', exact: true }).click()
    await page.getByText('PROVIDER RISK EVIDENCE', { exact: true }).waitFor({ timeout: 30_000 })
    await page.getByText(/Birdeye \+ DEX cross-check|degraded data/).waitFor({ timeout: 30_000 })
  } else {
    await page.getByRole('button', { name: 'Inspect', exact: true }).click()
    await page.getByRole('alert').getByText(/Birdeye is not configured/).waitFor({ timeout: 30_000 })
    await page.getByText('degraded data', { exact: true }).waitFor({ timeout: 30_000 })
  }

  logStep('capturing desktop and compact Meme Tech Studio states')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: path.join(outputDir, 'lite-meme-tech-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 820, height: 720 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(outputDir, 'lite-meme-tech-compact.png'), fullPage: true })

  assert.equal(rendererFailures.length, 0, `renderer failures detected:\n${rendererFailures.join('\n')}`)
  logStep('PASS: import, repo-aware guards, edit/save, scoped terminal, Meme Tech evidence, screenshots, and renderer diagnostics')
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
