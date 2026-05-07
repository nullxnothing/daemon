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
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-app-responsive-'))

const projectPath = repoRoot
const projectName = 'DAEMON App Responsive Smoke'
const viewports = [
  { name: 'narrow', width: 640, height: 700 },
  { name: 'compact', width: 900, height: 760 },
  { name: 'desktop', width: 1366, height: 900 },
  { name: 'wide', width: 1720, height: 980 },
]

const toolChecks = [
  { name: 'New Project', readySelector: '.starter-panel', expectedText: 'Project Templates' },
  { name: 'Git', readySelector: '.git-center', expectedText: 'Git workflow' },
  { name: 'Env', readySelector: '.env-center', expectedText: 'Environment' },
  { name: 'Wallet', readySelector: '.wallet-panel', expectedText: 'Wallet workspace' },
  { name: 'Token Launch', readySelector: '.token-launch-tool', expectedText: 'Launch Center' },
  { name: 'Project Readiness', readySelector: '.project-readiness', expectedText: 'Solana project status' },
  { name: 'Solana', readySelector: '.solana-toolbox', expectedText: 'Solana Workspace' },
  { name: 'Settings', readySelector: '.settings-center', expectedText: 'Settings' },
  { name: 'Dashboard', readySelector: '.dash-canvas', expectedText: 'No tokens launched' },
  { name: 'Sessions', readySelector: '.session-history', expectedText: 'Sessions' },
  { name: 'Recovery', readySelector: '.recovery-panel', expectedText: 'Wallets' },
]

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

async function seedAppState(page) {
  await page.evaluate(async ({ projectPath, projectName }) => {
    await window.daemon.settings.setOnboardingComplete(true)
    await window.daemon.settings.setWorkspaceProfile({
      name: 'custom',
      toolVisibility: {},
    })

    const projects = await window.daemon.projects.list()
    const exists = projects.ok && projects.data?.some((project) => project.path === projectPath)
    if (!exists) {
      await window.daemon.projects.create({ name: projectName, path: projectPath })
    }
  }, { projectPath, projectName })
}

async function openDrawerGrid(page) {
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
}

async function openTool(page, tool, viewportName) {
  console.log(`[responsive-smoke] ${viewportName}: opening ${tool.name}`)
  await openDrawerGrid(page)
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
  }, tool.name)
  assert.equal(clicked, true, `could not find drawer tool ${tool.name}`)

  await page.waitForSelector(tool.readySelector, { state: 'visible', timeout: 30000 })
  if (tool.expectedText) {
    try {
      await page.waitForFunction(({ selector, expected }) => {
        return Array.from(document.querySelectorAll(selector)).some((node) => {
          if (!(node instanceof HTMLElement)) return false
          const visible = !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length)
          return visible && (node.textContent ?? '').includes(expected)
        })
      }, { selector: tool.readySelector, expected: tool.expectedText }, { timeout: 30000 })
    } catch (error) {
      const snapshot = await page.evaluate(({ selector }) => {
        const activeTool = window.__uiStore?.getState?.().activeWorkspaceToolId ?? null
        const surfaces = Array.from(document.querySelectorAll(selector)).map((node) => {
          if (!(node instanceof HTMLElement)) return null
          const rect = node.getBoundingClientRect()
          return {
            visible: !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            text: (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 800),
          }
        }).filter(Boolean)

        return {
          activeTool,
          bodyText: (document.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 800),
          surfaces,
        }
      }, { selector: tool.readySelector })
      throw new Error(`Timed out opening ${tool.name} at ${viewportName}; expected "${tool.expectedText}". Snapshot: ${JSON.stringify(snapshot, null, 2)}\n${error.message}`)
    }
  }
}

async function assertNoHorizontalOverflow(page, viewportName, contextName) {
  const result = await page.evaluate(() => {
    const selectors = [
      'html',
      'body',
      '#root',
      '.main-layout',
      '.command-drawer',
      '.drawer-content',
      '.drawer-body',
      '.starter-panel',
      '.git-center',
      '.env-center',
      '.wallet-panel',
      '.token-launch-tool',
      '.solana-toolbox',
      '.settings-center',
      '.dash-canvas',
      '.session-history',
      '.recovery-panel',
      '.terminal-panel',
      '.terminal-views',
      '.terminal-view',
      '.terminal-view .xterm-screen',
    ]

    const overflowingSelectors = selectors
      .map((selector) => {
        const node = document.querySelector(selector)
        if (!(node instanceof HTMLElement)) return null
        return {
          selector,
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          overflow: node.scrollWidth - node.clientWidth,
        }
      })
      .filter(Boolean)
      .filter((entry) => entry.overflow > 12)

    if (overflowingSelectors.length === 0) return []

    return overflowingSelectors.map((entry) => {
      const root = document.querySelector(entry.selector)
      if (!(root instanceof HTMLElement)) return entry

      const rootRect = root.getBoundingClientRect()
      const descendants = Array.from(root.querySelectorAll('*'))
        .filter((node) => node instanceof HTMLElement)
        .map((node) => {
          const rect = node.getBoundingClientRect()
          const rightOverflow = Math.round(rect.right - rootRect.left - root.clientWidth)
          return {
            tag: node.tagName.toLowerCase(),
            className: String(node.className),
            text: (node.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 90),
            width: Math.round(rect.width),
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            overflow: node.scrollWidth - node.clientWidth,
            rightOverflow,
          }
        })
        .filter((node) => node.overflow > 12 || node.rightOverflow > 12)
        .sort((a, b) => Math.max(b.overflow, b.rightOverflow) - Math.max(a.overflow, a.rightOverflow))
        .slice(0, 8)

      return { ...entry, descendants }
    })
  })

  assert.deepEqual(result, [], `horizontal overflow at ${viewportName} / ${contextName}: ${JSON.stringify(result, null, 2)}`)
}

async function verifySolanaTabs(page) {
  const tabs = ['Start', 'Connect', 'Transact', 'Launch', 'Debug']
  for (const tab of tabs) {
    await page.locator('.solana-view-tab').evaluateAll((nodes, expected) => {
      for (const node of nodes) {
        const label = node.querySelector('.solana-view-tab-label')?.textContent?.trim()
        if (label === expected) {
          node.scrollIntoView({ block: 'center' })
          node.click()
          return true
        }
      }
      return false
    }, tab)
    await page.waitForFunction((expected) => {
      const active = document.querySelector('.solana-view-tab.active .solana-view-tab-label')?.textContent?.trim()
      return active === expected
    }, tab, { timeout: 30000 })
  }
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

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await openDrawerGrid(page)
    await assertNoHorizontalOverflow(page, viewport.name, 'tool grid')

    for (const tool of toolChecks) {
      await openTool(page, tool, viewport.name)
      if (tool.name === 'Solana') await verifySolanaTabs(page)
      await assertNoHorizontalOverflow(page, viewport.name, tool.name)
    }
  }

  assert.equal(rendererFailures.length, 0, `renderer failures detected:\n${rendererFailures.join('\n')}`)
}

try {
  await run()
  console.log('App responsive smoke passed')
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
