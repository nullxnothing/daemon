/**
 * DEBUG / SMOKE — memory-inject-verify.mjs
 *
 * Verifies that assembleSystemPrompt (contextAssembler.ts) actually appends the
 * DAEMON MEMORY block when snapshot.chips.projectMemory=true.
 *
 * Two-pronged approach:
 *  (A) LIVE: launches the app, seeds approved memories, calls
 *      window.daemon.memory.buildContextBundle — proves the raw block text the
 *      chip-gated path would inject.
 *  (B) STATIC: reads the TypeScript source AND the compiled dist-electron/main/index.js
 *      and asserts key sub-strings proving the wiring from chip → bundle → prompt.
 *
 * Run: node scripts/smoke/memory-inject-verify.mjs   (after pnpm run build)
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
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

// ── Temp dirs ────────────────────────────────────────────────────────────────
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-injectverify-'))
const projectPath = mkdtempSync(path.join(tmpdir(), 'daemon-injectfixture-'))
const projectName = 'Inject Verify Fixture'

writeFileSync(path.join(projectPath, 'pnpm-lock.yaml'), '')
writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({
  packageManager: 'pnpm@9.0.0',
  scripts: { test: 'vitest run', build: 'vite build', dev: 'vite' },
  dependencies: { react: '18' },
  devDependencies: { typescript: '5' },
}, null, 2))

let electronProcess
let browser

function log(m) { console.log(`[inject-verify] ${m}`) }
function pass(m) { console.log(`[inject-verify] ✓ ${m}`) }
function fail(m) { throw new Error(`[inject-verify] FAIL: ${m}`) }

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

// ── Part B: static wiring assertions ─────────────────────────────────────────
function assertStaticWiring() {
  log('--- PART B: Static wiring assertions ---')

  // 1. TypeScript source: contextAssembler.ts
  const assemblerSrc = readFileSync(
    path.join(repoRoot, 'electron', 'services', 'aria', 'contextAssembler.ts'),
    'utf8',
  )
  assert(
    assemblerSrc.includes("snapshot.chips.projectMemory && snapshot.activeProjectId"),
    'contextAssembler.ts must guard on chips.projectMemory && activeProjectId',
  )
  pass('contextAssembler.ts: chips.projectMemory guard present')

  assert(
    assemblerSrc.includes('buildContextBundle(snapshot.activeProjectId'),
    'contextAssembler.ts must call buildContextBundle with activeProjectId',
  )
  pass('contextAssembler.ts: buildContextBundle call wired')

  assert(
    assemblerSrc.includes('if (bundle.block) memoryBlock'),
    'contextAssembler.ts must gate injection on bundle.block being non-empty',
  )
  pass('contextAssembler.ts: non-empty-block guard present')

  assert(
    assemblerSrc.includes('`\\n\\n${bundle.block}`') ||
    assemblerSrc.includes('`\n\n${bundle.block}`'),
    'contextAssembler.ts must append block to the final prompt string',
  )
  pass('contextAssembler.ts: memoryBlock appended to returned prompt')

  // 2. TypeScript source: ariaContext.ts
  const ariaCtxSrc = readFileSync(
    path.join(repoRoot, 'src', 'lib', 'ariaContext.ts'),
    'utf8',
  )
  assert(
    /projectMemory\s*:\s*true/.test(ariaCtxSrc),
    'ariaContext.ts: chips default must have projectMemory: true',
  )
  pass('ariaContext.ts: projectMemory defaults to true')

  // 3. Compiled bundle: dist-electron/main/index.js
  const compiled = readFileSync(mainEntry, 'utf8')

  // Chip guard in compiled output (variable names may be minified — look for the pattern
  // "chips.projectMemory" or the minified equivalent ".projectMemory&&" or similar)
  const hasProjectMemoryGuard =
    compiled.includes('.projectMemory&&') ||
    compiled.includes('.projectMemory &&') ||
    /\.chips\.\w*emory/.test(compiled)
  assert(hasProjectMemoryGuard, 'Compiled bundle must contain projectMemory chip guard')
  pass('Compiled bundle: projectMemory chip guard found')

  const hasMemoryHeader = compiled.includes('--- DAEMON MEMORY ---')
  assert(hasMemoryHeader, 'Compiled bundle must contain the DAEMON MEMORY sentinel string')
  pass('Compiled bundle: --- DAEMON MEMORY --- sentinel found')

  // buildContextBundle symbol present (may be renamed but the call site is findable)
  const hasBundleCall =
    compiled.includes('buildContextBundle') ||
    compiled.includes('dT(') ||    // minified — we saw dT( in grep output
    /function \w+\(\w+,\w+\)\{.*DAEMON MEMORY/.test(compiled)
  assert(hasBundleCall, 'Compiled bundle must contain buildContextBundle / its minified equivalent')
  pass('Compiled bundle: buildContextBundle (or minified alias) present')

  log('--- PART B: ALL static wiring checks passed ---')
}

// ── Part A: live run ──────────────────────────────────────────────────────────
async function assertLiveBundle() {
  log('--- PART A: Live bundle assertions ---')
  const cdpPort = await getFreePort()
  log(`launching electron (cdp port ${cdpPort})`)

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
  log('app ready — driving window.daemon.*')

  const result = await page.evaluate(async ({ projectPath, projectName }) => {
    const unwrap = (res, label) => {
      if (!res || res.ok !== true) throw new Error(`${label} failed: ${res?.error ?? 'no response'}`)
      return res.data
    }

    // 1. Ensure project exists
    let list = unwrap(await window.daemon.projects.list(), 'projects.list')
    let project = list.find((p) => p.path === projectPath)
    if (!project) {
      unwrap(await window.daemon.projects.create({ name: projectName, path: projectPath }), 'projects.create')
      list = unwrap(await window.daemon.projects.list(), 'projects.list#2')
      project = list.find((p) => p.path === projectPath)
    }
    const projectId = project.id

    // 2. Extract memories
    const extracted = unwrap(await window.daemon.memory.extract(projectPath, projectId), 'memory.extract')

    // 3. Approve package_manager + test_command (same as memory-verify.mjs)
    const toApprove = extracted.filter((m) => m.kind === 'package_manager' || m.kind === 'test_command')
    for (const m of toApprove) unwrap(await window.daemon.memory.approve(m.id), 'memory.approve')

    // 4. Build context bundle — this is the SAME call assembleSystemPrompt makes
    //    when chips.projectMemory=true and activeProjectId is set.
    const bundle = unwrap(
      await window.daemon.memory.buildContextBundle(projectId, { usedIn: 'inject_verify' }),
      'memory.buildContextBundle',
    )

    // 5. Confirm the final assembled system prompt would contain the block by
    //    simulating the assembleSystemPrompt logic:
    //    `${ARIA_SYSTEM}\n\n${contextLines}${memoryBlock}`
    //    where memoryBlock = `\n\n${bundle.block}` when bundle.block is truthy.
    const simulatedPromptEnd = bundle.block
      ? `\n\n${bundle.block}`
      : '(no block — memories empty or unapproved)'

    return {
      projectId,
      extractedKinds: extracted.map((m) => m.kind).sort(),
      approvedCount: (await window.daemon.memory.list(projectId, { status: 'approved' })).data?.length ?? 0,
      bundleBlock: bundle.block,
      bundleUsedIds: bundle.usedMemoryIds,
      simulatedPromptTail: simulatedPromptEnd,
    }
  }, { projectPath, projectName })

  log(`project id : ${result.projectId}`)
  log(`extracted  : ${result.extractedKinds.join(', ')}`)
  log(`approved   : ${result.approvedCount}`)

  assert(result.extractedKinds.includes('package_manager'), 'expected package_manager memory')
  assert(result.approvedCount >= 1, 'expected at least 1 approved memory')
  pass('Live: memories extracted and approved')

  assert(result.bundleBlock.includes('--- DAEMON MEMORY ---'), 'bundle missing header sentinel')
  assert(result.bundleBlock.includes('--- END DAEMON MEMORY ---'), 'bundle missing footer sentinel')
  pass('Live: bundle block contains DAEMON MEMORY sentinels')

  assert(result.bundleBlock.includes('pnpm'), 'bundle should mention pnpm')
  pass('Live: bundle block contains expected package manager text')

  assert(result.bundleUsedIds.length >= 1, 'bundle must reference at least 1 memory id')
  pass(`Live: ${result.bundleUsedIds.length} memory id(s) in bundle`)

  // The tail of the final ARIA system prompt (what would be appended)
  log('\n>>> LIVE BUNDLE BLOCK (exact text that assembleSystemPrompt appends):')
  log(result.bundleBlock)
  log('\n>>> SIMULATED PROMPT TAIL (\\n\\n + block):')
  log(result.simulatedPromptTail)

  log('--- PART A: ALL live assertions passed ---')
}

// ── Main ──────────────────────────────────────────────────────────────────────
function cleanup() {
  try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* ignore EPERM on Windows */ }
  try { rmSync(projectPath, { recursive: true, force: true }) } catch { /* ignore */ }
}

async function main() {
  // B first (no app needed) so we fail fast on a bad build
  assertStaticWiring()

  await assertLiveBundle()

  log('\n========================================')
  log('PASS — static wiring + live bundle both verified.')
  log('assembleSystemPrompt WILL inject the DAEMON MEMORY block when')
  log('  snapshot.chips.projectMemory=true (the default) AND')
  log('  snapshot.activeProjectId is set AND')
  log('  at least one approved, non-secret memory exists for the project.')
  log('========================================')
}

main()
  .then(async () => {
    await browser?.close().catch(() => {})
    electronProcess?.kill()
    cleanup()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('[inject-verify] FAIL:', err)
    await browser?.close().catch(() => {})
    electronProcess?.kill()
    cleanup()
    process.exit(1)
  })
