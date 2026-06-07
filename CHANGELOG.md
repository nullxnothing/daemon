# Changelog

All notable changes to DAEMON are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows semantic-ish desktop release versioning.

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
