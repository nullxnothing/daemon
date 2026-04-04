# DAEMON — Claude Code Context

Custom Electron IDE for AI-native development. Monaco editor, node-pty terminals, React 18, Zustand, better-sqlite3.

---

## Hard Rules

1. **All DB calls in main process only.** Renderer uses IPC. Never import `db` in `src/`.
2. **All IPC handlers return `{ ok: true, data }` or `{ ok: false, error }`.** Use `IpcHandlerFactory`.
3. **Never use `--mcp` or `--context-file` as Claude CLI flags.** They don't exist. MCPs go in `.claude/settings.json`. Context via `--append-system-prompt-file`.
4. **Never reference `claude_desktop_config.json`.** That's Claude Desktop. Claude Code CLI reads `.claude/settings.json`.
5. **Never `git push` autonomously.** Stage only.
6. **Never store plaintext API keys in SQLite.** Use `safeStorage.encryptString()`.
7. **No emoji in UI chrome.** Status via 5px colored dots only.
8. **Use full versioned model strings:** `claude-opus-4-20250514`, not `claude-opus-4`.
9. **CSS Modules with token system.** No Tailwind. Follow `styles/tokens.css`.

---

## Dev Workflow

```bash
# Terminal A: dev server
pnpm run dev

# Terminal B: type checking
pnpm run typecheck:watch
```

Test with electron-test MCP via CDP port 9222. Connect, screenshot, click, evaluate JS.

**Commands:** `pnpm run dev` | `pnpm run build` | `pnpm run test` | `pnpm run package` | `pnpm run typecheck`

---

## Git & CI Flow

Branches + PRs. CI runs on every push and PR:
- **typecheck** — `pnpm run typecheck`
- **test** — `pnpm run test` (281 Vitest tests across 19 suites)
- **build** — `pnpm run package` on Windows + macOS

Releases: tag `v*` triggers release workflow that builds and uploads .exe/.dmg to GitHub Releases.

```bash
# Feature work
git checkout -b feat/my-feature
# ... build ...
git push -u origin feat/my-feature
# Open PR, CI validates, merge

# Release
git tag v0.2.0
git push --tags
# CI builds + creates draft release
```

Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

---

## Architecture Summary

```
electron/
  main/index.ts       App entry, window, protocol handlers
  preload/index.ts    contextBridge → window.daemon.*
  ipc/                One handler file per domain (20 modules)
  services/           Business logic (ClaudeRouter, ToolService, etc.)
  db/                 SQLite schema (V6), migrations, WAL mode
  shared/types.ts     Shared TypeScript interfaces

src/
  App.tsx             Root layout — sidebar, center, right panel
  store/              Zustand stores (ui, wallet, plugins, tools)
  panels/             One directory per panel (21 panels + plugins/)
  plugins/            Plugin registry + lazy-loaded components
  components/         Toggle, Dot, ErrorBoundary, etc.
  types/daemon.d.ts   Global type declarations for window.daemon

styles/
  tokens.css          Color, spacing, font CSS variables
  base.css            Global reset + scrollbar + input styles
```

---

## IPC Pattern

```typescript
// electron/ipc/example.ts
ipcMain.handle('domain:action', IpcHandlerFactory.createHandler(
  'domain:action',
  async (input: TypedInput) => {
    // validate, query DB, return data
  }
))

// Renderer calls via window.daemon.domain.action(input)
```

---

## Key Patterns

- **Monaco offline:** Custom `monaco-editor://` protocol. Workers wired up in `Editor.tsx`.
- **Terminal:** node-pty in main → IPC bridge → xterm.js in renderer. Sessions tracked per project.
- **Agent spawn:** Writes `.claude/settings.json` for MCPs, creates terminal, runs `claude` CLI with `--model` and `--append-system-prompt-file`.
- **MCP toggles:** Write to project `.mcp.json`. `mcpVersion` counter in Zustand syncs Settings ↔ Claude sidebar.
- **Editor crash guard:** Try/catch around `setModel()`, null `editorRef` on unmount, ErrorBoundary wrapping MonacoEditor.
- **Right panel:** Tabbed (Claude/Ports/Processes/Wallet) — doesn't replace center editor.

---

## Color System

```css
--bg: #0a0a0a;  --s1: #141414;  --s2: #1a1a1a;  --s3: #222222;  --s4: #2a2a2a;  --s5: #333333;  --s6: #3a3a3a;
--t1: #f0f0f0;  --t2: #a0a0a0;  --t3: #777777;  --t4: #505050;
--green: #3ecf8e;  --amber: #f0b429;  --red: #ef5350;  --blue: #60a5fa;
```
Each accent has `-dim` and `-glow` variants. See `styles/tokens.css` for full list.

---

## Current State

**Last updated:** 2026-04-03

**Complete:** Phases 1-8 (Shell, Agent Launcher, Claude Panel, Process Manager, Env Manager, Ports, Git, Wallet), Settings Panel, Tools Panel, production infrastructure (10 services), Browser + Playwright CDP, Colosseum Hackathon integration, on-chain Session Registry (Anchor program deployed to devnet), 281 tests across 19 suites passing.

**Remaining:**
- Phase 9: Image Generator (Gemini imagen-4)
- Phase 10: Gmail Code Catcher
- Phase 11: Tweet Generator
- Phase 12: Subscription Manager
- Phase 13: Remotion Panel
- Phase 15: Context Bridge Extension
- Future: Overnight Engine, Dispatch, ARIA, Services Panel

**Platform:** Windows 11, Node 22+, Electron 33, pnpm
