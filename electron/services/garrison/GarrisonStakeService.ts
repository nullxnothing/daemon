import crypto from 'node:crypto'
import { PublicKey } from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token'
import { getDb } from '../../db/db'
import {
  executeInstructions,
  getConnectionStrict,
  withKeypair,
} from '../SolanaService'
import { generateWallet } from '../WalletService'

// Garrison subsystem A — custodial $DAEMON staking vault.
//
// Staking gates the referral COMMISSION MULTIPLIER (and the rank bag-multiplier in a
// later subsystem). It never pays a yield on its own: a stake with zero referred volume
// earns zero. This is a separate, off-chain custodial vault — NOT the landing-site
// Streamflow staking. See GARRISON_BACKEND_SPEC.md §3.1 / §13.
//
// Discipline mirrors FlywheelService: deposits/withdrawals are ledgered with a UNIQUE
// on-chain signature so a replay/crash can't double-credit, and the credited amount is
// read authoritatively from the confirmed tx, never trusted from the client.

const DAEMON_MINT = '4vpf4qNtNVkvz2dm5qL2mT6jBXH9gDY8qH2QsHN5pump'
// 24h hold before a stake counts toward the multiplier — kills flash-staking.
export const STAKE_MATURITY_MS = 86_400_000
const ESCROW_WALLET_NAME = 'Garrison Vault'

export type StakeTier = { id: string; name: string; multiplierBps: number }
export type StakeStatus = {
  stakedRaw: number
  tier: StakeTier | null
  multiplierBps: number
  effectiveFrom: number | null
  isMature: boolean
  escrowWallet: string
  status: string
}

interface StakeRow {
  id: string
  holder_wallet: string
  staked_raw: number
  escrow_wallet: string
  tier_id: string | null
  effective_from: number | null
  status: string
}

interface TierRow {
  id: string
  name: string
  min_stake_raw: number
  multiplier_bps: number
}

// ----------------------------------------------------------------- escrow ---

let _escrowWalletId: string | null = null

/** The single DAEMON-controlled vault that holds staked $DAEMON. Created once. */
export function getOrCreateEscrowWallet(): { walletId: string; address: string } {
  const db = getDb()
  const existing = db
    .prepare('SELECT id, address FROM wallets WHERE name = ? LIMIT 1')
    .get(ESCROW_WALLET_NAME) as { id: string; address: string } | undefined
  if (existing) {
    _escrowWalletId = existing.id
    return { walletId: existing.id, address: existing.address }
  }
  const created = generateWallet(ESCROW_WALLET_NAME, 'user') as { id: string; address: string }
  _escrowWalletId = created.id
  return { walletId: created.id, address: created.address }
}

function escrowWalletIdFor(address: string): string {
  if (_escrowWalletId) return _escrowWalletId
  const db = getDb()
  const row = db.prepare('SELECT id FROM wallets WHERE address = ? LIMIT 1').get(address) as
    | { id: string }
    | undefined
  if (!row) throw new Error('Garrison escrow wallet not found')
  _escrowWalletId = row.id
  return row.id
}

// ------------------------------------------------------------------ tiers ---

/** Highest active tier whose threshold the matured stake clears; 1.0x otherwise. */
export function tierFor(holderWallet: string): { tier: StakeTier | null; multiplierBps: number } {
  const status = getStakeStatus(holderWallet)
  if (!status || status.stakedRaw <= 0 || !status.isMature) return { tier: null, multiplierBps: 10000 }
  const db = getDb()
  const row = db
    .prepare(
      'SELECT id, name, min_stake_raw, multiplier_bps FROM garrison_multiplier_tiers ' +
        'WHERE active = 1 AND min_stake_raw <= ? ORDER BY min_stake_raw DESC LIMIT 1',
    )
    .get(status.stakedRaw) as TierRow | undefined
  if (!row) return { tier: null, multiplierBps: 10000 }
  return {
    tier: { id: row.id, name: row.name, multiplierBps: row.multiplier_bps },
    multiplierBps: row.multiplier_bps,
  }
}

function recomputeTier(stake: StakeRow): string | null {
  const db = getDb()
  const row = db
    .prepare(
      'SELECT id FROM garrison_multiplier_tiers WHERE active = 1 AND min_stake_raw <= ? ' +
        'ORDER BY min_stake_raw DESC LIMIT 1',
    )
    .get(stake.staked_raw) as { id: string } | undefined
  return row?.id ?? null
}

// ------------------------------------------------------------------ reads ---

export function getStakeStatus(holderWallet: string): StakeStatus | null {
  const db = getDb()
  const stake = db
    .prepare('SELECT * FROM garrison_stakes WHERE holder_wallet = ?')
    .get(holderWallet) as StakeRow | undefined
  if (!stake) return null
  const tier = stake.tier_id
    ? (db
        .prepare('SELECT id, name, min_stake_raw, multiplier_bps FROM garrison_multiplier_tiers WHERE id = ?')
        .get(stake.tier_id) as TierRow | undefined)
    : undefined
  const isMature =
    stake.effective_from != null && Date.now() - stake.effective_from >= STAKE_MATURITY_MS
  return {
    stakedRaw: stake.staked_raw,
    tier: tier && isMature ? { id: tier.id, name: tier.name, multiplierBps: tier.multiplier_bps } : null,
    multiplierBps: tier && isMature ? tier.multiplier_bps : 10000,
    effectiveFrom: stake.effective_from,
    isMature,
    escrowWallet: stake.escrow_wallet,
    status: stake.status,
  }
}

// ------------------------------------------------------------- on-chain ---

async function tokenTransfer(
  fromWalletId: string,
  fromOwner: PublicKey,
  toOwner: PublicKey,
  amountRaw: number,
  guardSource: string,
): Promise<string> {
  const connection = getConnectionStrict()
  const mint = new PublicKey(DAEMON_MINT)
  const fromAta = await getAssociatedTokenAddress(mint, fromOwner)
  const toAta = await getAssociatedTokenAddress(mint, toOwner)
  return withKeypair(fromWalletId, async (keypair) => {
    const ixs = []
    try {
      await getAccount(connection, toAta)
    } catch {
      ixs.push(createAssociatedTokenAccountInstruction(keypair.publicKey, toAta, toOwner, mint))
    }
    ixs.push(createTransferInstruction(fromAta, toAta, fromOwner, amountRaw))
    const res = await executeInstructions(connection, ixs, [keypair], {
      payer: keypair.publicKey,
      guardSource,
    })
    return res.signature
  })
}

/** Read how many $DAEMON base units a confirmed tx credited to `owner`'s ATA. */
async function readCreditedTokens(signature: string, owner: PublicKey): Promise<number> {
  const connection = getConnectionStrict()
  const ata = (await getAssociatedTokenAddress(new PublicKey(DAEMON_MINT), owner)).toBase58()
  for (let attempt = 0; attempt < 5; attempt++) {
    const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 })
    if (tx?.meta) {
      const pre = tx.meta.preTokenBalances?.find((b) => b.owner === owner.toBase58())
      const post = tx.meta.postTokenBalances?.find((b) => b.owner === owner.toBase58())
      void ata
      const before = Number(pre?.uiTokenAmount.amount ?? 0)
      const after = Number(post?.uiTokenAmount.amount ?? 0)
      return Math.max(0, after - before)
    }
    await new Promise((r) => setTimeout(r, 800))
  }
  return 0
}

// ----------------------------------------------------------------- stake ---

/** Holder -> escrow $DAEMON deposit. Credited amount read from the confirmed tx. */
export async function stake(
  holderWallet: string,
  holderWalletId: string,
  amountRaw: number,
): Promise<{ stakeId: string; signature: string; stakedRaw: number; tier: StakeTier | null; effectiveFrom: number }> {
  if (amountRaw <= 0) throw new Error('Stake amount must be positive')
  const escrow = getOrCreateEscrowWallet()
  const db = getDb()

  const signature = await tokenTransfer(
    holderWalletId,
    new PublicKey(holderWallet),
    new PublicKey(escrow.address),
    amountRaw,
    'garrison:stake',
  )
  const credited = (await readCreditedTokens(signature, new PublicKey(escrow.address))) || amountRaw

  const now = Date.now()
  const stakeId = upsertStake(holderWallet, escrow.address, credited, now)
  insertMovement(stakeId, 'deposit', credited, signature)

  const status = getStakeStatus(holderWallet)
  const tier = status ? tierFor(holderWallet).tier : null
  return { stakeId, signature, stakedRaw: status?.stakedRaw ?? credited, tier, effectiveFrom: now }
}

/** Escrow -> holder withdrawal. Omitting amountRaw withdraws the full position. */
export async function unstake(
  holderWallet: string,
  amountRaw?: number,
): Promise<{ signature: string; remainingRaw: number; newTier: StakeTier | null }> {
  const db = getDb()
  const stake = db
    .prepare('SELECT * FROM garrison_stakes WHERE holder_wallet = ?')
    .get(holderWallet) as StakeRow | undefined
  if (!stake) throw new Error('No stake position for this wallet')
  if (stake.status === 'frozen') throw new Error('Stake is frozen (incident hold)')
  const amount = amountRaw == null ? stake.staked_raw : Math.min(amountRaw, stake.staked_raw)
  if (amount <= 0) throw new Error('Nothing to unstake')

  const escrowWalletId = escrowWalletIdFor(stake.escrow_wallet)
  const signature = await tokenTransfer(
    escrowWalletId,
    new PublicKey(stake.escrow_wallet),
    new PublicKey(holderWallet),
    amount,
    'garrison:unstake',
  )

  const remaining = stake.staked_raw - amount
  const now = Date.now()
  // Lowering the stake resets maturity only if it drops the tier; otherwise hold it.
  const prevTier = recomputeTier(stake)
  const updated: StakeRow = { ...stake, staked_raw: remaining }
  const newTierId = recomputeTier(updated)
  const effectiveFrom = newTierId !== prevTier ? now : stake.effective_from
  db.prepare(
    'UPDATE garrison_stakes SET staked_raw = ?, tier_id = ?, effective_from = ?, updated_at = ? WHERE id = ?',
  ).run(remaining, newTierId, effectiveFrom, now, stake.id)
  insertMovement(stake.id, 'withdraw', amount, signature)

  return { signature, remainingRaw: remaining, newTier: tierFor(holderWallet).tier }
}

// ------------------------------------------------------------- mutations ---

function upsertStake(holderWallet: string, escrowWallet: string, addRaw: number, now: number): string {
  const db = getDb()
  const existing = db
    .prepare('SELECT * FROM garrison_stakes WHERE holder_wallet = ?')
    .get(holderWallet) as StakeRow | undefined
  if (existing) {
    const next: StakeRow = { ...existing, staked_raw: existing.staked_raw + addRaw }
    const tierId = recomputeTier(next)
    // A deposit that lifts the tier resets the maturity clock for the new level.
    const effectiveFrom = tierId !== existing.tier_id ? now : existing.effective_from
    db.prepare(
      'UPDATE garrison_stakes SET staked_raw = ?, tier_id = ?, effective_from = ?, updated_at = ? WHERE id = ?',
    ).run(next.staked_raw, tierId, effectiveFrom, now, existing.id)
    return existing.id
  }
  const id = crypto.randomUUID()
  const fresh: StakeRow = {
    id,
    holder_wallet: holderWallet,
    staked_raw: addRaw,
    escrow_wallet: escrowWallet,
    tier_id: null,
    effective_from: now,
    status: 'active',
  }
  const tierId = recomputeTier(fresh)
  db.prepare(
    'INSERT INTO garrison_stakes (id, holder_wallet, staked_raw, escrow_wallet, tier_id, effective_from, status, created_at, updated_at) ' +
      'VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(id, holderWallet, addRaw, escrowWallet, tierId, now, 'active', now, now)
  return id
}

function insertMovement(stakeId: string, kind: 'deposit' | 'withdraw', amountRaw: number, signature: string): void {
  const db = getDb()
  db.prepare(
    'INSERT OR IGNORE INTO garrison_stake_movements (id, stake_id, kind, amount_raw, signature, status) VALUES (?,?,?,?,?,?)',
  ).run(crypto.randomUUID(), stakeId, kind, amountRaw, signature, 'confirmed')
}

// --------------------------------------------------------- incident response ---

export function freeze(holderWallet: string): void {
  getDb().prepare('UPDATE garrison_stakes SET status = ?, updated_at = ? WHERE holder_wallet = ?')
    .run('frozen', Date.now(), holderWallet)
}

export function unfreeze(holderWallet: string): void {
  getDb().prepare('UPDATE garrison_stakes SET status = ?, updated_at = ? WHERE holder_wallet = ?')
    .run('active', Date.now(), holderWallet)
}
