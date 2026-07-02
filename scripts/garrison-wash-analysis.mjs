#!/usr/bin/env node
// @ts-check
/**
 * garrison-wash-analysis.mjs — Garrison riskiest-assumption gate (offline).
 *
 * Validates §11 of .planning/GARRISON_BACKEND_SPEC.md BEFORE scaling the
 * referral-commission feature:
 *
 *   "Referred wallets generate enough INDEPENDENT, ORGANIC on-chain volume —
 *    volume the referrer is not themselves manufacturing — to make commissions
 *    meaningful without self-wash."
 *
 * If the only way to earn is to wash-trade your own referees, the mechanism is
 * an obfuscated self-pay that drains the fee floor and inflates fake activity.
 *
 * This script READS ONLY. It never writes to the DB and never touches chain.
 * It opens the live better-sqlite3 DB the app uses, measures historical
 * mainnet `fee_events`, estimates a wash fraction from the forensics
 * shared-funder graph, applies the §4 commission math, and prints a
 * GREEN / YELLOW / RED verdict.
 *
 * Usage:
 *   node scripts/garrison-wash-analysis.mjs [--db <path>] [--json]
 *   DAEMON_DB=<path> node scripts/garrison-wash-analysis.mjs
 *
 * Runtime note: better-sqlite3 is a NATIVE module compiled against ONE ABI.
 * In this repo it is built for Electron (`pnpm run rebuild:sqlite`). Plain
 * `node` has a different ABI and the require WILL throw NODE_MODULE_VERSION.
 * The script catches that and prints exact remediation rather than crashing.
 */

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import process from 'node:process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

// ───────────────────────── §2.6 / §4 constants (mirror the spec) ─────────────
// Compiled ceilings — config may only LOWER these, never raise.
const BASE_REFERRAL_BPS = 1000 // 10% of net protocol fee → referrer, base (pre-stake)
const MAX_REFERRAL_BPS = 3000 // hard ceiling on (base+bonus) referral share of net fee
const FEE_FLOOR_HEADROOM_BPS = 5000 // protocol keeps >= 50% of net fee, always
const KOL_RESERVED_BPS = 1000 // example carve-out for a manual/KOL deal on a referee
const MIN_CLAIM_LAMPORTS = 10_000_000 // 0.01 SOL — dust claims cost more than they pay
const PER_REFEREE_EPOCH_CAP_LAMPORTS = 5_000_000_000 // cap one referee's notional/epoch (anti-wash)
const DEFAULT_TIER_MULTIPLIER_BPS = 15_000 // v0 seeds ONE tier at 1.5x (§12 v0)

// From FeeService.ts — the dust floor below which the meter charges nothing.
const MIN_FEE_LAMPORTS = 5_000

const LAMPORTS_PER_SOL = 1_000_000_000
const MS_PER_DAY = 86_400_000

// ───────────────────────── CLI / env arg parsing ────────────────────────────
function parseArgs(argv) {
  const out = { db: null, json: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--db') out.db = argv[++i]
    else if (a.startsWith('--db=')) out.db = a.slice('--db='.length)
    else if (a === '--json') out.json = true
    else if (a === '-h' || a === '--help') out.help = true
  }
  return out
}

/**
 * Resolve the DB path the app actually uses. The app stores it at
 * `app.getPath('userData')/daemon.db` (see electron/db/db.ts). On Windows that
 * userData dir is `%APPDATA%/<productName>`. We try the known candidates and
 * default to the most-recently-written one, but let --db / DAEMON_DB override.
 */
function resolveDbPath(cliDb) {
  if (cliDb) return { path: path.resolve(cliDb), source: '--db' }
  if (process.env.DAEMON_DB) return { path: path.resolve(process.env.DAEMON_DB), source: 'DAEMON_DB' }

  const home = os.homedir()
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
  const candidates = [
    path.join(appData, 'daemon', 'daemon.db'),
    path.join(appData, 'DAEMON', 'daemon.db'),
    path.join(appData, 'Electron', 'daemon.db'), // dev runs unpackaged → productName "Electron"
    // macOS
    path.join(home, 'Library', 'Application Support', 'daemon', 'daemon.db'),
    path.join(home, 'Library', 'Application Support', 'DAEMON', 'daemon.db'),
    path.join(home, 'Library', 'Application Support', 'Electron', 'daemon.db'),
    // Linux
    path.join(home, '.config', 'daemon', 'daemon.db'),
    path.join(home, '.config', 'DAEMON', 'daemon.db'),
    path.join(home, '.config', 'Electron', 'daemon.db'),
  ]
  const existing = candidates
    .filter((p) => fs.existsSync(p))
    .map((p) => ({ p, mtime: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  if (existing.length) return { path: existing[0].p, source: 'auto', candidates }
  return { path: null, source: 'none', candidates }
}

function printAbiHelp() {
  console.error('')
  console.error('  Cause: the native better-sqlite3 module is built for a DIFFERENT runtime')
  console.error('  ABI than the node you ran this with (DAEMON builds it for Electron).')
  console.error('')
  console.error('  Fix — pick ONE:')
  console.error('    A) Rebuild for your system node, then re-run:')
  console.error('         npm rebuild better-sqlite3      (in ' + REPO_ROOT + ')')
  console.error('       then `pnpm run rebuild:sqlite` afterward to restore the Electron ABI.')
  console.error('    B) Run under Electron’s bundled node:')
  console.error('         set ELECTRON_RUN_AS_NODE=1 && npx electron scripts/garrison-wash-analysis.mjs')
  console.error('    C) Install a throwaway copy for system node in a temp dir and run with')
  console.error('       NODE_PATH pointing at it.')
}

/**
 * better-sqlite3 binds its native addon lazily — `require()` can succeed and the
 * NODE_MODULE_VERSION error only surfaces on first `new Database()`. So we both
 * require AND construct against a temp in-memory handle to surface ABI errors
 * here, where we can print actionable guidance.
 */
function loadDatabase() {
  try {
    const Database = require('better-sqlite3')
    const probe = new Database(':memory:') // forces the native binding to load
    probe.close()
    return { Database, error: null }
  } catch (err) {
    return { Database: null, error: err }
  }
}

// ───────────────────────── §4 commission math (per metered execution) ───────
/**
 * Floor-safe per-event commission. Mirrors §4.4 exactly. All shares are bps of
 * the net protocol fee (`fee_lamports`), never of notional. Returns the lamports
 * that would accrue to the referrer for this single fee event.
 *
 * @param {number} netFee fee_events.fee_lamports
 * @param {number} multiplierBps tier multiplier (10000 = 1.0x, 15000 = 1.5x)
 * @param {boolean} kolApplies whether a KOL carve-out applies to this referee
 */
function commissionForEvent(netFee, multiplierBps, kolApplies) {
  const baseShare = Math.floor((netFee * BASE_REFERRAL_BPS) / 10_000)
  const multipliedShare = Math.floor((baseShare * multiplierBps) / 10_000)

  // 1. cap the referral line at MAX_REFERRAL_BPS of net fee
  const referralCap = Math.floor((netFee * MAX_REFERRAL_BPS) / 10_000)
  const referralLine = Math.min(multipliedShare, referralCap)

  // 2. cap the SUM (referral + KOL) so the protocol keeps the floor
  const maxOutbound = Math.floor((netFee * (10_000 - FEE_FLOOR_HEADROOM_BPS)) / 10_000)
  const kol = kolApplies ? Math.floor((netFee * KOL_RESERVED_BPS) / 10_000) : 0
  const allowedReferral = Math.max(0, maxOutbound - kol)
  return Math.min(referralLine, allowedReferral) // FINAL, floor-safe
}

const epochOf = (createdAtMs) => Math.floor(createdAtMs / MS_PER_DAY)
const sol = (lamports) => (Number(lamports) / LAMPORTS_PER_SOL).toFixed(6)
const pct = (x) => (x * 100).toFixed(1) + '%'

// ───────────────────────── median / percentile helpers ──────────────────────
function quantile(sortedAsc, q) {
  if (!sortedAsc.length) return 0
  const idx = (sortedAsc.length - 1) * q
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sortedAsc[lo]
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo)
}

// ───────────────────────── analysis core ────────────────────────────────────
function analyze(db) {
  const tableExists = (t) =>
    db.prepare("SELECT count(*) c FROM sqlite_master WHERE type='table' AND name=?").get(t).c > 0

  const required = ['fee_events', 'forensic_bundle_clusters', 'forensic_bundle_wallet_index']
  const missing = required.filter((t) => !tableExists(t))
  if (missing.includes('fee_events')) {
    return { fatal: `fee_events table not found (schema too old?). Missing: ${missing.join(', ')}` }
  }

  const MAINNET = 'mainnet-beta'

  // (a) totals over mainnet fee_events
  const totals = db
    .prepare(
      `SELECT count(*) rows,
              COALESCE(sum(notional_lamports),0) notional,
              COALESCE(sum(fee_lamports),0) fee,
              COALESCE(min(created_at),0) firstAt,
              COALESCE(max(created_at),0) lastAt,
              count(DISTINCT wallet) wallets
         FROM fee_events WHERE cluster = ?`,
    )
    .get(MAINNET)

  if (totals.rows === 0) {
    return { empty: true, totals, otherClusters: clusterSpread(db) }
  }

  // (b) per-wallet notional distribution (mainnet only)
  const perWallet = db
    .prepare(
      `SELECT wallet,
              count(*) events,
              sum(notional_lamports) notional,
              sum(fee_lamports) fee
         FROM fee_events WHERE cluster = ?
        GROUP BY wallet`,
    )
    .all(MAINNET)

  // Build wallet → shared_funder set via the forensics graph.
  // forensic_bundle_wallet_index(wallet, cluster_id) ⋈ forensic_bundle_clusters(shared_funder)
  const walletFunders = new Map() // wallet → Set(shared_funder)
  const funderMembers = new Map() // shared_funder → Set(wallet)  (co-referee detection)
  let clustersWithFunder = 0
  if (tableExists('forensic_bundle_wallet_index') && tableExists('forensic_bundle_clusters')) {
    const rows = db
      .prepare(
        `SELECT wi.wallet wallet, c.shared_funder funder
           FROM forensic_bundle_wallet_index wi
           JOIN forensic_bundle_clusters c ON c.id = wi.cluster_id
          WHERE c.shared_funder IS NOT NULL AND c.shared_funder <> ''`,
      )
      .all()
    clustersWithFunder = new Set(rows.map((r) => r.funder)).size
    for (const r of rows) {
      if (!walletFunders.has(r.wallet)) walletFunders.set(r.wallet, new Set())
      walletFunders.get(r.wallet).add(r.funder)
      if (!funderMembers.has(r.funder)) funderMembers.set(r.funder, new Set())
      funderMembers.get(r.funder).add(r.wallet)
    }
  }

  // (c) wash fraction.
  // Without seed referral attributions (none exist pre-launch), we use the
  // strongest available proxy for self-wash: a wallet's notional is "wash-tainted"
  // if the wallet sits in a forensic cluster that shares a funder with ANOTHER
  // active fee-paying wallet. Co-funded fee-payers are the co-referee / round-trip
  // signal §4.5 calls out. This is an UPPER-BOUND proxy (no counterparty data in
  // fee_events) and is deliberately conservative — it over-counts wash if anything.
  const activeWallets = new Set(perWallet.map((w) => w.wallet))
  let washNotional = 0
  let cleanNotional = 0
  const taintedWallets = new Set()
  for (const w of perWallet) {
    const funders = walletFunders.get(w.wallet)
    let tainted = false
    if (funders) {
      for (const f of funders) {
        const members = funderMembers.get(f)
        if (!members) continue
        // shared funder links this wallet to >=1 OTHER active fee-payer → wash signal
        for (const m of members) {
          if (m !== w.wallet && activeWallets.has(m)) {
            tainted = true
            break
          }
        }
        if (tainted) break
      }
    }
    if (tainted) {
      washNotional += Number(w.notional)
      taintedWallets.add(w.wallet)
    } else {
      cleanNotional += Number(w.notional)
    }
  }
  const washFraction = totals.notional > 0 ? washNotional / Number(totals.notional) : 0

  // (d) median ORGANIC notional per active wallet per day-epoch.
  // Build per (wallet, epoch) organic notional, dropping wash-tainted wallets and
  // dust-fee events, then take the median across the population.
  const perWalletEpoch = db
    .prepare(
      `SELECT wallet,
              CAST(created_at / ${MS_PER_DAY} AS INTEGER) epoch,
              sum(notional_lamports) notional,
              sum(fee_lamports) fee,
              count(*) events
         FROM fee_events
        WHERE cluster = ? AND fee_lamports >= ${MIN_FEE_LAMPORTS}
        GROUP BY wallet, epoch`,
    )
    .all(MAINNET)

  const organicPerWalletEpoch = perWalletEpoch.filter((r) => !taintedWallets.has(r.wallet))
  const organicNotionals = organicPerWalletEpoch
    .map((r) => Math.min(Number(r.notional), PER_REFEREE_EPOCH_CAP_LAMPORTS))
    .sort((a, b) => a - b)
  const medianOrganicNotional = quantile(organicNotionals, 0.5)
  const p25 = quantile(organicNotionals, 0.25)
  const p75 = quantile(organicNotionals, 0.75)

  // Per-wallet-epoch organic FEE (the real pie that gets split) — for commission.
  const organicFeesByWalletEpoch = organicPerWalletEpoch.map((r) => Number(r.fee))

  return {
    empty: false,
    totals,
    perWalletCount: perWallet.length,
    washNotional,
    cleanNotional,
    washFraction,
    taintedWalletCount: taintedWallets.size,
    clustersWithFunder,
    forensicsPopulated: walletFunders.size > 0,
    medianOrganicNotional,
    p25OrganicNotional: p25,
    p75OrganicNotional: p75,
    organicSampleSize: organicNotionals.length,
    organicFeesByWalletEpoch,
    windowDays: (Number(totals.lastAt) - Number(totals.firstAt)) / MS_PER_DAY,
  }
}

function clusterSpread(db) {
  if (!db.prepare("SELECT count(*) c FROM sqlite_master WHERE type='table' AND name='fee_events'").get().c)
    return []
  return db.prepare('SELECT cluster, count(*) c FROM fee_events GROUP BY cluster ORDER BY c DESC').all()
}

// ───────────────────────── commission projection + verdict ──────────────────
/**
 * Project the commission a typical referrer earns per epoch under the §4 math,
 * for both an unstaked (1.0x) and a v0-staked (1.5x) referrer, using the
 * MEDIAN organic per-wallet-epoch fee. Then compare to MIN_CLAIM_LAMPORTS.
 */
function projectCommission(a) {
  const fees = a.organicFeesByWalletEpoch.slice().sort((x, y) => x - y)
  const medianFee = quantile(fees, 0.5)
  const p75Fee = quantile(fees, 0.75)
  const p90Fee = quantile(fees, 0.9)

  const proj = (feeLamports, multiplierBps) => commissionForEvent(feeLamports, multiplierBps, false)

  // A referrer typically has >1 referee; model the single-referee-epoch case
  // (the worst case for clearing the floor) AND report how many median referees
  // it takes to clear MIN_CLAIM_LAMPORTS in one epoch.
  const medianCommission1x = proj(medianFee, 10_000)
  const medianCommission15x = proj(medianFee, DEFAULT_TIER_MULTIPLIER_BPS)
  const p75Commission15x = proj(p75Fee, DEFAULT_TIER_MULTIPLIER_BPS)

  const refereesToClear15x =
    medianCommission15x > 0 ? Math.ceil(MIN_CLAIM_LAMPORTS / medianCommission15x) : Infinity
  const refereesToClear1x =
    medianCommission1x > 0 ? Math.ceil(MIN_CLAIM_LAMPORTS / medianCommission1x) : Infinity

  // Fraction of organic wallet-epochs whose SINGLE-referee commission already
  // clears the floor at 1.5x — i.e. one referee in one day is enough.
  const clearingSingle = fees.filter((f) => proj(f, DEFAULT_TIER_MULTIPLIER_BPS) >= MIN_CLAIM_LAMPORTS).length
  const fracClearingSingle = fees.length ? clearingSingle / fees.length : 0

  return {
    medianFee,
    p75Fee,
    p90Fee,
    medianCommission1x,
    medianCommission15x,
    p75Commission15x,
    refereesToClear1x,
    refereesToClear15x,
    fracClearingSingle,
  }
}

function decideVerdict(a, c) {
  // GREEN: low wash AND a non-trivial fraction of stakers plausibly clear the
  //        floor from organic volume in a reasonable window.
  // YELLOW: clears, but only with many referees / high wash / thin sample →
  //         ship with conservative rates + tight caps + monitoring.
  // RED:    wash dominates, or organic volume can't clear the floor at all →
  //         it's a wash-farm; stop.
  const reasons = []
  let verdict = 'YELLOW'

  const washHigh = a.washFraction >= 0.5
  const washMed = a.washFraction >= 0.2
  const clearsSometimes = c.fracClearingSingle > 0 || Number.isFinite(c.refereesToClear15x)
  const clearsEasily = c.fracClearingSingle >= 0.1 || c.refereesToClear15x <= 5

  if (washHigh) {
    verdict = 'RED'
    reasons.push(`wash fraction ${pct(a.washFraction)} ≥ 50% — referred volume is dominated by self-funded/co-funded wallets; commission would be obfuscated self-pay`)
  } else if (!clearsSometimes) {
    verdict = 'RED'
    reasons.push(`organic per-referee fee is ~0 (median ${sol(c.medianFee)} SOL) — no plausible number of organic referees clears MIN_CLAIM (0.01 SOL); the multiplier can't move behavior`)
  } else if (clearsEasily && !washMed) {
    verdict = 'GREEN'
    reasons.push(`${pct(c.fracClearingSingle)} of organic wallet-epochs clear the floor from a SINGLE referee at 1.5x; ~${c.refereesToClear15x} median referees clear it in one epoch`)
    reasons.push(`wash fraction ${pct(a.washFraction)} < 20% — organic volume is the dominant signal`)
  } else {
    verdict = 'YELLOW'
    reasons.push(`organic volume clears the floor but only with ~${c.refereesToClear15x} median referees per epoch (or wash fraction ${pct(a.washFraction)} is non-trivial)`)
    reasons.push('ship with conservative base rate, tight PER_REFEREE_EPOCH_CAP, and live wash monitoring before scaling tiers')
  }

  return { verdict, reasons }
}

// ───────────────────────── reporting ────────────────────────────────────────
function printHeader(dbInfo) {
  console.log('═'.repeat(74))
  console.log(' GARRISON — Riskiest-Assumption Gate (offline wash analysis)')
  console.log(' Spec: .planning/GARRISON_BACKEND_SPEC.md §4, §4.5, §11')
  console.log('═'.repeat(74))
  console.log(` DB: ${dbInfo.path}  (source: ${dbInfo.source})`)
  console.log('')
}

function printEmpty(a, dbInfo) {
  console.log('RESULT: NO MAINNET fee_events DATA YET (pre-launch).')
  console.log('')
  console.log(`  mainnet-beta fee_events rows: ${a.totals.rows}`)
  if (a.otherClusters && a.otherClusters.length) {
    console.log('  fee_events on other clusters:')
    for (const r of a.otherClusters) console.log(`    ${r.cluster}: ${r.c}`)
  } else {
    console.log('  fee_events on all clusters: 0 (table is empty)')
  }
  console.log('')
  console.log('VERDICT: INSUFFICIENT DATA — cannot make the GREEN/YELLOW/RED call yet.')
  console.log('')
  console.log('The script is correct and ready. Re-run once the meter has logged real')
  console.log('mainnet executions. To make a defensible call you need roughly:')
  console.log('  • ≥ 30 distinct referred (fee-paying) wallets on mainnet-beta,')
  console.log('  • ≥ 14 day-epochs of history (so median-per-epoch is stable),')
  console.log('  • the forensics bundle scanner run over those wallets (so')
  console.log('    forensic_bundle_clusters.shared_funder is populated for the')
  console.log('    wash-fraction estimate), and ideally')
  console.log('  • a handful of seed referral attributions to replace the')
  console.log('    co-funded-wallet proxy with true counterparty linkage.')
  console.log('')
  console.log('Until then: see the analytical reasoning in the run report.')
}

function printFull(a, c, decision) {
  const T = a.totals
  console.log('── Volume (mainnet-beta fee_events) ─────────────────────────────────')
  console.log(`  rows:               ${T.rows}`)
  console.log(`  distinct wallets:   ${T.wallets}`)
  console.log(`  window:             ${a.windowDays.toFixed(1)} days`)
  console.log(`  total notional:     ${sol(T.notional)} SOL`)
  console.log(`  total fees (pie):   ${sol(T.fee)} SOL`)
  console.log('')
  console.log('── Wash estimate (forensics shared-funder graph) ────────────────────')
  console.log(`  forensics populated: ${a.forensicsPopulated ? 'yes' : 'NO (wash undercount risk)'}`)
  console.log(`  clusters w/ funder:  ${a.clustersWithFunder}`)
  console.log(`  wash-tainted wallets: ${a.taintedWalletCount} / ${a.perWalletCount}`)
  console.log(`  wash notional:       ${sol(a.washNotional)} SOL`)
  console.log(`  clean notional:      ${sol(a.cleanNotional)} SOL`)
  console.log(`  WASH FRACTION:       ${pct(a.washFraction)}`)
  console.log('')
  console.log('── Organic per-wallet-epoch (wash-tainted wallets removed) ───────────')
  console.log(`  sample (wallet-epochs): ${a.organicSampleSize}`)
  console.log(`  median organic notional: ${sol(a.medianOrganicNotional)} SOL  (p25 ${sol(a.p25OrganicNotional)} / p75 ${sol(a.p75OrganicNotional)})`)
  console.log(`  median organic fee:      ${sol(c.medianFee)} SOL  (p75 ${sol(c.p75Fee)} / p90 ${sol(c.p90Fee)})`)
  console.log('')
  console.log('── Commission projection (§4 math, floor-safe) ──────────────────────')
  console.log(`  per median organic referee-epoch:`)
  console.log(`    unstaked 1.0x:  ${sol(c.medianCommission1x)} SOL`)
  console.log(`    staked   1.5x:  ${sol(c.medianCommission15x)} SOL`)
  console.log(`    p75 ref  1.5x:  ${sol(c.p75Commission15x)} SOL`)
  console.log(`  MIN_CLAIM:        ${sol(MIN_CLAIM_LAMPORTS)} SOL`)
  console.log(`  median referees to clear MIN_CLAIM in one epoch: 1.0x → ${c.refereesToClear1x}, 1.5x → ${c.refereesToClear15x}`)
  console.log(`  fraction of organic referee-epochs clearing MIN_CLAIM from ONE referee (1.5x): ${pct(c.fracClearingSingle)}`)
  console.log('')
  console.log('═'.repeat(74))
  console.log(` VERDICT: ${decision.verdict}`)
  for (const r of decision.reasons) console.log(`   • ${r}`)
  console.log('═'.repeat(74))
}

// ───────────────────────── main ─────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Usage: node scripts/garrison-wash-analysis.mjs [--db <path>] [--json]')
    console.log('       DAEMON_DB=<path> node scripts/garrison-wash-analysis.mjs')
    process.exit(0)
  }

  const dbInfo = resolveDbPath(args.db)
  if (!dbInfo.path) {
    console.error('Could not locate daemon.db. No candidate path exists.')
    console.error('Tried:')
    for (const c of dbInfo.candidates || []) console.error('  ' + c)
    console.error('')
    console.error('Pass it explicitly:  node scripts/garrison-wash-analysis.mjs --db <path-to-daemon.db>')
    console.error('Or set DAEMON_DB=<path>.')
    process.exit(2)
  }
  if (!fs.existsSync(dbInfo.path)) {
    console.error(`DB path does not exist: ${dbInfo.path}`)
    console.error('Pass --db <path> or set DAEMON_DB to the real daemon.db.')
    process.exit(2)
  }

  const { Database, error } = loadDatabase()
  if (error) {
    console.error('Failed to load better-sqlite3.')
    if (String(error.message || '').includes('NODE_MODULE_VERSION')) printAbiHelp()
    else console.error('  ' + error.message)
    process.exit(3)
  }

  let db
  try {
    db = new Database(dbInfo.path, { readonly: true, fileMustExist: true })
  } catch (err) {
    console.error('Could not open DB read-only: ' + (err && err.message))
    process.exit(3)
  }

  let a
  try {
    a = analyze(db)
  } finally {
    db.close()
  }

  if (a.fatal) {
    console.error(a.fatal)
    process.exit(4)
  }

  if (args.json && !a.empty) {
    const c = projectCommission(a)
    const decision = decideVerdict(a, c)
    // strip the large raw array before serializing
    const { organicFeesByWalletEpoch, ...rest } = a
    console.log(JSON.stringify({ db: dbInfo.path, analysis: rest, projection: c, decision }, null, 2))
    return
  }

  printHeader(dbInfo)
  if (a.empty) {
    printEmpty(a, dbInfo)
    return
  }
  const c = projectCommission(a)
  const decision = decideVerdict(a, c)
  printFull(a, c, decision)
}

main()
