# DAEMON v4.7

DAEMON v4.7 adds ARIA Game Studio Beta: a local-first path from a playable Phaser starter to an
agent-assisted build and in-app preview. The starter runs locally. Its typed wallet, score, and
trophy interfaces use local stubs, so the beta makes no onchain calls.

## Highlights

- **ARIA Game Studio Beta:** Choose the game starter, install its dependencies, verify a production
  build, and open the local preview in DAEMON. The starter includes typed seams for future Solana
  integration backed by local stubs.
- **Focused agent build:** The approved `build_game` action runs one lane in a separate Git worktree
  with Game Studio constraints supplied by DAEMON. Lane output still goes through project, branch,
  and clean-worktree checks before merge.
- **Manual deploy handoff:** `deploy_app` opens the Deploy panel. The beta does not perform a live
  wallet connection, onchain write, mint, publish, or deployment.
- **DAEMON Console + capability packs** — a VS Code-style shell (explorer, editor, bottom terminal, right-rail console) with toggleable packs. Turn a pack off and its tools, integrations, and background work go quiet.
- **ARIA Autopilot** — standing trading mandates parsed from natural language and run unattended on mainnet with exit rules, a hard exposure cap, and arm/disarm/kill switches. "The Desk" shows live unrealized P&L and the action tape.
- **Hyperliquid via HypurrClaw** — ARIA reads Hyperliquid markets and trades perps/spot through the agent-first CLI. Testnet by default; DAEMON never holds a Hyperliquid key.
- **Execution fee meter** — agent-routed SOL transfers on mainnet carry a fee line shown on the approval card before anything runs. Default 0.25%, devnet always free, disabled until a treasury is configured.
- **Agent bridge (MCP)** — a loopback, token-authenticated server exposing DAEMON's gated wallet, launch, and memory tools to external agents like Cursor and Claude Code, behind the same approval gate as ARIA.
- **Compounding console memory** — the console proposes durable facts after real work, cites which facts it drew on, and strengthens proven facts over time.
- **Agent economy control tower** — track agent-routed execution, fees, and paid-resource activity in one panel.
- **Venum** — a first-class Solana execution provider in the Markets pack (live/batch prices, ranked swap quotes).

## DAEMON Lite

- **A separate, small download that is just the agent.** DAEMON Lite ships the ARIA chatbox on its own — no editor, terminal, or project system. Paste one key (Anthropic or GLM/Z.AI) and chat. Keys are encrypted with the OS keychain and stay on the device.
- **Coexists with the full app.** Its own installer, appId, and userData, at roughly half the size (~106MB). Install both side by side.
- **DAEMON-focused tools, same gate.** A collapsible Tools section adds Wallet (read-only watch), Trade (token search, watchlist, and typed-confirm swaps through ARIA with a hard cap), and Scanner (one-shot rug check on mint/freeze authority, snipers, bundles, and cabal links). Every write and swap runs through the same approval gate as the full app.
- **Pop-out browser.** A real browser pane for previews and dashboards, restricted to https and loopback URLs, owned by the main process with no preload on the guest page.
- **Beginner-first onboarding.** One screen, bring-your-own-key, with an "Open in DAEMON IDE" handoff when you outgrow the chatbox.

## Hardening

- Game starter files and prompts redact RPC and credential-bearing URLs. Project names are strict,
  and scaffolding requires a target folder that does not already exist.
- The generated lockfile is committed only after install, production build verification, and a
  real local preview listener. Git push blocking applies only to the build lane's worktree.
- Autopilot ticks claim their ledger row before swapping, so a crash mid-tick is held for review rather than replayed into a double-buy; a cluster switch auto-holds armed mandates; unattended slippage and price impact are capped tighter than a human-confirmed trade.
- Swap price impact is normalized to a single unit end to end, so ordinary low-impact swaps are never spuriously blocked.
- ARIA streamed events are tagged per session so approval cards can never attach to the wrong conversation; the approval-resolution channels reject untrusted senders.
- Bridge and ARIA file reads deny secret-bearing paths (.env, keypairs, key material) and enforce real-path containment.
- Swarm lanes run with a minimal allowlisted environment and have push disabled at the git layer.

## First-run experience and reliability (4.6.4)

- A guided five-step wizard takes a fresh install from a new workspace to its first real approval decision in about three and a half minutes, ending on a mission where ARIA runs reads silently and raises a live approval card you accept or reject.
- Onboarding stays on devnet the whole way through, so nothing can touch mainnet while you learn the approval gate.
- First-session empty states now guide you across the console, wallet, activity, swarm, and memory panels.
- Upgraded installs refresh agents that were pinned to retired model IDs, and a rejected or disabled API key now shows a clear warning instead of quietly dropping ARIA's tools.

## First-session polish (4.6.3)

- Memory and Deploy icons open their panels on a fresh install.
- Plain questions to the engine answer directly; only actions that write to disk raise an approval card.
- The activity panel collapses repeated toolchain probes behind a count badge instead of flooding the log.
- The tab strip scrolls the active tab into view and shows chevrons when tabs overflow.

## Verification

- `pnpm run typecheck && pnpm run test && pnpm run build`
- `pnpm run lint:styles`
- `pnpm run test:ci`
- Packaged Windows executable exercised through the Game Studio desktop/mobile smoke flow.
