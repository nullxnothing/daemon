<p align="center">
  <h1 align="center">DAEMON</h1>
  <p align="center">An AI-native Solana development environment for agents, wallets, launches, deployments, and hosted DAEMON AI.</p>
</p>

<p align="center">
  <img src="https://github.com/nullxnothing/daemon/actions/workflows/ci.yml/badge.svg" alt="CI">
  <img src="https://img.shields.io/github/v/release/nullxnothing/daemon" alt="Release">
  <img src="https://img.shields.io/github/downloads/nullxnothing/daemon/total" alt="Downloads">
  <img src="https://img.shields.io/github/license/nullxnothing/daemon" alt="License">
  <img src="https://img.shields.io/badge/tests-542%20passing-brightgreen" alt="Tests">
</p>

<p align="center">
  <a href="https://daemon-landing.vercel.app">Website</a> &middot;
  <a href="#install">Install</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#daemon-ai-and-access">DAEMON AI</a> &middot;
  <a href="FRONTIER_SUBMISSION.md">Frontier</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#development">Development</a> &middot;
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

<p align="center">
  <strong>$DAEMON CA:</strong> <code>4vpf4qNtNVkvz2dm5qL2mT6jBXH9gDY8qH2QsHN5pump</code>
</p>

---

<p align="center">
  <img src="docs/screenshots/ui-overview.webp" alt="DAEMON agent workbench with editor, terminal, and sidebar" width="800">
</p>

**[Frontier demo runbook](FRONTIER_SUBMISSION.md#2-minute-demo-runbook)** — 2-minute submission flow from project open to devnet settlement.

DAEMON is a standalone Electron development environment for Solana builders who use AI agents to ship. It combines an offline editor, real PTY terminals, DAEMON AI, Claude/Codex agent spawning, MCP management, wallet/RPC readiness, token launches, deployments, integrations, and an Anchor-backed registry for publishing verifiable agent work receipts. Not a VS Code fork.

DAEMON Light stays free and useful for local work and bring-your-own-key AI. DAEMON Pro and holder access unlock hosted DAEMON AI, Pro Skills, Arena, MCP sync, priority workflows, and higher model lanes as they go live.

## Install

**Windows:** Download the [latest .exe](https://github.com/nullxnothing/daemon/releases/latest/download/DAEMON-setup.exe)

<a name="mac-install"></a>

**Mac:** Build from source (signed builds configurable via Apple credentials):

```bash
git clone https://github.com/nullxnothing/daemon.git
cd daemon
pnpm install
pnpm run build
pnpm run package
```

The `.dmg` will be in `release/<version>/`. Signed/notarized builds require Apple Developer credentials in the packaging environment. Without them, the app will still package, but Gatekeeper may require right-click > Open on first launch.

<a name="linux-install"></a>

**Linux:** Build from source (AppImage builds coming soon):

```bash
git clone https://github.com/nullxnothing/daemon.git
cd daemon
pnpm install
pnpm run build
pnpm run package
```

The AppImage will be in `release/<version>/`. Make it executable with `chmod +x` and run directly.

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

**Agent Launcher** — Spawn Claude Code agents with custom system prompts, model selection, and per-project MCP configurations. Agents run as real CLI sessions in dedicated terminal tabs.

**MCP Management** — Toggle project-level and global MCP servers from the sidebar. Changes write directly to `.claude/settings.json` and `.mcp.json` with a restart indicator when configs change.

**Git** — Branch switching, per-file and folder-level staging, commit, push, stash save/pop, branch creation, and tag management.

**Wallet** — Live Solana portfolio tracking via Helius. SOL balance and SPL token holdings with USD values from Jupiter.

<p align="center">
  <img src="docs/screenshots/wallet.webp" alt="Wallet panel showing token balances" width="800">
</p>

**Settings** — API keys encrypted via the OS keychain. MCP integrations, agent defaults, and display preferences.

**Tools Browser** — Create, import, and run scripts (TypeScript, Python, Shell) with per-language execution.

**Embedded Browser** — Built-in browser with a security sandbox for previewing and testing.

**PumpFun Integration** — Token launches and bonding curve interactions directly from the IDE.

**Multi-Project Tabs** — Tabbed project switching with per-project terminal sessions, MCP configs, and file trees. Context switching without losing state.

**Plugin System** — Extensible architecture for loading additional panels and integrations.

## DAEMON AI and Access

DAEMON AI is the hosted agent layer for project-aware chat, patch workflows, Solana-aware development help, model routing, usage metering, and premium workflows. Free users can use local/BYOK mode; paid users and eligible holders can use DAEMON-hosted AI through DAEMON AI Cloud.

| Plan | Price | Positioning |
|------|------:|-------------|
| DAEMON Light | Free | Local workbench, editor, terminal, git, wallet, BYOK agents, and core tools. |
| DAEMON Pro | $20/month | Hosted DAEMON AI, Pro Skills, Arena, MCP sync, and standard monthly usage. |
| DAEMON Operator | $60/month | Higher AI limits, larger context, cloud agents, and advanced ship/deploy workflows. |
| DAEMON Ultra | $200/month | Maximum individual usage, priority model access, early features, and advanced automation. |
| DAEMON Teams | $49/user/month | Shared workspaces, pooled usage, team billing, admin controls, and collaboration. |
| Enterprise | Custom | Private deployments, custom limits, support, compliance, and invoicing. |

Holder access starts with a simple rule: hold 1,000,000 $DAEMON to claim DAEMON Pro with included monthly AI usage. Higher holder tiers can unlock higher limits, discounts, badges, and early access later. Holder access does not mean unlimited AI usage.

DAEMON also includes a Zauth integration surface for x402 database and Provider Hub management. Payment and entitlement enforcement should remain server-side through DAEMON AI Cloud and the relevant provider backends.

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
| Shell | Electron 41 |
| Build | Vite |
| UI | React 19, TypeScript |
| Editor | Monaco Editor |
| Terminal | node-pty, xterm.js |
| State | Zustand |
| Database | better-sqlite3 (WAL) |
| Git | simple-git |
| Packaging | electron-builder |

## Development

```bash
pnpm install          # Install dependencies and rebuild native modules
pnpm run dev          # Dev server with hot reload
pnpm run typecheck    # TypeScript validation
pnpm run test         # Run tests (Vitest)
pnpm run build        # Production build
pnpm run package      # Create distributable (.exe / .dmg)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on pull requests and code style.

## License

[MIT](LICENSE)
