# DAEMON v4.6

DAEMON v4.6 turns the operator into a full trading and execution surface: unattended mandates, a second venue, a transparent fee line, and a bridge that lets external agents drive DAEMON's gated tools, all on top of the VS Code-style shell and capability packs introduced in v4.3.

## Highlights

- **DAEMON Console + capability packs** — a VS Code-style shell (explorer, editor, bottom terminal, right-rail console) with toggleable packs. Turn a pack off and its tools, integrations, and background work go quiet.
- **ARIA Autopilot** — standing trading mandates parsed from natural language and run unattended on mainnet with exit rules, a hard exposure cap, and arm/disarm/kill switches. "The Desk" shows live unrealized P&L and the action tape.
- **Hyperliquid via HypurrClaw** — ARIA reads Hyperliquid markets and trades perps/spot through the agent-first CLI. Testnet by default; DAEMON never holds a Hyperliquid key.
- **Execution fee meter** — agent-routed SOL transfers on mainnet carry a fee line shown on the approval card before anything runs. Default 0.25%, devnet always free, disabled until a treasury is configured.
- **Agent bridge (MCP)** — a loopback, token-authenticated server exposing DAEMON's gated wallet, launch, and memory tools to external agents like Cursor and Claude Code, behind the same approval gate as ARIA.
- **Compounding console memory** — the console proposes durable facts after real work, cites which facts it drew on, and strengthens proven facts over time.
- **Agent economy control tower** — track agent-routed execution, fees, and paid-resource activity in one panel.
- **Venum** — a first-class Solana execution provider in the Markets pack (live/batch prices, ranked swap quotes).

## Hardening

- Autopilot ticks claim their ledger row before swapping, so a crash mid-tick is held for review rather than replayed into a double-buy; a cluster switch auto-holds armed mandates; unattended slippage and price impact are capped tighter than a human-confirmed trade.
- Swap price impact is normalized to a single unit end to end, so ordinary low-impact swaps are never spuriously blocked.
- ARIA streamed events are tagged per session so approval cards can never attach to the wrong conversation; the approval-resolution channels reject untrusted senders.
- Bridge and ARIA file reads deny secret-bearing paths (.env, keypairs, key material) and enforce real-path containment.
- Swarm lanes run with a minimal allowlisted environment and have push disabled at the git layer.

## Verification

- `pnpm run typecheck && pnpm run test && pnpm run build`
- `pnpm run lint:styles`
