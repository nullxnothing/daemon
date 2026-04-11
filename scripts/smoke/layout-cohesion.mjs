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
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-layout-cohesion-'))

const projectPath = repoRoot
const projectName = 'DAEMON Layout Cohesion Smoke'

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
    await window.daemon.settings.setShowTitlebarWallet(true)
    await window.daemon.settings.setWorkspaceProfile({
      name: 'custom',
      toolVisibility: {},
    })

    const projects = await window.daemon.projects.list()
    const exists = projects.ok && projects.data?.some((project) => project.path === projectPath)
    if (!exists) {
      await window.daemon.projects.create({ name: projectName, path: projectPath })
    }

    const wallets = await window.daemon.wallet.list()
    if (!wallets.ok || !wallets.data || wallets.data.length === 0) {
      await window.daemon.wallet.generate({ name: 'Smoke Wallet' })
    }
  }, { projectPath, projectName })
}

async function openDrawerGrid(page) {
  const drawerVisible = await page.locator('.command-drawer').isVisible().catch(() => false)
  if (!drawerVisible) {
    await page.getByRole('button', { name: 'Tools', exact: true }).click()
    await page.waitForSelector('.command-drawer', { timeout: 30000 })
  }
}

async function openTool(page, toolName, readySelector) {
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
  }, toolName)
  assert.equal(clicked, true, `could not find drawer tool ${toolName}`)
  await page.waitForSelector(readySelector, { timeout: 30000 })
}

async function openWalletQuickView(page) {
  const trigger = page.locator('.titlebar-portfolio').first()
  const hasTrigger = await trigger.waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false)

  if (!hasTrigger) {
    return false
  }

  await trigger.click()
  await page.waitForSelector('.quickview-card--wallet', { timeout: 30000 })
  return true
}

async function openTerminalLauncher(page) {
  await page.getByRole('button', { name: 'New tab options' }).click()
  await page.waitForSelector('.terminal-launcher-menu', { timeout: 30000 })
}

async function readLayoutSnapshot(page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const select = (selector) => {
      const node = document.querySelector(selector)
      if (!(node instanceof HTMLElement)) return null
      return getComputedStyle(node)
    }

    const drawerHeader = select('.drawer-header')
    const drawerSearch = select('.drawer-search')
    const drawerCard = select('.drawer-tool-card')
    const rightRail = select('.right-panel-content')
    const settingsTab = select('.settings-tab')
    const walletHeader = select('.wallet-workspace-bar')
    const walletTab = select('.wallet-tab')
    const rightPanelTab = select('.right-panel-tab')
    const ariaPrompt = select('.aria-prompt')
    const quickviewCard = select('.quickview-card--wallet')
    const quickviewMeta = select('.quickview-wallet-meta')
    const quickviewStatGrid = select('.quickview-stat-grid')
    const quickviewFooter = select('.quickview-footer')
    const terminalTabs = select('.terminal-tabs')
    const terminalAdd = select('.terminal-tab-add')
    const terminalMenu = select('.terminal-launcher-menu')
    const terminalTools = select('.terminal-tools')
    const solanaToolbox = select('.solana-toolbox')
    const solanaHeader = select('.solana-workflow-header')
    const solanaTabs = select('.solana-view-tabs')
    const solanaTab = select('.solana-view-tab')
    const solanaZone = select('.solana-validator-zone')

    return {
      tokens: {
        drawerSpaceInline: root.getPropertyValue('--drawer-space-inline').trim(),
        drawerSpaceBlock: root.getPropertyValue('--drawer-space-block').trim(),
        drawerSectionPad: root.getPropertyValue('--drawer-section-pad').trim(),
        drawerCardRadius: root.getPropertyValue('--drawer-card-radius').trim(),
        drawerControlRadius: root.getPropertyValue('--drawer-control-radius').trim(),
        drawerRailShellPad: root.getPropertyValue('--drawer-rail-shell-pad').trim(),
        drawerRailCardGap: root.getPropertyValue('--drawer-rail-card-gap').trim(),
        radiusLg: root.getPropertyValue('--radius-lg').trim(),
        radiusMd: root.getPropertyValue('--radius-md').trim(),
        radiusSm: root.getPropertyValue('--radius-sm').trim(),
      },
      drawerHeader: drawerHeader ? {
        paddingLeft: drawerHeader.paddingLeft,
        paddingRight: drawerHeader.paddingRight,
      } : null,
      drawerSearch: drawerSearch ? {
        borderRadius: drawerSearch.borderTopLeftRadius,
      } : null,
      drawerCard: drawerCard ? {
        borderRadius: drawerCard.borderTopLeftRadius,
      } : null,
      rightRail: rightRail ? {
        paddingLeft: rightRail.paddingLeft,
        paddingRight: rightRail.paddingRight,
      } : null,
      settingsTab: settingsTab ? {
        borderRadius: settingsTab.borderTopLeftRadius,
      } : null,
      walletHeader: walletHeader ? {
        paddingLeft: walletHeader.paddingLeft,
        paddingRight: walletHeader.paddingRight,
      } : null,
      walletTab: walletTab ? {
        borderRadius: walletTab.borderTopLeftRadius,
      } : null,
      rightPanelTab: rightPanelTab ? {
        borderRadius: rightPanelTab.borderTopLeftRadius,
      } : null,
      ariaPrompt: ariaPrompt ? {
        marginLeft: ariaPrompt.marginLeft,
        marginRight: ariaPrompt.marginRight,
      } : null,
      quickviewCard: quickviewCard ? {
        borderRadius: quickviewCard.borderTopLeftRadius,
      } : null,
      quickviewMeta: quickviewMeta ? {
        paddingLeft: quickviewMeta.paddingLeft,
        paddingRight: quickviewMeta.paddingRight,
      } : null,
      quickviewStatGrid: quickviewStatGrid ? {
        paddingLeft: quickviewStatGrid.paddingLeft,
        paddingRight: quickviewStatGrid.paddingRight,
      } : null,
      quickviewFooter: quickviewFooter ? {
        paddingLeft: quickviewFooter.paddingLeft,
        paddingRight: quickviewFooter.paddingRight,
      } : null,
      terminalTabs: terminalTabs ? {
        paddingLeft: terminalTabs.paddingLeft,
        paddingRight: terminalTabs.paddingRight,
        height: terminalTabs.height,
      } : null,
      terminalAdd: terminalAdd ? {
        borderRadius: terminalAdd.borderTopLeftRadius,
        height: terminalAdd.height,
      } : null,
      terminalMenu: terminalMenu ? {
        borderRadius: terminalMenu.borderTopLeftRadius,
        paddingLeft: terminalMenu.paddingLeft,
        paddingRight: terminalMenu.paddingRight,
      } : null,
      terminalTools: terminalTools ? {
        paddingLeft: terminalTools.paddingLeft,
      } : null,
      solanaToolbox: solanaToolbox ? {
        overflowY: solanaToolbox.overflowY,
      } : null,
      solanaHeader: solanaHeader ? {
        paddingLeft: solanaHeader.paddingLeft,
        paddingRight: solanaHeader.paddingRight,
      } : null,
      solanaTabs: solanaTabs ? {
        paddingLeft: solanaTabs.paddingLeft,
        paddingRight: solanaTabs.paddingRight,
      } : null,
      solanaTab: solanaTab ? {
        borderRadius: solanaTab.borderTopLeftRadius,
      } : null,
      solanaZone: solanaZone ? {
        paddingLeft: solanaZone.paddingLeft,
        paddingRight: solanaZone.paddingRight,
      } : null,
    }
  })
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

  await page.setViewportSize({ width: 1366, height: 900 })
  await openDrawerGrid(page)
  const drawerSnapshot = await readLayoutSnapshot(page)
  await openTool(page, 'Settings', '.settings-center')
  const settingsSnapshot = await readLayoutSnapshot(page)
  await openTool(page, 'Wallet', '.wallet-panel')
  const walletSnapshot = await readLayoutSnapshot(page)
  await openTool(page, 'Solana', '.solana-toolbox')
  const solanaSnapshot = await readLayoutSnapshot(page)
  const quickviewAvailable = await openWalletQuickView(page)
  const quickviewSnapshot = quickviewAvailable ? await readLayoutSnapshot(page) : null
  if (quickviewAvailable) {
    await page.locator('.quickview-backdrop').click({ position: { x: 4, y: 4 } })
    await page.waitForSelector('.quickview-card--wallet', { state: 'hidden', timeout: 30000 })
  }
  await openTerminalLauncher(page)
  const terminalSnapshot = await readLayoutSnapshot(page)

  assert.ok(drawerSnapshot.drawerHeader, 'missing drawer header snapshot')
  assert.ok(drawerSnapshot.drawerSearch, 'missing drawer search snapshot')
  assert.ok(drawerSnapshot.drawerCard, 'missing drawer card snapshot')
  assert.ok(settingsSnapshot.rightRail, 'missing right rail snapshot')
  assert.ok(settingsSnapshot.rightPanelTab, 'missing right panel tab snapshot')
  assert.ok(settingsSnapshot.settingsTab, 'missing settings tab snapshot')
  assert.ok(settingsSnapshot.ariaPrompt, 'missing ARIA prompt snapshot')
  assert.ok(walletSnapshot.walletHeader, 'missing wallet header snapshot')
  assert.ok(walletSnapshot.walletTab, 'missing wallet tab snapshot')
  assert.ok(solanaSnapshot.solanaToolbox, 'missing solana toolbox snapshot')
  assert.ok(solanaSnapshot.solanaHeader, 'missing solana header snapshot')
  assert.ok(solanaSnapshot.solanaTabs, 'missing solana tabs snapshot')
  assert.ok(solanaSnapshot.solanaTab, 'missing solana tab snapshot')
  assert.ok(solanaSnapshot.solanaZone, 'missing solana zone snapshot')
  if (quickviewAvailable) {
    assert.ok(quickviewSnapshot?.quickviewCard, 'missing wallet quickview card snapshot')
    assert.ok(quickviewSnapshot?.quickviewMeta, 'missing wallet quickview meta snapshot')
    assert.ok(quickviewSnapshot?.quickviewStatGrid, 'missing wallet quickview stat grid snapshot')
    assert.ok(quickviewSnapshot?.quickviewFooter, 'missing wallet quickview footer snapshot')
  }
  assert.ok(terminalSnapshot.terminalTabs, 'missing terminal tabs snapshot')
  assert.ok(terminalSnapshot.terminalAdd, 'missing terminal add button snapshot')
  assert.ok(terminalSnapshot.terminalMenu, 'missing terminal launcher menu snapshot')
  assert.ok(terminalSnapshot.terminalTools, 'missing terminal tools snapshot')

  assert.equal(drawerSnapshot.drawerHeader.paddingLeft, drawerSnapshot.tokens.drawerSpaceInline, 'drawer header left gutter drifted')
  assert.equal(drawerSnapshot.drawerHeader.paddingRight, drawerSnapshot.tokens.drawerSpaceInline, 'drawer header right gutter drifted')
  assert.equal(drawerSnapshot.drawerSearch.borderRadius, drawerSnapshot.tokens.drawerControlRadius, 'drawer search radius drifted')
  assert.equal(drawerSnapshot.drawerCard.borderRadius, drawerSnapshot.tokens.drawerCardRadius, 'drawer card radius drifted')
  assert.equal(settingsSnapshot.rightRail.paddingLeft, settingsSnapshot.tokens.drawerRailShellPad, 'right rail shell padding drifted')
  assert.equal(settingsSnapshot.rightRail.paddingRight, settingsSnapshot.tokens.drawerRailShellPad, 'right rail shell padding drifted')
  assert.equal(settingsSnapshot.rightPanelTab.borderRadius, settingsSnapshot.tokens.drawerControlRadius, 'right rail tab radius drifted')
  assert.equal(settingsSnapshot.settingsTab.borderRadius, settingsSnapshot.tokens.drawerControlRadius, 'settings tab radius drifted')
  assert.equal(settingsSnapshot.ariaPrompt.marginLeft, settingsSnapshot.tokens.drawerRailShellPad, 'ARIA prompt inset drifted')
  assert.equal(settingsSnapshot.ariaPrompt.marginRight, settingsSnapshot.tokens.drawerRailShellPad, 'ARIA prompt inset drifted')
  assert.equal(walletSnapshot.walletHeader.paddingLeft, walletSnapshot.tokens.drawerSectionPad, 'wallet header gutter drifted')
  assert.equal(walletSnapshot.walletHeader.paddingRight, walletSnapshot.tokens.drawerSectionPad, 'wallet header gutter drifted')
  assert.equal(walletSnapshot.walletTab.borderRadius, walletSnapshot.tokens.drawerControlRadius, 'wallet tab radius drifted')
  assert.equal(solanaSnapshot.solanaToolbox.overflowY, 'auto', 'solana toolbox lost vertical scrolling')
  assert.equal(solanaSnapshot.solanaHeader.paddingLeft, '20px', 'solana header left gutter drifted')
  assert.equal(solanaSnapshot.solanaHeader.paddingRight, '20px', 'solana header right gutter drifted')
  assert.equal(solanaSnapshot.solanaTabs.paddingLeft, '20px', 'solana tabs left gutter drifted')
  assert.equal(solanaSnapshot.solanaTabs.paddingRight, '20px', 'solana tabs right gutter drifted')
  assert.equal(solanaSnapshot.solanaTab.borderRadius, '14px', 'solana tab radius drifted')
  assert.equal(solanaSnapshot.solanaZone.paddingLeft, '16px', 'solana content zone left gutter drifted')
  assert.equal(solanaSnapshot.solanaZone.paddingRight, '16px', 'solana content zone right gutter drifted')
  if (quickviewAvailable && quickviewSnapshot) {
    assert.equal(quickviewSnapshot.quickviewCard.borderRadius, '18px', 'wallet quickview card radius drifted')
    assert.equal(quickviewSnapshot.quickviewMeta.paddingLeft, '18px', 'wallet quickview header gutter drifted')
    assert.equal(quickviewSnapshot.quickviewMeta.paddingRight, '18px', 'wallet quickview header gutter drifted')
    assert.equal(quickviewSnapshot.quickviewStatGrid.paddingLeft, '18px', 'wallet quickview stats left gutter drifted')
    assert.equal(quickviewSnapshot.quickviewStatGrid.paddingRight, '18px', 'wallet quickview stats right gutter drifted')
    assert.equal(quickviewSnapshot.quickviewFooter.paddingLeft, '18px', 'wallet quickview footer left gutter drifted')
    assert.equal(quickviewSnapshot.quickviewFooter.paddingRight, '18px', 'wallet quickview footer right gutter drifted')
  }
  assert.equal(terminalSnapshot.terminalTabs.paddingLeft, '4px', 'terminal tabs left inset drifted')
  assert.equal(terminalSnapshot.terminalTabs.paddingRight, '4px', 'terminal tabs right inset drifted')
  assert.equal(terminalSnapshot.terminalTabs.height, '32px', 'terminal tabs height drifted')
  assert.equal(terminalSnapshot.terminalAdd.borderRadius, '4px', 'terminal launcher button radius drifted')
  assert.equal(terminalSnapshot.terminalAdd.height, '26px', 'terminal launcher button height drifted')
  assert.equal(terminalSnapshot.terminalMenu.borderRadius, '6px', 'terminal launcher menu radius drifted')
  assert.equal(terminalSnapshot.terminalMenu.paddingLeft, '4px', 'terminal launcher menu left inset drifted')
  assert.equal(terminalSnapshot.terminalMenu.paddingRight, '4px', 'terminal launcher menu right inset drifted')
  assert.equal(terminalSnapshot.terminalTools.paddingLeft, '8px', 'terminal tools gutter drifted')

  assert.equal(rendererFailures.length, 0, `renderer failures detected:\n${rendererFailures.join('\n')}`)
}

try {
  await run()
  console.log('Layout cohesion smoke passed')
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
