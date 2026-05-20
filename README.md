<p align="center">
  <h1 align="center">DAEMON</h1>
  <p align="center">An open-source Solana-native workbench for verifiable AI agent development.</p>
</p>

<p align="center">
  <img src="https://github.com/nullxnothing/daemon/actions/workflows/ci.yml/badge.svg" alt="CI">
  <img src="https://img.shields.io/github/v/release/nullxnothing/daemon" alt="Release">
  <img src="https://img.shields.io/github/downloads/nullxnothing/daemon/total" alt="Downloads">
  <img src="https://img.shields.io/github/license/nullxnothing/daemon" alt="License">
  <img src="https://img.shields.io/badge/tests-407%20passing-brightgreen" alt="Tests">
</p>

<p align="center">
  <a href="https://daemon-landing.vercel.app">Website</a> &middot;
  <a href="#frontier-hackathon">Frontier</a> &middot;
  <a href="#install">Install</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#development">Development</a> &middot;
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

<p align="center">
  <img src="docs/screenshots/ui-overview.webp" alt="DAEMON agent workbench with editor, terminal, and sidebar" width="800">
</p>

DAEMON is a standalone Electron workbench for Solana developers who use autonomous coding agents. It combines an offline editor, real PTY terminals, Claude/Codex agent spawning, MCP server management, wallet/RPC readiness, and an Anchor-backed registry for publishing verifiable agent work receipts on devnet.

The wedge is simple: AI agents can write code, but Solana teams still need proof of what was requested, what was delivered, who reviewed it, and how settlement happened.

## Frontier Hackathon

**Short pitch:** verifiable AI dev work for Solana teams.

**Demo path:** open project -> enable Solana/Helius MCP -> spawn Claude or Codex -> create and fund a devnet task -> submit receipt hashes -> approve and settle -> open Solana Explorer proof.

See the full [Frontier submission runbook](FRONTIER_SUBMISSION.md#2-minute-demo-runbook) for the 2-minute recording flow and devnet preflight.

### Judging checklist

| Criterion | DAEMON fit |
| --- | --- |
| Functionality and code quality | Electron app with typed IPC, PTY-backed agent sessions, project MCP management, wallet/RPC readiness, CI, smoke tests, and an Anchor registry. |
| Impact | Solana builders already use AI coding agents; DAEMON adds the missing trust layer for requested, delivered, reviewed, and settled work. |
| Novelty | Agent sessions produce task, receipt, review, and settlement evidence instead of relying on chat logs. |
| Solana UX | Wallet readiness, Solana/Helius MCP setup, devnet task funding, registry transactions, and explorer links are first-class flows. |
| Open source and composability | MIT-licensed app plus an Anchor registry program that other tools can inspect or build against. |
| Business plan | Pro desktop, team workspaces, paid MCP/plugin marketplace, and agent-work escrow fees. |

## Install

**Windows:** Download the [latest .exe](https://github.com/nullxnothing/daemon/releases/latest/download/DAEMON-setup.exe)

<a name="mac-install"></a>

**Mac:** Build from source. Signed builds are configurable with Apple Developer credentials:

```bash
git clone https://github.com/nullxnothing/daemon.git
cd daemon
pnpm install
pnpm run build
pnpm run package
```

The `.dmg` is emitted under the current release folder, for example `release/3.0.13/`. Without signing credentials, macOS may require right-click > Open on first launch.

<a name="linux-install"></a>

**Linux:** Build from source. AppImage builds are supported through the package script:

```bash
git clone https://github.com/nullxnothing/daemon.git
cd daemon
pnpm install
pnpm run build
pnpm run package
```

The AppImage is emitted under the current release folder, for example `release/3.0.13/`. Make it executable with `chmod +x` and run directly.

**Build from source (any platform):**

```bash
git clone https://github.com/nullxnothing/daemon.git
cd daemon
pnpm install
pnpm run package
```

Requires **Node.js 22+** and **pnpm 9+**.

## Features

<p align="center">
  <img src="docs/screenshots/editor.webp" alt="Editor with multiple tabs, breadcrumbs, and file tree" width="800">
</p>

**Editor** — Monaco running fully offline via a custom protocol handler. Multi-tab, breadcrumbs, syntax highlighting, Ctrl+S save. No CDN dependency.

**Terminal** — Real PTY sessions powered by node-pty and xterm.js. Multiple tabs, split panes, command history search (Ctrl+R), tab-completion hints, and dedicated agent session management.

<p align="center">
  <img src="docs/screenshots/agent-launcher.webp" alt="Agent launcher with model selection and MCP config" width="800">
</p>

**Agent Launcher** — Spawn Claude Code or Codex agents with custom system prompts, model selection, and per-project MCP configurations. Agents run as real CLI sessions in dedicated terminal tabs.

**Agent Work Registry** — Create, fund, start, submit, approve, reject, settle, or expire agent work tasks with hashes for the repo, prompt, acceptance criteria, diffs, tests, and artifacts.

**MCP Management** — Toggle project-level and global MCP servers from the sidebar. Changes write directly to `.claude/settings.json` and `.mcp.json` with a restart indicator when configs change.

**Git** — Branch switching, per-file and folder-level staging, commit, push, stash save/pop, branch creation, and tag management.

**Wallet** — Live Solana portfolio tracking via Helius. SOL balance and SPL token holdings with USD values from Jupiter.

<p align="center">
  <img src="docs/screenshots/wallet.webp" alt="Wallet panel showing token balances" width="800">
</p>

**Settings** — API keys encrypted via the OS keychain. MCP integrations, agent defaults, and display preferences.

**Tools Browser** — Create, import, and run scripts (TypeScript, Python, Shell) with per-language execution.

**Embedded Browser** — Built-in browser with a security sandbox for previewing and testing.

**Solana Integrations** — Wallet, launch, SpawnAgents, PumpFun, x402/MPP, and protocol workflow surfaces inside one local workbench.

**Multi-Project Tabs** — Tabbed project switching with per-project terminal sessions, MCP configs, and file trees. Context switching without losing state.

**Plugin System** — Extensible architecture for loading additional panels and integrations.

## Architecture

```
electron/
  main/           App entry, window management, protocol handlers
  ipc/            One handler per domain (agents, git, terminal, wallet, ...)
  services/       Business logic — never imported from renderer
  db/             SQLite (WAL mode), versioned migrations

src/
  panels/         One directory per UI panel
  store/          Zustand state management
  plugins/        Plugin registry, lazy-loaded components
  components/     Shared UI primitives

styles/           CSS custom properties and base reset
```

Key decisions:
- All database access runs in the main process. The renderer communicates exclusively via IPC.
- Every IPC handler returns `{ ok, data }` or `{ ok, error }` — no raw throws across the bridge.
- Native modules (`better-sqlite3`, `node-pty`) are unpacked from ASAR for production builds.
- Monaco runs offline through a custom `monaco-editor://` protocol — zero network requests.
- CSS Modules with a design token system. No utility CSS frameworks.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron 33 |
| Build | Vite |
| UI | React 18, TypeScript |
| Editor | Monaco Editor |
| Terminal | node-pty, xterm.js |
| State | Zustand |
| Database | better-sqlite3 (WAL) |
| Git | simple-git |
| Packaging | electron-builder |
| Registry | Anchor / Solana devnet |

## Development

```bash
pnpm install          # Install dependencies and rebuild native modules
pnpm run dev          # Dev server with hot reload
pnpm run typecheck    # TypeScript validation
pnpm run test         # Run tests (Vitest)
pnpm run build        # Production build
pnpm run package      # Create distributable (.exe / .dmg / AppImage)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on pull requests and code style.

## Community

$DAEMON community token CA: `4vpf4qNtNVkvz2dm5qL2mT6jBXH9gDY8qH2QsHN5pump`

## License

[MIT](LICENSE)
