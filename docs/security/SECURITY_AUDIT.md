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
