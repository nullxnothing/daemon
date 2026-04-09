# Solana IDE Roadmap

## Goal

Make DAEMON a real Solana-first development environment with an accurate runtime stack, current scaffolding, wallet-aware execution, and protocol packs that map cleanly to what is actually shipped.

## Current branch

Branch: `feat/solana-ide-foundation`

Delivered in this branch so far:

- Solana ecosystem catalog that separates `native` integrations from `guided` coverage.
- Updated Solana starter prompts around `@solana/kit`, current wallet flows, Jupiter, Jito, AVM, LiteSVM, and provider abstraction.
- Broader Solana project detection for modern frontend/client stacks.
- Wallet infrastructure settings for:
  - Helius
  - public RPC
  - QuickNode RPC
  - custom RPC
  - Jupiter swap execution
  - Phantom-first or Wallet Standard wallet path
  - Jito block-engine submission mode
- Runtime stack visibility in the Solana toolbox so the UI reflects the live configuration.

## Phase 1: Foundation

Status: in progress

- Keep Solana IDE claims accurate in the UI.
- Prefer `@solana/kit` and current Solana frontend patterns over stale `web3.js`-only guidance.
- Expose live runtime configuration for RPC, execution, and wallet path.
- Preserve compatibility with the existing Helius-backed wallet flows.

## Phase 2: Wallet and Execution

Status: partially delivered

- Add first-class Phantom and Wallet Standard starter flows.
- Keep Jupiter as the default swap execution engine.
- Add optional Jito low-latency submission for swaps and transfers.
- Add provider selection that can target Helius, QuickNode, or custom RPC infrastructure.

Remaining work:

- Add clearer wallet-provider onboarding in the starter output and docs panel.
- Add UX around missing API keys and provider misconfiguration before execution begins.
- Add deeper transaction telemetry for Jito-vs-RPC execution outcomes.

## Phase 3: Testing and Local Dev

Status: planned

- Surface AVM, LiteSVM, Mollusk, and Surfpool as first-class setup flows.
- Add environment checks for Solana CLI, Anchor, AVM, and validator tooling.
- Add starter presets for program, client, and full-stack Solana projects.

## Phase 4: Protocol Packs

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

- Keep the core IDE lean.
- Layer protocol support as explicit packs instead of pretending every skill is a native runtime integration.

## Phase 5: MCP and Agent Flows

Status: planned

- Tighten alignment between installed MCPs, skills, and what the toolbox advertises.
- Add setup guidance for Solana MCP, Helius MCP, Phantom MCP, and payment-oriented MCPs where they materially improve workflows.
- Keep protocol skills and runtime integrations distinct in the UI and project scaffolds.

## Immediate next slice

1. Add Phantom and Wallet Standard starter/runtime helpers so the configured wallet path affects generated project output.
2. Add execution UX for Jupiter and Jito so users can see which path a swap or transfer used.
3. Add Solana environment diagnostics for AVM, Anchor, Solana CLI, Surfpool, and LiteSVM.
