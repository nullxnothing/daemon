# DAEMON — Claude Code Context

This is the master context document for building DAEMON. Read this fully before writing any code. Update the "Current State" section at the end of every session.

---

## Testing with electron-test-mcp (IMPORTANT)

**Always use `electron-test-mcp` via MCP to test changes.** This is the primary way to verify UI rendering, user workflows, IPC behavior, state management, and bug fixes — not just visual checks. Use it to click through flows, inspect DOM state, execute JS to verify store values, simulate user interactions end-to-end, and reproduce/confirm bug fixes.

### Setup

1. **Start the persistent dev app:** `npm run dev`
2. **Keep typecheck running in parallel:** `npm run typecheck:watch`
3. **Connect via CDP:** Use the `electron-test:connect` tool with port `9222`.
4. **Use `npm run dev:debug` only when you explicitly want DevTools to auto-open.** The default dev loop keeps DevTools closed so CDP attaches to the app window reliably.

### Available Tools

- `electron-test:connect` — Connect to running app via CDP on port 9222
- `electron-test:screenshot` — Take a screenshot of the current window
- `electron-test:snapshot` — Get accessibility tree (for finding elements)
- `electron-test:evaluate` — Execute JS in the renderer process (access `window.daemon`, Zustand stores, DOM, etc.)
- `electron-test:click` — Click an element by CSS selector or `text=Label`
- `electron-test:getText` — Get text content of an element
- `electron-test:isVisible` — Check element visibility
- `electron-test:fill` — Fill an input field
- `electron-test:type` / `electron-test:press` — Type text or press keys
- `electron-test:hover` — Hover an element
- `electron-test:wait` — Wait for an element to appear
- `electron-test:disconnect` — Disconnect from CDP

### What to Test

- **UI changes** — screenshot after any visual modification to verify rendering
- **Workflows** — click through multi-step flows (add project, open file, spawn agent, etc.)
- **IPC** — use `evaluate` to call `window.daemon.*` methods and verify responses
- **State** — use `evaluate` to inspect Zustand store state after actions
- **Bug fixes** — reproduce the bug via MCP, apply the fix, then verify it's resolved
- **Regressions** — after refactors, click through affected areas to confirm nothing broke

### Rules

- `evaluateMain` is **not available** in CDP mode — only renderer access. Test main process logic through IPC calls from the renderer.
- The app must be built (`npm run build`) or running in dev (`npm run dev`) before connecting.
- The default dev script keeps DevTools closed so CDP connects to the correct window. If you used `npm run dev:debug`, restart with `npm run dev` before MCP testing.

### Recommended Dev Workflow

Use a persistent inner loop instead of repeatedly stopping and starting the app:

1. **Terminal A:** `npm run dev`
2. **Terminal B:** `npm run typecheck:watch`
3. **Keep the Electron window open** and test changes in place.
4. **Use MCP/CDP against the running app** rather than relaunching between edits.
5. **Use in-app reload for fast iteration** — click the reload button in the titlebar or press `Ctrl+Shift+R`.
6. **Only restart the dev process when needed** — preload contract changes, startup bugs, or state corruption after hot reload.
7. **Use the repo launcher for one-click startup** — `scripts/start-daemon-dev.cmd` opens the persistent dev app and typecheck watch in separate terminals.
8. **Use `npm run package` at milestones, not on every edit.**

---

## What This Is

A custom Electron IDE for the AI-native solo developer. Monaco Editor for code, node-pty/xterm.js for terminals, React 18 + Vite for UI, better-sqlite3 for local storage. Every panel is purpose-built — Claude Code agent launcher, MCP toggle panel, localhost manager, Solana wallet, Gmail code catcher, Playwright browser, autonomous overnight engine, and ARIA personal agent.

Previously codenamed DAEMON. Now DAEMON.

Built for one user first (Dylan, @nullxnothing, Solana dev in Denver). Configurable for others later.

---

## Non-Negotiable Rules

1. **Never write code that works only in dev.** Every feature must work in the packaged app. Test with `npm run package` regularly.
2. **Native modules always need rebuild.** After any `npm install` that touches `node-pty` or `better-sqlite3`, run `./node_modules/.bin/electron-rebuild` before testing.
3. **All DB calls in main process only.** Never expose the SQLite instance to the renderer. All DB operations go through IPC handlers.
4. **All IPC handlers wrapped in try/catch.** Return `{ ok: true, data }` or `{ ok: false, error }` — never throw uncaught.
5. **Staged, never auto-pushed.** Any agent or overnight engine writing to disk stages changes only. Never `git push` autonomously.
6. **No emoji in UI chrome.** Status via colored dots only. Clean black/white design.

---

## Never Do (Hard Stops)

- **Never use `--mcp` as a Claude CLI flag.** It does not exist. MCPs are configured in `.claude/settings.json` per project. See CLAUDE_FLAGS.md.
- **Never use `--context-file` as a Claude CLI flag.** It does not exist. Use `--append-system-prompt-file <path>` instead.
- **Never reference `claude_desktop_config.json` for MCP toggle logic.** That file is for the Claude Desktop app. Claude Code CLI reads `.claude/settings.json` in the project directory.
- **Never import `db` in any file inside `src/` (renderer).** DB is main process only. Use IPC.
- **Never call `git push` from any automated context.**
- **Never store a full API key as a plaintext string in SQLite.** Always `safeStorage.encryptString()` before insert.
- **Never assume a packaged build works because dev works.** Run `npm run package` at the end of every phase.
- **Never use unversioned model shorthand in automated code.** Use full strings: `claude-opus-4-20250514`, not `claude-opus-4`.

---

## CLI Flags Reference

**See `CLAUDE_FLAGS.md` for the complete, verified flag reference.**

Key facts:
- `--mcp` does not exist — MCPs live in `.claude/settings.json`
- `--context-file` does not exist — use `--append-system-prompt-file`
- `--model`, `--append-system-prompt-file`, `--dangerously-skip-permissions`, `--allowedTools`, `--effort` all exist and work as expected

---

## Tech Stack

| Layer | Package | Notes |
|---|---|---|
| Shell | electron 31+ | Frameless window, custom titlebar |
| Build | electron-vite + vite | `pnpm create @quick-start/electron daemon --template react-ts` |
| UI | React 18 + TypeScript | CSS Modules — no Tailwind |
| Editor | @monaco-editor/react + monaco-editor | Requires offline protocol handler — see below |
| Terminal | node-pty + xterm.js | node-pty on main, xterm on renderer, IPC bridge |
| State | Zustand | One store per domain |
| DB | better-sqlite3 | Main process only, WAL mode |
| Git | simple-git | No native compilation required |
| Process detection | ps-list | Cross-platform |
| File watching | chokidar | Images, .env files, CLAUDE.md |
| Local server | express | Context bridge on localhost:7337 |
| Fonts | Plus Jakarta Sans (UI), JetBrains Mono (code) | Load from Google Fonts, cache locally |
| Packaging | electron-builder | .dmg + .exe |

---

## Color System

```css
--bg:    #090909;   /* base background */
--s1:    #101010;   /* sidebar / panel bg */
--s2:    #151515;   /* secondary surfaces */
--s3:    #1a1a1a;   /* hover states */
--s4:    #222222;   /* active / pressed */
--s5:    #2a2a2a;   /* borders */
--t1:    #ebebeb;   /* primary text */
--t2:    #7a7a7a;   /* secondary text */
--t3:    #3d3d3d;   /* muted / placeholder */
--green: #4a8c62;   /* live / success */
--amber: #8c7a4a;   /* warning / busy */
--red:   #8c4a4a;   /* error / kill */
```

Status dots: 5px circles, no labels. Green = live/running. Amber = busy/warning. Off (#3d3d3d) = idle. Red used sparingly for errors only.

---

## Folder Structure

```
daemon/
├── electron/
│   ├── main.ts                  # App entry — window, protocol, IPC registration
│   ├── preload.ts               # contextBridge — exposes IPC to renderer
│   ├── protocol.ts              # Monaco offline protocol handler
│   ├── ipc/                     # One file per domain
│   │   ├── agents.ts
│   │   ├── terminal.ts
│   │   ├── filesystem.ts
│   │   ├── mcp.ts
│   │   ├── git.ts
│   │   ├── processes.ts
│   │   ├── ports.ts
│   │   ├── wallet.ts
│   │   ├── gmail.ts
│   │   ├── imagegen.ts
│   │   ├── dispatch.ts
│   │   ├── overnight.ts
│   │   ├── services.ts
│   │   └── context_bridge.ts
│   ├── services/                # Business logic (main process only)
│   │   ├── ClaudeManager.ts     # Spawn/kill Claude Code instances
│   │   ├── McpConfig.ts         # .claude/settings.json per project
│   │   ├── EnvManager.ts        # .env file scanner/writer
│   │   ├── GitService.ts        # simple-git wrapper
│   │   ├── PortRegistry.ts      # Port map + ghost detection
│   │   ├── WalletService.ts     # Helius + Jupiter price
│   │   ├── GmailService.ts      # OAuth + Gmail API
│   │   ├── ImageGenService.ts   # Gemini imagen-3
│   │   ├── OvernightEngine.ts   # Phase runner + state machine
│   │   ├── DispatchService.ts   # Telegram + Discord bot processes
│   │   ├── VoiceProfile.ts      # Tweet voice config
│   │   ├── ServiceManager.ts    # User services (PM2-style)
│   │   ├── ARIAAgent.ts         # ARIA orchestration layer
│   │   └── ContextBridgeServer.ts # Express :7337
│   └── db/
│       ├── schema.ts            # All table definitions
│       ├── migrations.ts        # Version-based schema migrations
│       └── db.ts                # better-sqlite3 singleton (WAL mode)
│
├── src/
│   ├── App.tsx                  # Root layout
│   ├── store/
│   │   ├── projects.ts
│   │   ├── agents.ts
│   │   ├── terminals.ts         # Active sessions by project ID
│   │   ├── ui.ts                # Active panel, active project, overlays
│   │   └── wallet.ts
│   ├── components/
│   │   ├── Toggle.tsx           # Reusable toggle — on/off state
│   │   ├── Dot.tsx              # Status dot — color + size props
│   │   ├── Tooltip.tsx          # Terminal tab hover preview
│   │   └── NotificationCard.tsx # ARIA notification cards
│   └── panels/
│       ├── Titlebar/            # Project tabs + status + spend
│       ├── IconSidebar/         # 48px nav column
│       ├── LeftPanel/           # Projects list + file explorer
│       ├── Editor/              # Monaco wrapper + tab manager
│       ├── Terminal/            # xterm.js + tab system
│       ├── RightPanel/          # Tab container
│       │   ├── ClaudeTab/       # MCP, usage, chat, CLAUDE.md button
│       │   ├── PortsTab/        # Localhost + infra manager
│       │   ├── ProcessTab/      # Process list + overnight config
│       │   ├── DispatchTab/     # Telegram/Discord session cards
│       │   └── ARIATab/         # Ops view for multi-project dispatch
│       ├── AgentLauncher/       # Overlay from + button
│       ├── AgentRoom/           # Multi-agent visual workspace
│       ├── ImageGen/            # Bottom-right pill widget
│       ├── TweetGenerator/      # Voice-aware tweet drafting
│       ├── Browser/             # WebContentsView wrapper
│       ├── Gmail/               # Code catcher + inbox
│       ├── Wallet/              # SOL balance + holdings
│       ├── Git/                 # Branch, commits, PRs
│       ├── EnvManager/          # Unified .env view
│       ├── Remotion/            # BrowserView for localhost Remotion
│       ├── Services/            # User services panel
│       ├── Telegram/            # Full Telegram client
│       ├── Subscriptions/       # API subscription tracker
│       └── MorningBriefing/     # Full-screen overnight report overlay
│
├── extension/                   # Chrome/Brave extension
│   ├── manifest.json            # MV3
│   ├── background.ts
│   ├── content.ts               # Sidebar injection
│   └── sidebar/
│
├── CLAUDE.md                    # This file
├── CLAUDE_FLAGS.md              # Verified Claude Code CLI flag reference
└── styles/
    ├── tokens.css               # CSS variables
    ├── base.css                 # Reset + global
    └── fonts.css
```

---

## IPC Pattern

Every domain follows this exact pattern. Do not deviate.

```typescript
// electron/ipc/agents.ts — main process handler
import { ipcMain } from 'electron';
import { db } from '../db/db';

export function registerAgentHandlers() {
  ipcMain.handle('agents:list', async () => {
    try {
      return { ok: true, data: db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all() };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('agents:create', async (_event, agent) => {
    try {
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO agents (id, name, system_prompt, model, mcps, project_id, shortcut) VALUES (?,?,?,?,?,?,?)')
        .run(id, agent.name, agent.systemPrompt, agent.model, JSON.stringify(agent.mcps), agent.projectId, agent.shortcut);
      return { ok: true, data: { id } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}

// electron/preload.ts — exposed to renderer
contextBridge.exposeInMainWorld('daemon', {
  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
    create: (agent) => ipcRenderer.invoke('agents:create', agent),
    update: (id, data) => ipcRenderer.invoke('agents:update', id, data),
    delete: (id) => ipcRenderer.invoke('agents:delete', id),
    spawn: (id) => ipcRenderer.invoke('agents:spawn', id),
  },
  // ... other domains
});

// src/panels/AgentLauncher/index.tsx — renderer usage
const { data: agents } = await window.daemon.agents.list();
// Always check response.ok before using .data
```

---

## Monaco Offline Configuration

**This must be done before any window is created. If you forget this, Monaco shows a blank white box in production.**

```typescript
// electron/protocol.ts
import { protocol } from 'electron';
import path from 'path';

export function registerMonacoProtocol() {
  // protocol.registerFileProtocol is deprecated as of Electron 25.
  // Use protocol.handle for Electron 25+ (this project targets Electron 31+).
  protocol.handle('monaco-worker', (request) => {
    const url = request.url.slice('monaco-worker://'.length);
    const filePath = path.join(__dirname, '../node_modules/monaco-editor/min/vs', url);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}
// Required import in main.ts: import { net } from 'electron'; import { pathToFileURL } from 'url';

// electron/main.ts — call BEFORE app.whenReady()
registerMonacoProtocol();

// src/editor/Monaco.tsx — call BEFORE any Monaco import
import { loader } from '@monaco-editor/react';
loader.config({ paths: { vs: 'monaco-worker://vs' } });
```

---

## Terminal Architecture

```typescript
// electron/ipc/terminal.ts — main process
// node-pty runs here, never in renderer

const sessions = new Map<string, IPty>();

ipcMain.handle('terminal:create', async (_event, { projectPath, agentId }) => {
  const id = crypto.randomUUID();
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  
  const pty = spawn(shell, [], {
    name: 'xterm-256color',
    cols: 120, rows: 30,
    cwd: projectPath,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      DAEMON_PROJECT: projectPath,
      PROMPT_COMMAND: 'echo "DAEMON_CWD:$(pwd)"', // for tab label tracking
    }
  });
  
  sessions.set(id, pty);
  
  pty.onData((data) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('terminal:data', { id, data });
  });
  
  pty.onExit(({ exitCode }) => {
    sessions.delete(id);
    BrowserWindow.getAllWindows()[0]?.webContents.send('terminal:exit', { id, exitCode });
    db.prepare('DELETE FROM active_sessions WHERE terminal_id = ?').run(id);
  });
  
  db.prepare('INSERT INTO active_sessions (id, project_path, agent_id, started_at) VALUES (?,?,?,?)')
    .run(id, projectPath, agentId ?? null, Date.now());
  
  return { ok: true, data: { id } };
});

ipcMain.on('terminal:write', (_event, id: string, data: string) => {
  sessions.get(id)?.write(data);
});
```

---

## Claude Agent Spawn Pattern

**Important: `--mcp` and `--context-file` do not exist as Claude CLI flags.**
MCPs are configured via `.claude/settings.json`. Context is passed via `--append-system-prompt-file`.
See `CLAUDE_FLAGS.md` for the full verified reference.

```typescript
// electron/services/ClaudeManager.ts
import fs from 'fs';
import path from 'path';
import os from 'os';

export function buildClaudeCommand(agent: Agent, project: Project): {
  command: string;
  args: string[];
  contextFilePath: string;
} {
  // Write context to temp file — passed via --append-system-prompt-file
  // This flag exists and does exactly what --context-file was intended to do
  const portMap = getProjectPortMap(project.id);

  const contextContent = [
    agent.system_prompt,
    '',
    `--- DAEMON CONTEXT ---`,
    `Project: ${project.name}`,
    `Path: ${project.path}`,
    portMap ? `Port map: ${portMap}` : '',
    project.session_summary ? `Last session summary: ${project.session_summary}` : '',
    `--- END CONTEXT ---`,
  ].filter(Boolean).join('\n');

  const contextFilePath = path.join(
    os.tmpdir(),
    `daemon_agent_${agent.id}_${Date.now()}.txt`
  );
  fs.writeFileSync(contextFilePath, contextContent, 'utf8');

  // Write MCPs to project's .claude/settings.json
  // MCPs are NOT CLI flags — they are configured per-project in settings.json
  writeProjectMcpSettings(project.path, JSON.parse(agent.mcps));

  const args: string[] = [
    '--model', agent.model,                          // e.g. 'claude-opus-4-20250514'
    '--append-system-prompt-file', contextFilePath,  // appends to, not replaces, built-in prompt
  ];

  return { command: 'claude', args, contextFilePath };
}

function writeProjectMcpSettings(projectPath: string, mcps: string[]) {
  const settingsDir = path.join(projectPath, '.claude');
  const settingsPath = path.join(settingsDir, 'settings.json');

  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try { existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}
  }

  const mcpServers = buildMcpServersBlock(mcps); // looks up each MCP config from SQLite

  const updated = {
    ...existing,
    mcpServers: { ...(existing.mcpServers as object ?? {}), ...mcpServers },
  };

  fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2), 'utf8');
}
```

**Spawn via node-pty:**
```typescript
const { command, args, contextFilePath } = buildClaudeCommand(agent, project);

const ptyProcess = pty.spawn(command, args, {
  name: 'xterm-256color',
  cols: 120, rows: 30,
  cwd: project.path,   // ALWAYS project path, never DAEMON's own cwd
  env: { ...process.env, TERM: 'xterm-256color' }
});

ptyProcess.onExit(() => {
  try { fs.unlinkSync(contextFilePath); } catch {} // clean up temp file
});
```

---

## MCP Config (Claude Panel)

**MCP toggles write to `.claude/settings.json` in the project directory — not `claude_desktop_config.json`.**
`claude_desktop_config.json` is for the Claude Desktop app (separate product). Claude Code CLI reads `.claude/settings.json`.

```typescript
// electron/services/McpConfig.ts

export function toggleMcp(projectPath: string, mcpName: string, enabled: boolean) {
  const settingsPath = path.join(projectPath, '.claude', 'settings.json');
  const settings = readSettings(settingsPath);

  if (enabled) {
    const mcpConfig = db.prepare('SELECT * FROM mcp_registry WHERE name = ?').get(mcpName);
    settings.mcpServers = settings.mcpServers ?? {};
    settings.mcpServers[mcpName] = JSON.parse(mcpConfig.config);
  } else {
    delete settings.mcpServers?.[mcpName];
  }

  writeSettings(settingsPath, settings);
  // Claude Code picks up settings.json on next session start.
  // Show "Restart session to apply" indicator in UI after any toggle.
}
```

---

## Database Schema (Complete)

```sql
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  system_prompt TEXT,
  model TEXT DEFAULT 'claude-opus-4-20250514',   -- always use versioned string
  mcps TEXT DEFAULT '[]',
  project_id TEXT,
  shortcut TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  git_remote TEXT,
  default_agent_id TEXT,
  status TEXT DEFAULT 'idle',
  session_summary TEXT,
  infra TEXT DEFAULT '{}',
  aliases TEXT DEFAULT '[]',
  created_at INTEGER DEFAULT (unixepoch()),
  last_active INTEGER
);

CREATE TABLE IF NOT EXISTS active_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  agent_id TEXT,
  terminal_id TEXT,
  pid INTEGER,
  started_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS ports (
  port INTEGER NOT NULL,
  project_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  pid INTEGER,
  registered_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (port, project_id)
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  prompt TEXT,
  model TEXT,
  project_id TEXT,
  tags TEXT DEFAULT '[]',
  source TEXT DEFAULT 'generated',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS tweets (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  mode TEXT,
  source_tweet TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS voice_profile (
  id TEXT PRIMARY KEY DEFAULT 'default',
  system_prompt TEXT NOT NULL,
  examples TEXT DEFAULT '[]',
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cwd TEXT NOT NULL,
  command TEXT NOT NULL,
  auto_restart INTEGER DEFAULT 1,
  auto_start INTEGER DEFAULT 0,
  health_check_url TEXT,
  env_overrides TEXT DEFAULT '{}',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS crash_history (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  exit_code INTEGER,
  error_signature TEXT,
  error_summary TEXT,
  fix_applied TEXT,
  fix_worked INTEGER,
  auto_fixed INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS mcp_registry (
  name TEXT PRIMARY KEY,
  config TEXT NOT NULL,          -- JSON: {command, args, env}
  description TEXT,
  is_global INTEGER DEFAULT 0    -- 1 = installed globally via claude mcp add
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_cost REAL,
  renewal_day INTEGER,
  usage_limit REAL,
  usage_current REAL,
  alert_at REAL DEFAULT 0.8,
  url TEXT,
  api_key_hint TEXT
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  service TEXT PRIMARY KEY,
  access_token TEXT,
  refresh_token TEXT,
  expiry INTEGER
);

CREATE TABLE IF NOT EXISTS overnight_runs (
  id TEXT PRIMARY KEY,
  started_at INTEGER,
  ended_at INTEGER,
  phases TEXT DEFAULT '{}',
  token_cost REAL DEFAULT 0,
  briefing TEXT,
  status TEXT DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS dispatch_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  context_bundle TEXT,
  dispatched_at INTEGER DEFAULT (unixepoch()),
  depth TEXT DEFAULT 'standard'
);

CREATE TABLE IF NOT EXISTS notification_rules (
  id TEXT PRIMARY KEY,
  condition_text TEXT NOT NULL,
  priority TEXT DEFAULT 'surface',
  source TEXT,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS aria_interactions (
  id TEXT PRIMARY KEY,
  input TEXT NOT NULL,
  parsed_tasks TEXT,
  outcome TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
```

---

## ARIA Agent Architecture

ARIA is Claude (Haiku for fast operations, Opus for complex reasoning) with full app state awareness.

```typescript
// electron/services/ARIAAgent.ts

const ARIA_SYSTEM = `
You are ARIA, the co-pilot agent for DAEMON. You have full awareness of:
- All open projects and their current status
- Active Claude sessions and what they're working on  
- Running services and their health
- The user's calendar, Gmail (if connected), and Solana wallet
- All configured agents and their capabilities

You operate in two modes:
1. COMMAND: User gives you an instruction — you parse it, dispatch agents/actions, report back
2. PROACTIVE: You monitor for events matching notification rules, surface what matters

Rules:
- Always confirm before irreversible actions (send email, push code, make purchase)
- When uncertain which project the user means, ask once — never guess
- Never spawn more than 6 parallel agents
- Always report token cost of multi-agent operations before and after
- Failures are reported honestly — never claim success without verification
`;

export async function processARIACommand(input: string): Promise<ARIAResponse> {
  const state = await captureFullState();
  
  const parsed = await callClaude('claude-haiku-4-5-20251001', ARIA_SYSTEM,
    `Current state: ${JSON.stringify(state)}\n\nUser command: ${input}\n\nParse into tasks. Return JSON.`
  );
  
  const tasks = JSON.parse(parsed);
  const results = await Promise.all(tasks.map(executeTask));
  
  db.prepare('INSERT INTO aria_interactions (id, input, parsed_tasks, outcome, created_at) VALUES (?,?,?,?,?)')
    .run(crypto.randomUUID(), input, JSON.stringify(tasks), JSON.stringify(results), Date.now());
  
  return { tasks, results };
}
```

---

## Context Bridge Server (localhost:7337)

```typescript
// electron/services/ContextBridgeServer.ts
import express from 'express';

export function startContextBridge() {
  const app = express();
  app.use(express.json());
  
  app.get('/context/active', (_req, res) => {
    const project = db.prepare('SELECT * FROM projects WHERE status = ?').get('active');
    const summary = project ? db.prepare('SELECT session_summary FROM projects WHERE id = ?').get(project.id) : null;
    res.json({ project, summary });
  });
  
  app.get('/context/file', (req, res) => {
    const { path: filePath } = req.query as { path: string };
    const project = getActiveProject();
    if (!project) return res.status(400).json({ error: 'no active project' });
    const fullPath = path.join(project.path, filePath);
    if (!fullPath.startsWith(project.path)) return res.status(403).json({ error: 'path traversal blocked' });
    res.json({ content: fs.readFileSync(fullPath, 'utf8') });
  });
  
  app.post('/notify', (req, res) => {
    const { title, message, priority = 'surface', actions = [] } = req.body;
    BrowserWindow.getAllWindows()[0]?.webContents.send('notification:push', { title, message, priority, actions });
    res.json({ ok: true });
  });
  
  app.listen(7337, '127.0.0.1', () => {
    console.log('Context bridge running on localhost:7337');
  });
}
```

---

## Critical Windows Gotchas

```typescript
async function getListeningPorts() {
  if (process.platform === 'win32') {
    const { stdout } = await exec('netstat -ano | findstr LISTENING');
    return parseNetstatOutput(stdout);
  } else {
    const { stdout } = await exec('lsof -i -P -n | grep LISTEN');
    return parseLsofOutput(stdout);
  }
}

async function killByPid(pid: number) {
  if (process.platform === 'win32') {
    await exec(`taskkill /PID ${pid} /F`);
  } else {
    process.kill(pid, 'SIGTERM');
    setTimeout(() => { try { process.kill(pid, 'SIGKILL'); } catch {} }, 3000);
  }
}

const shell = process.platform === 'win32' ? 'powershell.exe' :
              process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
```

---

## electron-builder.yml

```yaml
appId: com.daemon.app
productName: DAEMON
directories:
  output: dist
files:
  - dist-electron
  - dist
  - node_modules
asarUnpack:
  - node_modules/better-sqlite3/**
  - node_modules/node-pty/**
  - node_modules/node-pty/build/**
extraFiles:
  - from: node_modules/better-sqlite3/build
    to: resources/better-sqlite3/build
mac:
  target: dmg
  category: public.app-category.developer-tools
win:
  target: nsis
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

---

## package.json Scripts

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "package": "npm run build && electron-builder",
    "postinstall": "electron-rebuild -f -w better-sqlite3,node-pty",
    "rebuild": "electron-rebuild -f -w better-sqlite3,node-pty",
    "test:packaged": "npm run package && open dist/mac/DAEMON.dmg"
  }
}
```

---

## Phase 1 Exit Criteria

A phase is not done when the code is written. A phase is done when all of these pass:

- [ ] `npm run package` produces a working .dmg or .exe with no errors
- [ ] Monaco renders a file offline (wifi disabled, packaged app open)
- [ ] Terminal: `pwd`, `ls`, `git status` all return correct output
- [ ] Terminal resize: drag window smaller — xterm reflows correctly
- [ ] SQLite: create a project, force-quit the app, relaunch — project still exists
- [ ] node-pty TERM: run `echo $TERM` — must return `xterm-256color`
- [ ] Design tokens applied: background is #090909, not default white/grey

---

## Pre-Seeded Data (First Run)

```typescript
// electron/db/migrations.ts

export function seedDefaultData() {
  const existing = db.prepare('SELECT COUNT(*) as count FROM agents').get() as { count: number };
  if (existing.count > 0) return;
  
  const defaultAgents = [
    {
      id: 'daemon-debug',
      name: 'DAEMON Debug',
      system_prompt: 'You are a debug agent for the DAEMON application itself. Architecture is at ~/.daemon/. Diagnose and fix issues with this Electron app. You have full filesystem access.',
      model: 'claude-opus-4-20250514',
      mcps: JSON.stringify(['filesystem']),
      shortcut: 'cmd+shift+d'
    },
    {
      id: 'security-audit',
      name: 'Security Audit',
      system_prompt: 'You perform security audits. Read-only mode — never write to files. Look for: reentrancy, missing signer validation, integer overflow, auth bypasses.',
      model: 'claude-opus-4-20250514',
      mcps: JSON.stringify(['filesystem']),
      shortcut: 'cmd+2'
    },
    {
      id: 'code-review',
      name: 'Code Review',
      system_prompt: 'You review and clean up code. Remove dead code, improve naming, add missing error handling, fix obvious bugs. Conservative changes only.',
      model: 'claude-sonnet-4-20250514',
      mcps: JSON.stringify(['filesystem']),
      shortcut: 'cmd+3'
    },
    {
      id: 'git-agent',
      name: 'Git Agent',
      system_prompt: 'You manage git operations. Summarize recent changes, write clear commit messages, stage and commit files. Never push unless explicitly told to.',
      model: 'claude-haiku-4-5-20251001',
      mcps: JSON.stringify(['filesystem']),
      shortcut: 'cmd+4'
    },
    {
      id: 'test-runner',
      name: 'Test Runner',
      system_prompt: 'You run tests and report results clearly. Run the test suite, identify failures, explain what is failing and why. Do not attempt to fix — report only.',
      model: 'claude-haiku-4-5-20251001',
      mcps: JSON.stringify(['filesystem']),
      shortcut: 'cmd+5'
    }
  ];
  
  const defaultVoiceProfile = {
    id: 'default',
    system_prompt: `Write tweets for a solo Solana developer and builder.
Style: punchy, lowercase, CT-native, no corporate cringe, no hashtags.
Never use emojis unless ironic. Under 240 chars unless threading.
Builder > marketer. Reference real Solana/crypto context when relevant.
Sound like someone who ships, not someone who talks about shipping.`,
    examples: JSON.stringify([])
  };
  
  const defaultNotificationRules = [
    { condition_text: 'from someone I replied to in the last 7 days', priority: 'interrupt', source: 'gmail' },
    { condition_text: 'invoice, payment, verification, or API key email', priority: 'interrupt', source: 'gmail' },
    { condition_text: 'SOL price moves more than 5% in one hour', priority: 'surface', source: 'market' },
    { condition_text: 'overnight agent found critical errors', priority: 'interrupt', source: 'overnight' },
    { condition_text: 'meeting in 30 minutes', priority: 'interrupt', source: 'calendar' },
    { condition_text: 'service crashed', priority: 'interrupt', source: 'services' },
  ];

  // Insert all defaults...
}
```

---

## Wallet Architecture

```typescript
// electron/services/WalletService.ts
import { Connection, PublicKey } from '@solana/web3.js';

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const connection = new Connection(HELIUS_RPC, 'confirmed');

export async function getPortfolio(walletAddress: string) {
  const pubkey = new PublicKey(walletAddress);
  
  const [solBalance, tokenAccounts] = await Promise.all([
    connection.getBalance(pubkey),
    connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID })
  ]);
  
  const mints = tokenAccounts.value.map(a => a.account.data.parsed.info.mint);
  const prices = await getJupiterPrices([SOL_MINT, ...mints]);
  
  return buildPortfolio(solBalance, tokenAccounts, prices);
}

async function getJupiterPrices(mints: string[]) {
  const ids = mints.join(',');
  const res = await fetch(`https://price.jup.ag/v6/price?ids=${ids}`); // v4 is deprecated
  return (await res.json()).data;
}

// Signing — always confirmation modal, zeros memory after use
async function signWithKeypair(tx: Transaction, keypairPath: string): Promise<string> {
  const keypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8')))
  );
  tx.sign(keypair);
  const sig = await connection.sendRawTransaction(tx.serialize());
  keypair.secretKey.fill(0); // zero memory immediately — note: Node.js does not guarantee
                              // this buffer wasn't copied elsewhere first. Do not rely on
                              // this as a hard security guarantee. For higher security,
                              // prefer Phantom deep link signing instead.
  return sig;
}
```

---

## Quality Gates

After every major code change (completing a phase, adding a new panel, or refactoring core systems), run a full audit before moving on:

1. **Code Review Agent** — spawn the code-reviewer agent to scan for SQL injection, type mismatches, dead code, orphaned files, IPC inconsistencies, and CSS drift
2. **Research Agent** — spawn the Explore agent to verify current best practices for any new dependencies or patterns introduced
3. **TypeScript Check** — run `npx tsc --noEmit` and fix all errors
4. **Test in Electron** — verify the app launches clean (no console errors beyond Autofill DevTools warnings)

Do not proceed to the next phase until all critical and high-severity issues from the audit are resolved.

---

## Current State

*Update this section at the end of every Claude Code session.*

**Last updated:** 2026-03-30

**Phases complete:**
- [x] Phase 1 — Shell (Monaco + terminal + SQLite + file explorer + project tabs)
- [x] Phase 2 — Agent Launcher (agent CRUD, spawn Claude with context, terminal tabs with agent names)
- [x] Phase 3 — Claude Panel (MCP management, usage stats, CLAUDE.md tools)
- [x] Phase 4 — Process Manager
- [x] Phase 5 — Env Manager
- [x] Phase 6 — Localhost + Infrastructure Manager
- [x] Phase 7 — Git Panel
- [x] Phase 8 — Wallet Panel

**Phases in progress:**
- None

**Known issues from last session:**
- Monaco keybinding uses imported `monaco.KeyMod` — verify it works at runtime
- `chokidar`, `express`, `ps-list`, `simple-git` in dependencies but unused until future phases
- node-pty built with ConPTY-only patch (winpty target removed) — document in postinstall
- Wallet flows still need live runtime verification against a configured Helius session

**Next session should start with:**
- Phase 9: Image Generator or a stabilization pass

**API keys configured:**
- [ ] ANTHROPIC_API_KEY
- [ ] ANTHROPIC_ADMIN_KEY
- [ ] GEMINI_API_KEY
- [ ] HELIUS_API_KEY
- [ ] GITHUB_TOKEN

**Platform:**
- OS: Windows (primary)
- Node: [version]
- Electron: [version]

---

## References

- Full plan: `DAEMON_MASTER_PLAN.md`
- **CLI flags (verified):** `CLAUDE_FLAGS.md` ← read this before touching ClaudeManager.ts
- Boilerplate: `github.com/electron-vite/electron-vite-react`
- Monaco offline: `jameskerr.blog/posts/offline-monaco-editor-in-electron`
- node-pty Electron example: `github.com/microsoft/node-pty/tree/main/examples/electron`
- Playwright CDP: `playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp`
- GramJS (Telegram): `gram.js.org`
- Anthropic usage API: `platform.claude.com/docs/en/build-with-claude/usage-cost-api`
