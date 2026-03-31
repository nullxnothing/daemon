<p align="center">
  <h1 align="center">DAEMON</h1>
  <p align="center">The IDE built for developers who ship with AI.</p>
</p>

<p align="center">
  <a href="#install">Install</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#development">Development</a> &middot;
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

DAEMON is an open-source Electron IDE designed from the ground up for AI-native development. Monaco editor, integrated terminals, Claude Code agent spawning, MCP management, Solana wallet, and a plugin system — all in one window.

Built for solo developers who use AI agents as their primary workflow. Not a VS Code fork. Every panel is purpose-built.

## Install

Download the latest release from [Releases](https://github.com/nullxnothing/daemon/releases), or build from source:

```bash
git clone https://github.com/nullxnothing/daemon.git
cd daemon
pnpm install
pnpm run package
```

Requires Node.js 22+ and pnpm 9+.

## Features

**Editor** — Monaco with offline support, syntax highlighting, multi-tab, breadcrumbs, Ctrl+S save, markdown tidy with AI diff preview.

**Terminal** — Full PTY terminal with multiple tabs, split panes, command history search (Ctrl+R), tab-completion hints, and agent session management.

**Agent Launcher** — Create and spawn Claude Code agents with custom system prompts, model selection (Opus/Sonnet/Haiku), and per-project MCP configurations. Agents run as real CLI sessions in dedicated terminal tabs.

**MCP Management** — Toggle project-level and global MCP servers from the sidebar. Changes write directly to `.claude/settings.json` and `.mcp.json`. Restart indicator when config changes.

**Git** — Branch switching, staging (individual file + folder-level + stage all), commit with AI-generated messages, push, stash save/pop, branch and tag creation.

**Wallet** — Live Solana portfolio tracking via Helius RPC. SOL balance, SPL token holdings with USD values from Jupiter price API.

**Settings** — Encrypted API key storage (OS keychain), MCP integrations, agent defaults, display preferences.

**Tools** — Built-in tool browser for creating, importing, and running scripts (TypeScript, Python, Shell) with per-language execution.

**Plugins** — Image generation (Gemini), tweet drafting with voice profiles, embedded browser (Playwright), Telegram client (GramJS), Gmail integration, Remotion video editor, subscription tracker, background services manager.

**Multi-Project** — Tabbed project switching with per-project terminal sessions, MCP configs, and file trees. Seamless context switching without losing state.

## Architecture

```
electron/           Main process (Node.js)
  ipc/              IPC handler per domain (agents, git, terminal, etc.)
  services/         Business logic, never imported from renderer
  db/               SQLite with WAL mode, versioned migrations
src/                Renderer (React 18 + TypeScript)
  panels/           One directory per UI panel
  store/            Zustand state management
  plugins/          Plugin registry and lazy-loaded components
styles/             CSS custom properties and base reset
```

Key architectural decisions:
- All database access in main process only — renderer communicates via IPC
- Every IPC handler returns `{ ok: true, data }` or `{ ok: false, error }`
- Native modules (`better-sqlite3`, `node-pty`) unpacked from ASAR for production
- Monaco editor runs offline via custom protocol handler — no CDN dependency
- CSS Modules with a strict token system — no utility frameworks

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron 33 |
| Build | Vite + vite-plugin-electron |
| UI | React 18 + TypeScript |
| Editor | Monaco Editor |
| Terminal | node-pty + xterm.js |
| State | Zustand |
| Database | better-sqlite3 (WAL) |
| Git | simple-git |
| Packaging | electron-builder |

## Development

```bash
pnpm install          # Install deps + rebuild native modules
pnpm run dev          # Dev server with hot reload
pnpm run typecheck    # TypeScript validation
pnpm run test         # Run test suite (Vitest)
pnpm run build        # Production build
pnpm run package      # Create .exe / .dmg
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## Roadmap

- [x] Core IDE (editor, terminal, file explorer, project management)
- [x] Agent system (launcher, Claude Code spawning, MCP management)
- [x] Developer panels (git, env manager, ports, processes, wallet)
- [x] Settings and tools browser
- [x] Production infrastructure (error recovery, resource management, logging)
- [ ] Image generation (Gemini)
- [ ] Gmail integration
- [ ] Tweet generator with voice profiles
- [ ] Subscription tracker
- [ ] Remotion video panel
- [ ] Embedded browser with Playwright CDP
- [ ] Chrome extension context bridge

## License

[MIT](LICENSE)
