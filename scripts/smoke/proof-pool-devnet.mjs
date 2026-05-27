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
const electronBinary = process.env.DAEMON_SMOKE_ELECTRON || requireFromRepo('electron')
const {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} = requireFromRepo('@solana/web3.js')
const bs58Module = requireFromRepo('bs58')
const bs58 = bs58Module.default ?? bs58Module

const mainEntry = path.join(repoRoot, 'dist-electron', 'main', 'index.js')
const userDataDir = mkdtempSync(path.join(tmpdir(), 'daemon-proof-pool-devnet-'))
const devnetRpc = process.env.DAEMON_DEVNET_RPC_URL || 'https://api.devnet.solana.com'
const backingSol = Number(process.env.DAEMON_PROOF_BACKING_SOL || '0.05')
const airdropSol = Math.max(0.2, backingSol + 0.05)
const funderKey = process.env.DAEMON_PROOF_DEVNET_FUNDER_KEY?.trim() || ''

let electronProcess
let browser
const rendererFailures = []

function logStep(message) {
  console.log(`[proof-pool-devnet] ${message}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseFunderKeypair() {
  if (!funderKey) return null
  try {
    const parsed = JSON.parse(funderKey)
    if (Array.isArray(parsed)) return Keypair.fromSecretKey(Uint8Array.from(parsed))
  } catch {}
  return Keypair.fromSecretKey(bs58.decode(funderKey))
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
  throw new Error('Timed out waiting for BrowserWindow page')
}

async function waitForAppReady(page) {
  await page.waitForFunction(() => !!window.daemon, { timeout: 30_000 })
  await page.waitForSelector('.titlebar', { timeout: 30_000 })
  await page.waitForSelector('.main-layout', { timeout: 30_000 })
}

async function seedAppState(page) {
  await page.evaluate(async ({ devnetRpc }) => {
    await window.daemon.settings.setOnboardingComplete(true)
    await window.daemon.settings.setWorkspaceProfile({ name: 'custom', toolVisibility: {} })
    await window.daemon.settings.setWalletInfrastructureSettings({
      cluster: 'devnet',
      rpcProvider: devnetRpc ? 'custom' : 'public',
      quicknodeRpcUrl: '',
      customRpcUrl: devnetRpc,
      swapProvider: 'jupiter',
      preferredWallet: 'phantom',
      executionMode: 'rpc',
      jitoBlockEngineUrl: '',
    })
  }, { devnetRpc })
}

async function requestAirdrop(connection, address, sol) {
  const publicKey = typeof address === 'string' ? new PublicKey(address) : address
  let lastError
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      logStep(`airdropping ${sol} devnet SOL to ${publicKey.toBase58()} (attempt ${attempt})`)
      const signature = await connection.requestAirdrop(publicKey, Math.round(sol * LAMPORTS_PER_SOL))
      const latest = await connection.getLatestBlockhash('confirmed')
      await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
      return signature
    } catch (error) {
      lastError = error
      if (attempt < 4) await sleep(1_000 * attempt)
    }
  }
  throw lastError
}

async function transferSol(connection, payer, destination, sol) {
  const destinationPublicKey = typeof destination === 'string' ? new PublicKey(destination) : destination
  const latest = await connection.getLatestBlockhash('confirmed')
  const transfer = new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: latest.blockhash,
  }).add(SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: destinationPublicKey,
    lamports: Math.round(sol * LAMPORTS_PER_SOL),
  }))
  transfer.sign(payer)
  const signature = await connection.sendRawTransaction(transfer.serialize(), { skipPreflight: false, maxRetries: 3 })
  await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
  return signature
}

async function fundAddress(connection, funder, address, sol) {
  if (!funder) return requestAirdrop(connection, address, sol)
  const publicKey = typeof address === 'string' ? new PublicKey(address) : address
  logStep(`funding ${publicKey.toBase58()} from DAEMON_PROOF_DEVNET_FUNDER_KEY`)
  return transferSol(connection, funder, publicKey, sol)
}

async function runProofFlow(page) {
  const connection = new Connection(devnetRpc, 'confirmed')
  const creator = Keypair.generate()
  const backers = [Keypair.generate(), Keypair.generate()]
  const funder = parseFunderKeypair()

  const escrow = await page.evaluate(async () => {
    const res = await window.daemon.proof.configureEscrow()
    if (!res.ok || !res.data?.address) throw new Error(res.error || 'Escrow configuration failed')
    return res.data
  })
  await fundAddress(connection, funder, escrow.address, 0.2)

  const created = await page.evaluate(async ({ creatorWallet, backingSol }) => {
    const res = await window.daemon.proof.createPool({
      name: 'Devnet Proof Pool',
      symbol: 'DPROOF',
      description: 'Devnet Proof Pool smoke run',
      creatorWallet,
      totalSlots: 2,
      minBackingSol: backingSol,
      backingDays: 1,
    })
    if (!res.ok || !res.data) throw new Error(res.error || 'Pool creation failed')
    return res.data
  }, { creatorWallet: creator.publicKey.toBase58(), backingSol })

  logStep(`created pool wallet ${created.pool.pool_wallet}`)
  for (const backer of backers) {
    await fundAddress(connection, funder, backer.publicKey, airdropSol)
    const signature = await transferSol(connection, backer, created.pool.pool_wallet, backingSol)
    logStep(`backing transfer ${signature}`)
    const verified = await page.evaluate(async ({ poolId, backerWallet, backingSol, signature }) => {
      const res = await window.daemon.proof.verifyBacking({
        poolId,
        backerWallet,
        amountSol: backingSol,
        depositSignature: signature,
      })
      if (!res.ok || !res.data) throw new Error(res.error || 'Backing verification failed')
      return res.data
    }, {
      poolId: created.pool.id,
      backerWallet: backer.publicKey.toBase58(),
      backingSol,
      signature,
    })
    assert(verified.backings.some((entry) => entry.deposit_signature === signature), 'verified backing missing from detail')
  }

  const funded = await page.evaluate(async (poolId) => {
    const res = await window.daemon.proof.getPool(poolId)
    if (!res.ok || !res.data) throw new Error(res.error || 'Pool lookup failed')
    return res.data
  }, created.pool.id)
  assert.equal(funded.pool.status, 'funded')
  assert.equal(funded.backings.length, 2)

  const refunded = await page.evaluate(async (poolId) => {
    const res = await window.daemon.proof.refundPool(poolId, true)
    if (!res.ok || !res.data) throw new Error(res.error || 'Pool refund failed')
    return res.data
  }, created.pool.id)
  assert.equal(refunded.pool.status, 'failed')
  assert(refunded.backings.every((entry) => entry.status === 'refunded'), 'not all backings were refunded')
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
  page.on('pageerror', (error) => rendererFailures.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') rendererFailures.push(message.text())
  })
  await waitForAppReady(page)
  await seedAppState(page)
  await page.reload()
  await waitForAppReady(page)
  await runProofFlow(page)
  assert.equal(rendererFailures.length, 0, `renderer failures detected:\n${rendererFailures.join('\n')}`)
}

try {
  await run()
  logStep('Proof Pool devnet deposit/refund E2E passed')
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[proof-pool-devnet] failed: ${message}`)
  if (!funderKey && /airdrop|429|faucet/i.test(message)) {
    console.error('[proof-pool-devnet] set DAEMON_PROOF_DEVNET_FUNDER_KEY to a funded devnet keypair when the public faucet is unavailable')
  }
  process.exitCode = 1
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
