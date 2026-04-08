import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const requireFromRepo = createRequire(path.join(repoRoot, 'package.json'))
const { chromium } = requireFromRepo('playwright')
const electronBinary = process.env.DAEMON_SMOKE_ELECTRON || path.join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
const mainEntry = path.join(repoRoot, 'dist-electron', 'main', 'index.js')
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-token-launch-smoke-'))
const projectPath = repoRoot
const projectName = 'DAEMON Token Launch Smoke'
const validConfig = '11111111111111111111111111111111'

let electronProcess
let browser

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

async function waitForAppReady(page) {
  await page.waitForFunction(() => !!window.daemon, { timeout: 30000 })
  await page.waitForSelector('.titlebar', { timeout: 30000 })
  await page.waitForSelector('.main-layout', { timeout: 30000 })
}

async function seedAppState(page) {
  await page.evaluate(async ({ projectPath, projectName, validConfig }) => {
    await window.daemon.settings.setOnboardingComplete(true)

    const projects = await window.daemon.projects.list()
    let project = projects.ok ? projects.data?.find((entry) => entry.path === projectPath) : null
    if (!project) {
      const created = await window.daemon.projects.create({ name: projectName, path: projectPath })
      project = created.ok ? created.data : null
    }

    const wallets = await window.daemon.wallet.list()
    let wallet = wallets.ok ? wallets.data?.[0] : null
    if (!wallet) {
      const generated = await window.daemon.wallet.generate({ name: 'Smoke Wallet' })
      wallet = generated.ok ? generated.data : null
    }

    if (project?.id && wallet?.id) {
      await window.daemon.wallet.assignProject(project.id, wallet.id)
    }

    await window.daemon.settings.setTokenLaunchSettings({
      raydium: { configId: validConfig, quoteMint: validConfig },
      meteora: { configId: validConfig, quoteMint: validConfig, baseSupply: '1000000000' },
    })
  }, { projectPath, projectName, validConfig })
}

async function runSmoke(page) {
  const result = await page.evaluate(async () => {
    const launchpads = await window.daemon.launch.listLaunchpads()
    const wallets = await window.daemon.launch.listWalletOptions()
    const wallet = wallets.ok ? wallets.data?.find((entry) => entry.hasKeypair) ?? wallets.data?.[0] : null

    if (!wallet) {
      return { error: 'No wallet available', launchpads, wallets }
    }

    const baseInput = {
      launchpad: 'raydium',
      walletId: wallet.id,
      name: 'Smoke Token',
      symbol: 'SMOKE',
      description: 'Token launch preflight smoke check',
      imagePath: '',
      website: '',
      twitter: '',
      telegram: '',
      initialBuySol: 0.1,
      slippageBps: 500,
      priorityFeeSol: 0.001,
      mayhemMode: false,
    }

    const raydium = await window.daemon.launch.preflightToken(baseInput)
    const meteora = await window.daemon.launch.preflightToken({ ...baseInput, launchpad: 'meteora' })

    return { launchpads, wallets, raydium, meteora }
  })

  assert(!result.error, result.error || 'Unexpected token launch smoke error')
  assert(result.launchpads.ok, 'Launchpad list failed')
  assert(result.wallets.ok, 'Launch wallet list failed')
  assert(result.raydium.ok, 'Raydium preflight IPC failed')
  assert(result.meteora.ok, 'Meteora preflight IPC failed')

  const raydiumChecks = result.raydium.data?.checks ?? []
  const meteoraChecks = result.meteora.data?.checks ?? []

  assert(raydiumChecks.some((check) => check.id === 'raydium-config'), 'Missing raydium-config check')
  assert(raydiumChecks.some((check) => check.id === 'raydium-quote-mint'), 'Missing raydium-quote-mint check')
  assert(meteoraChecks.some((check) => check.id === 'meteora-config'), 'Missing meteora-config check')
  assert(meteoraChecks.some((check) => check.id === 'meteora-quote-mint'), 'Missing meteora-quote-mint check')
  assert(meteoraChecks.some((check) => check.id === 'meteora-base-supply'), 'Missing meteora-base-supply check')
}

try {
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
  await waitForAppReady(page)
  await seedAppState(page)
  await page.reload()
  await waitForAppReady(page)
  await runSmoke(page)

  console.log('Token launch preflight smoke passed')
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
