# DAEMON Frontier Submission

DAEMON is a Solana-native agent workbench for verifiable AI development work.

The product turns agent coding sessions into auditable work: a developer opens a project, enables the Solana and Helius MCP stack, spawns an agent, creates and funds a task, receives a work receipt, reviews it, and approves settlement on devnet. The on-chain registry makes the relationship between prompt, task, agent session, receipt, approval, and settlement inspectable instead of relying on chat logs.

## Positioning

**Short pitch:** Verifiable AI dev work for Solana teams.

**Category:** Agent workbench, not a generic IDE.

**Audience:** Solana founders, protocol teams, agencies, and independent builders who already use coding agents but need repeatable project context, MCP setup, wallet/RPC readiness, and proof that paid agent work was requested, delivered, reviewed, and settled.

**Why Solana:** Solana teams already operate through wallets, RPCs, explorers, devnet/mainnet deploy flows, and on-chain settlement. DAEMON puts the agent workflow next to those primitives instead of leaving the proof trail scattered across terminal logs and chat transcripts.

## Canonical Demo

**One sentence:** DAEMON turns an AI coding task into a devnet-verifiable work receipt and settlement trail.

The demo should show one uninterrupted flow:

1. Open a Solana project in DAEMON.
2. Enable Solana/Helius MCP readiness.
3. Spawn Claude or Codex in a dedicated PTY tab.
4. Create a devnet agent work task with prompt, acceptance criteria, bounty, owner, verifier, and agent wallet.
5. Fund/start the task.
6. Submit receipt hashes for commit, diff, tests, and artifact URI.
7. Approve and settle the task.
8. Open the Solana Explorer devnet transaction proof.

## 2-Minute Demo Runbook

| Time | Scene | What to show |
| --- | --- | --- |
| 0:00-0:15 | Open project | Launch DAEMON, open a clean Solana project, show project tabs, editor, and terminal. |
| 0:15-0:30 | Enable Solana/Helius MCP | Open Project Readiness, toggle Solana/Helius MCP, confirm wallet, RPC, and MCP readiness checks. |
| 0:30-0:50 | Spawn agent | Open Agent Launcher, choose Claude or Codex, attach Solana/Helius MCP, spawn an agent in a dedicated PTY tab. |
| 0:50-1:10 | Create and fund task | In Agent Work or Registry controls, create a devnet task with bounty/escrow funding and show the task account. |
| 1:10-1:25 | Submit work receipt | Submit receipt hashes/summary for completed work and show the receipt state. |
| 1:25-1:45 | Approve and settle | Approve the receipt, settle the task on devnet, and show the final state transition. |
| 1:45-2:00 | Explorer proof | Open the Solana Explorer devnet transaction link and close on the value prop: verifiable AI dev work for Solana teams. |

Recording checklist:

- Keep the capture under 2 minutes.
- Use a clean project with funded devnet wallet and `RPC_URL` set.
- Copy the final explorer URL into the submission notes.
- Mention the local validation status: `pnpm run typecheck`, `pnpm test`, and Anchor/Cargo registry tests.
- Do not lead with token/community materials; lead with the working devnet proof flow.
- To capture a 120 second take with `ffmpeg`, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/frontier-record.ps1
```

The helper records the desktop to `docs/frontier-demo.mp4`.

## Devnet Preflight

- Confirm the registry program is current:

```bash
solana program show 3nu6sppjDtAKNoBbUAhvFJ35B2JsxpRY6G4Cg72MCJRc --url devnet
```

- If the deployed binary is stale, rebuild and upgrade the registry before recording:

```bash
cd programs/daemon-registry
cargo build-sbf
solana program deploy --url devnet --program-id 3nu6sppjDtAKNoBbUAhvFJ35B2JsxpRY6G4Cg72MCJRc target/sbpf-solana-solana/release/daemon_registry.so
```

- Use a devnet wallet with enough SOL for task funding, rent, and fees.
- Save the final explorer link beside the demo video for judges.

## Frontier Criteria Fit

| Criterion | DAEMON answer |
| --- | --- |
| Functionality and code quality | Electron app, typed IPC bridge, PTY-backed agent sessions, project-level MCP management, wallet/RPC readiness, SQLite migrations, smoke tests, CI, and Anchor registry code. |
| Impact | Solana builders are adopting coding agents, but teams still need a trustworthy way to request, review, verify, and settle agent work. |
| Novelty | The core wedge is not another editor. It is a workbench where AI development tasks can produce devnet-verifiable receipts and settlements. |
| Solana UX | Solana/Helius MCP setup, wallet readiness, RPC checks, devnet registry transactions, task funding, and explorer links are first-class flows. |
| Open source and composability | MIT-licensed repo with an extensible plugin/MCP architecture and an Anchor program that other tools can inspect or build against. |
| Business plan | Pro desktop, team workspaces, marketplace fees, and agent-work escrow fees create a path from individual builders to protocol/team usage. |

## Business Model

DAEMON can monetize through four explicit channels:

1. **Pro desktop:** Paid local app tier for advanced agent orchestration, session replay, telemetry, registry publishing, and premium Solana tooling.
2. **Team workspaces:** Shared project profiles, policy-controlled MCP configs, audit logs, agent session history, and role-based approval flows for protocol teams.
3. **Paid MCP/plugin marketplace:** Curated Solana protocol packs, MCP servers, agent skills, and workflow plugins with creator revenue share.
4. **Agent-work escrow fees:** A small protocol or platform fee on task funding and settlement when teams pay agents or contractors through the on-chain registry.

## Judge Notes

- DAEMON is not a VS Code fork.
- The demo should be evaluated as a Solana-native agent workbench and receipt layer.
- The important proof is the task lifecycle: prompt -> task -> agent session -> receipt -> approval -> settlement -> explorer link.
- Community/token information is intentionally separated from the core product narrative so the submission focuses on functionality, Solana UX, and composability.
