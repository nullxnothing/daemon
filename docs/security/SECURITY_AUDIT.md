# DAEMON Security Audit & Remediation

Audit of the Electron hot-wallet / agent-workbench. Findings are recorded per
priority stage with `file:line` evidence and a status of **CONFIRMED+FIXED**,
**ALREADY MITIGATED** (with proof), or **N/A**.

Delivered as four staged PRs, all merged into `v4`:

| Stage | PR | Headline fix |
|---|---|---|
| P0 | #177 | safeStorage degraded-backend refusal; IPC sender-frame validation; CI `--ignore-scripts` + OSV scan |
| P1 | #178, #181 | non-bypassable signer guard in `executeTransaction`; close external-transfer/swap bypass; drop default `--dangerously-skip-permissions` |
| P2 | #179 | Seeker relay per-session bearer token (+ mobile client); webview `http` restricted to loopback |
| P3 | #180 | daemon-registry `create_task` escrow-party validation |

Remaining follow-ups are listed at the end of each stage section (the largest:
end-to-end UI hash-binding for internal transfers, MCP description-change
re-approval, and a key-free PTY/repo worker).

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


## PRIORITY 0 — Stop-the-bleeding (`fix/security-p0`)

### 1. Supply chain: `@solana/web3.js` backdoor + `bigint-buffer` overflow — ALREADY MITIGATED
- **web3.js pinned to 1.98.4** everywhere in `pnpm-lock.yaml` (e.g. `:2515`,
  `:9396`); `package.json:91` declares `^1.98.4`. No lockfile entry references the
  backdoored **1.95.6 / 1.95.7** (CVE-2024-54134). 1.98.4 is above the 1.98.1
  fix line, so no key rotation is indicated from this vector.
- **`bigint-buffer` (CVE-2025-3194)** is neutralized via a pnpm override mapping
  it to a local pure-JS workspace stub: `package.json:158`
  (`"bigint-buffer": "workspace:*"`), resolved to `link:packages/bigint-buffer`
  in `pnpm-lock.yaml:8835`. The stub (`packages/bigint-buffer/index.cjs`) is a
  DataView/BigInt reimplementation with no native overflow path; covered by
  `test/security/BigIntBufferShim.test.ts`. `pnpm why bigint-buffer` is wired
  into `package.json:50` (`test:deps:solana`).

### 2. Install hygiene — PARTIALLY MITIGATED → FIXED
- Lockfile committed and excluded from gitignore (`.gitignore:28-30`).
- `test:ci` already used `--frozen-lockfile --ignore-scripts` (`package.json:55`),
  but the **CI workflow** ran `pnpm install --frozen-lockfile` *without*
  `--ignore-scripts` (lifecycle scripts execute on install — the Shai-Hulud
  vector).
- **FIX** (`.github/workflows/ci.yml`): all three jobs now install with
  `--ignore-scripts` and rebuild native modules explicitly via
  `pnpm run rebuild:native`. Added an **OSV lockfile scan** step
  (`google/osv-scanner-action`) to the validate job. (Socket/Snyk were not added
  because they require an org token; OSV is free and token-less. Swap in
  Socket/Snyk if a token is provisioned.)

### 3. `safeStorage` degradation — CONFIRMED + FIXED
- **Before**: `SecureKeyService.getKey` returned `null` whenever
  `isEncryptionAvailable()` was false and never inspected
  `getSelectedStorageBackend()`. On Linux a degraded `basic_text` backend
  reports `isEncryptionAvailable() === true` while storing plaintext, and a
  missing key silently returned `null` — the exact "silent-null and proceed"
  anti-pattern (old `electron/services/SecureKeyService.ts:22-31`).
- **FIX** (`electron/services/SecureKeyService.ts`):
  - `isKeyEncryptionTrustworthy()` / `getKeyEncryptionWarning()` /
    `getStorageBackend()` added; degraded backends `basic_text` / `unknown` are
    treated as untrusted. macOS/Windows (no backend selector) trust
    `isEncryptionAvailable()`.
  - Private-key names (`WALLET_KEYPAIR_*`, `AGENT_STATION_KEY_*`,
    `PROOF_POOL_KEY_*`, `PROOF_CREATOR_KEY_*`, `PROOF_VANITY_MINT_*`,
    `PROOF_POOL_PLATFORM_ESCROW`) are **refused on store** and **throw on read**
    under a degraded/unavailable backend — they no longer return `null` and let a
    caller proceed. API keys keep lenient (null) behavior.
  - `setUsePlainTextEncryption` is never called (verified by grep — absent).
  - Startup health check in `electron/main/index.ts` (`app.whenReady`): logs +
    records a `key-encryption-degraded` diagnostic and emits `secure-key:degraded`
    to the renderer (channel allow-listed in `preload/index.ts`).
- **Tests**: `test/services/SecureKeyService.test.ts` — 8 new cases (store/read
  refusal on `basic_text` and unavailable keyring, lenient API-key behavior,
  healthy-backend round-trip). Fail-before: the new functions did not exist and
  `getKey` returned null instead of throwing.

### 4. Electron baseline — MOSTLY MITIGATED → IPC sender gap FIXED
- `BrowserWindow` `webPreferences` (`electron/main/index.ts:467-473`):
  `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`. ✅
  (`webviewTag:true`, but webviews are gated — see below.)
- `setWindowOpenHandler` denies and routes through `isSafeExternalUrl`
  (`main/index.ts:513-516`). ✅
- `will-attach-webview` forces `nodeIntegration:false`, `contextIsolation:true`,
  `sandbox:true`, `webSecurity:true`, strips `preload` (`:519-532`). ✅
- `will-navigate` blocks cross-origin (`:535-543`). ✅
- Strict CSP in production (`script-src 'self'`, `object-src 'none'`) (`:385`);
  `webSecurity` not disabled, `allowRunningInsecureContent` not set. ✅
- **GAP (CONFIRMED + FIXED): no `senderFrame` validation.** `ipcHandler`
  (`electron/services/IpcHandlerFactory.ts`) never inspected the event, and the
  raw `ipcMain.on` PTY channels (`electron/ipc/terminal.ts` `terminal:write` etc.)
  and window-control channels (`main/index.ts`) had no sender check. A
  compromised/embedded webview or sub-frame could `ipcRenderer.invoke` any
  channel — including `wallet:send-sol`.
  - **FIX**: new `electron/security/ipcSender.ts` (`isTrustedSender` requires the
    event's **top frame** at the configured app origin). Wired into:
    - `IpcHandlerFactory.ipcHandler` — guards every `.handle` channel (the bulk).
    - `ipc/terminal.ts` — `terminal:write` / `terminal:resize` / `terminal:ready`.
    - `main/index.ts` — window controls, `agentops:*`, `shell:open-external`;
      `setTrustedIpcOrigin(...)` set at `createWindow`.
  - **Tests**: `test/security/IpcSender.test.ts` (8 cases: top-frame accept,
    sub-frame reject, cross-origin reject, file:// app, missing/unparseable frame)
    and `test/services/IpcHandlerFactory.test.ts` (2 new cases: missing frame and
    sub-frame rejected). Fail-before: the factory previously ran the handler for
    any event.
- **Note**: the renderer still reaches signing IPC directly. Restricting that to
  the approval gate is **P1** (architectural), not a baseline flag.

### 5. Auto-update — ALREADY MITIGATED (documented)
- `electron-updater ^6.8.3` (`package.json:100`) — current; the
  GHSA-9jxc-qjr9-vjxq Windows signature-bypass was fixed long before 6.8.
- `main/index.ts:625-637`: auto-update only runs when `app.isPackaged`, uses
  `checkForUpdatesAndNotify` (signature verification on by default in v6; install
  is blocked on failed verification), and has a kill switch
  (`DAEMON_DISABLE_AUTO_UPDATE`). Artifacts are served over HTTPS by the release
  channel. No `setUsePlainTextEncryption` / unsafe-update flags present.

### P0 residual / follow-ups
- `electron/security/externalNavigation.ts:34-45` — `isAllowedWebviewUrl` permits
  arbitrary `http:` for dev previews. `openSafeExternalUrl` is strict
  (https+localhost only), so `shell.openExternal` is safe; the loose http rule
  only affects webview embedding. Tighten in P2.
- Consider a real Socket/Snyk token in CI to complement OSV.

## PRIORITY 1 — Agent → signer confused-deputy gap (`fix/security-p1`)

### Can an agent / MCP tool / PTY sign a transaction without human approval?

**Architecture as found:**
- The LLM agent run service `electron/services/DaemonAIAgentService.ts` is
  **proposal/bookkeeping only** — it has no `@solana/web3.js`, `WalletService`,
  or signing import (verified by grep). The model cannot call a signing function
  directly; it can only emit tool-call *records*.
- `ToolApprovalService` (`electron/services/ToolApprovalService.ts:38-47`)
  **BLOCKS by name** `sign_transaction`, `send_transaction`, `transfer_sol`,
  `transfer_token`, `export_private_key`, and unknown tools default to `high`
  (require approval, `:91`). ✅ for the structured-tool path.
- **GAP 1 — the block is name-based and advisory.** Nothing in the *main* process
  re-checks it before signing; `wallet:send-sol`/`send-token`/`swap-execute`
  (`electron/ipc/wallet.ts`) sign immediately and trust the renderer UI as the
  gate. `SolanaTransactionPreviewService` is **display-only**
  (`SolanaTransactionPreviewService.ts:34`) — not bound to the signed bytes,
  fully bypassable.
- **GAP 2 — the PTY is a real shell.** A Claude/Codex agent in a `node-pty`
  session can run `solana transfer` / a node script using an exported keypair,
  entirely outside `ToolApprovalService`.
- **GAP 3 — auto-approval flag enabled by default.**
  `ReplayEngineService.createAgentHandoff` launched
  `claude --dangerously-skip-permissions` (`ReplayEngineService.ts:445`) in the
  user's repo with shell+fs access.

### Fixes

**1. Non-bypassable signer guard (`electron/services/SignerGuardService.ts`).**
Wired into the universal chokepoint `SolanaService.executeTransaction`
(`SolanaService.ts:296-305`) — runs on the FINAL message immediately before
`transaction.sign(...)`, so EVERY caller (wallet IPC, launch adapters,
agent-work settlement, and any agent/MCP/PTY that reaches a signing helper) is
subject to it. Enforces, in the main process where agents cannot edit it:
  - **Program allow-list** (System, ComputeBudget, Token, Token-2022, ATA, Memo,
    registry, Jupiter v6, Pump, Pump AMM). Non-allowlisted programs require a
    hash-bound approval token — **reject-by-default** otherwise.
  - **Per-transaction outbound-SOL cap** (default 10 SOL) — over-cap requires
    approval.
  - **Rolling-window cap** (default 25 SOL / 60 min, per signer).
  - **Rate limit** (default 12 signed tx / min, per signer).
  - **Propose/commit hash binding** (`approveTransactionHash` /
    `hashTransactionMessage`): an approval is a single-use, 2-min-TTL token keyed
    by `sha256` of the exact serialized message, so an agent cannot swap the
    payload between approval and signing.
  - Enforcement gate: **throws on `mainnet-beta`**, **log-only on
    devnet/localnet** (Voight + LogService alert) to avoid breaking dev/test
    flows while making the real-funds drain path non-bypassable.
  - Tests: `test/services/SignerGuardService.test.ts` (12) — allow-list reject,
    hash-bound approve, replay-prevention, per-tx/rolling caps, rate limit,
    devnet log-only. Fail-before: the guard module did not exist and
    `executeTransaction` signed unconditionally.

**2. Removed default auto-approval flag** in `ReplayEngineService.ts:445` — the
replay handoff now launches `claude -p …` (normal per-tool approval). Test
updated to assert the flag is absent
(`test/services/ReplayEngineService.test.ts:248`).

### Guard coverage closed (post-P1 hardening)
Two signing paths previously **bypassed the guard entirely** by submitting raw
bytes (not via `executeTransaction`):
- **External transfers** (`submitExternalSignedTransaction`) — the user signs in
  their own wallet, then DAEMON submitted directly. Now: the prepared message is
  re-hashed, `approveTransactionHash` binds an approval to those exact bytes, and
  `assertTransactionAllowed(tx, [], { signerOverride, approvalHash })` runs the
  caps/allow-list before submit. This is a true end-to-end hash-bound
  propose→commit: prepare returns the message, the user approves the exact bytes
  in their wallet, and the guard consumes the matching hash.
- **Jupiter swaps** (`executeSwap`) — signed locally and handed to Jupiter's
  execute endpoint. Now `assertTransactionAllowed` runs immediately before
  `transaction.sign(...)` (Jupiter is allow-listed; per-tx/rolling caps + rate
  limit still apply).
- `transferSOL`/`transferToken` now tag `guardSource` for audit attribution.
- The guard fails closed: a transaction it cannot inspect is rejected when
  enforcing (mainnet), logged otherwise. Tests:
  `SignerGuardService.test.ts` (+4: signerOverride accounting, hash-approved
  external over-cap, uninspectable-reject/log).

### Residual / follow-ups (documented, not yet enforced)
- **Internal fast-path transfers still rely on caps, not UI hash-binding.**
  `transferSOL`/`transferToken` build-and-sign in one shot, so an over-cap
  *internal* transfer is blocked by the cap rather than carrying a UI-issued
  approval. Converting these to a prepare→confirm→commit pair (like the external
  flow) so the UI can register `approveTransactionHash` is the remaining
  increment. The caps already protect the agent-drain path without this.
- **MCP (P1 #10):** `.mcp.json` servers are not yet content-pinned with
  re-approval on tool-description change (tool-poisoning / rug-pull). Tool
  *results* flow into the model context; they cannot reach signing except via the
  guarded chokepoint, but a description/results change should force re-approval.
  Tracked for a follow-up MCP-integrity change.
- **PTY (P1 #11):** agent/web content cannot write to a PTY without a trusted
  top-frame sender (P0 IPC guard on `terminal:write`). The PTY shell can still
  run signing CLIs with an exported key — mitigated operationally by keeping hot
  wallets at small float and by the signer guard catching on-chain spends that
  route through DAEMON's RPC; a fully isolated key-free PTY is a P2 item.

## PRIORITY 2 — Electron RCE surface (`fix/security-p2`)

### 12. Minimal preload bridge — ALREADY MITIGATED
`electron/preload/index.ts` exposes one explicit method per channel; there is no
generic `ipcRenderer.invoke(channel, ...args)` passthrough. Event subscriptions
are channel-allow-listed (`:231`). With the P0 sender-frame guard, the bridge is
method-scoped and origin-checked. ✅

### 13. shell.openExternal + CSP + webview scheme — MOSTLY MITIGATED → http tightened
- `shell:open-external` routes through `openSafeExternalUrl`
  (`security/externalNavigation.ts:28`): only `https:` and loopback `http:`,
  credentials rejected. ✅
- Strict prod CSP (`script-src 'self'`, `object-src 'none'`), `webSecurity` never
  disabled, `allowRunningInsecureContent` never set (`main/index.ts:385`). ✅
- **FIX**: `isAllowedWebviewUrl` previously allowed arbitrary remote `http:`. Now
  restricted to `https:` + loopback `http:` so a cleartext remote page can't be
  embedded as a `<webview>` (`externalNavigation.ts`; test updated in
  `test/security/ExternalNavigation.test.ts`).
- **Residual**: local pages are served from `file://` rather than a custom
  privileged-isolated protocol. The `will-navigate` + `setWindowOpenHandler`
  origin locks contain this; a custom app protocol is a larger follow-up.

### 14. Embedded local server (Seeker relay) — CONFIRMED + FIXED
`electron/services/SeekerRelayService.ts` runs an HTTP server bound to `0.0.0.0`
(intentional — the phone reaches it over LAN) exposing pairing/approval endpoints.
- **Weak pairing secret**: `makePairingCode` produced ~6 chars
  (`randomBytes(3)` → 4 hex + 2 digits ≈ 5.9M combos) — brute-forceable on an
  unauthenticated, LAN-exposed server with no rate limit; a LAN attacker could
  enumerate codes and POST `approved` to approval endpoints.
- **CORS `*`**: any web page could reach the LAN endpoints.
- **FIX**:
  - 32-byte per-session **bearer access token** (`randomBytes(32)`), delivered to
    the phone via the deep link/QR (`token=` param) and required (constant-time
    `timingSafeEqual`) on every session-scoped endpoint. Unauthorized → generic
    404 (doesn't confirm code existence).
  - Removed `access-control-allow-origin: *`; any request with a browser `Origin`
    is rejected (`403`).
  - `/sessions` list restricted to loopback.
  - Tests: `test/services/SeekerRelayService.test.ts` — no-token/wrong-token/
    browser-origin/unauth-approval rejected, correct token accepted.
- **Mobile app (done in this PR)**: `apps/seeker-mobile` now parses the deep-link
  `token`, threads it through `PairingSession` → `useDesktopRelay` →
  `desktopRelay` client, and sends `Authorization: Bearer <token>` on all relay
  requests (snapshot, events, pair). Manual pairing accepts a pasted
  `daemonseeker://` link to carry the token. Verified by `tsc` (the mobile package
  has no test runner).
- `daemon-ai-cloud/server.ts` is a separately-deployed cloud component gated by
  x402/SubscriptionGateway — not the desktop app's local surface; unchanged.

### 15. Untrusted repos + email injection — REVIEWED (residual)
- Repo build/run happens in the user-driven `node-pty` terminal, not an automatic
  main-process exec. `ProjectSafetyService.ts:103` flags
  `--dangerously-skip-permissions` in scanned commands. A fully **key-free,
  network-restricted repo worker** (so a malicious `postinstall` can't share the
  signer's process) is an architectural follow-up.
- `imapflow`/`nodemailer`/`BrowserService` send paths use structured library
  APIs (no shell concatenation); no concrete injection found. Deeper fuzzing
  recommended.

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
