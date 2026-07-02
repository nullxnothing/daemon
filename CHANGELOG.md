# Changelog

All notable changes to DAEMON are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows semantic-ish desktop release versioning.

## [4.6.2] - 2026-07-02

### Fixed
- **Swap high-impact gate no longer double-scales price impact.** Jupiter's `priceImpactPct` is a
  0..1 fraction; it is now normalized to a percentage exactly once, so an ordinary sub-5% swap is
  never spuriously hard-blocked (a regression that could block all swaps on one quote path).
- **ARIA session isolation now covers approval and patch cards.** Streamed `tool-call`,
  `approval-request`, and `patch-proposal` events are tagged with the session id by the transport,
  so a card can never render in — or leak an approval into — the wrong conversation, and patch
  proposals no longer hang the turn.
- **ARIA terminal backend no longer deadlocks on approvals.** The stdin frame loop dispatches
  turns without blocking, so an approval/patch-decision frame is delivered while a turn awaits it;
  piped `aria` invocations now exit cleanly after answering.
- **`claude:install-cli` works on Windows** — the npm.cmd spawn no longer throws EINVAL.

### Security & money-safety
- **Autopilot cluster re-validation per tick.** An armed mandate is auto-held if the live cluster
  is not mainnet or no longer matches the mandate's cluster, so a devnet switch can never
  green-light a real mainnet spend.
- **Autopilot crash-safe ledger.** Each tick claims its ledger row (`executing`) and advances the
  next-tick time before it swaps; a boot reconciler holds any interrupted tick for review instead
  of replaying it, closing a double-buy window.
- **Autopilot exit rules validated** (finite, positive, in-range) so a malformed stop-loss can
  never be silently dead; unattended slippage is capped tighter than a manual swap and a
  high-impact clip is skipped rather than executed.
- **Autopilot exits liquidate only the mandate's own position**, tracked separately from the
  wallet's pre-existing balance of the same mint. Fee lines that were never actually charged are
  no longer recorded on swap actions.
- **`hl_update_leverage` reclassified sensitive** (was write) so it always requires a typed
  confirmation and can't auto-run under a plan approval.
- **ARIA approval-resolution channels reject untrusted senders**; the approval card now shows all
  material fields (amount, side, size), not just the first input value.
- **Bridge/ARIA file reads deny secret-bearing paths** (`.env`, keypairs, key material) and
  enforce real-path containment against symlink escapes.
- **Swarm lanes run with a minimal allowlisted environment** (no blanket env passthrough) and have
  push disabled at the git layer, not just by a tool-name prefix.
- **ARIA no longer hijacks ordinary messages**: the read-only fast path only fires on short,
  unambiguous commands, never on a keyword buried in a question.

### Docs
- Backfilled CHANGELOG entries for 4.3.0-4.6.1; refreshed the README feature list, `Whatsnew.md`,
  and the `CLAUDE.md`/`AGENTS.md` agent-context files (runtime versions, schema, model-id rule) to
  the current release. Documented the execution fee meter.

## [4.6.1] - 2026-06-25

### Fixed
- Stabilized embedded UI surfaces: Recovery log, RicoMaps, Zauth, and Remotion panels no longer
  break when re-mounted, and hidden terminal instances stay inert.

## [4.6.0] - 2026-06-22

### Added
- **Agent economy control tower**: a dedicated panel plus `AgentEconomyService`, IPC domain, and
  ARIA operator tools for tracking agent-routed execution, fees, and venue activity in one place.
  Schema advanced to V55.

## [4.5.0] - 2026-06-21

### Added
- **Hyperliquid via HypurrClaw**: ARIA reads Hyperliquid markets and trades perps/spot by driving
  the agent-first `hyperliquid` CLI through a single execFile gate (no raw shell, one known binary,
  fixed argv). Read tools auto-run; `hl_place_order`, `hl_cancel_order`, `hl_modify_order`, and
  `hl_transfer` are sensitive and typed-confirm gated. Network defaults to testnet and DAEMON never
  holds a Hyperliquid key: the CLI's encrypted wallet signs. Sensitive summaries carry an
  `[HL-MAINNET]`/`[HL-TESTNET]` marker.
- **Autopilot trading mandates**: unattended scheduled mandates with exit rules. Armed mandates
  resume after restart, and the action ledger is idempotent so a tick interrupted mid-swap cannot
  double-fire on resume. Schema V54.
- **Execution fee meter**: agent-routed mainnet execution carries a transparent fee line surfaced
  on the approval card before anything runs, never charged silently.
- **Agent bridge (MCP)**: loopback MCP server with bearer-token auth exposing DAEMON's gated
  wallet, launch, and memory tools to external agents. Every call re-filters against enabled packs;
  sensitive actions route through the same approval gate as ARIA.

### Fixed
- Explorer file tree auto-refreshes on external filesystem changes.
- Hidden terminal instances are inert, so scroll and click-to-focus work.

## [4.4.0] - 2026-06-11

### Added
- **Venum integration**: `VenumService` with secure-key auth, live/batch prices, and ranked swap
  quotes; read-tier ARIA tools (`venum_get_price`, `venum_get_prices`, `venum_get_quote`);
  Integration Command Center card with key check and live price-feed test.
- **Compounding console memory**: `remember_fact` / `recall_memories` / `forget_memory` /
  `update_memory` operator tools, post-turn fact extraction with inline Keep/Dismiss cards, cited
  recall per assistant turn, and a "What DAEMON Knows" view in the Memory panel. Memories
  strengthen with use and prompt pruning when stale.
- **Editor settings**: font family/size, tab size, word wrap, minimap, and theme configurable in
  Settings > Display, applied to Monaco live. Adds a `daemon-light` theme.
- **BrainBlast pre-flight (opt-in)**: swarm lanes can run a research gate that compiles external
  components into a structured report before code is written; critical risks gate the lane and the
  gate fails open. Schema V51.

### Fixed
- Seeker relay records the OS-assigned port when binding to port 0, fixing the flaky relay test.
- Dropped the deprecated `--space-2xs` token alias.

## [4.3.0] - 2026-06-07

### Added
- **VS Code-style shell**: explorer, editor, bottom-panel terminal, and the DAEMON Console on the
  right rail (chat-first with `>` and `/` command accelerators; can swap to the bottom panel).
- **Capability packs**: Solana, Wallet, Launch, Agents, Memory, Sites, Markets, and Create are now
  toggleable packs, each owning its tools, integrations, sidebar icon, console commands, and
  background work. Disabling a pack quiesces its IPC handlers. Capability Manager UI plus a live
  status-bar pack indicator. Schema V50.
- **Create pack**: image editor and email tools for launch and marketing assets.

### Changed
- Per-pack integrations replace the single giant Integrations tab; the Activity Bar is dynamic.

### Fixed
- Pack host panels no longer collapse to zero height in narrow windows.
- macOS packaging unblocked (switched to a `.icns` icon).

## [4.2.0] - 2026-06-05

### Added
- **Operator console** — the right-panel AI (ARIA) is now a full daemon operator. It drives
  DAEMON from natural language via a registry-driven tool catalog (`electron/services/aria/tools/`)
  spanning navigation, settings, wallet, Clawpump, AgentStation, token launches, Flywheel, and git.
  Sensitive on-chain actions require typed confirmation and carry a `[MAINNET]` guard; the operator
  never pushes to git autonomously.
- **Per-project chat sessions** in the console — new chat (non-destructive), switch, rename, archive,
  delete, with auto-titling and memory that rehydrates from the DB on restart (`aria_sessions`,
  schema V47). Replaces the old single-thread console.
- **Parallel agent swarms** — launch N tasks in parallel, each in its own isolated git worktree +
  branch driven by a headless Claude agent (`WorktreeService` + `SwarmOrchestrator`, schema V48;
  `swarm_runs`/`swarm_lanes`). Concurrency-capped, auto-cleaned worktrees, per-lane `RESULTS.md`,
  and a Swarms tab in the workbench. Lanes never push — merging stays a manual step.
- Git worktree IPC (`git:worktree-add|list|remove|prune`) and swarm IPC (`swarm:*`).
- Composer `+` opens a context picker menu (toggle active file / project tree / git diff / terminal
  logs / wallet) instead of cycling chips.

### Changed
- Broader UX/design-system polish pass across panels (settings, wallet, integrations, launches,
  AgentStation, and more) and the in-flight Synapse SAP integration.
- Right panel min-width raised so the operator console header/sessions never clip.
- Schema advanced to V49 (`projects.pinned`/`branch`).

### Docs
- Documented the operator console, sessions, and swarms in the README, agent-context files
  (`CLAUDE.md`/`AGENTS.md`), and the landing docs (new `operator-console.md`).

## [4.1.2] - 2026-06-01

### Fixed
- Production renderer no longer crashes to a blank screen — added a Buffer polyfill for
  CJS Solana/crypto deps that the prod bundle previously left unresolved.
- Agent grid now renders styled in grind mode (its CSS lived in `Terminal.css`, which
  doesn't load there); moved to a component-owned `AgentGrid.css`.
- Spettro provider uses its own logo instead of the DAEMON-icon placeholder.

### Changed
- Adopted the shared design system (`PanelHeader`, `StateView`, `EmptyState`, `MetricCard`,
  `Button`) across Dashboard, Git, Settings, Wallet, DAEMON AI, Tools, Pro, Replay Engine,
  Plugins, Subscriptions, and the agent panels for consistent panel chrome.
- Added `DESIGN_SYSTEM.md`, a cloud API reference, and ratcheted style-debt enforcement.

### CI
- CI now launches the built app and asserts the renderer mounts, so a blank-screen
  bundle crash fails the gate instead of shipping.

## [4.1.0] - 2026-05

### Added
- Proof pool and forensics workflows for inspecting and verifying agent work receipts.
- Solflare wallet signing flow alongside the existing wallet adapters.
- MoonPay SOL on-ramp for funding wallets directly from the desktop app.

### Changed
- Hardened the DAEMON AI ask path with stricter request handling.

### Fixed
- Cleared the cloud security gates flagged during the v4 release hardening pass.
- Stabilized layout, responsive, and visual regression smoke coverage.

## [4.0.0] - 2026-05-15

### Added
- DAEMON AI Cloud: hosted AI service for Pro, Operator, Ultra, and holder-backed access.
- Hosted model routing across OpenAI, Anthropic, and compatible provider lanes
  (`auto`, `fast`, `standard`, `reasoning`, `premium`).
- Desktop DAEMON AI and Pro subscription clients wired to the production cloud service.
- SQLite-backed usage metering for hosted DAEMON AI requests.
- Holder access claim flow (sign-in-with-wallet challenge, no token transfer required).
- x402 USDC payment path for Pro/Operator/Ultra subscriptions.
- Low-power performance mode: deferred startup work, reduced background refresh, lower motion.
- Expanded release smoke gates: Electron startup, MCP stress, Pro entitlement,
  workflow journeys, responsive layout, visual regression, packaging, and packaged-app smoke.
- Local and live cloud smoke gates (`test:daemon-ai:cloud-local`, `test:daemon-ai:live`).

### Changed
- Required hosted model lane entitlements at the cloud API boundary before
  credit checks or provider calls.
- Preserved BYOK and local development paths for users who avoid hosted model traffic.

### Hardening
- Production readiness checks for provider configuration, JWT secrets, admin grant
  support, Solana RPC, and persistent cloud storage.

[4.1.0]: https://github.com/nullxnothing/daemon/releases/tag/v4.1.0
[4.0.0]: https://github.com/nullxnothing/daemon/releases/tag/v4.0.0
