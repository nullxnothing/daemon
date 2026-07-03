/**
 * DAEMON receipt spike — DEVNET ONLY.
 *
 * Proves DAEMON can emit an attested execution receipt into the official
 * Metaplex Agent Registry (mpl-agent-registry). Full chain:
 *   1. throwaway airdropped key (never the DAEMON vault)
 *   2. mint MPL Core asset  -> registerIdentityV1   (agent identity in official registry)
 *   3. registerExecutiveV1  -> delegateExecutionV1  (executive may act for the agent)
 *   4. bootstrap receipts collection + Bubblegum receipts tree (canonical PDAs, permissionless payer)
 *   5. mintWorkReceiptV1    (cNFT work receipt carrying sha256 of the receipt JSON)
 *   6. SPL Memo anchor of the same sha256 (belt-and-braces fallback path)
 *
 * Run: node spike.mjs   (from scripts/receipt-spike after npm install)
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { generateSigner, keypairIdentity, publicKey, sol } from '@metaplex-foundation/umi'
import { base58 } from '@metaplex-foundation/umi/serializers'
import { mplCore, create } from '@metaplex-foundation/mpl-core'
import { addMemo, mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import { findTreeConfigPda, MPL_BUBBLEGUM_PROGRAM_ID } from '@metaplex-foundation/mpl-bubblegum'
import {
  mplAgentIdentity, mplAgentTools,
  registerIdentityV1, registerExecutiveV1, delegateExecutionV1,
  createReceiptsCollectionV1, registerReceiptsTreeV1, mintWorkReceiptV1,
  findAgentIdentityV1Pda, findExecutiveProfileV1Pda, findExecutionDelegateRecordV1Pda,
  findReceiptsCollectionPda, findReceiptsAuthorityPda, findReceiptsTreePda,
} from '@metaplex-foundation/mpl-agent-registry'

const DEVNET_RPC = 'https://api.devnet.solana.com'
const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'
const MPL_CORE_CPI_SIGNER = publicKey('CbNY3JiXdXNE9tPNEk1aRZVEkWdj2v7kfJLNQwZZgpXk')
const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(HERE, 'out')
const KEY_FILE = process.env.SPIKE_KEY_FILE ?? join(OUT_DIR, 'throwaway-devnet-key.json')

const explorer = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`
const log = (...a) => console.log('[spike]', ...a)

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function loadOrCreateThrowawayKey(umi) {
  if (existsSync(KEY_FILE)) {
    const secret = new Uint8Array(JSON.parse(readFileSync(KEY_FILE, 'utf8')))
    return umi.eddsa.createKeypairFromSecretKey(secret)
  }
  const kp = umi.eddsa.generateKeypair()
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(KEY_FILE, JSON.stringify(Array.from(kp.secretKey)))
  return kp
}

async function assertDevnet() {
  const res = await fetch(DEVNET_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getGenesisHash' }),
  })
  const genesis = (await res.json()).result
  if (genesis !== DEVNET_GENESIS) throw new Error(`RPC is not devnet (genesis ${genesis}) — refusing to continue`)
  log('cluster check OK: devnet genesis', genesis)
}

async function ensureFunds(umi) {
  const min = sol(0.6).basisPoints
  let balance = (await umi.rpc.getBalance(umi.identity.publicKey)).basisPoints
  log('throwaway key', umi.identity.publicKey, 'balance', Number(balance) / 1e9, 'SOL')
  if (balance >= min) return
  for (const amount of [2, 1, 0.5]) {
    try {
      log(`requesting devnet airdrop of ${amount} SOL...`)
      await umi.rpc.airdrop(umi.identity.publicKey, sol(amount), { commitment: 'confirmed' })
      balance = (await umi.rpc.getBalance(umi.identity.publicKey)).basisPoints
      log('balance after airdrop:', Number(balance) / 1e9, 'SOL')
      if (balance >= min) return
    } catch (e) {
      log(`airdrop ${amount} SOL failed:`, e.message ?? e)
    }
  }
  if (balance === 0n) throw new Error('devnet faucet dry — rerun later, key is persisted')
}

async function send(umi, builder, label) {
  const { signature } = await builder.sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } })
  const sig = base58.deserialize(signature)[0]
  log(`${label}: ${sig}`)
  log(`  ${explorer(sig)}`)
  return sig
}

async function main() {
  const umi = createUmi(DEVNET_RPC)
    .use(mplCore()).use(mplToolbox()).use(mplAgentIdentity()).use(mplAgentTools())
  await assertDevnet(umi)

  const throwaway = loadOrCreateThrowawayKey(umi)
  umi.use(keypairIdentity(throwaway))
  await ensureFunds(umi)

  const signatures = {}
  const state = existsSync(join(OUT_DIR, 'state.json'))
    ? JSON.parse(readFileSync(join(OUT_DIR, 'state.json'), 'utf8'))
    : {}
  const saveState = () => writeFileSync(join(OUT_DIR, 'state.json'), JSON.stringify(state, null, 2))

  // ---- Stage 1: agent identity in the official registry ----
  let assetPk
  if (state.asset) {
    assetPk = publicKey(state.asset)
    log('reusing agent asset', assetPk)
  } else {
    const asset = generateSigner(umi)
    assetPk = asset.publicKey
    signatures.mintAsset = await send(umi,
      create(umi, {
        asset,
        name: 'DAEMON Spike Agent',
        uri: 'https://daemon.dev/agents/spike-agent.json',
      }), 'mint MPL Core agent asset')
    state.asset = assetPk
    saveState()
  }

  const [identityPda] = findAgentIdentityV1Pda(umi, { asset: assetPk })
  if (!(await umi.rpc.getAccount(identityPda)).exists) {
    signatures.registerIdentity = await send(umi,
      registerIdentityV1(umi, { agentIdentity: identityPda, asset: assetPk }),
      'registerIdentityV1 (official Agent Registry)')
  } else {
    log('identity already registered:', identityPda)
  }

  // ---- Stage 2: executive profile + execution delegation ----
  const [executiveProfile] = findExecutiveProfileV1Pda(umi, { authority: umi.identity.publicKey })
  if (!(await umi.rpc.getAccount(executiveProfile)).exists) {
    signatures.registerExecutive = await send(umi,
      registerExecutiveV1(umi, { executiveProfile, authority: umi.identity }),
      'registerExecutiveV1')
  } else {
    log('executive profile exists:', executiveProfile)
  }

  const [delegateRecord] = findExecutionDelegateRecordV1Pda(umi, { executiveProfile, agentAsset: assetPk })
  if (!(await umi.rpc.getAccount(delegateRecord)).exists) {
    signatures.delegateExecution = await send(umi,
      delegateExecutionV1(umi, {
        executiveProfile, agentAsset: assetPk, agentIdentity: identityPda,
        executionDelegateRecord: delegateRecord, authority: umi.identity,
      }), 'delegateExecutionV1')
  } else {
    log('delegate record exists:', delegateRecord)
  }

  // ---- Stage 3: the execution receipt (synthetic record, content-hash only) ----
  const receipt = {
    spec: 'daemon-receipt/1',
    agent: { assetAddress: assetPk, identityPda, registry: 'mpl-agent-registry' },
    action: { type: 'swap.execute', tool: 'autopilot_swap', summary: 'SYNTHETIC devnet spike: 0.1 SOL -> USDC quote accepted' },
    cluster: 'devnet',
    policy: { verdict: 'approved', mode: 'auto', riskTier: 'write', mandateId: 'spike-mandate-001' },
    executionTxSignature: null,
    operator: umi.identity.publicKey,
    timestamp: new Date().toISOString(),
  }
  const receiptCanonical = canonicalJson(receipt)
  const receiptHash = sha256Hex(receiptCanonical)
  writeFileSync(join(OUT_DIR, 'receipt.json'), JSON.stringify(receipt, null, 2))
  log('receipt sha256:', receiptHash)

  // ---- Stage 4: registry-native work receipt (cNFT) — bootstrap infra if absent ----
  let workReceiptOk = false
  try {
    const [collection] = findReceiptsCollectionPda(umi)
    if (!(await umi.rpc.getAccount(collection)).exists) {
      signatures.createReceiptsCollection = await send(umi,
        createReceiptsCollectionV1(umi, {}), 'createReceiptsCollectionV1 (bootstrap devnet)')
    }
    const treeIndex = 0
    const [merkleTree] = findReceiptsTreePda(umi, { treeIndex })
    const treeConfig = findTreeConfigPda(umi, { merkleTree })
    if (!(await umi.rpc.getAccount(merkleTree)).exists) {
      const balance = (await umi.rpc.getBalance(umi.identity.publicKey)).basisPoints
      const [maxDepth, maxBufferSize] = balance >= sol(0.5).basisPoints ? [14, 64] : [3, 8]
      signatures.registerReceiptsTree = await send(umi,
        registerReceiptsTreeV1(umi, { merkleTree, treeConfig, treeIndex, maxDepth, maxBufferSize, canopyDepth: 0 }),
        `registerReceiptsTreeV1 (depth ${maxDepth}, buffer ${maxBufferSize})`)
    }
    signatures.mintWorkReceipt = await send(umi,
      mintWorkReceiptV1(umi, {
        executiveAuthority: umi.identity,
        executionDelegateRecord: delegateRecord,
        agentAsset: assetPk,
        client: umi.identity.publicKey,
        treeConfig,
        merkleTree,
        mplCoreCpiSigner: MPL_CORE_CPI_SIGNER,
        treeIndex,
        receiptUri: `daemon://receipt/v1?sha256=${receiptHash}`,
      }), 'mintWorkReceiptV1 (registry-native execution receipt)')
    workReceiptOk = true
  } catch (e) {
    log('registry-native work receipt path FAILED (falling back to memo only):', e.message ?? e)
    if (e.logs) log(e.logs.join('\n'))
  }

  // ---- Stage 5: memo-anchored content hash (always) ----
  signatures.memoAnchor = await send(umi,
    addMemo(umi, { memo: `DAEMON-RECEIPT v1 sha256=${receiptHash} agent=${assetPk}` }),
    'SPL Memo anchor of receipt hash')

  const summary = {
    cluster: 'devnet',
    throwawayKey: umi.identity.publicKey,
    agentAsset: assetPk,
    identityPda,
    executiveProfile,
    delegateRecord,
    receiptSha256: receiptHash,
    registryNativeWorkReceipt: workReceiptOk,
    signatures,
    explorerUrls: Object.fromEntries(Object.entries(signatures).map(([k, v]) => [k, explorer(v)])),
  }
  writeFileSync(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2))
  log('=== SUMMARY ===')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((e) => {
  console.error('[spike] FATAL:', e)
  if (e.logs) console.error(e.logs.join('\n'))
  process.exit(1)
})
