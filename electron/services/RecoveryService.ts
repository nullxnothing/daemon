import { BrowserWindow, dialog } from 'electron'
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
  ComputeBudgetProgram,
  TransactionInstruction,
} from '@solana/web3.js'
import bs58 from 'bs58'
import * as fs from 'node:fs'
import * as SecureKey from './SecureKeyService'
import type { RecoveryWalletInfo, RecoveryProgressEvent, RecoveryStatus } from '../shared/types'

// ─── Constants ─────────────────────────────────────────────────────────────

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const TOKEN_2022_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
const CLOSES_PER_TX = 12
const CONCURRENCY = 10

// ─── State ─────────────────────────────────────────────────────────────────

let currentStatus: RecoveryStatus = {
  state: 'idle', currentPhase: 0, totalRecovered: 0,
  walletCount: 0, completed: 0, failed: 0,
}

let abortController: AbortController | null = null

// Loaded wallets from CSV (kept in memory, never sent to renderer with private keys)
let loadedKeypairs: Map<string, Keypair> = new Map()
let loadedPubkeys: string[] = []

// ─── Helpers ───────────────────────────────────────────────────────────────

function getConnection(): Connection {
  const key = SecureKey.getKey('HELIUS_API_KEY')
  if (!key) throw new Error('Helius API key not configured')
  return new Connection(`https://mainnet.helius-rpc.com/?api-key=${key}`, 'confirmed')
}

function emit(win: BrowserWindow | null, event: RecoveryProgressEvent) {
  win?.webContents.send('recovery:progress', event)
}

function isAborted(): boolean {
  return abortController?.signal.aborted ?? false
}

async function getPriorityFee(conn: Connection): Promise<number> {
  try {
    const res = await fetch(conn.rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'getPriorityFeeEstimate',
        params: [{ accountKeys: [TOKEN_PROGRAM_ID.toBase58()], options: { priorityLevel: 'High' } }],
      }),
    })
    const data = await res.json() as { result?: { priorityFeeEstimate: number } }
    return Math.max(data.result?.priorityFeeEstimate ?? 100_000, 10_000)
  } catch {
    return 100_000
  }
}

async function sendAndConfirm(
  conn: Connection, tx: VersionedTransaction, timeout = 15_000,
): Promise<string | null> {
  try {
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 })
    const result = await conn.confirmTransaction(sig, 'confirmed')
    if (result.value.err) return null
    return sig
  } catch {
    return null
  }
}

// ─── CSV Import ────────────────────────────────────────────────────────────

export async function importCsv(): Promise<{ count: number; path: string } | null> {
  const win = BrowserWindow.getAllWindows()[0]
  const result = await dialog.showOpenDialog(win, {
    title: 'Import Wallet CSV',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return null

  const csvPath = result.filePaths[0]
  return loadCsvFile(csvPath)
}

export function loadCsvFile(csvPath: string): { count: number; path: string } {
  const CSV_MAX_BYTES = 10 * 1024 * 1024
  const stat = fs.statSync(csvPath)
  if (stat.size > CSV_MAX_BYTES) throw new Error('CSV file exceeds 10MB limit')
  const content = fs.readFileSync(csvPath, 'utf-8')
  const lines = content.split('\n')
  const keypairs = new Map<string, Keypair>()

  for (const raw of lines.slice(1)) {
    const line = raw.trim()
    if (!line || line.toLowerCase().startsWith('publickey') || line.toLowerCase().startsWith('privatekey')) continue

    try {
      let kp: Keypair
      if (line.includes(',')) {
        const hex = line.split(',')[1]?.trim()
        if (!hex) continue
        kp = Keypair.fromSecretKey(Buffer.from(hex, 'hex'))
      } else {
        const decoded = bs58.decode(line)
        kp = decoded.length === 64
          ? Keypair.fromSecretKey(decoded)
          : Keypair.fromSeed(decoded.slice(0, 32))
      }
      const pub = kp.publicKey.toBase58()
      if (!keypairs.has(pub)) keypairs.set(pub, kp)
    } catch { /* skip bad lines */ }
  }

  loadedKeypairs = keypairs
  loadedPubkeys = [...keypairs.keys()]

  return { count: keypairs.size, path: csvPath }
}

// ─── Scan ──────────────────────────────────────────────────────────────────

export async function scanWallets(win: BrowserWindow | null): Promise<RecoveryWalletInfo[]> {
  if (loadedPubkeys.length === 0) throw new Error('No wallets loaded. Import a CSV first.')

  const conn = getConnection()

  currentStatus = {
    state: 'scanning', currentPhase: 0, totalRecovered: 0,
    walletCount: loadedPubkeys.length, completed: 0, failed: 0,
  }

  const results: RecoveryWalletInfo[] = []

  for (let i = 0; i < loadedPubkeys.length; i += CONCURRENCY) {
    if (isAborted()) break
    const batch = loadedPubkeys.slice(i, i + CONCURRENCY)

    const batchResults = await Promise.allSettled(
      batch.map(async (address, j) => {
        const idx = i + j

        const balResult = await conn.getBalance(new PublicKey(address))
        const solLamports = balResult ?? 0

        const tokenAccounts = await conn.getParsedTokenAccountsByOwner(
          new PublicKey(address), { programId: TOKEN_PROGRAM_ID },
        )

        const allAccounts = tokenAccounts.value ?? []
        const emptyTokenAccounts = allAccounts.filter(
          (a) => a.account.data.parsed.info.tokenAmount.amount === '0',
        ).length

        const info: RecoveryWalletInfo = {
          index: idx, pubkey: address, solLamports,
          tokenAccountCount: allAccounts.length, emptyTokenAccounts, hasPammFees: false,
        }

        emit(win, {
          type: 'scan-progress', walletIndex: idx, pubkey: address,
          message: `Scanned ${address.slice(0, 8)}... | ${(solLamports / 1e9).toFixed(4)} SOL | ${allAccounts.length} tokens`,
        })

        return info
      }),
    )

    for (const r of batchResults) {
      if (r.status === 'fulfilled') results.push(r.value)
    }
  }

  emit(win, { type: 'scan-complete', message: `Scan complete: ${results.length} wallets` })
  currentStatus.state = 'idle'
  return results
}

// ─── Execute Recovery ──────────────────────────────────────────────────────

export async function executeRecovery(
  masterAddress: string,
  win: BrowserWindow | null,
): Promise<{ totalRecovered: number }> {
  if (loadedPubkeys.length === 0) throw new Error('No wallets loaded')

  const conn = getConnection()
  const masterPubkey = new PublicKey(masterAddress)

  // Find master keypair (it must be in the loaded set or the wallet DB)
  let masterKp = loadedKeypairs.get(masterAddress)
  if (!masterKp) {
    // Try to find it by checking if any loaded key matches
    throw new Error('Master wallet keypair not found in loaded wallets')
  }

  abortController = new AbortController()
  let totalRecovered = 0

  currentStatus = {
    state: 'executing', currentPhase: 0, totalRecovered: 0,
    walletCount: loadedPubkeys.length, completed: 0, failed: 0,
  }

  const priorityFee = await getPriorityFee(conn)

  try {
  // ─── Phase 1: Close empty token accounts ──────────────────────────────
  currentStatus.currentPhase = 1
  emit(win, { type: 'phase-start', phase: 1, message: 'Phase 1: Closing empty token accounts...' })

  for (let wi = 0; wi < loadedPubkeys.length; wi++) {
    if (isAborted()) break
    const pub = loadedPubkeys[wi]
    const kp = loadedKeypairs.get(pub)
    if (!kp) continue
    if (pub === masterAddress) continue

    try {
      const tokenAccounts = await conn.getParsedTokenAccountsByOwner(
        new PublicKey(pub), { programId: TOKEN_PROGRAM_ID },
      )

      const empty: { pubkey: PublicKey; programId: PublicKey }[] = []
      const withBalance: { pubkey: PublicKey; programId: PublicKey; mint: PublicKey; amount: bigint }[] = []

      for (const ta of tokenAccounts.value) {
        const info = ta.account.data.parsed.info
        const amount = BigInt(info.tokenAmount.amount)
        if (amount === 0n) {
          empty.push({ pubkey: ta.pubkey, programId: TOKEN_PROGRAM_ID })
        } else {
          withBalance.push({
            pubkey: ta.pubkey, programId: TOKEN_PROGRAM_ID,
            mint: new PublicKey(info.mint), amount,
          })
        }
      }

      if (empty.length === 0 && withBalance.length === 0) continue

      emit(win, { type: 'wallet-start', walletIndex: wi, pubkey: pub })

      // Burn + close accounts with token balances
      for (const ta of withBalance) {
        if (isAborted()) break
        try {
          const burnData = Buffer.alloc(9)
          burnData[0] = 8 // Burn opcode
          burnData.writeBigUInt64LE(ta.amount, 1)

          const burnIx = new TransactionInstruction({
            programId: ta.programId,
            keys: [
              { pubkey: ta.pubkey, isSigner: false, isWritable: true },
              { pubkey: ta.mint, isSigner: false, isWritable: true },
              { pubkey: kp.publicKey, isSigner: true, isWritable: false },
            ],
            data: burnData,
          })

          const closeIx = new TransactionInstruction({
            programId: ta.programId,
            keys: [
              { pubkey: ta.pubkey, isSigner: false, isWritable: true },
              { pubkey: masterPubkey, isSigner: false, isWritable: true },
              { pubkey: kp.publicKey, isSigner: true, isWritable: false },
            ],
            data: Buffer.from([9]),
          })

          const { blockhash } = await conn.getLatestBlockhash('finalized')
          const msg = new TransactionMessage({
            payerKey: masterPubkey,
            recentBlockhash: blockhash,
            instructions: [
              ComputeBudgetProgram.setComputeUnitLimit({ units: 80_000 }),
              ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
              burnIx, closeIx,
            ],
          }).compileToV0Message()

          const tx = new VersionedTransaction(msg)
          tx.sign([masterKp, kp])
          const sig = await sendAndConfirm(conn, tx)
          if (sig) {
            totalRecovered += 0.00203928
            currentStatus.totalRecovered = totalRecovered
            emit(win, { type: 'flow', walletIndex: wi, amount: 0.00203928, totalRecovered })
          }
        } catch { /* continue */ }
      }

      // Batch close empty accounts
      for (let bi = 0; bi < empty.length; bi += CLOSES_PER_TX) {
        if (isAborted()) break
        const batch = empty.slice(bi, bi + CLOSES_PER_TX)

        const closeIxs = batch.map((ta) => new TransactionInstruction({
          programId: ta.programId,
          keys: [
            { pubkey: ta.pubkey, isSigner: false, isWritable: true },
            { pubkey: masterPubkey, isSigner: false, isWritable: true },
            { pubkey: kp.publicKey, isSigner: true, isWritable: false },
          ],
          data: Buffer.from([9]),
        }))

        try {
          const { blockhash } = await conn.getLatestBlockhash('finalized')
          const msg = new TransactionMessage({
            payerKey: masterPubkey,
            recentBlockhash: blockhash,
            instructions: [
              ComputeBudgetProgram.setComputeUnitLimit({ units: 20_000 * batch.length }),
              ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
              ...closeIxs,
            ],
          }).compileToV0Message()

          const tx = new VersionedTransaction(msg)
          tx.sign([masterKp, kp])
          const sig = await sendAndConfirm(conn, tx)
          if (sig) {
            const recovered = batch.length * 0.00203928
            totalRecovered += recovered
            currentStatus.totalRecovered = totalRecovered
            emit(win, {
              type: 'flow', walletIndex: wi, amount: recovered, totalRecovered,
              message: `Closed ${batch.length} accounts from ${pub.slice(0, 12)}...`,
            })
          }
        } catch { /* continue */ }
      }

      currentStatus.completed++
      emit(win, { type: 'wallet-complete', walletIndex: wi, message: `Done: ${pub.slice(0, 12)}...` })
    } catch (err) {
      currentStatus.failed++
      emit(win, { type: 'wallet-error', walletIndex: wi, error: (err as Error).message })
    }
  }

  // ─── Phase 2: Sweep SOL ───────────────────────────────────────────────
  currentStatus.currentPhase = 2
  emit(win, { type: 'phase-start', phase: 2, message: 'Phase 2: Sweeping SOL to master...' })

  for (let wi = 0; wi < loadedPubkeys.length; wi++) {
    if (isAborted()) break
    const pub = loadedPubkeys[wi]
    if (pub === masterAddress) continue
    const kp = loadedKeypairs.get(pub)
    if (!kp) continue

    try {
      const balance = await conn.getBalance(kp.publicKey)
      if (balance === 0) continue

      emit(win, { type: 'wallet-start', walletIndex: wi, pubkey: pub })

      const { blockhash } = await conn.getLatestBlockhash('finalized')
      const msg = new TransactionMessage({
        payerKey: masterPubkey,
        recentBlockhash: blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 20_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
          SystemProgram.transfer({
            fromPubkey: kp.publicKey,
            toPubkey: masterPubkey,
            lamports: balance,
          }),
        ],
      }).compileToV0Message()

      const tx = new VersionedTransaction(msg)
      tx.sign([masterKp, kp])
      const sig = await sendAndConfirm(conn, tx)

      if (sig) {
        const sol = balance / 1e9
        totalRecovered += sol
        currentStatus.totalRecovered = totalRecovered
        currentStatus.completed++
        emit(win, {
          type: 'flow', walletIndex: wi, amount: sol, totalRecovered,
          message: `Swept ${sol.toFixed(6)} SOL from ${pub.slice(0, 12)}...`,
        })
        emit(win, { type: 'wallet-complete', walletIndex: wi })
      }
    } catch (err) {
      currentStatus.failed++
      emit(win, { type: 'wallet-error', walletIndex: wi, error: (err as Error).message })
    }
  }

  // ─── Done ─────────────────────────────────────────────────────────────
  currentStatus.state = 'complete'
  emit(win, { type: 'complete', totalRecovered, message: `Recovery complete: ${totalRecovered.toFixed(6)} SOL` })

  return { totalRecovered }
  } finally {
    currentStatus.state = 'idle'
    abortController = null
    clearLoadedWallets()
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export function getStatus(): RecoveryStatus {
  return { ...currentStatus }
}

export function stopRecovery() {
  abortController?.abort()
  currentStatus.state = 'idle'
  clearLoadedWallets()
}

export function clearLoadedWallets(): void {
  for (const kp of loadedKeypairs.values()) {
    kp.secretKey.fill(0)
  }
  loadedKeypairs.clear()
  loadedPubkeys = []
}

export function getLoadedCount(): number {
  return loadedPubkeys.length
}
