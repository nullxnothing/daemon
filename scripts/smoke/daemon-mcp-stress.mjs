import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

const sandboxRoot = mkdtempSync(path.join(tmpdir(), 'daemon-mcp-stress-'))
const userDataDir = path.join(sandboxRoot, 'userData')
const homeDir = path.join(sandboxRoot, 'home')
const projectPath = path.join(sandboxRoot, 'project')
const projectName = 'DAEMON MCP Stress'

const catalogMcpNames = ['helius', 'solana-mcp-server', 'phantom-docs', 'payai-mcp-server', 'x402-mcp']
const projectStressCount = 16
const globalStressCount = 10
const codexStressCount = 12
const toggleRounds = 5

let electronProcess
let browser
const rendererConsole = []
const rendererFailures = []

function logStep(message) {
  console.log(`[mcp-stress] ${message}`)
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

    const list = mustOk(await window.daemon.projects.list(), 'list projects') ?? []
    const exists = list.some((project) => project.path === projectPath)
    if (!exists) {
      mustOk(await window.daemon.projects.create({ name: projectName, path: projectPath }), 'create stress project')
    }
  }, { projectPath, projectName })
}

async function openToolFromLauncher(page, toolName, readySelector = null) {
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

  if (readySelector) {
    await page.waitForSelector(readySelector, { timeout: 30000 })
    return
  }
  await page.waitForFunction((expected) => {
    const title = document.querySelector('.drawer-title')?.textContent?.trim()
    return title?.toLowerCase() === String(expected).toLowerCase()
  }, toolName, { timeout: 30000 })
}

async function stressMcpBridge(page) {
  return page.evaluate(async ({ catalogMcpNames, projectPath, projectStressCount, globalStressCount, codexStressCount, toggleRounds }) => {
    const mustOk = (res, label) => {
      if (!res?.ok) throw new Error(`${label}: ${res?.error ?? 'unknown failure'}`)
      return res.data
    }
    const mcpConfig = (name, index) => JSON.stringify({
      command: 'node',
      args: ['--version'],
      env: {
        DAEMON_MCP_STRESS: name,
        DAEMON_MCP_STRESS_INDEX: String(index),
      },
    })
    const projectNames = Array.from({ length: projectStressCount }, (_, index) => `daemon-project-stress-${index}`)
    const globalNames = Array.from({ length: globalStressCount }, (_, index) => `daemon-global-stress-${index}`)
    const codexNames = Array.from({ length: codexStressCount }, (_, index) => `daemon_codex_stress_${index}`)
    const startedAt = performance.now()

    for (const [index, name] of [...catalogMcpNames, ...projectNames].entries()) {
      mustOk(await window.daemon.claude.mcpAdd({
        name,
        description: `DAEMON MCP stress registry entry ${name}`,
        isGlobal: false,
        config: mcpConfig(name, index),
      }), `register project MCP ${name}`)
    }

    for (const [index, name] of globalNames.entries()) {
      mustOk(await window.daemon.claude.mcpAdd({
        name,
        description: `DAEMON global MCP stress entry ${name}`,
        isGlobal: true,
        config: mcpConfig(name, index),
      }), `register global MCP ${name}`)
    }

    for (let round = 0; round < toggleRounds; round += 1) {
      for (const name of [...catalogMcpNames, ...projectNames]) {
        mustOk(await window.daemon.claude.projectMcpToggle(projectPath, name, true), `enable project MCP ${name} round ${round}`)
      }
      const disableEvery = round % 2 === 0 ? 3 : 4
      for (const [index, name] of projectNames.entries()) {
        if (index % disableEvery === 0) {
          mustOk(await window.daemon.claude.projectMcpToggle(projectPath, name, false), `disable project MCP ${name} round ${round}`)
          mustOk(await window.daemon.claude.projectMcpToggle(projectPath, name, true), `restore project MCP ${name} round ${round}`)
        }
      }
    }

    for (let round = 0; round < toggleRounds; round += 1) {
      for (const name of globalNames) {
        mustOk(await window.daemon.claude.globalMcpToggle(name, true), `enable global MCP ${name} round ${round}`)
      }
      for (const [index, name] of globalNames.entries()) {
        if ((index + round) % 3 === 0) {
          mustOk(await window.daemon.claude.globalMcpToggle(name, false), `disable global MCP ${name} round ${round}`)
          mustOk(await window.daemon.claude.globalMcpToggle(name, true), `restore global MCP ${name} round ${round}`)
        }
      }
    }

    for (const [index, name] of codexNames.entries()) {
      mustOk(await window.daemon.codex.mcpAdd(name, 'node', ['--version'], {
        DAEMON_CODEX_STRESS: name,
        DAEMON_CODEX_STRESS_INDEX: String(index),
      }), `add codex MCP ${name}`)
    }
    for (let round = 0; round < toggleRounds; round += 1) {
      for (const name of codexNames) {
        mustOk(await window.daemon.codex.mcpToggle(name, round % 2 === 0), `toggle codex MCP ${name} round ${round}`)
      }
    }
    for (const name of codexNames) {
      mustOk(await window.daemon.codex.mcpToggle(name, true), `final-enable codex MCP ${name}`)
    }

    const projectAll = mustOk(await window.daemon.claude.projectMcpAll(projectPath), 'read project MCPs') ?? []
    const globalAll = mustOk(await window.daemon.claude.globalMcpAll(), 'read global MCPs') ?? []
    const codexAll = mustOk(await window.daemon.codex.mcpAll(), 'read codex MCPs') ?? []
    const elapsedMs = Math.round(performance.now() - startedAt)

    return {
      elapsedMs,
      projectEnabled: projectAll.filter((entry) => entry.enabled).length,
      projectCatalogEnabled: catalogMcpNames.filter((name) => projectAll.some((entry) => entry.name === name && entry.enabled)).length,
      projectStressEnabled: projectNames.filter((name) => projectAll.some((entry) => entry.name === name && entry.enabled)).length,
      globalEnabled: globalNames.filter((name) => globalAll.some((entry) => entry.name === name && entry.enabled)).length,
      codexEnabled: codexNames.filter((name) => codexAll.some((entry) => entry.name === name && entry.enabled)).length,
      projectNames,
      globalNames,
      codexNames,
    }
  }, { catalogMcpNames, projectPath, projectStressCount, globalStressCount, codexStressCount, toggleRounds })
}

async function verifySolanaMcpUi(page) {
  await openToolFromLauncher(page, 'Solana', '.solana-toolbox')
  await page.getByRole('tab', { name: /^Connect\b/ }).click()
  await page.waitForSelector('.solana-service-row', { timeout: 30000 })
  await page.waitForFunction((expectedCount) => {
    const rows = Array.from(document.querySelectorAll('.solana-service-row'))
    const enabled = rows.filter((row) => row.querySelector('.solana-toggle')?.classList.contains('on')).length
    return rows.length >= expectedCount && enabled >= expectedCount
  }, catalogMcpNames.length, { timeout: 30000 })

  const heliusToggle = page.locator('.solana-service-row', { hasText: 'Helius' }).locator('.solana-toggle').first()
  await heliusToggle.click()
  await page.waitForFunction(() => {
    const row = Array.from(document.querySelectorAll('.solana-service-row'))
      .find((entry) => entry.textContent?.includes('Helius'))
    return row && !row.querySelector('.solana-toggle')?.classList.contains('on')
  }, { timeout: 30000 })

  await heliusToggle.click()
  await page.waitForFunction(() => {
    const row = Array.from(document.querySelectorAll('.solana-service-row'))
      .find((entry) => entry.textContent?.includes('Helius'))
    return row?.querySelector('.solana-toggle')?.classList.contains('on') === true
  }, { timeout: 30000 })

  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.solana-service-row'))
    return {
      rows: rows.length,
      enabledRows: rows.filter((row) => row.querySelector('.solana-toggle')?.classList.contains('on')).length,
      labels: rows.map((row) => row.querySelector('.solana-service-name')?.textContent?.trim()).filter(Boolean),
    }
  })
}

async function verifyLowPowerStillResponds(page) {
  const setLowPower = async (enabled) => {
    await page.evaluate(async (enabled) => {
      const res = await window.daemon.settings.setLowPowerMode(enabled)
      if (!res?.ok) throw new Error(res?.error ?? 'setLowPowerMode failed')
    }, enabled)
    await page.reload()
    await waitForAppReady(page)
    await page.waitForSelector('.project-tab.active', { timeout: 30000 })
    await page.waitForSelector(`.app[data-low-power="${String(enabled)}"]`, { timeout: 30000 })
  }

  await setLowPower(true)
  await openToolFromLauncher(page, 'Solana', '.solana-toolbox')
  await page.getByRole('tab', { name: /^Connect\b/ }).click()
  await page.waitForSelector('.solana-service-row', { timeout: 30000 })
  await setLowPower(false)
}

function prepareSandbox() {
  mkdirSync(userDataDir, { recursive: true })
  mkdirSync(homeDir, { recursive: true })
  mkdirSync(projectPath, { recursive: true })
  writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({
    name: 'daemon-mcp-stress-project',
    version: '0.0.0',
    private: true,
  }, null, 2), 'utf8')
  writeFileSync(path.join(projectPath, 'README.md'), '# DAEMON MCP stress project\n', 'utf8')
}

function verifyConfigFiles(stressResult) {
  const projectMcpPath = path.join(projectPath, '.mcp.json')
  const claudeJsonPath = path.join(homeDir, '.claude.json')
  const codexConfigPath = path.join(homeDir, '.codex', 'config.toml')

  assert.equal(existsSync(projectMcpPath), true, 'project .mcp.json was not written')
  assert.equal(existsSync(claudeJsonPath), true, 'isolated Claude config was not written')
  assert.equal(existsSync(codexConfigPath), true, 'isolated Codex config was not written')

  const projectMcp = JSON.parse(readFileSync(projectMcpPath, 'utf8'))
  const claudeJson = JSON.parse(readFileSync(claudeJsonPath, 'utf8'))
  const codexConfig = readFileSync(codexConfigPath, 'utf8')

  for (const name of [...catalogMcpNames, ...stressResult.projectNames]) {
    assert.ok(projectMcp.mcpServers?.[name], `missing project MCP ${name}`)
  }
  for (const name of stressResult.globalNames) {
    assert.ok(claudeJson.mcpServers?.[name], `missing global MCP ${name}`)
  }
  for (const name of stressResult.codexNames) {
    assert.ok(codexConfig.includes(`[mcp_servers.${name}]`), `missing Codex MCP ${name}`)
  }
}

async function run() {
  prepareSandbox()

  const cdpPort = await getFreePort()
  logStep('spawning electron with isolated MCP config roots')
  electronProcess = spawn(electronBinary, [mainEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DAEMON_SMOKE_TEST: '1',
      DAEMON_SMOKE_CDP_PORT: String(cdpPort),
      DAEMON_USER_DATA_DIR: userDataDir,
      DAEMON_LOW_POWER_MODE: '0',
      DAEMON_MCP_HOME_DIR: homeDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  electronProcess.stdout.on('data', (chunk) => process.stdout.write(chunk))
  electronProcess.stderr.on('data', (chunk) => process.stderr.write(chunk))

  logStep('waiting for cdp port')
  await waitForPort(cdpPort)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)

  const page = await getPage()
  attachPageDiagnostics(page)
  await waitForAppReady(page)

  logStep('seeding app state')
  await seedAppState(page)
  await page.reload()
  await waitForAppReady(page)
  await page.waitForSelector('.project-tab.active', { timeout: 30000 })

  logStep('running MCP bridge stress')
  const stressResult = await stressMcpBridge(page)
  assert.equal(stressResult.projectCatalogEnabled, catalogMcpNames.length, 'not all catalog MCPs are enabled')
  assert.equal(stressResult.projectStressEnabled, projectStressCount, 'not all project stress MCPs are enabled')
  assert.equal(stressResult.globalEnabled, globalStressCount, 'not all global stress MCPs are enabled')
  assert.equal(stressResult.codexEnabled, codexStressCount, 'not all Codex stress MCPs are enabled')

  logStep('checking Solana MCP UI against stressed config')
  const uiResult = await verifySolanaMcpUi(page)
  assert.ok(uiResult.rows >= catalogMcpNames.length, `expected at least ${catalogMcpNames.length} MCP UI rows`)
  assert.ok(uiResult.enabledRows >= catalogMcpNames.length, `expected at least ${catalogMcpNames.length} enabled MCP UI rows`)

  logStep('checking MCP surfaces still respond in low-power app mode')
  await verifyLowPowerStillResponds(page)

  logStep('verifying isolated config files')
  verifyConfigFiles(stressResult)

  assert.equal(rendererFailures.length, 0, `renderer failures detected:\n${rendererFailures.join('\n')}`)
  console.log(JSON.stringify({
    elapsedMs: stressResult.elapsedMs,
    projectEnabled: stressResult.projectEnabled,
    globalEnabled: stressResult.globalEnabled,
    codexEnabled: stressResult.codexEnabled,
    uiRows: uiResult.rows,
    uiEnabledRows: uiResult.enabledRows,
  }, null, 2))
}

try {
  await run()
  console.log('DAEMON MCP stress test passed')
} finally {
  if (rendererConsole.length > 0) {
    console.log('[mcp-stress] collected renderer diagnostics:')
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
  rmSync(sandboxRoot, { recursive: true, force: true })
}
