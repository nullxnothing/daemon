# Solana IDE Stabilization Backlog

## Goal

Make DAEMON a real Solana-first development environment with an accurate runtime stack, current scaffolding, wallet-aware execution, and protocol packs that map cleanly to what is actually shipped.

## Current Direction

This is now a polish backlog, not a new phase roadmap.

- Do not expand the surface area just to complete numbered phases.
- Perfect the Solana IDE work that already exists: starter output, runtime visibility, wallet execution, provider configuration, toolbox diagnostics, and protocol/plugin accuracy.
- Treat planned features as candidates only when they remove friction from an existing shipped workflow.
- Keep dormant plugin shells out of primary product claims until they are genuinely usable.

## Delivered Foundation

- Solana ecosystem catalog that separates `native` integrations from `guided` coverage.
- Solana starter prompts around `@solana/kit`, current wallet flows, Jupiter, Jito, AVM, LiteSVM, and provider abstraction.
- Broader Solana project detection for modern frontend/client stacks.
- Wallet infrastructure settings for Helius, public RPC, QuickNode RPC, custom RPC, Jupiter execution, Phantom or Wallet Standard paths, and optional Jito block-engine submission.
- Runtime stack visibility in the Solana toolbox so the UI reflects the live configuration.
- Project Runtime Dashboard and Validator Workbench for project-level cluster, program, IDL, script, toolchain, Surfpool, and test-validator readiness.
- Transaction Lab in the Transact view for wallet-backed preview, preflight blockers, execution path context, recent activity, and replay trace summaries.

## Polish Priorities

1. Runtime accuracy
   Keep Solana IDE claims accurate in the UI, docs, setup flows, and generated project output.

2. Wallet and execution quality
   Make missing API keys, provider misconfiguration, Jupiter execution, Jito submission, and RPC fallback states visible before execution begins.

3. Starter and onboarding clarity
   Ensure Phantom, Wallet Standard, Helius, QuickNode, custom RPC, Jupiter, and Jito choices affect generated starter output consistently.

4. Local toolchain diagnostics
   Surface Solana CLI, Anchor, AVM, Surfpool, LiteSVM, and validator readiness as diagnostics for existing workflows, not as a separate expansion track.

5. Protocol and plugin honesty
   Keep protocol support explicit about what is native, guided, scaffolded, or dormant.

6. MCP and agent alignment
   Tighten alignment between installed MCPs, skills, and what the toolbox advertises.

## Immediate Next Slice

1. Let Transaction Lab hand successful previews directly into the existing Wallet and Launch execution flows with the preview context preserved.
2. Add project-aware replay handoff from Transaction Lab so failed signatures can create a Claude context without switching tools first.
3. Keep adding focused DOM and service tests around the Solana toolbox so runtime, wallet, validator, and replay polish does not regress.
