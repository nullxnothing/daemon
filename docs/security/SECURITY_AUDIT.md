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
