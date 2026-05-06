# DAEMON Frontier Submission

DAEMON is a Solana-native agent workbench for verifiable AI development work.

The product turns agent coding sessions into auditable work: a developer opens a project, enables the Solana and Helius MCP stack, spawns an agent, funds a task, receives a work receipt, and approves settlement on devnet. The on-chain registry makes the relationship between prompt, task, agent session, receipt, approval, and settlement inspectable instead of relying on chat logs.

## Positioning

**Short pitch:** Verifiable AI dev work for Solana teams.

**Category:** Agent workbench, not a generic IDE.

**Audience:** Solana founders, protocol teams, and independent builders who already use coding agents but need repeatable project context, MCP setup, wallet/RPC readiness, and proof that paid agent work was requested, delivered, reviewed, and settled.

## 2-Minute Demo Runbook

| Time | Scene | What to show |
| --- | --- | --- |
| 0:00-0:15 | Open project | Launch DAEMON, open `C:\Users\offic\Projects\DAEMON`, show project tabs, editor, and terminal. |
| 0:15-0:30 | Enable Solana/Helius MCP | Open Project Readiness, toggle Solana/Helius MCP, confirm wallet, RPC, and MCP readiness checks. |
| 0:30-0:50 | Spawn agent | Open Agent Launcher, choose Claude or Codex, attach Solana/Helius MCP, spawn an agent in a dedicated PTY tab. |
| 0:50-1:10 | Create and fund task | In Agent Work or Registry controls, create a devnet task with bounty/escrow funding and show the task account. |
| 1:10-1:25 | Submit work receipt | Have the agent submit a receipt hash/summary for the completed work and show the receipt state. |
| 1:25-1:45 | Approve and settle | Approve the receipt, settle the task on devnet, and show the final state transition. |
| 1:45-2:00 | Explorer proof | Open the Solana Explorer devnet transaction link and close on the value prop: verifiable AI dev work for Solana teams. |

Recording checklist:

- Keep the capture under 2 minutes.
- Use a clean project with funded devnet wallet and `RPC_URL` set.
- Copy the final explorer URL into the submission notes.
- Mention the test status: `pnpm run typecheck`, `pnpm test`, and `cargo test` pass locally.
- To capture the final take with `ffmpeg`, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/frontier-record.ps1
```

The helper records the desktop for 120 seconds to `docs/frontier-demo.mp4`.

Devnet preflight:

- Confirm the registry program is current: `solana program show 3nu6sppjDtAKNoBbUAhvFJ35B2JsxpRY6G4Cg72MCJRc --url devnet`.
- If the deployed binary is stale, rebuild and upgrade the registry before recording: `cargo build-sbf` from `programs/daemon-registry`, then `solana program deploy --url devnet --program-id 3nu6sppjDtAKNoBbUAhvFJ35B2JsxpRY6G4Cg72MCJRc programs/daemon-registry/target/sbpf-solana-solana/release/daemon_registry.so`.

## Business Model

DAEMON can monetize through four explicit channels:

1. **Pro desktop:** Paid local app tier for advanced agent orchestration, session replay, telemetry, registry publishing, and premium Solana tooling.
2. **Team workspaces:** Shared project profiles, policy-controlled MCP configs, audit logs, agent session history, and role-based approval flows for protocol teams.
3. **Paid MCP/plugin marketplace:** Curated Solana protocol packs, MCP servers, agent skills, and workflow plugins with creator revenue share.
4. **Agent-work escrow fees:** A small protocol or platform fee on task funding and settlement when teams pay agents or contractors through the on-chain registry.

## Frontier Criteria Fit

**Functionality and code quality:** Electron app, typed IPC bridge, PTY-backed agent sessions, project-level MCP management, wallet/RPC readiness, and Anchor registry tests.

**Impact:** Solana builders are already adopting coding agents; DAEMON targets the missing trust layer between autonomous work, human approval, and payment.

**Novelty:** The core wedge is not another editor. It is a workbench where AI development tasks can produce devnet-verifiable receipts and settlements.

**Solana UX:** Solana/Helius MCP setup, wallet readiness, RPC checks, devnet registry transactions, and explorer links are first-class user flows.

**Open source and composability:** MIT-licensed repo with an extensible plugin/MCP architecture and an Anchor program that other tools can inspect or build against.

**Business plan:** Pro desktop, team workspaces, marketplace fees, and agent-work escrow fees create a path from individual builders to paid protocol/team usage.
