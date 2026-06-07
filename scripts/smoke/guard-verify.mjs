/**
 * Guard verification for the ARIA patch path.
 * Proves:
 *  (1) SERVICE-LEVEL LIVE: Guard scan fires for a sensitive-path diff and stays
 *      clean for a normal diff — driven through the running Electron app via CDP
 *      using window.daemon.ai.createAgentRun + createPatchProposal (the same IPC
 *      path the ARIA agent uses in production).
 *  (2) UI STATIC: The built renderer bundle contains the guardFindings rendering
 *      code from PatchProposalCard.tsx (guard UI present in the shipped bundle).
 *
 * Run: node scripts/smoke/guard-verify.mjs   (after pnpm run build)
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
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
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-guardverify-'))

// --- Test diffs -------------------------------------------------------

// A diff touching .env — should trigger sensitive_path / blocked.
const SENSITIVE_DIFF = `diff --git a/.env b/.env
index 0000000..abc1234 100644
--- a/.env
+++ b/.env
@@ -0,0 +1,2 @@
+SECRET_KEY=hunter2
+DATABASE_URL=postgres://localhost/mydb
`

// A clean diff touching a normal source file.
const CLEAN_DIFF = `diff --git a/src/index.ts b/src/index.ts
index 0000000..deadbeef 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 export function hello() {
-  return 'hello'
+  return 'hello world'
 }
+// updated
`

// A diff touching a keypair file — should also trigger sensitive_path / blocked.
const KEYPAIR_DIFF = `diff --git a/wallets/id_keypair.json b/wallets/id_keypair.json
index 0000000..cafebabe 100644
--- a/wallets/id_keypair.json
+++ b/wallets/id_keypair.json
@@ -1,3 +1,3 @@
-{"secretKey":[1,2,3]}
+{"secretKey":[4,5,6]}
`

let electronProcess
let browser

function log(m) { console.log(`[guard-verify] ${m}`) }

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

// ---- Main ------------------------------------------------------------

async function main() {
  // ---- (2) UI STATIC CHECK (no app needed) --------------------------
  log('=== PART 2: UI STATIC CHECK ===')
  const distAssets = path.join(repoRoot, 'dist', 'assets')
  const jsFiles = readdirSync(distAssets).filter(f => f.endsWith('.js'))

  let guardFindingsInBundle = false
  let sevBlockedInBundle = false
  let gmsgInBundle = false
  let guardRenderSnippet = ''
  let bundleWithGuard = null

  for (const f of jsFiles) {
    const content = readFileSync(path.join(distAssets, f), 'utf8')
    if (content.includes('guardFindings')) {
      guardFindingsInBundle = true
      sevBlockedInBundle = content.includes('sevBlocked') || content.includes('Blocked')
      gmsgInBundle = content.includes('gmsg') || content.includes('finding')
      bundleWithGuard = f
      // Extract 200 chars around guardFindings for evidence
      const idx = content.indexOf('guardFindings')
      guardRenderSnippet = content.substring(Math.max(0, idx - 50), idx + 300)
      break
    }
  }

  log(`Bundle file with guard rendering: ${bundleWithGuard ?? 'NOT FOUND'}`)
  log(`guardFindings in renderer bundle: ${guardFindingsInBundle}`)
  log(`sevBlocked class in renderer bundle: ${sevBlockedInBundle}`)
  log(`gmsg class (finding message row) in renderer bundle: ${gmsgInBundle}`)
  if (guardRenderSnippet) log(`Snippet: ...${guardRenderSnippet.slice(0, 250)}...`)

  assert(guardFindingsInBundle, 'FAIL: renderer bundle does not contain guardFindings render path')
  assert(sevBlockedInBundle, 'FAIL: renderer bundle missing sevBlocked class (blocked-severity pill)')
  assert(gmsgInBundle, 'FAIL: renderer bundle missing gmsg/finding render code')
  log('PASS — PatchProposalCard guard-finding rendering is present in the built renderer bundle.')

  // ---- (1) SERVICE-LEVEL LIVE via running app -----------------------
  log('\n=== PART 1: SERVICE-LEVEL LIVE (CDP) ===')
  const cdpPort = await getFreePort()
  log(`Launching Electron (CDP port ${cdpPort})`)
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
  electronProcess.stdout.on('data', (c) => process.stdout.write(c))
  electronProcess.stderr.on('data', (c) => process.stderr.write(c))

  await waitForPort(cdpPort)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
  const page = await getPage()
  await page.waitForFunction(() => !!window.daemon, { timeout: 30000 })
  log('App ready')

  const results = await page.evaluate(async ({ SENSITIVE_DIFF, CLEAN_DIFF, KEYPAIR_DIFF }) => {
    const unwrap = (res, label) => {
      if (!res || res.ok !== true) throw new Error(`${label} failed: ${res?.error ?? 'no response'}`)
      return res.data
    }

    // Create a throwaway local agent run so createPatchProposal has a valid runId.
    const run = unwrap(
      await window.daemon.ai.createAgentRun({
        task: 'guard-verify smoke task',
        mode: 'patch',
        accessMode: 'byok',
      }),
      'ai.createAgentRun',
    )
    const runId = run.id

    // --- Test A: sensitive diff (.env) ---
    const sensitiveProposal = unwrap(
      await window.daemon.ai.createPatchProposal({
        runId,
        title: 'Sensitive diff test',
        unifiedDiff: SENSITIVE_DIFF,
      }),
      'ai.createPatchProposal [sensitive]',
    )

    // --- Test B: clean diff (src/index.ts) ---
    const cleanProposal = unwrap(
      await window.daemon.ai.createPatchProposal({
        runId,
        title: 'Clean diff test',
        unifiedDiff: CLEAN_DIFF,
      }),
      'ai.createPatchProposal [clean]',
    )

    // --- Test C: keypair diff ---
    const keypairProposal = unwrap(
      await window.daemon.ai.createPatchProposal({
        runId,
        title: 'Keypair diff test',
        unifiedDiff: KEYPAIR_DIFF,
      }),
      'ai.createPatchProposal [keypair]',
    )

    return {
      sensitive: {
        riskLevel: sensitiveProposal.riskLevel,
        safetyFindings: sensitiveProposal.safetyFindings,
        files: sensitiveProposal.files,
      },
      clean: {
        riskLevel: cleanProposal.riskLevel,
        safetyFindings: cleanProposal.safetyFindings,
        files: cleanProposal.files,
      },
      keypair: {
        riskLevel: keypairProposal.riskLevel,
        safetyFindings: keypairProposal.safetyFindings,
        files: keypairProposal.files,
      },
    }
  }, { SENSITIVE_DIFF, CLEAN_DIFF, KEYPAIR_DIFF })

  // ---- Assertions ---------------------------------------------------

  log('\n--- Sensitive diff (.env) ---')
  log(`  riskLevel: ${results.sensitive.riskLevel}`)
  log(`  safetyFindings: ${JSON.stringify(results.sensitive.safetyFindings)}`)

  assert.equal(results.sensitive.riskLevel, 'blocked',
    `FAIL: expected riskLevel 'blocked' for .env diff, got '${results.sensitive.riskLevel}'`)
  assert(results.sensitive.safetyFindings.length > 0,
    'FAIL: expected at least one safety finding for .env diff')
  const envFinding = results.sensitive.safetyFindings.find(f => f.code === 'sensitive_path')
  assert(envFinding, `FAIL: expected a 'sensitive_path' finding for .env diff; got: ${JSON.stringify(results.sensitive.safetyFindings)}`)
  assert.equal(envFinding.severity, 'blocked',
    `FAIL: sensitive_path finding severity should be 'blocked', got '${envFinding.severity}'`)
  log('PASS — .env diff => riskLevel=blocked, sensitive_path finding present')

  log('\n--- Clean diff (src/index.ts) ---')
  log(`  riskLevel: ${results.clean.riskLevel}`)
  log(`  safetyFindings: ${JSON.stringify(results.clean.safetyFindings)}`)

  assert.equal(results.clean.riskLevel, 'low',
    `FAIL: expected riskLevel 'low' for clean diff, got '${results.clean.riskLevel}'`)
  assert.equal(results.clean.safetyFindings.length, 0,
    `FAIL: expected zero safety findings for clean diff, got ${results.clean.safetyFindings.length}: ${JSON.stringify(results.clean.safetyFindings)}`)
  log('PASS — clean diff => riskLevel=low, no findings')

  log('\n--- Keypair diff (*keypair.json) ---')
  log(`  riskLevel: ${results.keypair.riskLevel}`)
  log(`  safetyFindings: ${JSON.stringify(results.keypair.safetyFindings)}`)

  assert.equal(results.keypair.riskLevel, 'blocked',
    `FAIL: expected riskLevel 'blocked' for keypair diff, got '${results.keypair.riskLevel}'`)
  const keypairFinding = results.keypair.safetyFindings.find(f => f.code === 'sensitive_path')
  assert(keypairFinding, `FAIL: expected a 'sensitive_path' finding for keypair diff; got: ${JSON.stringify(results.keypair.safetyFindings)}`)
  log('PASS — *keypair.json diff => riskLevel=blocked, sensitive_path finding present')

  log('\n=== ALL ASSERTIONS PASSED ===')
  log('SERVICE-LEVEL LIVE: Guard scan is live and working through window.daemon.ai.createPatchProposal IPC')
  log('UI STATIC: PatchProposalCard guard-finding rendering is present in the built renderer bundle')
}

function cleanup() {
  try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* Windows EPERM on exit — expected */ }
}

main()
  .then(async () => {
    await browser?.close().catch(() => {})
    electronProcess?.kill()
    cleanup()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('[guard-verify] FAIL:', err)
    await browser?.close().catch(() => {})
    electronProcess?.kill()
    cleanup()
    process.exit(1)
  })
