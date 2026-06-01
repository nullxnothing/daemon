# DAEMON Security Audit & Remediation

Audit of the Electron hot-wallet / agent-workbench. Findings are recorded per
priority stage with `file:line` evidence and a status of **CONFIRMED+FIXED**,
**ALREADY MITIGATED** (with proof), or **N/A**.

One branch + PR per stage:
- P0 → `fix/security-p0`
- P1 → `fix/security-p1`
- P2 → `fix/security-p2`
- P3 → `fix/security-p3`

---

## Transaction flow call graph (signer reachability)

The single signing primitive is `withKeypair` / `loadKeypair` in
`electron/services/SolanaService.ts:385-409`. It loads a decrypted `Keypair`
from `SecureKeyService`, passes it to a callback, and zeroes the secret in a
`finally`. All on-chain signing funnels through `executeTransaction`
(`SolanaService.ts:273`) / `executeInstructions` (`:348`), which call
`transaction.sign(...)` then `submitRawTransaction`.

Callers of the signing primitive (`Grep withKeypair|executeTransaction|loadKeypair|.sign(`):
- `services/WalletService.ts` — `transferSOL`, `transferToken`, `executeSwap`, external-transfer prepare/submit
- `services/PumpFunService.ts`, `services/token-launch/adapters/*` — launch flows
- `services/ProofPoolService.ts`, `services/MetaplexOperatorService.ts`, `services/KeycardService.ts`, `services/MeterflowService.ts`, `services/ProService.ts`, `services/RecoveryService.ts`
- `services/AgentWorkService.ts` (`loadKeypair`, `:178`) and `services/SpawnAgentsService.ts` — **agent-adjacent**, analyzed in P1.

Renderer → signer entry points are the `wallet:*` IPC channels in
`electron/ipc/wallet.ts` (`wallet:send-sol :106`, `wallet:send-token :122`,
`wallet:swap-execute :138`). These are exposed to the renderer via
`electron/preload/index.ts:297-335`. **The signing IPC channels assume the
renderer UI is the approval gate** — there is no main-process binding between an
approved proposal and the signed bytes. This is the P1 confused-deputy surface.

---

## PRIORITY 3 — Anchor program `programs/daemon-registry` (`fix/security-p3`)

Focus: `settle_task` + `approve_work` (the settlement/approval flows). Overall the
program is well-built (Anchor 0.31, `Account<T>` owner checks, canonical bumps,
checked math, sound state machine). Checklist results:

| Check | Result | Evidence |
|---|---|---|
| Approver/settler is `Signer` | ✅ | `approve_work.rs:21`, `settle_task.rs:20`, `reject_work.rs:21`, `expire_task.rs:17` |
| Authority linked to task (no `authority==key` w/o `is_signer`) | ✅ | `settle_task.rs:14-18` (`address = task.owner/agent`), signer ∈ {owner,verifier,agent} `:32-35`; `approve_work.rs:29` |
| State accounts use `Account<T>` (owner check) | ✅ | all instructions use `Account<'info, TaskEscrow/WorkReceipt>` |
| Arbitrary CPI / forwarded signer | N/A | settlement moves lamports via direct `try_borrow_mut_lamports` on the PDA; no CPI with forwarded PDA signer |
| PDA / canonical bump | ✅ | `seeds=[…], bump = task.bump` everywhere; `init` derives canonical bump, stored at create |
| Reinitialization (`init_if_needed`) | ✅ (guarded) | `submit_work_receipt.rs:15` uses `init_if_needed`, but the `task.status == RUNNING` guard (`:37`) + one-way state machine prevent re-entry |
| Checked integer math | ✅ | `settle_task.rs:49,54`; `expire_task.rs:45,50` use `checked_sub/checked_add` |
| Reload after CPI | N/A | no post-CPI reads of mutated balances |
| Duplicate mutable accounts | ✅ (hardened) | settlement credits a single status-selected recipient; create-time `verifier != agent` now enforced |
| Account closing / rent | ✅ | escrow funded `rent + bounty` (`create_task.rs:54-67`); settle/expire drain only `bounty_lamports`, leaving rent-exempt |
| Re-settle / double-settle | ✅ | `TaskAlreadySettled` + status→SETTLED + `bounty_lamports = 0` (`settle_task.rs:25,57-58`) |
| Deadline enforcement | ✅ | `start_task_session.rs:21`, `submit_work_receipt.rs:39`, `expire_task.rs:26-29` |

### Fix — escrow party validation (`create_task`)
`create_task` accepted arbitrary `verifier`/`agent` pubkeys. A **zeroed
verifier** bricks approval, a **zeroed agent** bricks the task, and
**`verifier == agent`** lets the worker approve their own work — defeating the
escrow's verification separation. Added `task_parties_valid()` enforcing
non-default + distinct (`create_task.rs`), with a new `InvalidTaskParty` error.
Owner-as-verifier stays allowed (intended by `approve_work`/`reject_work`).
- Extracted as a pure helper and unit-tested in Rust (`cargo test`, 4 cases:
  distinct-accept, zeroed-verifier-reject, zeroed-agent-reject,
  verifier==agent-reject). Fail-before: the helper/validation did not exist.
- `cargo check` clean; existing handlers unchanged in behavior.

### Residual / recommendations
- `submit_work_receipt` `init_if_needed` is safe via the status guard, but a
  follow-up could replace it with explicit `init` + a separate resubmit path to
  remove the footgun entirely.
- The settlement uses direct lamport arithmetic rather than `#[account(close=…)]`
  — correct here (the escrow persists as a SETTLED record), but if tasks should
  be reclaimable, add an explicit close path that zeroes data + the discriminator.
- Recommend an independent audit (Neodyme/OtterSec/Zellic) + sec3/Soteria static
  analysis in CI before mainnet value flows through the escrow.
