import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const repoRoot = path.resolve(__dirname, '..', '..')
const electronBinary = process.env.DAEMON_SMOKE_ELECTRON || require('electron')
const mainEntry = path.join(repoRoot, 'dist-electron', 'main', 'index.js')
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-workflow-smoke-'))

const projectPath = repoRoot
const projectName = 'DAEMON Workflow Smoke'
const validConfig = '11111111111111111111111111111111'

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
}

async function seedWorkflowState(page) {
  await page.evaluate(async ({ projectPath, projectName, validConfig }) => {
    await window.daemon.settings.setOnboardingComplete(true)
    await window.daemon.settings.setTokenLaunchSettings({
      raydium: { configId: validConfig, quoteMint: validConfig },
      meteora: { configId: validConfig, quoteMint: validConfig, baseSupply: '1000000000' },
    })

    const projects = await window.daemon.projects.list()
    let project = projects.ok ? projects.data?.find((entry) => entry.path === projectPath) : null
    if (!project) {
      const created = await window.daemon.projects.create({ name: projectName, path: projectPath })
      project = created.ok ? created.data : null
    }

    const wallets = await window.daemon.wallet.list()
    let wallet = wallets.ok ? wallets.data?.find((entry) => entry.hasKeypair) ?? wallets.data?.[0] : null
    if (!wallet) {
      const generated = await window.daemon.wallet.generate({ name: 'Workflow Wallet' })
      wallet = generated.ok ? generated.data : null
    }

    if (project?.id && wallet?.id) {
      await window.daemon.wallet.assignProject(project.id, wallet.id)
    }
  }, { projectPath, projectName, validConfig })
}

async function openToolFromLauncher(page, toolName, readySelector = null) {
  const drawerVisible = await page.locator('.command-drawer').isVisible().catch(() => false)
  if (!drawerVisible) {
    await page.getByRole('button', { name: 'Tools', exact: true }).click()
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
        ;(node).scrollIntoView({ block: 'center' })
        ;(node).click()
        return true
      }
    }
    return false
  }, toolName)
  if (!clicked) {
    throw new Error(`Could not find drawer tool card for ${toolName}`)
  }
  if (readySelector) {
    await page.waitForSelector(readySelector, { timeout: 30000 })
    return
  }
  await page.waitForFunction((expected) => {
    const title = document.querySelector('.drawer-title')?.textContent?.trim()
    return title?.toLowerCase() === String(expected).toLowerCase()
  }, toolName, { timeout: 30000 })
}

async function verifyFirstLaunchOnboarding(page) {
  await page.waitForSelector('.wizard-overlay', { timeout: 30000 })
  await page.waitForSelector('.wizard-card', { timeout: 30000 })
  await page.reload()
  await waitForAppReady(page)
}

async function verifyWalletJourney(page) {
  await openToolFromLauncher(page, 'Wallet', '.wallet-panel')
  await page.waitForFunction(() => {
    const tabs = Array.from(document.querySelectorAll('.wallet-tab')).map((node) => node.textContent?.trim())
    return tabs.includes('Wallet') && tabs.includes('Agents')
  }, { timeout: 30000 })
  await page.waitForFunction(() => {
    const body = document.body.textContent ?? ''
    return body.includes('tracked') || body.includes('Wallet data couldn\'t load')
  }, { timeout: 30000 })
  await page.locator('.wallet-panel .wallet-icon-btn').click()
  await page.waitForFunction(() => {
    const body = document.body.textContent ?? ''
    return body.includes('Wallet Infrastructure') || body.includes('No wallets configured') || body.includes('Add Wallet')
  }, { timeout: 30000 })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.wallet-panel'), { timeout: 30000 })
}

async function verifySolanaWorkflowTabs(page) {
  await openToolFromLauncher(page, 'Solana', '.solana-toolbox')
  const tabs = [
    { name: 'Overview', check: () => page.locator('.solana-workflow-title').waitFor({ timeout: 30000 }) },
    { name: 'Connect', check: () => page.locator('.solana-service-row, .solana-split-title').first().waitFor({ timeout: 30000 }) },
    { name: 'Build', check: () => page.locator('.solana-integration-row, .solana-skill-group').first().waitFor({ timeout: 30000 }) },
    { name: 'Integrate', check: () => page.locator('.solana-protocol-card').first().waitFor({ timeout: 30000 }) },
    { name: 'Diagnose', check: () => page.locator('.solana-toolchain-card').first().waitFor({ timeout: 30000 }) },
  ]

  for (const tab of tabs) {
    await page.locator('.solana-view-tab').evaluateAll((nodes, expected) => {
      for (const node of nodes) {
        const text = node.querySelector('.solana-view-tab-label')?.textContent?.trim()
        if (text === expected) {
          node.scrollIntoView({ block: 'center' })
          node.click()
          return true
        }
      }
      return false
    }, tab.name)
    await page.waitForFunction((expectedTab) => {
      const activeTab = document.querySelector('.solana-view-tab.active')
      const activeLabel = activeTab?.querySelector('.solana-view-tab-label')?.textContent?.trim()
      return activeLabel === expectedTab
    }, tab.name, { timeout: 30000 })
    await tab.check()
  }

  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.solana-toolbox'), { timeout: 30000 })
}

async function verifyTokenLaunchFlow(page) {
  await openToolFromLauncher(page, 'Token Launch', '.token-launch-tool')
  await page.waitForFunction(() => {
    const body = document.body.textContent ?? ''
    return body.includes('Step 1')
      && body.includes('Check readiness and recent launches')
      && body.includes('Step 2')
      && body.includes('Save protocol config once')
      && body.includes('Recommended flow')
  }, { timeout: 30000 })
  await page.waitForFunction(() => {
    const body = document.body.textContent ?? ''
    return body.includes('Pump live now') && body.includes('Launch Token')
  }, { timeout: 30000 })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.token-launch-tool'), { timeout: 30000 })
}

async function verifyRecoverySurface(page) {
  await openToolFromLauncher(page, 'Settings', '.settings-center')
  await page.locator('[data-tab="setup"]').click()
  await page.waitForFunction(() => {
    const body = document.body.textContent ?? ''
    return body.includes('Re-run Setup Wizard') && body.includes('Reset UI Layout')
  }, { timeout: 30000 })
}

async function run() {
  const cdpPort = await getFreePort()
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

  await waitForPort(cdpPort)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)

  const page = await getPage()
  attachPageDiagnostics(page)
  await waitForAppReady(page)

  await verifyFirstLaunchOnboarding(page)
  await seedWorkflowState(page)
  await page.reload()
  await waitForAppReady(page)
  await page.waitForSelector('.project-tab.active', { timeout: 30000 })

  await verifyWalletJourney(page)
  await verifySolanaWorkflowTabs(page)
  await verifyTokenLaunchFlow(page)
  await verifyRecoverySurface(page)

  assert.equal(rendererFailures.length, 0, `renderer failures detected:\n${rendererFailures.join('\n')}`)
}

try {
  await run()
  console.log('Workflow journey smoke passed')
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
}
