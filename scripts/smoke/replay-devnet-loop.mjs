import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const requireFromRepo = createRequire(path.join(__dirname, '..', '..', 'package.json'))
const { chromium } = requireFromRepo('playwright')
const electronBinary = process.env.DAEMON_SMOKE_ELECTRON || requireFromRepo('electron')
const repoRoot = path.resolve(__dirname, '..', '..')
const mainEntry = path.join(repoRoot, 'dist-electron', 'main', 'index.js')
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-replay-devnet-'))
const devnetRpc = process.env.DAEMON_DEVNET_RPC_URL || 'https://api.devnet.solana.com'

let electronProcess
let browser

function logStep(message) {
  console.log(`[replay-devnet] ${message}`)
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

function waitForPort(port, timeoutMs = 30_000) {
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
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const context = browser?.contexts()?.[0]
    const page = context?.pages()?.[0]
    if (page) return page
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for a BrowserWindow page')
}

async function waitForAppReady(page) {
  await page.waitForFunction(() => !!window.daemon, { timeout: 30_000 })
  await page.waitForSelector('.titlebar', { timeout: 30_000 })
  await page.waitForSelector('.main-layout', { timeout: 30_000 })
}

async function openReplayPanel(page) {
  const drawerVisible = await page.locator('.command-drawer').isVisible().catch(() => false)
  if (!drawerVisible) {
    await page.locator('.sidebar-icon--tools').click()
    await page.waitForSelector('.command-drawer', { timeout: 30_000 })
  }
  await page.locator('.drawer-tool-card', { hasText: 'Replay' }).first().click()
  await page.waitForSelector('.replay-panel', { timeout: 30_000 })
}

async function findRecentDevnetSystemTransfer(connection) {
  logStep('devnet faucet unavailable; falling back to a recent confirmed System Program transaction')
  const signatures = await connection.getSignaturesForAddress(SystemProgram.programId, { limit: 50 }, 'confirmed')
  for (const entry of signatures) {
    const tx = await connection.getParsedTransaction(entry.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
    if (!tx?.meta || tx.meta.err) continue
    const hasSystemInstruction = tx.transaction.message.instructions.some((instruction) => {
      return 'programId' in instruction && instruction.programId.equals(SystemProgram.programId)
    })
    if (!hasSystemInstruction) continue

    const accountKeys = tx.transaction.message.accountKeys
    const writableDiffs = accountKeys
      .map((key, index) => ({
        pubkey: key.pubkey.toBase58(),
        writable: key.writable,
        delta: (tx.meta?.postBalances[index] ?? 0) - (tx.meta?.preBalances[index] ?? 0),
      }))
      .filter((entry) => entry.writable && entry.delta !== 0)

    const debit = writableDiffs.find((entry) => entry.delta < 0)
    const credit = writableDiffs.find((entry) => entry.delta > 0)
    if (debit && credit) {
      logStep(`selected recent devnet transaction ${entry.signature}`)
      return {
        signature: entry.signature,
        payer: debit.pubkey,
        recipient: credit.pubkey,
        source: 'recent-devnet-system-transaction',
      }
    }
  }
  throw new Error('Unable to find a recent devnet System Program transaction with writable account diffs')
}

async function createDevnetTransfer() {
  const connection = new Connection(devnetRpc, 'confirmed')
  const payer = Keypair.generate()
  const recipient = Keypair.generate().publicKey

  logStep(`airdropping devnet SOL to ${payer.publicKey.toBase58()}`)
  try {
    const airdropSig = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL / 10)
    const latest = await connection.getLatestBlockhash('confirmed')
    await connection.confirmTransaction({ signature: airdropSig, ...latest }, 'confirmed')
  } catch (error) {
    logStep(`airdrop failed: ${error instanceof Error ? error.message : String(error)}`)
    return findRecentDevnetSystemTransfer(connection)
  }

  const transfer = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports: 10_000,
    }),
  )
  transfer.feePayer = payer.publicKey
  transfer.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash
  transfer.sign(payer)
  const signature = await connection.sendRawTransaction(transfer.serialize(), { skipPreflight: false, maxRetries: 3 })
  await connection.confirmTransaction(signature, 'confirmed')

  logStep(`created devnet transfer ${signature}`)
  return {
    signature,
    payer: payer.publicKey.toBase58(),
    recipient: recipient.toBase58(),
    source: 'generated-devnet-transfer',
  }
}

async function seedAppState(page) {
  await page.evaluate(async ({ repoRoot, devnetRpc }) => {
    await window.daemon.settings.setOnboardingComplete(true)
    await window.daemon.settings.setWalletInfrastructureSettings({
      rpcProvider: 'custom',
      quicknodeRpcUrl: '',
      customRpcUrl: devnetRpc,
      swapProvider: 'jupiter',
      preferredWallet: 'phantom',
      executionMode: 'rpc',
      jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf',
    })

    const projects = await window.daemon.projects.list()
    const existing = projects.ok ? projects.data?.find((entry) => entry.path === repoRoot) : null
    if (!existing) {
      await window.daemon.projects.create({ name: 'DAEMON Replay Devnet Smoke', path: repoRoot })
    }
  }, { repoRoot, devnetRpc })
}

async function waitForReplayTrace(page, signature) {
  const deadline = Date.now() + 45_000
  let lastError = ''
  while (Date.now() < deadline) {
    const result = await page.evaluate(async (signature) => {
      const trace = await window.daemon.replay.fetchTrace(signature, true)
      return trace
    }, signature)

    if (result.ok && result.data) return result.data
    lastError = result.error ?? 'trace unavailable'
    await new Promise((resolve) => setTimeout(resolve, 3_000))
  }
  throw new Error(`Replay trace never became available: ${lastError}`)
}

async function runReplayLoop(page, devnetTx) {
  await openReplayPanel(page)
  await page.getByPlaceholder('Paste a Solana transaction signature').fill(devnetTx.signature)
  await page.getByRole('button', { name: 'Replay', exact: true }).click()
  await page.waitForSelector('.replay-summary', { timeout: 45_000 })
  await page.waitForSelector(`text=${devnetTx.signature}`, { timeout: 30_000 })

  const trace = await waitForReplayTrace(page, devnetTx.signature)
  logStep(`validating replay for ${devnetTx.source}`)
  assert.equal(trace.signature, devnetTx.signature)
  assert.equal(trace.success, true)
  assert(trace.programIds.includes('11111111111111111111111111111111'), 'System Program missing from trace')
  assert(trace.accountDiffs.some((diff) => diff.pubkey === devnetTx.payer && diff.lamportsDelta < 0), 'payer debit missing from account diffs')
  assert(trace.accountDiffs.some((diff) => diff.pubkey === devnetTx.recipient && diff.lamportsDelta > 0), 'recipient credit missing from account diffs')

  await page.locator('.replay-verify-input').fill('echo verified replay fix')
  await page.getByRole('button', { name: 'Run verification' }).click()
  await page.waitForSelector('.replay-verify-card.is-passed', { timeout: 30_000 })
  await page.waitForSelector('text=verified replay fix', { timeout: 30_000 })

  const result = await page.evaluate(async ({ repoRoot, signature }) => {
    const context = await window.daemon.replay.buildContext(signature)
    const handoff = await window.daemon.replay.createHandoff(repoRoot, signature)
    if (!handoff.ok || !handoff.data) return { context, handoff }
    const terminal = await window.daemon.terminal.create({
      cwd: repoRoot,
      startupCommand: handoff.data.startupCommand,
      isAgent: true,
    })
    if (terminal.ok && terminal.data) {
      await window.daemon.terminal.kill(terminal.data.id)
    }
    return { context, handoff, terminal }
  }, { repoRoot, signature: devnetTx.signature })

  assert(result.context.ok, result.context.error ?? 'buildContext failed')
  assert(result.context.data.contextMarkdown.includes(devnetTx.signature), 'context markdown missing signature')
  assert(result.handoff.ok, result.handoff.error ?? 'createHandoff failed')
  assert(result.handoff.data.contextPath.includes(path.join('.daemon', 'replays')), 'handoff path not project scoped')
  assert(existsSync(result.handoff.data.contextPath), 'handoff file was not written')
  assert(readFileSync(result.handoff.data.contextPath, 'utf8').includes(devnetTx.signature), 'handoff file missing signature')
  assert(result.terminal.ok, result.terminal.error ?? 'agent terminal launch failed')

  const verificationPath = path.join(
    repoRoot,
    '.daemon',
    'replays',
    `${devnetTx.signature.replace(/[^1-9A-HJ-NP-Za-km-z]/g, '').slice(0, 24)}.verification.json`,
  )
  assert(existsSync(verificationPath), 'verification result was not written')

  return {
    signature: devnetTx.signature,
    contextPath: result.handoff.data.contextPath,
    verificationPath,
    terminalId: result.terminal.data.id,
  }
}

try {
  const devnetTx = await createDevnetTransfer()
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

  const result = await runReplayLoop(page, devnetTx)
  console.log(`Replay devnet loop passed: ${result.signature}`)
  console.log(`Replay context file: ${result.contextPath}`)
  console.log(`Replay verification file: ${result.verificationPath}`)
} finally {
  await browser?.close().catch(() => {})
  if (electronProcess && electronProcess.exitCode === null) {
    electronProcess.kill('SIGTERM')
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        electronProcess.kill('SIGKILL')
        resolve()
      }, 5_000)
      electronProcess.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
  rmSync(userDataDir, { recursive: true, force: true })
}
