// Verifies fs:importPaths (the backend behind FileExplorer drag-and-drop):
// copies a real temp file into the project root via the renderer bridge,
// checks collision-safe renaming, then cleans up.

import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
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
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-dnd-'))

// A real source file to "drop".
const srcDir = mkdtempSync(path.join(tmpdir(), 'daemon-dnd-src-'))
const srcFile = path.join(srcDir, 'dropped-sample.txt')
writeFileSync(srcFile, 'hello from a dropped file')

const destName = 'dropped-sample.txt'
const destPath = path.join(repoRoot, destName)
const collisionPath = path.join(repoRoot, 'dropped-sample (2).txt')

let electronProcess
let browser

const log = (m) => console.log(`[dnd] ${m}`)

function getFreePort() {
  return new Promise((res, rej) => {
    const s = net.createServer(); s.unref(); s.on('error', rej)
    s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => res(a.port)) })
  })
}
function waitForPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((res, rej) => {
    const tick = () => {
      const sock = net.connect({ port, host: '127.0.0.1' })
      sock.once('connect', () => { sock.destroy(); res() })
      sock.once('error', () => { sock.destroy(); Date.now() >= deadline ? rej(new Error('timeout')) : setTimeout(tick, 250) })
    }
    tick()
  })
}
async function getPage() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const p = browser.contexts()[0]?.pages()[0]
    if (p) return p
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('no page')
}

async function run() {
  const cdpPort = await getFreePort()
  electronProcess = spawn(electronBinary, [mainEntry], {
    cwd: repoRoot,
    env: { ...process.env, DAEMON_SMOKE_TEST: '1', DAEMON_SMOKE_CDP_PORT: String(cdpPort), DAEMON_USER_DATA_DIR: userDataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  electronProcess.stdout.on('data', () => {})
  electronProcess.stderr.on('data', () => {})

  await waitForPort(cdpPort)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
  const page = await getPage()
  await page.waitForFunction(() => !!window.daemon, { timeout: 30000 })

  // Register the repo as a project so it passes path-boundary validation.
  await page.evaluate(async (projectPath) => {
    const list = await window.daemon.projects.list()
    if (!(list.ok && list.data?.some((p) => p.path === projectPath))) {
      await window.daemon.projects.create({ name: 'DAEMON', path: projectPath })
    }
  }, repoRoot)
  log('project registered')

  // First import.
  const r1 = await page.evaluate(
    ({ src, dest }) => window.daemon.fs.importPaths([src], dest),
    { src: srcFile, dest: repoRoot },
  )
  log(`import #1 -> ${JSON.stringify(r1)}`)
  if (!r1.ok) throw new Error('import #1 failed: ' + r1.error)
  if (!existsSync(destPath)) throw new Error('destination file not created')
  log('PASS: file copied into project root')

  // Second import of same name -> collision-safe rename.
  const r2 = await page.evaluate(
    ({ src, dest }) => window.daemon.fs.importPaths([src], dest),
    { src: srcFile, dest: repoRoot },
  )
  log(`import #2 -> ${JSON.stringify(r2)}`)
  if (!r2.ok) throw new Error('import #2 failed: ' + r2.error)
  if (!existsSync(collisionPath)) throw new Error('collision rename "(2)" not applied')
  log('PASS: collision resolved to "dropped-sample (2).txt"')

  // Path-escape guard: importing into a dir outside project must fail.
  const r3 = await page.evaluate(
    ({ src }) => window.daemon.fs.importPaths([src], 'C:/Windows'),
    { src: srcFile },
  )
  if (r3.ok) throw new Error('SECURITY: import into C:/Windows should have been rejected')
  log('PASS: out-of-project destination rejected')
}

let failed = false
try {
  await run()
  console.log('\n[dnd] ALL CHECKS PASSED')
} catch (err) {
  failed = true
  console.error('\n[dnd] FAILED:', err.message)
} finally {
  await browser?.close().catch(() => {})
  electronProcess?.kill()
  for (const p of [destPath, collisionPath]) { try { rmSync(p, { force: true }) } catch {} }
  try { rmSync(srcDir, { recursive: true, force: true }) } catch {}
  try { rmSync(userDataDir, { recursive: true, force: true }) } catch {}
  process.exitCode = failed ? 1 : 0
}
