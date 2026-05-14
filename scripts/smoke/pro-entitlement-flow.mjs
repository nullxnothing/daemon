import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

const sandboxRoot = mkdtempSync(path.join(tmpdir(), 'daemon-pro-entitlement-'))
const userDataDir = path.join(sandboxRoot, 'userData')
const homeDir = path.join(sandboxRoot, 'home')
const projectPath = path.join(sandboxRoot, 'project')
const projectName = 'DAEMON Pro Entitlement Smoke'
const entitlementJwt = 'entitlement-smoke-jwt'
const entitlementWallet = 'EntitlementSmokeWallet111111111111111111111'
const paidFeatures = ['daemon-ai', 'arena', 'pro-skills', 'mcp-sync', 'priority-api']

let electronProcess
let browser
let apiServer
let entitlementActive = false
let remoteMcpConfig = null

const apiRequests = []
const rendererConsole = []
const rendererFailures = []

function logStep(message) {
  console.log(`[pro-entitlement] ${message}`)
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

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function holderStatus() {
  return {
    enabled: false,
    eligible: false,
    mint: null,
    minAmount: null,
    currentAmount: null,
    symbol: 'DAEMON',
  }
}

function statusPayload() {
  if (!entitlementActive) {
    return {
      active: false,
      expiresAt: null,
      features: [],
      tier: null,
      plan: 'light',
      accessSource: 'free',
      holderStatus: holderStatus(),
    }
  }

  return {
    active: true,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    features: paidFeatures,
    tier: 'pro',
    plan: 'pro',
    accessSource: 'payment',
    holderStatus: holderStatus(),
  }
}

function requireActiveAuth(req, res) {
  const auth = req.headers.authorization
  if (auth !== `Bearer ${entitlementJwt}`) {
    sendJson(res, 401, { ok: false, error: 'Missing Pro token' })
    return false
  }
  if (!entitlementActive) {
    sendJson(res, 403, { ok: false, error: 'Entitlement inactive' })
    return false
  }
  return true
}

async function startFakeProApi() {
  apiServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    apiRequests.push(`${req.method} ${url.pathname}`)

    try {
      if (req.method === 'GET' && url.pathname === '/v1/subscribe/price') {
        sendJson(res, 200, {
          ok: true,
          data: {
            priceUsdc: 20,
            durationDays: 30,
            network: 'solana:mainnet',
            payTo: 'GNVxk3sn4iJ2iUaqEUskWQ1KNy9Mmcee3WF3AMtRjN7W',
            paymentMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          },
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/v1/subscribe/status') {
        sendJson(res, 200, { ok: true, data: statusPayload() })
        return
      }

      if (url.pathname === '/v1/priority/quota') {
        if (!requireActiveAuth(req, res)) return
        sendJson(res, 200, { ok: true, data: { quota: 500, used: 7, remaining: 493 } })
        return
      }

      if (url.pathname === '/v1/arena/submissions') {
        if (!requireActiveAuth(req, res)) return
        sendJson(res, 200, {
          ok: true,
          data: [
            {
              id: 'arena-entitlement-smoke',
              title: 'Entitlement smoke build',
              pitch: 'Verifies paid access before a Pro-only surface opens.',
              author: { handle: 'daemon', wallet: entitlementWallet },
              description: 'A deterministic Arena item returned by the local Pro API smoke server.',
              category: 'tool',
              themeWeek: 'v4',
              submittedAt: Date.now() - 60_000,
              status: 'featured',
              votes: 3,
              githubUrl: 'https://github.com/daemon/smoke',
              demoUrl: 'https://daemon.local/smoke',
              xHandle: 'daemon',
              discordHandle: 'daemon',
              contestSlug: 'v4-smoke',
            },
          ],
        })
        return
      }

      if (req.method === 'POST' && url.pathname.startsWith('/v1/arena/vote/')) {
        if (!requireActiveAuth(req, res)) return
        sendJson(res, 200, { ok: true, data: { voted: true } })
        return
      }

      if (url.pathname === '/v1/pro-skills/manifest') {
        if (!requireActiveAuth(req, res)) return
        sendJson(res, 200, { ok: true, data: { version: 1, skills: [] } })
        return
      }

      if (url.pathname === '/v1/sync/mcp') {
        if (!requireActiveAuth(req, res)) return
        if (req.method === 'POST') {
          const body = await readBody(req)
          remoteMcpConfig = JSON.parse(body || '{}')
          sendJson(res, 200, { ok: true, data: { updatedAt: Date.now() } })
          return
        }
        if (req.method === 'GET') {
          sendJson(res, 200, {
            ok: true,
            data: remoteMcpConfig ?? {
              version: 1,
              updatedAt: Date.now(),
              mcpServers: {
                entitlementSmoke: {
                  command: 'node',
                  args: ['--version'],
                  env: { DAEMON_PRO_ENTITLEMENT: '1' },
                },
              },
            },
          })
          return
        }
      }

      sendJson(res, 404, { ok: false, error: `Unhandled route ${req.method} ${url.pathname}` })
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Fake API error' })
    }
  })

  await new Promise((resolve, reject) => {
    apiServer.once('error', reject)
    apiServer.listen(0, '127.0.0.1', resolve)
  })

  const address = apiServer.address()
  assert.ok(address && typeof address !== 'string', 'fake Pro API did not bind to a TCP port')
  return `http://127.0.0.1:${address.port}`
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
    mustOk(await window.daemon.settings.setPinnedTools(['pro', 'solana-toolbox', 'settings']), 'set pinned tools')

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

async function verifyLockedUi(page) {
  await openToolFromLauncher(page, 'Daemon Pro', '.pro-panel')
  const panel = page.locator('.pro-panel')
  await panel.getByText('Unlock DAEMON Pro').waitFor({ timeout: 30000 })

  assert.equal(await panel.getByRole('button', { name: 'Skills' }).isDisabled(), true, 'Skills tab should be disabled without Pro')
  assert.equal(await panel.getByRole('button', { name: 'MCP Sync' }).isDisabled(), true, 'MCP Sync tab should be disabled without Pro')

  await panel.getByRole('button', { name: 'Arena' }).click()
  await panel.getByText('Arena submission is not active on this install.').waitFor({ timeout: 30000 })
}

async function verifyActiveUi(page) {
  await openToolFromLauncher(page, 'Daemon Pro', '.pro-panel')
  const panel = page.locator('.pro-panel')
  await panel.getByText('Plan active').waitFor({ timeout: 30000 })
  await panel.getByText('Paid').waitFor({ timeout: 30000 })

  assert.equal(await panel.getByRole('button', { name: 'Skills' }).isDisabled(), false, 'Skills tab should unlock with Pro')
  assert.equal(await panel.getByRole('button', { name: 'MCP Sync' }).isDisabled(), false, 'MCP Sync tab should unlock with Pro')

  await panel.getByRole('button', { name: 'Skills' }).click()
  await panel.locator('.pro-skills').getByText('Pro skill pack').waitFor({ timeout: 30000 })

  await panel.getByRole('button', { name: 'MCP Sync' }).click()
  await panel.locator('.pro-sync').getByText('MCP sync').waitFor({ timeout: 30000 })

  await panel.getByRole('button', { name: 'Arena' }).click()
  await panel.locator('.pro-arena').getByText('Ship something people want inside DAEMON.').waitFor({ timeout: 30000 })
  await panel.getByText('Entitlement smoke build').waitFor({ timeout: 30000 })
}

async function assertProtectedBridgeDenied(page, expectedMessage) {
  const results = await page.evaluate(async () => {
    const [quota, arenaList, skillsSync, mcpPush] = await Promise.all([
      window.daemon.pro.quota(),
      window.daemon.pro.arenaList(),
      window.daemon.pro.skillsSync(),
      window.daemon.pro.mcpPush(),
    ])
    return { quota, arenaList, skillsSync, mcpPush }
  })

  for (const [name, result] of Object.entries(results)) {
    assert.equal(result.ok, false, `${name} unexpectedly succeeded`)
    assert.match(result.error ?? '', expectedMessage, `${name} returned the wrong denial message`)
  }
}

async function assertProtectedBridgeAllowed(page) {
  const results = await page.evaluate(async () => {
    const [quota, arenaList, skillsSync, mcpPush, mcpPull] = await Promise.all([
      window.daemon.pro.quota(),
      window.daemon.pro.arenaList(),
      window.daemon.pro.skillsSync(),
      window.daemon.pro.mcpPush(),
      window.daemon.pro.mcpPull(),
    ])
    return { quota, arenaList, skillsSync, mcpPush, mcpPull }
  })

  assert.equal(results.quota.ok, true, results.quota.error)
  assert.equal(results.quota.data.remaining, 493, 'quota did not come from the fake Pro API')
  assert.equal(results.arenaList.ok, true, results.arenaList.error)
  assert.equal(results.arenaList.data.length, 1, 'Arena list should return paid-only data')
  assert.equal(results.skillsSync.ok, true, results.skillsSync.error)
  assert.deepEqual(results.skillsSync.data, { installed: [], skipped: [] }, 'empty manifest should sync cleanly')
  assert.equal(results.mcpPush.ok, true, results.mcpPush.error)
  assert.equal(results.mcpPush.data.count, 1, 'MCP push should count the isolated Claude config')
  assert.equal(results.mcpPull.ok, true, results.mcpPull.error)
  assert.equal(results.mcpPull.data.count, 1, 'MCP pull should write the remote config')
}

function prepareSandbox() {
  mkdirSync(userDataDir, { recursive: true })
  mkdirSync(homeDir, { recursive: true })
  mkdirSync(projectPath, { recursive: true })
  writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({
    name: 'daemon-pro-entitlement-smoke',
    version: '0.0.0',
    private: true,
  }, null, 2), 'utf8')
  writeFileSync(path.join(homeDir, '.claude.json'), JSON.stringify({
    mcpServers: {
      entitlementSmokeLocal: {
        command: 'node',
        args: ['--version'],
        env: { DAEMON_PRO_ENTITLEMENT_LOCAL: '1' },
      },
    },
  }, null, 2), 'utf8')
}

async function installNetworkMocks(page) {
  await page.route('https://api.dexscreener.com/latest/dex/tokens/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        pairs: [
          {
            url: 'https://dexscreener.com/solana/daemon-smoke',
            marketCap: 50000,
            liquidity: { usd: 10000 },
          },
        ],
      }),
    })
  })
}

async function run() {
  assert.equal(existsSync(mainEntry), true, `Electron main entry not built: ${mainEntry}`)
  prepareSandbox()
  const proApiBase = await startFakeProApi()
  const cdpPort = await getFreePort()

  logStep('spawning Electron against fake Pro API')
  electronProcess = spawn(electronBinary, [mainEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DAEMON_SMOKE_TEST: '1',
      DAEMON_SMOKE_CDP_PORT: String(cdpPort),
      DAEMON_USER_DATA_DIR: userDataDir,
      DAEMON_LOW_POWER_MODE: '0',
      DAEMON_MCP_HOME_DIR: homeDir,
      DAEMON_PRO_API_BASE: proApiBase,
      DAEMON_DISABLE_AUTO_UPDATE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  electronProcess.stdout.on('data', (chunk) => process.stdout.write(chunk))
  electronProcess.stderr.on('data', (chunk) => process.stderr.write(chunk))

  await waitForPort(cdpPort)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)

  const page = await getPage()
  attachPageDiagnostics(page)
  await installNetworkMocks(page)
  await waitForAppReady(page)

  logStep('seeding app state')
  await seedAppState(page)
  await page.reload()
  await waitForAppReady(page)
  await page.waitForSelector('.project-tab.active', { timeout: 30000 })

  logStep('verifying free install stays locked')
  const initialStatus = await page.evaluate(() => window.daemon.pro.status())
  assert.equal(initialStatus.ok, true, initialStatus.error)
  assert.equal(initialStatus.data.active, false, 'fresh install should not start active')
  assert.equal(initialStatus.data.plan, 'light', 'fresh install should start on light plan')
  await assertProtectedBridgeDenied(page, /Not subscribed to Daemon Pro/)
  await verifyLockedUi(page)

  logStep('activating paid entitlement from server status')
  entitlementActive = true
  const activeStatus = await page.evaluate(async ({ entitlementJwt, entitlementWallet }) => {
    const keyResult = await window.daemon.claude.storeKey('daemon_pro_jwt', entitlementJwt)
    if (!keyResult?.ok) throw new Error(keyResult?.error ?? 'failed to store smoke Pro JWT')
    return window.daemon.pro.refreshStatus(entitlementWallet)
  }, { entitlementJwt, entitlementWallet })
  assert.equal(activeStatus.ok, true, activeStatus.error)
  assert.equal(activeStatus.data.active, true, 'paid server status did not activate local Pro state')
  assert.equal(activeStatus.data.accessSource, 'payment', 'paid activation should report payment access')
  assert.deepEqual(activeStatus.data.features, paidFeatures, 'paid activation returned the wrong features')

  await page.reload()
  await waitForAppReady(page)
  await page.waitForSelector('.project-tab.active', { timeout: 30000 })
  await assertProtectedBridgeAllowed(page)
  await verifyActiveUi(page)

  logStep('revoking paid entitlement and checking lockout')
  entitlementActive = false
  const revokedStatus = await page.evaluate((entitlementWallet) => {
    return window.daemon.pro.refreshStatus(entitlementWallet)
  }, entitlementWallet)
  assert.equal(revokedStatus.ok, true, revokedStatus.error)
  assert.equal(revokedStatus.data.active, false, 'revoked server status should deactivate local Pro state')
  assert.equal(revokedStatus.data.plan, 'light', 'revoked status should fall back to light plan')

  await assertProtectedBridgeDenied(page, /Entitlement inactive/)
  await page.reload()
  await waitForAppReady(page)
  await page.waitForSelector('.project-tab.active', { timeout: 30000 })
  await verifyLockedUi(page)

  assert.ok(apiRequests.some((entry) => entry === 'GET /v1/subscribe/status'), 'status endpoint was not exercised')
  assert.ok(apiRequests.some((entry) => entry === 'GET /v1/priority/quota'), 'quota endpoint was not exercised')
  assert.ok(apiRequests.some((entry) => entry === 'GET /v1/arena/submissions'), 'Arena endpoint was not exercised')
  assert.ok(apiRequests.some((entry) => entry === 'GET /v1/pro-skills/manifest'), 'skills endpoint was not exercised')
  assert.ok(apiRequests.some((entry) => entry === 'POST /v1/sync/mcp'), 'MCP push endpoint was not exercised')
  assert.ok(apiRequests.some((entry) => entry === 'GET /v1/sync/mcp'), 'MCP pull endpoint was not exercised')

  assert.equal(rendererFailures.length, 0, `renderer failures detected:\n${rendererFailures.join('\n')}`)
  console.log(JSON.stringify({
    statusRequests: apiRequests.filter((entry) => entry === 'GET /v1/subscribe/status').length,
    protectedRequests: apiRequests.filter((entry) => entry !== 'GET /v1/subscribe/price' && entry !== 'GET /v1/subscribe/status').length,
    entitlementStatesChecked: ['free', 'paid', 'revoked'],
  }, null, 2))
}

try {
  await run()
  console.log('DAEMON Pro entitlement smoke passed')
} finally {
  if (rendererConsole.length > 0) {
    console.log('[pro-entitlement] collected renderer diagnostics:')
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
  await new Promise((resolve) => apiServer?.close(resolve))
  rmSync(sandboxRoot, { recursive: true, force: true })
}
