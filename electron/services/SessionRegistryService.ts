import * as crypto from 'node:crypto'
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js'
import type { Keypair } from '@solana/web3.js'

const PROGRAM_ID = new PublicKey('3nu6sppjDtAKNoBbUAhvFJ35B2JsxpRY6G4Cg72MCJRc')
const REGISTRY_RPC_ENDPOINT = process.env.DAEMON_REGISTRY_RPC_URL || 'https://api.devnet.solana.com'

export function getRegistryRpcEndpoint(): string {
  return REGISTRY_RPC_ENDPOINT
}

export function getRegistryConnection(): Connection {
  return new Connection(REGISTRY_RPC_ENDPOINT, 'confirmed')
}

// Anchor discriminators — sha256("global:<instruction_name>")[0..8]
function buildDiscriminator(name: string): Buffer {
  const hash = crypto.createHash('sha256').update(`global:${name}`).digest()
  return hash.slice(0, 8)
}

const DISC_INITIALIZE_PROFILE = buildDiscriminator('initialize_profile')
const DISC_START_SESSION = buildDiscriminator('start_session')
const DISC_END_SESSION = buildDiscriminator('end_session')
const DISC_CREATE_TASK = buildDiscriminator('create_task')
const DISC_START_TASK_SESSION = buildDiscriminator('start_task_session')
const DISC_SUBMIT_WORK_RECEIPT = buildDiscriminator('submit_work_receipt')
const DISC_APPROVE_WORK = buildDiscriminator('approve_work')
const DISC_REJECT_WORK = buildDiscriminator('reject_work')
const DISC_SETTLE_TASK = buildDiscriminator('settle_task')
const DISC_EXPIRE_TASK = buildDiscriminator('expire_task')
const MAX_AGENTS_PER_SESSION = 4

function deriveProfilePda(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('profile'), authority.toBuffer()],
    PROGRAM_ID,
  )
}

function deriveSessionPda(authority: PublicKey, sessionId: bigint): [PublicKey, number] {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(sessionId)
  return PublicKey.findProgramAddressSync(
    [Buffer.from('session'), authority.toBuffer(), buf],
    PROGRAM_ID,
  )
}

function deriveTaskPda(owner: PublicKey, taskId: bigint): [PublicKey, number] {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(taskId)
  return PublicKey.findProgramAddressSync(
    [Buffer.from('task'), owner.toBuffer(), buf],
    PROGRAM_ID,
  )
}

function deriveReceiptPda(task: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('receipt'), task.toBuffer()],
    PROGRAM_ID,
  )
}

function encodeBorshU64(value: bigint): Buffer {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(value)
  return buf
}

function encodeBorshI64(value: bigint): Buffer {
  const buf = Buffer.alloc(8)
  buf.writeBigInt64LE(value)
  return buf
}

function encodeBorshU32(value: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(value)
  return buf
}

function hashHexToBytes32(value: string): Buffer {
  const clean = value.trim().replace(/^0x/, '')
  const source = /^[0-9a-fA-F]{64}$/.test(clean)
    ? Buffer.from(clean, 'hex')
    : crypto.createHash('sha256').update(value).digest()
  const out = Buffer.alloc(32, 0)
  source.copy(out, 0, 0, Math.min(32, source.length))
  return out
}

async function ensureProfileExists(keypair: Keypair): Promise<void> {
  const connection = getRegistryConnection()
  const [profilePda] = deriveProfilePda(keypair.publicKey)

  const accountInfo = await connection.getAccountInfo(profilePda)
  if (accountInfo !== null) return

  // Build initialize_profile instruction
  // Borsh layout: discriminator (8 bytes) — no args
  const data = DISC_INITIALIZE_PROFILE

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: profilePda, isSigner: false, isWritable: true },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  })

  const tx = new Transaction().add(ix)
  await sendAndConfirmTransaction(connection, tx, [keypair])
}

export async function publishStartSession(params: {
  walletKeypair: Keypair
  sessionId: bigint
  projectName: string
  agentCount: number
  modelsUsed: number[]
}): Promise<string> {
  const { walletKeypair, sessionId, projectName, agentCount, modelsUsed } = params
  if (!Number.isInteger(agentCount) || agentCount < 1 || agentCount > MAX_AGENTS_PER_SESSION) {
    throw new Error(`Agent count must be between 1 and ${MAX_AGENTS_PER_SESSION}`)
  }
  const connection = getRegistryConnection()

  await ensureProfileExists(walletKeypair)

  const [profilePda] = deriveProfilePda(walletKeypair.publicKey)
  const [sessionPda] = deriveSessionPda(walletKeypair.publicKey, sessionId)

  // project_hash: sha256 of project name
  const projectHash = Buffer.from(
    crypto.createHash('sha256').update(projectName).digest()
  )

  // models_used: [u8; 4] — pad to 4 bytes
  const modelsBuf = Buffer.alloc(4, 0)
  for (let i = 0; i < Math.min(4, modelsUsed.length); i++) {
    modelsBuf[i] = modelsUsed[i] ?? 0
  }

  // start_session Borsh layout:
  //   discriminator [u8; 8]
  //   session_id    u64 (8 bytes LE)
  //   project_hash  [u8; 32]
  //   agent_count   u8 (1 byte)
  //   models_used   [u8; 4]
  const data = Buffer.concat([
    DISC_START_SESSION,
    encodeBorshU64(sessionId),
    projectHash,
    Buffer.from([agentCount]),
    modelsBuf,
  ])

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: sessionPda, isSigner: false, isWritable: true },
      { pubkey: profilePda, isSigner: false, isWritable: true },
      { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  })

  const tx = new Transaction().add(ix)
  const signature = await sendAndConfirmTransaction(connection, tx, [walletKeypair])
  return signature
}

export async function publishEndSession(params: {
  walletKeypair: Keypair
  sessionId: bigint
  toolsMerkleRoot: Uint8Array
  linesGenerated: number
}): Promise<string> {
  const { walletKeypair, sessionId, toolsMerkleRoot, linesGenerated } = params
  const connection = getRegistryConnection()

  const [profilePda] = deriveProfilePda(walletKeypair.publicKey)
  const [sessionPda] = deriveSessionPda(walletKeypair.publicKey, sessionId)

  // Pad or truncate merkle root to exactly 32 bytes
  const rootBuf = Buffer.alloc(32, 0)
  Buffer.from(toolsMerkleRoot).copy(rootBuf, 0, 0, Math.min(32, toolsMerkleRoot.length))

  // end_session Borsh layout:
  //   discriminator      [u8; 8]
  //   tools_merkle_root  [u8; 32]
  //   lines_generated    u32 (4 bytes LE)
  const data = Buffer.concat([
    DISC_END_SESSION,
    rootBuf,
    encodeBorshU32(linesGenerated),
  ])

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: sessionPda, isSigner: false, isWritable: true },
      { pubkey: profilePda, isSigner: false, isWritable: true },
      { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
    ],
    data,
  })

  const tx = new Transaction().add(ix)
  const signature = await sendAndConfirmTransaction(connection, tx, [walletKeypair])
  return signature
}

export async function publishCreateTask(params: {
  walletKeypair: Keypair
  taskId: bigint
  repoHash: string
  promptHash: string
  acceptanceHash: string
  bountyLamports: bigint
  deadlineAtMs: number
  verifier: string | PublicKey
  agent: string | PublicKey
}): Promise<string> {
  const connection = getRegistryConnection()
  const verifier = new PublicKey(params.verifier)
  const agent = new PublicKey(params.agent)
  const [taskPda] = deriveTaskPda(params.walletKeypair.publicKey, params.taskId)
  const deadlineSecs = BigInt(Math.floor(params.deadlineAtMs / 1000))

  const data = Buffer.concat([
    DISC_CREATE_TASK,
    encodeBorshU64(params.taskId),
    hashHexToBytes32(params.repoHash),
    hashHexToBytes32(params.promptHash),
    hashHexToBytes32(params.acceptanceHash),
    encodeBorshU64(params.bountyLamports),
    encodeBorshI64(deadlineSecs),
    verifier.toBuffer(),
    agent.toBuffer(),
  ])

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: taskPda, isSigner: false, isWritable: true },
      { pubkey: params.walletKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  })

  const tx = new Transaction().add(ix)
  return sendAndConfirmTransaction(connection, tx, [params.walletKeypair])
}

export async function publishStartTaskSession(params: {
  agentKeypair: Keypair
  owner: string | PublicKey
  taskId: bigint
}): Promise<string> {
  const connection = getRegistryConnection()
  const owner = new PublicKey(params.owner)
  const [taskPda] = deriveTaskPda(owner, params.taskId)

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: taskPda, isSigner: false, isWritable: true },
      { pubkey: params.agentKeypair.publicKey, isSigner: true, isWritable: false },
    ],
    data: DISC_START_TASK_SESSION,
  })

  const tx = new Transaction().add(ix)
  return sendAndConfirmTransaction(connection, tx, [params.agentKeypair])
}

export async function publishSubmitWorkReceipt(params: {
  agentKeypair: Keypair
  owner: string | PublicKey
  taskId: bigint
  commitHash: string
  diffHash: string
  testsHash: string
  artifactHash: string
}): Promise<string> {
  const connection = getRegistryConnection()
  const owner = new PublicKey(params.owner)
  const [taskPda] = deriveTaskPda(owner, params.taskId)
  const [receiptPda] = deriveReceiptPda(taskPda)

  const data = Buffer.concat([
    DISC_SUBMIT_WORK_RECEIPT,
    hashHexToBytes32(params.commitHash),
    hashHexToBytes32(params.diffHash),
    hashHexToBytes32(params.testsHash),
    hashHexToBytes32(params.artifactHash),
  ])

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: taskPda, isSigner: false, isWritable: true },
      { pubkey: receiptPda, isSigner: false, isWritable: true },
      { pubkey: params.agentKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  })

  const tx = new Transaction().add(ix)
  return sendAndConfirmTransaction(connection, tx, [params.agentKeypair])
}

export async function publishApproveWork(params: {
  verifierKeypair: Keypair
  owner: string | PublicKey
  taskId: bigint
}): Promise<string> {
  return publishReviewWork({ ...params, discriminator: DISC_APPROVE_WORK })
}

export async function publishRejectWork(params: {
  verifierKeypair: Keypair
  owner: string | PublicKey
  taskId: bigint
}): Promise<string> {
  return publishReviewWork({ ...params, discriminator: DISC_REJECT_WORK })
}

async function publishReviewWork(params: {
  verifierKeypair: Keypair
  owner: string | PublicKey
  taskId: bigint
  discriminator: Buffer
}): Promise<string> {
  const connection = getRegistryConnection()
  const owner = new PublicKey(params.owner)
  const [taskPda] = deriveTaskPda(owner, params.taskId)
  const [receiptPda] = deriveReceiptPda(taskPda)

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: taskPda, isSigner: false, isWritable: true },
      { pubkey: receiptPda, isSigner: false, isWritable: true },
      { pubkey: params.verifierKeypair.publicKey, isSigner: true, isWritable: false },
    ],
    data: params.discriminator,
  })

  const tx = new Transaction().add(ix)
  return sendAndConfirmTransaction(connection, tx, [params.verifierKeypair])
}

export async function publishSettleTask(params: {
  authorityKeypair: Keypair
  owner: string | PublicKey
  agent: string | PublicKey
  taskId: bigint
}): Promise<string> {
  const connection = getRegistryConnection()
  const owner = new PublicKey(params.owner)
  const agent = new PublicKey(params.agent)
  const [taskPda] = deriveTaskPda(owner, params.taskId)

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: taskPda, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: agent, isSigner: false, isWritable: true },
      { pubkey: params.authorityKeypair.publicKey, isSigner: true, isWritable: false },
    ],
    data: DISC_SETTLE_TASK,
  })

  const tx = new Transaction().add(ix)
  return sendAndConfirmTransaction(connection, tx, [params.authorityKeypair])
}

export async function publishExpireTask(params: {
  authorityKeypair: Keypair
  owner: string | PublicKey
  taskId: bigint
}): Promise<string> {
  const connection = getRegistryConnection()
  const owner = new PublicKey(params.owner)
  const [taskPda] = deriveTaskPda(owner, params.taskId)

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: taskPda, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: params.authorityKeypair.publicKey, isSigner: true, isWritable: false },
    ],
    data: DISC_EXPIRE_TASK,
  })

  const tx = new Transaction().add(ix)
  return sendAndConfirmTransaction(connection, tx, [params.authorityKeypair])
}

// Build a deterministic tools merkle root from an array of tool names
export function buildToolsMerkleRoot(toolNames: string[]): Uint8Array {
  if (toolNames.length === 0) return new Uint8Array(32)

  const leaves = toolNames.map((name) =>
    crypto.createHash('sha256').update(name).digest()
  )

  // Single-level hash tree — sufficient for hackathon demo
  let combined = Buffer.concat(leaves)
  return crypto.createHash('sha256').update(combined).digest()
}

// Convert a local session ID (numeric part) to a u64 for Anchor
export function sessionIdToU64(localId: string): bigint {
  // Use a hash of the UUID to get a stable u64
  const hash = crypto.createHash('sha256').update(localId).digest()
  // Read first 8 bytes as LE u64, mask to safe range (< 2^53) for JS compatibility
  const lo = hash.readUInt32LE(0)
  const hi = hash.readUInt32LE(4) & 0x001fffff // top 21 bits only → safe BigInt
  return BigInt(lo) + (BigInt(hi) << 32n)
}

export function agentWorkTaskIdToU64(localId: string): bigint {
  return sessionIdToU64(`agent-work:${localId}`)
}
