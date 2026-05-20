import assert from 'node:assert/strict'
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
const electronBinary = process.env.DAEMON_SMOKE_ELECTRON || require('electron')
const mainEntry = path.join(repoRoot, 'dist-electron', 'main', 'index.js')
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-shipline-smoke-user-'))
const projectRoot = mkdtempSync(path.join(tmpdir(), 'daemon-shipline-smoke-project-'))
const fakeBinDir = mkdtempSync(path.join(tmpdir(), 'daemon-shipline-smoke-bin-'))

const projectName = 'Shipline Smoke Project'
const programName = 'shipline_smoke'
const programId = 'ShipLine1111111111111111111111111111111111'
const programDataAddress = 'Data1111111111111111111111111111111111'
const upgradeAuthority = 'Auth1111111111111111111111111111111111'
const pathDelimiter = process.platform === 'win32' ? ';' : ':'

let electronProcess
let browser
const rendererFailures = []
const rendererConsole = []

function logStep(message) {
  console.log(`[shipline-smoke] ${message}`)
}

function writeExecutable(filePath, body) {
  writeFileSync(filePath, body, { mode: 0o755 })
}

function createFakeToolchain() {
  if (process.platform === 'win32') {
    writeExecutable(path.join(fakeBinDir, 'anchor.cmd'), [
      '@echo off',
      'if "%1"=="idl" (',
      `  echo {"version":"0.1.0","name":"${programName}","instructions":[]}`,
      '  exit /b 0',
      ')',
      'echo [fake-anchor] %*',
      'exit /b 0',
      '',
    ].join('\r\n'))

    writeExecutable(path.join(fakeBinDir, 'solana.cmd'), [
      '@echo off',
      'if "%1"=="program" if "%2"=="show" (',
      '  echo Program Id: %3',
      '  echo Owner: BPFLoaderUpgradeab1e11111111111111111111111',
      '  echo Executable: true',
      `  echo ProgramData Address: ${programDataAddress}`,
      `  echo Authority: ${upgradeAuthority}`,
      '  echo Last Deployed In Slot: 12345',
      '  echo Data Length: 4096 ^(0x1000^) bytes',
      '  echo Balance: 1.234 SOL',
      '  exit /b 0',
      ')',
      'echo [fake-solana] %*',
      'exit /b 0',
      '',
    ].join('\r\n'))
    return
  }

  writeExecutable(path.join(fakeBinDir, 'anchor'), [
    '#!/usr/bin/env bash',
    'if [[ "$1" == "idl" ]]; then',
    `  echo '{"version":"0.1.0","name":"${programName}","instructions":[]}'`,
    '  exit 0',
    'fi',
    'echo "[fake-anchor] $*"',
    '',
  ].join('\n'))

  writeExecutable(path.join(fakeBinDir, 'solana'), [
    '#!/usr/bin/env bash',
    'if [[ "$1" == "program" && "$2" == "show" ]]; then',
    '  echo "Program Id: $3"',
    '  echo "Owner: BPFLoaderUpgradeab1e11111111111111111111111"',
    '  echo "Executable: true"',
    `  echo "ProgramData Address: ${programDataAddress}"`,
    `  echo "Authority: ${upgradeAuthority}"`,
    '  echo "Last Deployed In Slot: 12345"',
    '  echo "Data Length: 4096 (0x1000) bytes"',
    '  echo "Balance: 1.234 SOL"',
    '  exit 0',
    'fi',
    'echo "[fake-solana] $*"',
    '',
  ].join('\n'))
}

function createSmokeProject() {
  mkdirSync(path.join(projectRoot, 'programs', programName, 'src'), { recursive: true })
  mkdirSync(path.join(projectRoot, 'target', 'idl'), { recursive: true })
  mkdirSync(path.join(projectRoot, 'target', 'deploy'), { recursive: true })

  writeFileSync(path.join(projectRoot, 'Anchor.toml'), [
    '[programs.devnet]',
    `${programName} = "${programId}"`,
    '',
    '[provider]',
    'cluster = "devnet"',
    'wallet = "~/.config/solana/id.json"',
    '',
  ].join('\n'))

  writeFileSync(path.join(projectRoot, 'Cargo.toml'), [
    '[workspace]',
    `members = ["programs/${programName}"]`,
    '',
  ].join('\n'))

  writeFileSync(path.join(projectRoot, 'programs', programName, 'Cargo.toml'), [
    '[package]',
    `name = "${programName}"`,
    'version = "0.1.0"',
    'edition = "2021"',
    '',
    '[dependencies]',
    'anchor-lang = "0.31.1"',
    '',
  ].join('\n'))

  writeFileSync(path.join(projectRoot, 'programs', programName, 'src', 'lib.rs'), [
    'use anchor_lang::prelude::*;',
    `declare_id!("${programId}");`,
    '',
    '#[program]',
    `pub mod ${programName} {`,
    '    use super::*;',
    '    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> { Ok(()) }',
    '}',
    '',
    '#[derive(Accounts)]',
    'pub struct Initialize {}',
    '',
  ].join('\n'))

  writeFileSync(path.join(projectRoot, 'target', 'idl', `${programName}.json`), JSON.stringify({
    address: programId,
    metadata: { address: programId },
    instructions: [],
  }, null, 2))
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
  throw new Error('Timed out waiting for a BrowserWindow page')
}

function attachPageDiagnostics(page) {
  page.on('console', (message) => {
    const entry = `[page-console] ${message.type()}: ${message.text()}`
    rendererConsole.push(entry)
    if (message.type() === 'error') rendererFailures.push(entry)
  })
  page.on('pageerror', (error) => {
    const entry = `[page-error] ${error.message}`
    rendererConsole.push(entry)
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
    await window.daemon.settings.setOnboardingComplete(true)
    await window.daemon.settings.setWorkspaceProfile({ name: 'custom', toolVisibility: {} })
    await window.daemon.settings.setPinnedTools(['solana-toolbox', 'activity', 'settings'])
    const list = await window.daemon.projects.list()
    const exists = list.ok && list.data?.some((project) => project.path === projectPath)
    if (!exists) {
      await window.daemon.projects.create({ name: projectName, path: projectPath })
    }
  }, { projectPath: projectRoot, projectName })
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
        node.scrollIntoView({ block: 'center', inline: 'nearest' })
        node.click()
        return true
      }
    }
    return false
  }, toolName)
  if (!clicked) {
    throw new Error(`Tool card not found: ${toolName}`)
  }
  await page.waitForSelector(readySelector, { timeout: 30000 })
}

function stepRow(page, label) {
  return page.locator('.shipline-step', { hasText: label }).first()
}

async function waitForStepStatus(page, label, statusText) {
  await page.waitForFunction(({ label, statusText }) => {
    const steps = Array.from(document.querySelectorAll('.shipline-step'))
    const step = steps.find((node) => node.textContent?.includes(label))
    return step?.textContent?.includes(statusText)
  }, { label, statusText }, { timeout: 45000 })
}

async function clickStepButton(page, label, buttonName) {
  const row = stepRow(page, label)
  await row.waitFor({ state: 'visible', timeout: 30000 })
  const button = row.getByRole('button', { name: buttonName, exact: true })
  await button.waitFor({ state: 'visible', timeout: 30000 })
  await button.click()
}

async function openStepAndWaitDone(page, label, expectedEvidence = []) {
  await clickStepButton(page, label, 'Open')
  await page.waitForSelector('.terminal-panel', { timeout: 30000 })
  await waitForStepStatus(page, label, 'Done')
  for (const evidence of expectedEvidence) {
    await page.waitForFunction(({ label, evidence }) => {
      const steps = Array.from(document.querySelectorAll('.shipline-step'))
      const step = steps.find((node) => node.textContent?.includes(label))
      return step?.textContent?.includes(evidence)
    }, { label, evidence }, { timeout: 30000 })
  }
}

async function runShiplineFlow(page) {
  logStep('opening Solana toolbox')
  await openToolFromLauncher(page, 'Solana Workflow', '.solana-toolbox')

  logStep('opening Build view')
  await page.getByRole('tab', { name: /^Build\b/ }).click()
  await page.waitForSelector('.shipline-timeline', { timeout: 30000 })
  await page.getByRole('button', { name: 'Create Timeline', exact: true }).click()
  await page.waitForFunction(() => {
    const timeline = document.querySelector('.shipline-timeline')
    return Boolean(timeline?.querySelector('.shipline-step') || timeline?.querySelector('.solana-ide-check.warning'))
  }, null, { timeout: 30000 })
  const timelineText = await page.locator('.shipline-timeline').innerText()
  assert(
    timelineText.includes('Devnet Shipline timeline is ready'),
    `Expected ready Shipline timeline, got:\n${timelineText}`,
  )

  const requiredSteps = ['Preflight', 'Build', 'Tests', 'Priority Fees', 'Deploy', 'Confirm', 'Verify', 'IDL Export']
  for (const label of requiredSteps) {
    await stepRow(page, label).waitFor({ state: 'visible', timeout: 30000 })
  }

  logStep('advancing preflight')
  await clickStepButton(page, 'Preflight', 'Done')
  await waitForStepStatus(page, 'Preflight', 'Done')

  logStep('running build/test/deploy through fake toolchain')
  await openStepAndWaitDone(page, 'Build', ['Terminal', 'Command', 'Exit code'])
  await openStepAndWaitDone(page, 'Tests', ['Terminal', 'Command', 'Exit code'])
  await openStepAndWaitDone(page, 'Deploy', ['Terminal', 'Command', 'Exit code'])

  logStep('capturing verification evidence')
  await openStepAndWaitDone(page, 'Confirm', ['Program ID', 'Executable', 'Upgrade authority', 'Last deployed slot'])
  await openStepAndWaitDone(page, 'Verify', ['Program data', 'Data length', 'Balance'])
  await openStepAndWaitDone(page, 'IDL Export', ['IDL path', 'Exit code'])

  const run = await page.evaluate(async () => {
    const projects = await window.daemon.projects.list()
    const project = projects.ok ? projects.data?.[0] : null
    const runs = project?.id ? await window.daemon.shipline.listTimelines(project.id, 1) : null
    return runs?.ok ? runs.data?.[0] : null
  })

  assert(run, 'No Shipline run was persisted')
  assert.equal(run.status, 'complete', `Expected complete Shipline run, got ${run.status}`)
  const confirm = run.steps.find((step) => step.id === 'confirm')
  assert(confirm?.artifacts.some((artifact) => artifact.label === 'Upgrade authority' && artifact.value === upgradeAuthority), 'missing upgrade authority evidence')
  assert(confirm?.artifacts.some((artifact) => artifact.label === 'Executable' && artifact.value === 'true'), 'missing executable evidence')
}

async function run() {
  createSmokeProject()
  createFakeToolchain()

  const cdpPort = await getFreePort()
  logStep('spawning electron')
  electronProcess = spawn(electronBinary, [mainEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DAEMON_SMOKE_TEST: '1',
      DAEMON_SMOKE_CDP_PORT: String(cdpPort),
      DAEMON_USER_DATA_DIR: userDataDir,
      PATH: `${fakeBinDir}${pathDelimiter}${process.env.PATH ?? ''}`,
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
  await page.waitForSelector('.project-tab.active', { timeout: 30000 })
  await runShiplineFlow(page)

  assert.equal(rendererFailures.length, 0, `renderer failures detected:\n${rendererFailures.join('\n')}`)
}

try {
  await run()
  console.log('Shipline workflow smoke passed')
} finally {
  if (rendererConsole.length > 0) {
    console.log('[shipline-smoke] collected renderer diagnostics:')
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
  rmSync(projectRoot, { recursive: true, force: true })
  rmSync(fakeBinDir, { recursive: true, force: true })
}
