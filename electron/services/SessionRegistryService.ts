import * as crypto from 'node:crypto'
import { PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js'
import type { Keypair } from '@solana/web3.js'
import { getConnection } from './SolanaService'

const PROGRAM_ID = new PublicKey('GrQd4eRnR38pVipbXwCn9cf5oBRoxxvjQATDCgL1844')

// Anchor discriminators — sha256("global:<instruction_name>")[0..8]
function buildDiscriminator(name: string): Buffer {
  const hash = crypto.createHash('sha256').update(`global:${name}`).digest()
  return hash.slice(0, 8)
}

const DISC_INITIALIZE_PROFILE = buildDiscriminator('initialize_profile')
const DISC_START_SESSION = buildDiscriminator('start_session')
const DISC_END_SESSION = buildDiscriminator('end_session')

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

function encodeBorshU64(value: bigint): Buffer {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(value)
  return buf
}

function encodeBorshU32(value: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(value)
  return buf
}

async function ensureProfileExists(keypair: Keypair): Promise<void> {
  const connection = getConnection()
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
  const connection = getConnection()

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
  const connection = getConnection()

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
