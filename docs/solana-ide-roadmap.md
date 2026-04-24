# Solana IDE Roadmap

## Goal

Make DAEMON the default operating surface for Solana builders:

- scaffold a project with the right runtime defaults
- run a validator and local test stack from inside the IDE
- execute transactions through one shared pipeline
- see signatures, logs, errors, and agent actions in one activity stream
- let agents operate with real project and runtime context instead of blind prompts

## v3 definition

`v3` is the point where DAEMON stops feeling like a general IDE with Solana features bolted on and starts feeling like a Solana-native control plane.

The release should be legible around four pillars:

1. Project scaffolding
2. Unified transaction pipeline
3. Solana activity timeline
4. Agent-aware runtime execution

## Delivered so far

- Solana ecosystem catalog that separates `native` integrations from `guided` coverage.
- Updated starter prompts around `@solana/kit`, current wallet flows, Jupiter, Jito, AVM, LiteSVM, and provider abstraction.
- Broader Solana project detection for modern frontend and client stacks.
- Wallet infrastructure settings for Helius, public RPC, QuickNode, custom RPC, Jupiter, Phantom-first or Wallet Standard, and Jito execution mode.
- Runtime stack visibility in the Solana toolbox so the UI reflects live configuration.
- Environment diagnostics for Solana CLI, Anchor, AVM, Surfpool, LiteSVM, and validator readiness.
- Guided tooling install and docs actions directly from the Toolbox.
- Cleaner wallet transfer behavior for tracked internal recipients versus custom destinations.

## Pillar 1: Project Scaffolding

Status: in progress

DAEMON should generate projects that already match the workspace runtime instead of forcing the user to manually reconcile generated code with local settings.

Delivered:

- Project starter writes `daemon.solana-runtime.json`.
- Starter prompts already encode provider, wallet, swap, and execution preferences.

Remaining:

- Generate stronger starter outputs for app, bot, MCP server, and Anchor program templates.
- Make starter output read and honor `daemon.solana-runtime.json` consistently.
- Add starter-side wallet onboarding, provider onboarding, and validator setup guidance.
- Add project health checks immediately after scaffold so DAEMON can say what is still missing.

Definition of done:

- A new Solana project boots with the expected provider, wallet path, and execution mode without hand-editing config files.

## Pillar 2: Unified Transaction Pipeline

Status: partially delivered

Wallet sends, swaps, launches, recovery flows, and future deploy actions should all run through one shared execution contract.

Delivered:

- Shared runtime settings for provider, wallet path, swap engine, and execution mode.
- Runtime UI that explains the current execution path.

Remaining:

- Introduce one canonical transaction pipeline abstraction for quote/build/sign/submit/confirm.
- Surface which execution path was used for every action: RPC, Jito, provider, signer, and resulting signature.
- Add preflight simulation and clearer missing-config checks before execution begins.
- Reuse the same pipeline across wallet, launch, and future deploy flows.

Definition of done:

- DAEMON can explain every Solana action in the same vocabulary before and after submission.

## Pillar 3: Solana Activity Timeline

Status: planned

DAEMON needs a single timeline that makes Solana work observable.

Target events:

- validator start, stop, restart, and failure
- wallet sends, swaps, launches, and deploys
- transaction signatures, confirmation state, and errors
- agent-triggered Solana actions
- project runtime warnings and setup actions

Definition of done:

- Users can answer "what happened?" without opening multiple panels or terminal tabs.

## Pillar 4: Agent-Aware Runtime Execution

Status: planned

Agents should inherit real Solana context from the active project rather than guessing.

Needed:

- expose runtime state to agent scaffolding and action flows
- give agents project-aware validator, wallet, and provider context
- let agent actions record into the same activity stream as manual actions
- keep protocol packs, MCPs, and runtime integrations distinct in the UI

Definition of done:

- An agent can scaffold, inspect, and execute against the active Solana project without inventing a second runtime model.

## Protocol Packs

Status: planned

Priority packs:

- Jupiter
- Metaplex
- Raydium
- Meteora
- Pump.fun
- Drift
- Orca
- Kamino
- Sanctum
- Pyth
- Switchboard

Approach:

- Keep the core runtime lean.
- Layer protocol support as explicit packs instead of pretending every skill is a native runtime integration.

## GitHub execution model

Use GitHub to track `v3` as slices, not as one giant milestone-free backlog.

- Every `v3` issue should map to exactly one primary pillar.
- Epics should describe a user-facing loop, not an internal subsystem in isolation.
- PRs should state which pillar they advance and how the shipped behavior moves DAEMON closer to the full Solana builder loop.

## Immediate next slices

1. Strengthen starter output so generated projects explicitly consume `daemon.solana-runtime.json` and boot with the configured wallet/provider path.
2. Introduce a shared transaction activity record that wallet sends and swaps both write to.
3. Add preflight checks and execution telemetry so every send path reports provider, mode, signature, and failure reason.
4. Surface validator lifecycle events and runtime warnings into a single activity feed.
