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

### Residual / follow-ups (documented, not yet enforced)
- **Hash-bound approval is available but not yet required at the wallet IPC
  layer.** The caps/allow-list already protect the agent-drain path without
  caller cooperation; binding the *human UI confirmation* to `approvalHash` end
  to end (so every over-cap/launch tx carries a UI-issued token) is the next
  increment. The external-transfer flow (`prepareExternalSolTransfer` →
  `submitExternalSignedTransaction`) is the model to follow — it already returns
  `messageBase64` for client signing.
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
