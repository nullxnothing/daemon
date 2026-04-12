import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const repoRoot = path.resolve(__dirname, '..', '..')
const electronBinary = process.env.DAEMON_SMOKE_ELECTRON || require('electron')
const mainEntry = path.join(repoRoot, 'dist-electron', 'main', 'index.js')
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-visual-regression-'))
const baselineRoot = path.join(repoRoot, 'scripts', 'smoke', 'visual-baselines', process.platform)
const resultRoot = path.join(repoRoot, 'test-results', 'visual-regression', process.platform)
const runningInCi = process.env.CI === 'true'
const defaultMaxChangedRatio = runningInCi ? 0.08 : 0
const defaultMaxDimensionDelta = runningInCi ? 96 : 1

const projectPath = repoRoot
const projectName = 'DAEMON Visual Regression Smoke'
const updateBaselines = process.argv.includes('--update') || process.env.DAEMON_UPDATE_VISUAL_BASELINES === '1'

let electronProcess
let browser
const rendererFailures = []

const profiles = [
  { name: 'desktop', width: 1366, height: 900 },
  { name: 'compact', width: 1180, height: 820 },
  { name: 'wide', width: 1720, height: 980 },
]

const scenarios = [
  {
    name: 'command-drawer',
    setup: async (page) => {
      await openDrawerGrid(page)
    },
    selector: '.command-drawer',
  },
  {
    name: 'settings-center',
    setup: async (page) => {
      await openTool(page, 'Settings', '.settings-center')
    },
    selector: '.settings-center',
  },
  {
    name: 'wallet-workspace-bar',
    setup: async (page) => {
      await openTool(page, 'Wallet', '.wallet-panel')
    },
    selector: '.wallet-workspace-bar',
  },
  {
    name: 'wallet-tabs',
    setup: async (page) => {
      await openTool(page, 'Wallet', '.wallet-panel')
    },
    selector: '.wallet-tabs',
  },
  {
    name: 'wallet-quickview',
    profiles: ['desktop', 'wide'],
    setup: async (page) => {
      await openWalletQuickView(page)
      await normalizeWalletQuickView(page)
    },
    selector: '.quickview-card--wallet',
  },
  {
    name: 'right-panel-tabs',
    setup: async () => {},
    selector: '.right-panel-tabs',
  },
  {
    name: 'aria-chamber',
    setup: async () => {},
    selector: '.aria-chamber',
  },
  {
    name: 'aria-prompt',
    setup: async () => {},
    selector: '.aria-prompt',
  },
  {
    name: 'terminal-tabs',
    setup: async () => {},
    selector: '.terminal-tabs',
  },
  {
    name: 'terminal-launcher-menu',
    maxChangedPixels: 180,
    setup: async (page) => {
      await openTerminalLauncher(page)
    },
    selector: '.terminal-launcher-menu',
  },
]

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

async function stabilizePage(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }
    `,
  })
}

async function openDrawerGrid(page) {
  await closeTransientUi(page)
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
  await closeTransientUi(page)
  await page.waitForSelector('.titlebar-portfolio', { timeout: 30000 })
  await page.locator('.titlebar-portfolio').click()
  await page.waitForSelector('.quickview-card--wallet', { timeout: 30000 })
}

async function normalizeWalletQuickView(page) {
  await page.evaluate(() => {
    const addressNode = document.querySelector('.quickview-wallet-address')
    if (addressNode) {
      addressNode.textContent = 'TEST WALLET · Shared RPC executor'
    }

    const card = document.querySelector('.quickview-card--wallet')
    if (card instanceof HTMLElement) {
      const nextLeft = Math.max(24, window.innerWidth - card.offsetWidth - 24)
      card.style.top = '72px'
      card.style.left = `${nextLeft}px`
      card.style.transform = 'none'
      card.style.setProperty('--enter-dir', '0px')
    }
  })
}

async function openTerminalLauncher(page) {
  await closeTransientUi(page)
  await page.getByRole('button', { name: 'New tab options' }).click()
  await page.waitForSelector('.terminal-launcher-menu', { timeout: 30000 })
}

async function closeTransientUi(page) {
  const quickviewOpen = await page.locator('.quickview-card--wallet').isVisible().catch(() => false)
  if (quickviewOpen) {
    await page.locator('.quickview-backdrop').dispatchEvent('mousedown')
    await page.waitForTimeout(150)
    await page.evaluate(() => {
      const card = document.querySelector('.quickview-card--wallet')
      if (card instanceof HTMLElement) {
        card.dispatchEvent(new Event('animationend', { bubbles: true }))
      }
    })
    await page.waitForSelector('.quickview-card--wallet', { state: 'hidden', timeout: 30000 })
  }

  const launcherOpen = await page.locator('.terminal-launcher-menu').isVisible().catch(() => false)
  if (launcherOpen) {
    await page.keyboard.press('Escape')
    await page.waitForSelector('.terminal-launcher-menu', { state: 'hidden', timeout: 30000 })
  }
}

async function normalizeAriaChamber(page) {
  await page.evaluate(() => {
    const face = document.querySelector('.aria-chamber .aria-face')
    if (face instanceof HTMLElement) {
      face.className = 'aria-face aria-face-idle aria-face-large'
      face.style.transform = 'translateX(0)'
      face.style.setProperty('--look-x', '0px')
    }

    const eyes = document.querySelectorAll('.aria-chamber .aria-eye')
    eyes.forEach((eye) => {
      if (eye instanceof HTMLElement) {
        eye.style.animation = 'none'
        eye.style.transition = 'none'
        eye.style.transform = 'none'
        eye.style.opacity = '0.8'
      }
    })
  })
}

async function normalizeAriaPrompt(page) {
  await page.evaluate(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement) {
      active.blur()
    }

    const prompt = document.querySelector('.aria-prompt')
    if (prompt instanceof HTMLElement) {
      prompt.style.transition = 'none'
    }

    const textarea = document.querySelector('.aria-prompt .aria-input')
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.value = ''
      textarea.style.height = '28px'
      textarea.style.transition = 'none'
      textarea.style.caretColor = 'transparent'
      textarea.scrollTop = 0
      textarea.scrollLeft = 0
      textarea.setSelectionRange(0, 0)
    }

    const caret = document.querySelector('.aria-prompt .aria-prompt-caret')
    if (caret instanceof HTMLElement) {
      caret.style.transition = 'none'
      caret.style.animation = 'none'
    }

    const submit = document.querySelector('.aria-prompt .aria-submit')
    if (submit instanceof HTMLElement) {
      submit.style.transition = 'none'
    }
  })
}

async function normalizeTerminalLauncher(page) {
  await page.mouse.move(1, 1)
  await page.evaluate(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement) {
      active.blur()
    }

    const menu = document.querySelector('.terminal-launcher-menu')
    if (menu instanceof HTMLElement) {
      menu.style.backdropFilter = 'none'
      menu.style.setProperty('-webkit-backdrop-filter', 'none')
      menu.style.boxShadow = 'none'
      menu.style.background = 'rgba(13, 16, 19, 0.98)'
    }
  })
}

async function stabilizeScenario(page, scenario) {
  if (scenario.name === 'aria-chamber') {
    await normalizeAriaChamber(page)
  }

  if (scenario.name === 'aria-prompt') {
    await normalizeAriaPrompt(page)
  }

  if (scenario.name === 'terminal-launcher-menu') {
    await normalizeTerminalLauncher(page)
  }
}

function getBaselinePath(profile, scenario) {
  if (profile.name === 'desktop') {
    return path.join(baselineRoot, `${scenario.name}.png`)
  }
  return path.join(baselineRoot, profile.name, `${scenario.name}.png`)
}

function getActualPath(profile, scenario) {
  return path.join(resultRoot, profile.name, `${scenario.name}.png`)
}

function getDiffPath(profile, scenario) {
  return path.join(resultRoot, profile.name, `${scenario.name}.diff.png`)
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true })
}

function readPng(filePath) {
  return PNG.sync.read(readFileSync(filePath))
}

function writePng(filePath, png) {
  ensureDir(path.dirname(filePath))
  writeFileSync(filePath, PNG.sync.write(png))
}

function cropPng(source, width, height) {
  const cropped = new PNG({ width, height })
  const sourceRowBytes = source.width * 4
  const croppedRowBytes = width * 4

  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * sourceRowBytes
    const sourceEnd = sourceStart + croppedRowBytes
    const targetStart = y * croppedRowBytes
    source.data.copy(cropped.data, targetStart, sourceStart, sourceEnd)
  }

  return cropped
}

function comparePngs(actualPath, baselinePath, diffPath) {
  const actual = readPng(actualPath)
  const baseline = readPng(baselinePath)
  const widthDelta = Math.abs(actual.width - baseline.width)
  const heightDelta = Math.abs(actual.height - baseline.height)
  const minWidth = Math.min(actual.width, baseline.width)
  const minHeight = Math.min(actual.height, baseline.height)
  const comparableActual = widthDelta || heightDelta ? cropPng(actual, minWidth, minHeight) : actual
  const comparableBaseline = widthDelta || heightDelta ? cropPng(baseline, minWidth, minHeight) : baseline

  const diff = new PNG({ width: minWidth, height: minHeight })
  const changedPixels = pixelmatch(
    comparableBaseline.data,
    comparableActual.data,
    diff.data,
    minWidth,
    minHeight,
    { threshold: 0.1 },
  )

  if (changedPixels > 0) {
    writePng(diffPath, diff)
  }

  return {
    changedPixels,
    totalPixels: minWidth * minHeight,
    widthDelta,
    heightDelta,
  }
}

async function captureScenario(page, profile, scenario) {
  await page.setViewportSize({ width: profile.width, height: profile.height })
  await page.waitForFunction((expectedWidth) => window.innerWidth === expectedWidth, profile.width, { timeout: 30000 })
  await scenario.setup(page)
  await stabilizeScenario(page, scenario)
  const target = page.locator(scenario.selector)
  await target.waitFor({ state: 'visible', timeout: 30000 })
  return target.screenshot({ animations: 'disabled', caret: 'hide' })
}

async function runVisuals(page) {
  ensureDir(baselineRoot)
  ensureDir(resultRoot)

  const failures = []

  for (const profile of profiles) {
    for (const scenario of scenarios) {
      if (scenario.profiles && !scenario.profiles.includes(profile.name)) {
        continue
      }

      const actualPath = getActualPath(profile, scenario)
      const baselinePath = getBaselinePath(profile, scenario)
      const diffPath = getDiffPath(profile, scenario)

      ensureDir(path.dirname(actualPath))
      const screenshot = await captureScenario(page, profile, scenario)
      writeFileSync(actualPath, screenshot)

      const hadBaseline = existsSync(baselinePath)
      if (updateBaselines || !hadBaseline) {
        ensureDir(path.dirname(baselinePath))
        writeFileSync(baselinePath, screenshot)
        console.log(`${hadBaseline ? 'Updated' : 'Created'} baseline ${profile.name}/${scenario.name}`)
        continue
      }

      const { changedPixels, totalPixels, widthDelta, heightDelta } = comparePngs(actualPath, baselinePath, diffPath)
      const maxChangedPixels = scenario.maxChangedPixels ?? 0
      const maxChangedRatio = scenario.maxChangedRatio ?? defaultMaxChangedRatio
      const maxChangedByRatio = Math.ceil(totalPixels * maxChangedRatio)
      const allowedChangedPixels = Math.max(maxChangedPixels, maxChangedByRatio)
      const maxDimensionDelta = scenario.maxDimensionDelta ?? defaultMaxDimensionDelta
      if (changedPixels > allowedChangedPixels || widthDelta > maxDimensionDelta || heightDelta > maxDimensionDelta) {
        failures.push({
          scenario: `${profile.name}/${scenario.name}`,
          changedPixels,
          allowedChangedPixels,
          widthDelta,
          heightDelta,
          actualPath,
          diffPath,
        })
        continue
      }

      if (changedPixels > 0 || widthDelta > 0 || heightDelta > 0) {
        rmSync(diffPath, { force: true })
        console.log(`Matched baseline ${profile.name}/${scenario.name} within tolerance (${changedPixels}/${allowedChangedPixels}px, ${widthDelta}w/${heightDelta}h)`)
        continue
      }

      console.log(`Matched baseline ${profile.name}/${scenario.name}`)
    }
  }

  if (failures.length > 0) {
    const details = failures
      .map((failure) => `${failure.scenario}: ${failure.changedPixels}/${failure.allowedChangedPixels} changed pixels, ${failure.widthDelta}w/${failure.heightDelta}h dimension drift\nactual: ${failure.actualPath}\ndiff: ${failure.diffPath}`)
      .join('\n\n')
    throw new Error(`Visual regression mismatches detected\n\n${details}`)
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
  await stabilizePage(page)
  await runVisuals(page)

  assert.equal(rendererFailures.length, 0, `renderer failures detected:\n${rendererFailures.join('\n')}`)
}

try {
  await run()
  console.log(updateBaselines ? 'Visual baselines updated' : 'Visual regression smoke passed')
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
