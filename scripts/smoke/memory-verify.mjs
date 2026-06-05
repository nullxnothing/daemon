// Live end-to-end verification of DAEMON Memory v1 + Guard on the built app.
// Launches Electron like the smoke harness, then drives window.daemon.memory.* :
//   create project -> extract -> approve -> buildContextBundle -> assert block + usage event.
// Run: node scripts/smoke/memory-verify.mjs   (after pnpm run build)
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
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
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-memverify-'))

// A throwaway fixture project the extractor can read.
const projectPath = mkdtempSync(path.join(tmpdir(), 'daemon-memfixture-'))
const projectName = 'Memory Verify Fixture'
writeFileSync(path.join(projectPath, 'pnpm-lock.yaml'), '')
writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({
  packageManager: 'pnpm@9.0.0',
  scripts: { test: 'vitest run', build: 'vite build', dev: 'vite' },
  dependencies: { react: '18' },
  devDependencies: { typescript: '5' },
}, null, 2))

let electronProcess
let browser

function log(m) { console.log(`[mem-verify] ${m}`) }

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const a = server.address()
      server.close(() => resolve(a.port))
    })
  })
}

function waitForPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.connect({ port, host: '127.0.0.1' })
      socket.once('connect', () => { socket.destroy(); resolve() })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for port ${port}`))
        setTimeout(tryConnect, 250)
      })
    }
    tryConnect()
  })
}

async function getPage() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const page = browser.contexts()[0]?.pages()[0]
    if (page) return page
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('Timed out waiting for a BrowserWindow page')
}

async function main() {
  const cdpPort = await getFreePort()
  log(`launching electron (cdp ${cdpPort})`)
  electronProcess = spawn(electronBinary, [mainEntry], {
    cwd: repoRoot,
    env: { ...process.env, DAEMON_SMOKE_TEST: '1', DAEMON_SMOKE_CDP_PORT: String(cdpPort), DAEMON_USER_DATA_DIR: userDataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  electronProcess.stdout.on('data', (c) => process.stdout.write(c))
  electronProcess.stderr.on('data', (c) => process.stderr.write(c))

  await waitForPort(cdpPort)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
  const page = await getPage()
  await page.waitForFunction(() => !!window.daemon, { timeout: 30000 })
  log('app ready')

  const result = await page.evaluate(async ({ projectPath, projectName }) => {
    const unwrap = (res, label) => {
      if (!res || res.ok !== true) throw new Error(`${label} failed: ${res?.error ?? 'no response'}`)
      return res.data
    }
    // 1. Ensure the project exists and grab its id.
    let list = unwrap(await window.daemon.projects.list(), 'projects.list')
    let project = list.find((p) => p.path === projectPath)
    if (!project) {
      unwrap(await window.daemon.projects.create({ name: projectName, path: projectPath }), 'projects.create')
      list = unwrap(await window.daemon.projects.list(), 'projects.list#2')
      project = list.find((p) => p.path === projectPath)
    }
    const projectId = project.id

    // 2. Extract memories from the fixture project.
    const extracted = unwrap(await window.daemon.memory.extract(projectPath, projectId), 'memory.extract')

    // 3. Approve the package_manager + test_command suggestions.
    const toApprove = extracted.filter((m) => m.kind === 'package_manager' || m.kind === 'test_command')
    for (const m of toApprove) unwrap(await window.daemon.memory.approve(m.id), 'memory.approve')

    // 4. Build the context bundle (this also records usage events).
    const bundle = unwrap(await window.daemon.memory.buildContextBundle(projectId, {}), 'memory.buildContextBundle')

    // 5. Re-list to confirm approval + last_used_at stamping.
    const approved = unwrap(await window.daemon.memory.list(projectId, { status: 'approved' }), 'memory.list approved')

    // 6. CheckRunner discovery (deploy-safe).
    const checks = unwrap(await window.daemon.memory.discoverChecks(projectPath), 'checks.discover')

    return {
      extractedKinds: extracted.map((m) => m.kind).sort(),
      approvedCount: approved.length,
      bundleBlock: bundle.block,
      bundleUsedIds: bundle.usedMemoryIds,
      usedStamped: approved.filter((m) => m.lastUsedAt != null).length,
      checkCommands: checks.map((c) => c.command).sort(),
    }
  }, { projectPath, projectName })

  // ---- Assertions ----
  log(`extracted kinds: ${result.extractedKinds.join(', ')}`)
  assert(result.extractedKinds.includes('package_manager'), 'expected package_manager memory')
  assert(result.extractedKinds.includes('test_command'), 'expected test_command memory')

  log(`approved: ${result.approvedCount}, bundle used ids: ${result.bundleUsedIds.length}`)
  assert(result.approvedCount >= 2, 'expected >= 2 approved memories')
  assert(result.bundleUsedIds.length >= 2, 'expected bundle to include approved memories')

  assert(result.bundleBlock.includes('--- DAEMON MEMORY ---'), 'bundle missing DAEMON MEMORY header')
  assert(result.bundleBlock.includes('pnpm'), 'bundle should mention pnpm package manager')
  log('bundle block:\n' + result.bundleBlock)

  assert(result.usedStamped >= 2, 'expected usage events to stamp last_used_at on injected memories')

  log(`discovered checks: ${result.checkCommands.join(', ')}`)
  assert(result.checkCommands.includes('pnpm run test'), 'expected test check')
  assert(result.checkCommands.includes('pnpm run build'), 'expected build check')
  assert(!result.checkCommands.some((c) => /deploy|publish/.test(c)), 'no deploy check should appear')

  log('PASS — memory extracted, approved, injected, usage-recorded; checks deploy-safe.')
}

function cleanup() {
  // Best-effort: Windows may still hold the user-data dir as Electron exits.
  try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* ignore */ }
  try { rmSync(projectPath, { recursive: true, force: true }) } catch { /* ignore */ }
}

main()
  .then(async () => {
    await browser?.close().catch(() => {})
    electronProcess?.kill()
    cleanup()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('[mem-verify] FAIL:', err)
    await browser?.close().catch(() => {})
    electronProcess?.kill()
    cleanup()
    process.exit(1)
  })
