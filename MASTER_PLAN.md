# NULLPAD — Master Build Plan v3
*Research-verified. All broken references fixed. Phases reordered for best build sequence.*
*Last updated: March 2026*

---

## What NULLPAD Is

A custom Electron IDE built on Monaco Editor for the AI-native solo developer. VS Code layout and muscle memory, but every panel purpose-built: Claude Code sessions, multi-agent orchestration, Solana wallet, localhost manager, image gen, Gmail codes, context-aware extension, and autonomous overnight engine.

Built for yourself first. Every setting configurable. Nothing hardcoded.

---

## ⚠ Known Broken References — Fixed in This Document

| Was in v1/v2 | Reality | Fix Applied |
|---|---|---|
| `--mcp <name>` CLI flag | Does not exist | MCPs go in `.claude/settings.json` |
| `--context-file <path>` CLI flag | Does not exist | Use `--append-system-prompt-file` |
| `claude_desktop_config.json` for MCP | Wrong file — that's Claude Desktop app | Use `.claude/settings.json` |
| `imagen-3.0-generate-002` | **Shut down by Google** | Use `imagen-4.0-generate-001` |
| Gemini SDK: `@google/generative-ai` + `getGenerativeModel()` | Wrong package + wrong method for image gen | Use `@google/genai` + `ai.models.generateImages()` |
| Gmail OAuth: `urn:ietf:wg:oauth:2.0:oob` | **Blocked by Google since Feb 2023** | Loopback localhost flow only |
| Model strings: `claude-opus-4`, `claude-sonnet-4`, `claude-haiku-4-5` | Unversioned — unreliable in automated spawning | Use full versioned strings |

All fixes are applied inline throughout this document.

---

## Design System

### Aesthetic Direction
Apple-simple. Clean black and white. Dense but never cluttered. No emoji in UI chrome. Status via 5px dots and muted color only.

### Typography
- **UI**: Plus Jakarta Sans — friendly, modern, legible at 11-13px
- **Code**: JetBrains Mono — best coding font at small sizes
- Both loaded from Google Fonts on first run, cached locally

### Color Palette
```css
--bg:    #090909;
--s1:    #101010;
--s2:    #151515;
--s3:    #1a1a1a;
--s4:    #222222;
--s5:    #2a2a2a;
--t1:    #ebebeb;
--t2:    #7a7a7a;
--t3:    #3d3d3d;
--green: #4a8c62;
--amber: #8c7a4a;
--red:   #8c4a4a;
```

### Layout
- Titlebar: 38px
- Icon sidebar: 48px
- Left panel: 210px
- Editor: flex 1
- Right panel: 262px — tabbed
- Status bar: 22px

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Shell | Electron 31+ | Latest stable |
| Build | electron-vite | `pnpm create @quick-start/electron . --template react-ts` |
| Boilerplate | electron-vite-react | github.com/electron-vite/electron-vite-react |
| UI | React 18 + TypeScript | CSS Modules — no Tailwind |
| Editor | Monaco Editor | Requires offline protocol handler — see Phase 1 |
| Terminal | node-pty + xterm.js | node-pty on main, xterm on renderer, IPC bridge |
| State | Zustand | One store per domain |
| DB | better-sqlite3 | Main process only, WAL mode |
| Git | simple-git | No native compilation needed |
| Process detection | ps-list | Cross-platform |
| File watching | chokidar | Images, .env, CLAUDE.md |
| Local server | express | Context bridge on localhost:7337 |
| Image gen | @google/genai | See Phase 6 — correct package |
| Packaging | electron-builder | .dmg + .exe |

### Critical native module note
`node-pty` and `better-sqlite3` are C++ native modules. After every `npm install`:
```bash
./node_modules/.bin/electron-rebuild
```
And in `electron-builder.yml`:
```yaml
asarUnpack:
  - node_modules/better-sqlite3/**
  - node_modules/node-pty/**
```

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  system_prompt TEXT,
  model TEXT DEFAULT 'claude-opus-4-20250514',
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
  wallet_id TEXT,
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

CREATE TABLE IF NOT EXISTS mcp_registry (
  name TEXT PRIMARY KEY,
  config TEXT NOT NULL,
  description TEXT,
  is_global INTEGER DEFAULT 0
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

CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  keypair_path TEXT,
  is_default INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  total_usd REAL,
  sol_balance REAL,
  tokens TEXT,
  snapshot_at INTEGER DEFAULT (unixepoch())
);

-- Future: Economic Layer
CREATE TABLE IF NOT EXISTS protocol_revenue (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  amount_sol REAL,
  amount_usd REAL,
  snapshot_at INTEGER DEFAULT (unixepoch())
);

-- Future: Not-Tonight Queue
CREATE TABLE IF NOT EXISTS queue_items (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  bucket TEXT DEFAULT 'tonight',   -- 'tonight' | 'tomorrow' | 'someday'
  project_id TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  completed_at INTEGER
);

-- Future: Prompt Pattern Library
CREATE TABLE IF NOT EXISTS prompt_patterns (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  agent_id TEXT,
  project_id TEXT,
  tags TEXT DEFAULT '[]',
  outcome_notes TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
```

---

## IPC Architecture

All DB and OS calls in main process. Renderer talks through IPC only.

Every handler follows this exact pattern:
```typescript
ipcMain.handle('domain:action', async (_event, ...args) => {
  try {
    const result = doWork(...args);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});
```

Renderer always checks `response.ok` before using `response.data`.

---

## Claude Agent Spawn Pattern (Verified)

`--mcp` and `--context-file` do not exist. This is the correct implementation:

```typescript
// electron/services/ClaudeManager.ts
export function buildClaudeCommand(agent: Agent, project: Project) {
  // Context goes via --append-system-prompt-file (this flag exists)
  const contextContent = [
    agent.system_prompt,
    `\n--- NULLPAD CONTEXT ---`,
    `Project: ${project.name}`,
    `Path: ${project.path}`,
    getProjectPortMap(project.id),
    project.session_summary ? `Last session: ${project.session_summary}` : '',
  ].filter(Boolean).join('\n');

  const contextFilePath = path.join(os.tmpdir(), `nullpad_${agent.id}_${Date.now()}.txt`);
  fs.writeFileSync(contextFilePath, contextContent, 'utf8');

  // MCPs go in .claude/settings.json — NOT as CLI flags
  writeProjectMcpSettings(project.path, JSON.parse(agent.mcps));

  return {
    command: 'claude',
    args: ['--model', agent.model, '--append-system-prompt-file', contextFilePath],
    contextFilePath,
  };
}

function writeProjectMcpSettings(projectPath: string, mcps: string[]) {
  const settingsPath = path.join(projectPath, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

  let existing: any = {};
  try { existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}

  const mcpServers = buildMcpServersBlock(mcps); // look up each from mcp_registry table
  fs.writeFileSync(settingsPath, JSON.stringify({
    ...existing,
    mcpServers: { ...existing.mcpServers, ...mcpServers },
  }, null, 2));
}
```

MCP toggles in the Claude panel write to `.claude/settings.json` in the project directory. Changes take effect on next session start — show "Restart session to apply" after any toggle.

---

---

# PHASE BUILD PLAN

## Build Order Rationale

Phases are ordered by: daily usability unlocked, risk level, and dependency chain.
The first 8 phases make NULLPAD your primary IDE. Phases 9-13 add the integrations you'll use every day. Phases 14-15 are medium complexity but high value. Everything after that is in Future Features — build those after you've used the core for 4-6 weeks.

---

## Phase 1 — Shell · Est. 3-5 hours (Claude Code)
*Get something you can use*

**Goal:** Electron window running. Monaco working offline. Real terminal. Project tabs.

**Tasks:**
1. Scaffold: `pnpm create @quick-start/electron nullpad --template react-ts`
2. Monaco offline protocol handler — must be registered before `app.whenReady()`
3. node-pty terminal bridge — main spawns PTY, renderer xterm, IPC data flows
4. Frameless window + custom titlebar
5. Left panel: file explorer via recursive `fs.readdir`
6. better-sqlite3 setup + schema migration on first launch
7. CSS design tokens from color palette above

**Exit criteria — all must pass before Phase 2:**
- [ ] `npm run package` produces working .dmg/.exe
- [ ] Monaco renders a file offline (wifi off, packaged app)
- [ ] `echo $TERM` in terminal returns `xterm-256color`
- [ ] `pwd`, `ls`, `git status` all work in terminal
- [ ] Window resize — terminal reflows correctly
- [ ] Create a project, force-quit, relaunch — project persists in SQLite
- [ ] Background is #090909

---

## Phase 2 — Agent Launcher · Est. 1-2 hours (Claude Code)
*The feature that makes this different from VS Code*

**Goal:** `+` button opens agent panel. Click agent → Claude boots with correct context.

**Tasks:**
1. `agents` SQLite table + IPC CRUD
2. `buildClaudeCommand()` — see verified pattern above. No `--mcp` flags.
3. Agent launcher overlay UI — icon, name, description, keyboard shortcut
4. Terminal tab: `● project · agent-name` — dot color = session status
5. Tab hover tooltip: last output line from xterm buffer
6. `Cmd+Shift+A` fuzzy search (fuse.js)
7. Pre-seed 5 default agents on first run

**Pre-seeded agents (verified model strings):**
```json
[
  { "id": "nullpad-debug", "name": "NULLPAD Debug",
    "model": "claude-opus-4-20250514", "shortcut": "cmd+shift+d" },
  { "id": "security-audit", "name": "Security Audit",
    "model": "claude-opus-4-20250514", "shortcut": "cmd+2" },
  { "id": "code-review", "name": "Code Review",
    "model": "claude-sonnet-4-20250514", "shortcut": "cmd+3" },
  { "id": "git-agent", "name": "Git Agent",
    "model": "claude-haiku-4-5-20251001", "shortcut": "cmd+4" },
  { "id": "test-runner", "name": "Test Runner",
    "model": "claude-haiku-4-5-20251001", "shortcut": "cmd+5" }
]
```

**Enhancement — Session Intelligence Card:**
Before spawning an agent, surface a "where you left off" card: git diff since last session, files touched, unresolved terminal errors, session cost. One click injects it as context. The difference between starting at 100% and starting at 60%. Data is already in SQLite — just needs a UI layer. Store last-session snapshot in `projects.session_summary` on PTY exit.

**Exit criteria:**
- [ ] Spawn agent — terminal opens in correct project directory (`pwd` confirms)
- [ ] Spawn 4 agents simultaneously — all 4 terminals work independently
- [ ] Tab dot is green when running, amber when busy
- [ ] Edit agent system prompt — next spawn uses updated prompt

---

## Phase 3 — Claude Panel · Est. 1-2 hours (Claude Code)
*MCP control center + context awareness*

**Goal:** Right panel Claude tab fully functional.

**MCP toggle note:** Toggles write to `.claude/settings.json` in the project directory — NOT to `claude_desktop_config.json` (that's the Claude Desktop app, unrelated). After any toggle, show "Restart session to apply changes." The Restart button kills the active PTY and respawns — that's when new settings are read.

**Tasks:**
1. MCP toggle UI → writes/reads `.claude/settings.json`
2. Quick-add MCP: registry of common servers (filesystem, GitHub, Helius, Vercel, Puppeteer)
3. Restart Claude button: kill active PTY, respawn with same agent config
4. Anthropic status: poll `https://status.anthropic.com/api/v2/status.json` every 5 min
5. Usage stats: Anthropic usage API (requires Admin key — verify current endpoint before building)
6. CLAUDE.md update button:
   - Read current `CLAUDE.md`
   - Run `git diff HEAD~5`
   - Call Claude API to update
   - Monaco diff view — approve writes, reject discards
7. `+` tool/MCP button → command palette overlay

**Exit criteria:**
- [ ] Toggle MCP on → `.claude/settings.json` updated on disk
- [ ] Restart button → session restarts, new settings loaded
- [ ] Anthropic status pill shows real status
- [ ] CLAUDE.md diff appears, approve writes to disk

---

## Phase 4 — Process Manager · Est. 45 min (Claude Code)
*Stop the memory bleed*

**Goal:** See all Claude instances. Kill them from one place.

**Tasks:**
1. `ps-list` polling every 5s — filter for `claude` processes
2. Map PIDs to working directories via `lsof -p {pid}` (mac) / `/proc/{pid}/cwd` (linux) / `wmic` (windows)
3. Process panel UI: memory bar, per-instance rows, kill button
4. Kill: `SIGTERM` first, `SIGKILL` after 3s
5. Warning when any instance > 400MB
6. Focus button: find which terminal tab matches that working directory, switch to it

**Exit criteria:**
- [ ] Spawn 3 agents, close 1 — panel shows exactly 2 active
- [ ] Kill from panel — disappears within 5s
- [ ] Focus button switches to correct terminal tab

---

## Phase 5 — Env Manager · Est. 45 min (Claude Code)
*Moved earlier — high daily value, low complexity*

**Goal:** One unified view of all .env files across projects.

**Tasks:**
1. Scan all project dirs for `.env`, `.env.local`, `.env.production`, `.env.staging`
2. Parse into unified SQLite-backed view — file stays on disk, only metadata in DB
3. Table view: variable name, value (obscured by default), which projects have it
4. Edit inline → writes back to correct `.env` file
5. Auto-tag secrets: `sk-`, `_KEY`, `_TOKEN`, `_SECRET`
6. Copy value button
7. Quick-add: type var → select projects → writes to all selected `.env` files
8. Diff view: select two projects → see missing vars

**Exit criteria:**
- [ ] Add a var via UI — appears in actual .env file on disk
- [ ] Value is obscured by default — click to reveal
- [ ] Diff view shows correctly between two projects

---

## Phase 6 — Localhost + Infrastructure Manager · Est. 1-2 hours (Claude Code)
*Ends port confusion permanently*

**Goal:** Every project knows its ports. Claude knows too. Ghost servers visible and killable.

**Tasks:**
1. Port registry SQLite table + IPC CRUD
2. Per-project port config UI (service name + port number)
3. Ghost server detection — platform-specific:
   - Mac/Linux: `lsof -i -P -n | grep LISTEN`
   - Windows: `netstat -ano | findstr LISTENING`
4. Conflict detection: flag when two projects claim same port
5. Claude context injection: write port map to context file at agent spawn
6. Auto-register: parse Claude terminal stdout for "listening on port X"
7. Infrastructure panel: Railway, Vercel, Docker, Helius per project
8. API status checks: Railway `/v1/projects`, Vercel `/v9/projects/{id}`, Docker socket

8. **RPC health monitor:** Live Helius call counts, latency, error rates, and plan limit proximity — per project and in aggregate. Alert before rate-limited, not after. Especially valuable across multiple projects all hitting the same RPC endpoint. Surface in the infra panel alongside Railway/Vercel status.

**Exit criteria:**
- [ ] Kill ghost — process killed, disappears
- [ ] Spawn agent — terminal output includes port map

---

## Phase 7 — Git Panel · Est. 1 hour (Claude Code)

**Enhancement — Cost Per Commit:**
DAEMON knows every agent session and every git commit. Map them together: cost to produce each commit, cost per feature, which agents have the best output-to-burn ratio. Stored in SQLite — `active_sessions` cross-referenced with `git log`. Surface in git panel as a subtle cost annotation per commit. Changes how you use agents over time.

**Enhancement — Agent Blame:**
Cross-reference agent session logs with `git log` to show which agent wrote which code. "This function was written by Code Review agent, session #47, Tuesday 2am, cost $0.12." Useful for knowing which agents to trust with which task types. Builds on the same session → commit mapping as cost per commit.

**Tasks:**
2. Current branch, last commit, uncommitted file count
3. Stage/unstage files (checkbox per file)
4. Commit: input field → `git.commit()`
5. Push: `git.push()` with progress
6. GitHub API: list open PRs, show status checks
7. Branch switcher
8. Monaco diff editor for changed files (built into Monaco)

**Exit criteria:**
- [ ] Stage 2 files, commit — `git log` shows commit
- [ ] Push — progress shown, completes
- [ ] Changed file diff renders in Monaco

---

## Phase 8 — Wallet Panel · Est. 1 hour (Claude Code)
*You already built SolBlade — adapt it*

**Tasks:**
1. Connect wallet address (stored in SQLite)
2. SOL balance via Helius `getBalance`
3. USD price via Jupiter: `GET https://price.jup.ag/v4/price?ids=SOL`
4. Token holdings via `getTokenAccountsByOwner`
5. PnL: (current price - avg entry) × balance
6. Price refresh every 30s
7. Last 10 transactions via `getSignaturesForAddress`
8. Status bar: `12.84 SOL` — live
9. Per-project wallet assignment

**Exit criteria:**
- [ ] SOL balance loads within 3s
- [ ] Price refreshes without full panel reload
- [ ] Status bar shows balance

---

## Phase 9 — Image Generator · Est. 1-2 hours (Claude Code)

**⚠ Imagen 3 (`imagen-3.0-generate-002`) has been shut down by Google.**
Use Imagen 4. The SDK package has also changed.

**Correct implementation:**
```typescript
// Package: @google/genai (NOT @google/generative-ai)
import { GoogleGenAI } from '@google/genai';

async function generateImage(prompt: string, apiKey: string): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',    // Imagen 3 is shut down — use Imagen 4
    prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: '1:1',               // '1:1' | '16:9' | '4:3' | '9:16' | '3:4'
    },
  });

  const imageBytes = response.generatedImages[0].image.imageBytes;
  return Buffer.from(imageBytes, 'base64');
}
```

**Pricing (Imagen 4):**
- Fast: ~$0.02/image (`imagen-4.0-fast-generate-001`)
- Standard: ~$0.04/image (`imagen-4.0-generate-001`)
- Ultra: ~$0.06/image (`imagen-4.0-ultra-generate-001`)

**Tasks:**
1. Gemini API key stored in SQLite via `safeStorage.encryptString()`
2. Bottom-right pill widget — always visible
3. Expand on click: prompt input, style tags, aspect ratio
4. Auto-save to `~/Pictures/NULLPAD/generated/YYYY-MM/imagen4_{date}_{slug}.png`
5. Image library: grid view, filter by project/date/model/tag
6. Screenshot watcher via chokidar
7. Right-click → "Use as Claude context" → attach to session input

**Exit criteria:**
- [ ] Generate image — appears in panel and saves to correct path
- [ ] Screenshot auto-imports within 5s
- [ ] Grid view filters work

---

## Phase 10 — Gmail Code Catcher · Est. 1-2 hours (Claude Code)

**⚠ `urn:ietf:wg:oauth:2.0:oob` (out-of-band OAuth) is blocked by Google since February 2023.**
Use loopback localhost flow only.

**Correct OAuth flow:**
```typescript
import { google } from 'googleapis';
import http from 'http';

async function startGmailOAuth(clientId: string, clientSecret: string) {
  // Loopback flow — the only valid approach for desktop apps
  const PORT = 3742; // any available port
  const redirectUri = `http://127.0.0.1:${PORT}/oauth/callback`;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
  });

  // Open browser for consent
  shell.openExternal(authUrl);

  // Listen for the callback
  return new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1:${PORT}`);
      const code = url.searchParams.get('code');
      if (!code) { reject(new Error('no code')); return; }

      const { tokens } = await oauth2Client.getToken(code);
      // Store tokens in SQLite via safeStorage
      storeOAuthTokens('gmail', tokens);

      res.end('Authenticated. You can close this tab.');
      server.close();
      resolve();
    });
    server.listen(PORT, '127.0.0.1');
  });
}
```

**Register `http://127.0.0.1:3742/oauth/callback` in Google Cloud Console as an authorized redirect URI.**

**Tasks:**
1. OAuth loopback flow (above)
2. Token auto-refresh before expiry
3. Poll inbox every 60s for verification codes — regex `\b\d{4,8}\b`
4. Codes surface in notification area — click to copy
5. Auto-dismiss after 5 min
6. Unread count in status bar + sidebar badge
7. Full inbox panel: read/search, plain text render

**Exit criteria:**
- [ ] OAuth flow completes in browser, tokens stored
- [ ] Relaunch — Gmail loads without re-auth
- [ ] Send test verification email — code appears within 60s
- [ ] Click code — copied to clipboard

---

## Phase 11 — Tweet Generator · Est. 1 hour (Claude Code)

**Enhancement — Build In Public Auto-Draft:**
Every time you push to GitHub, DAEMON auto-drafts a tweet using your voice profile and the commit diff as context. Not posted — just surfaces as a draft card in the tweet panel. Raw material for building in public without having to write about what you built right after you built it. Connects Git Panel (Phase 7) + Tweet Generator.

**Tasks:**
2. Default voice prompt (tune over time)
3. Draft mode: prompt → Haiku API call → output card
4. Reply mode: paste tweet → response in your voice
5. Tone nudges: "simpler" / "more technical" / "punchier"
6. Thread mode: 3-5 tweet thread from single idea
7. Copy card — just the text, no labels
8. History: last 50 generated, searchable

**Model:** `claude-haiku-4-5-20251001` — fast, cheap, right for short-form

**Exit criteria:**
- [ ] Generate tweet — card appears under 3s
- [ ] Reply mode works
- [ ] History searchable

---

## Phase 12 — Subscription Manager · Est. 30 min (Claude Code)
*Low effort, high daily value — moved earlier*

Pre-loaded: Helius, QuickNode, Anthropic, OpenAI, Gemini, Vercel, GitHub, Supabase, Railway, Discord.

**Tasks:**
1. SQLite CRUD + UI
2. Monthly cost total
3. Renewal warning 7 days before
4. Usage threshold alert
5. Quick link to billing page per service

---

## Phase 13 — Remotion Panel · Est. 30 min (Claude Code)

**Tasks:**
1. Detect Remotion projects: scan for `remotion.config.ts`
2. One-click start: `spawn('npx', ['remotion', 'studio'], { cwd: project.path })`
3. Monitor stdout for ready signal
4. `WebContentsView` renders `http://localhost:3000`
5. Pass-through keyboard shortcuts
6. Stop button: kill process, unmount view
7. Auto-register port in registry

---

## Phase 14 — Browser + Playwright CDP · Est. 2-3 hours (Claude Code)

**Goal:** Persistent authenticated browser. Playwright connects to it — never has to log in.

```typescript
// main.ts — BEFORE app.whenReady()
app.commandLine.appendSwitch('remote-debugging-port', '9222');
app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');

// Wait for CDP before exposing to renderer
async function waitForCDP(): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
    try { await fetch('http://localhost:9222/json/version'); return true; }
    catch { await new Promise(r => setTimeout(r, 500)); }
  }
  return false;
}

// Playwright connection
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0]; // authenticated session
```

**Tasks:**
1. `WebContentsView` with persistent `userDataDir`
2. CDP debug port on launch
3. Browser panel UI: URL bar, nav, refresh, open-external
4. Playwright panel: Monaco script editor, run button, output panel
5. Element picker: hover highlights, click shows selector
6. Record mode: `playwright codegen` subprocess piped to Monaco
7. Auth state saver: `context.storageState()` → reuse

**Exit criteria:**
- [ ] `curl http://localhost:9222/json/version` returns version JSON
- [ ] Navigate, close, reopen — still logged in (persistent session)
- [ ] Element picker selects elements, generates working selectors

---

## Phase 15 — Context Bridge Extension · Est. 1-2 hours (Claude Code)

**Goal:** Claude that knows your project from any browser tab.

Express server on `:7337` already built (Phase 6 infra). This phase is the Chrome extension that connects to it.

**Manifest V3 extension:**
```json
{
  "manifest_version": 3,
  "name": "NULLPAD",
  "permissions": ["sidePanel", "activeTab"],
  "host_permissions": ["http://localhost:7337/*"],
  "side_panel": { "default_path": "sidebar.html" }
}
```

Extension pulls active project context from `:7337`, renders sidebar with project-aware Claude chat.

---

---

# FUTURE FEATURES
*Build these after using the core for 4-6 weeks. All have significant complexity or integration risk.*

---

## Future: Overnight Engine
State machine with phases: Observe → Clean → Agents → Content → Briefing. Triggered on screen lock within configured time window. All changes staged only — never auto-pushed. Per-phase token budget. Morning briefing card on first open.

**Why deferred:** Most complex phase in the plan (6-8 days human estimate). Token cost can spiral if agent loops. Needs solid process manager (Phase 4) and port manager (Phase 6) running stably first. Build when the rest of the app is solid.

**Time window guard (critical — prevents triggering at 2pm):**
```typescript
powerMonitor.on('lock-screen', () => {
  const hour = new Date().getHours();
  const { startHour, endHour } = getOvernightSettings();
  if (hour >= startHour || hour < endHour) {
    if (!engine.isRunning()) engine.start();
  }
});
```

---

## Future: NULLPAD Dispatch (Telegram + Discord bots)
Both bots run as managed child processes inside NULLPAD. Context bundle packaged at dispatch time. Auto-dispatch on screen lock. Morning briefing pushed via Telegram.

**Why deferred:** Requires Phase 4 (process manager) solid. Telegram/Discord bot management adds significant infra complexity. Context bundle packaging needs real sessions to draw from first.

---

## Future: ARIA — Ambient Personal Agent Layer
Global hotkey command mode + proactive monitoring. Gmail, Calendar, CDP browser, 1Password CLI. Multi-project orchestration: one sentence dispatches agents across all open projects in parallel.

**Why deferred:** Touches everything — Gmail, Calendar, browser, process manager, dispatch, wallet. Individual pieces are medium complexity. Hard part is the UX: confirmation flows, notification fatigue management, knowing when NOT to interrupt. Build after the core is solid and you have real usage patterns.

**ARIA self-healing:** Services crash → ARIA reads logs → spawns debug agent → fixes → restarts → monitors stability. Confidence scoring from crash history determines auto-fix vs. escalate. Build after Services panel.

---

## Future: Services Panel
PM2-style service manager for your bots and tools. Auto-restart, health checks, log streaming. Notification bridge via `POST localhost:7337/notify` — any service can push a card into NULLPAD with one HTTP call.

**Why deferred:** Medium complexity, but only valuable once you have services to manage. Build when you have 2-3 bots running.

---

## Future: Telegram Full Client (GramJS)
Full MTProto client via `telegram` npm package (GramJS). Read any conversation, send messages, real-time notifications. ARIA gains full Telegram read/write access.

**Why deferred:** GramJS MTProto implementation is complex. Real-time event handling across many conversations needs careful performance management. Build after ARIA is solid.

---

## Future: Personal Voice System
One voice config applied across Claude agents, tweets, and READMEs. Build after Tweet Generator has been used for a few weeks and the voice profile is tuned.

---

## Future: Multi-model Router
Claude vs GPT-4o vs Gemini side by side. Build only if you actually need it — Claude Code handles the heavy lifting.

---

## Future: Workspace Profiles
Save named layouts: "deep build", "content day", "launch day". Build after you know what your actual daily layouts are.

---

## Future: Ship Mode Layout
A dedicated launch-day workspace. Monitoring front and center — RPC health, error rates, on-chain activity, SOL price, token price. Git log. Terminal for hot fixes. Everything else collapsed. One click to switch into it. The opposite of the deep build layout. Implemented as a saved workspace profile once that system exists.

---

## Future: Not-Tonight Queue
Simple kanban: tonight / tomorrow / someday. Overnight Engine pulls exclusively from tonight's queue. ARIA populates it from your notes and Telegram messages throughout the day. Replaces the mental overhead of "what should I actually let it work on tonight." Three columns, drag to reorder, nothing more complex than that.

SQLite table: `queue_items (id, content, bucket, project_id, created_at, completed_at)`

---

## Future: Build Journal
Automatic log: what was built, when, agent used, session cost, which commits came out of it. Not a productivity dashboard — just a searchable record. Valuable six months from now when you're trying to remember why a decision was made, or want to write a thread about what you shipped. Data is already in SQLite across `active_sessions`, `overnight_runs`, and `aria_interactions` — this is mostly a UI and search layer on top.

---

## Future: Semantic Codebase Search
grep is structural. What you actually want sometimes is "find everywhere we handle transaction failures" — including code that does it differently, across all projects. Embed the codebase on first index via a local embedding model or API, re-embed on file change. One search box in DAEMON that understands intent, not just string matches. Cross-project. Useful for the kind of "where did I handle this before?" questions that happen constantly in a multi-project solo setup.

---

## Future: Blast Radius Indicator
Before an Overnight Engine or Agent Room run makes changes, estimate what else could break. "This change touches the Helius connection — also used by slurp, mpp-spl, and solblade." Static analysis cross-referenced with the port registry and shared dependency map. Prevents the "fixed one thing, broke three others" overnight surprise. Build when Overnight Engine and Agent Room exist.

---

## Future: Prompt Pattern Library
When an agent session produces something genuinely good — clean implementation, smart refactor — one click saves the prompt that produced it, tagged by project, agent, and outcome. Searchable. Reusable. You build up a personal library of prompts that work for your specific codebases and style, rather than rediscovering them every session. Stored in SQLite: `prompt_patterns (id, prompt, agent_id, project_id, tags, outcome_notes, created_at)`.

---

## Future: Economic Layer
You're building on Solana. Your apps make money or they don't. DAEMON already has wallet data — extend it to track on-chain protocol revenue alongside building activity. "You shipped the buyback engine Thursday. Protocol revenue up 11% over the weekend." SOL snapshots already in `portfolio_snapshots`. Add a `protocol_revenue` table keyed to project + timestamp. Surface as a timeline overlaying git commits and agent sessions. Closes the loop between building and outcomes — no other dev tool does this.

`protocol_revenue (id, project_id, amount_sol, amount_usd, snapshot_at)`

---

## Future: Agent Room
Multi-agent visual workspace with test-refine loop. Agents run in parallel columns, each seeing previous round's output. Stop conditions: tests pass or consensus reached. All changes staged, never committed. Cost estimate shown before run starts.

**Why deferred:** Coordination logic is tricky to get right. The failure modes (runaway loops, agents stepping on each other) need real usage patterns to design against. Build Phase 1-13 first, use them, then you'll know what you actually want here.

---

## API Keys Reference

| Key | Type | Used For |
|---|---|---|
| `ANTHROPIC_API_KEY` | Standard | Tweet gen, CLAUDE.md updater, ARIA |
| `ANTHROPIC_ADMIN_KEY` | Admin (`sk-ant-admin...`) | Usage stats endpoint |
| `GEMINI_API_KEY` | Google AI Studio | Image gen via `@google/genai` |
| `HELIUS_API_KEY` | Helius dashboard | Wallet data, tx history |
| `GITHUB_TOKEN` | github.com/settings/tokens | Git panel, PR list |
| Google OAuth | Google Cloud Console | Gmail — loopback flow only |
| `TELEGRAM_BOT_TOKEN` | BotFather | Dispatch bot (Future) |
| `DISCORD_BOT_TOKEN` | Discord Dev Portal | Dispatch bot (Future) |

All stored via `safeStorage.encryptString()`. Never in `.env`. Never logged. Display last 4 chars only.

---

## Build Order Summary

| # | Phase | CC Est. | Daily Value Unlocked |
|---|---|---|---|
| 1 | Shell — Monaco + terminal + SQLite | 3-5h | Usable editor |
| 2 | Agent Launcher | 1-2h | Core differentiator |
| 3 | Claude Panel — MCP toggles, usage, CLAUDE.md | 1-2h | Daily workflow friction gone |
| 4 | Process Manager | 45m | Memory hygiene |
| 5 | Env Manager | 45m | Unified .env view |
| 6 | Localhost + Infra Manager | 1-2h | Port confusion solved |
| 7 | Git Panel | 1h | Stage/commit from NULLPAD |
| 8 | Wallet Panel | 1h | SOL balance always visible |
| 9 | Image Generator (Imagen 4) | 1-2h | Never open browser for images |
| 10 | Gmail Code Catcher | 1-2h | 2FA codes in-app |
| 11 | Tweet Generator | 1h | Voice-aware drafting |
| 12 | Subscription Manager | 30m | API cost visibility |
| 13 | Remotion Panel | 30m | localhost preview in-app |
| 14 | Browser + Playwright CDP | 2-3h | Auth-free automation |
| 15 | Context Bridge Extension | 1-2h | Claude knows project in browser |
| — | **FUTURE** | — | — |
| F1 | Agent Room | — | Multi-agent collab |
| F2 | Overnight Engine | — | Autonomous overnight |
| F3 | Dispatch | — | Mobile handoff |
| F4 | ARIA | — | Personal agent layer |
| F5 | Services Panel + Self-healing | — | Managed processes |
| F6 | Telegram Full Client | — | Unified inbox |
| F7 | Ship Mode Layout | — | Launch-day workspace |
| F8 | Not-Tonight Queue | — | Overnight task control |
| F9 | Build Journal | — | Searchable build history |
| F10 | Semantic Codebase Search | — | Intent-based cross-project search |
| F11 | Blast Radius Indicator | — | Pre-run change impact estimate |
| F12 | Prompt Pattern Library | — | Reusable prompt archive |
| F13 | Economic Layer | — | On-chain revenue vs. building activity |

**Daily-driver (Phases 1-8): ~1 focused Claude Code session**
**Full core v1 (Phases 1-15): ~2 Claude Code sessions**
**Future features: build after 4-6 weeks of real usage**

---

## Known Hard Problems

**1. better-sqlite3 in packaged Electron**
Native module must be rebuilt for each Electron version. Use `electron-rebuild` in postinstall. Unpack from asar. Always test packaged build.

**2. Monaco offline**
Protocol handler must be registered before any window loads. If you see "Failed to construct Worker" in prod, this is why.

**3. node-pty on Windows**
Requires Windows 10 1809+ for ConPTY. Test on target versions early.

**4. Playwright + Electron CDP**
`connectOverCDP` works. `context.browser()` returns null for persistent contexts — expected behavior, not a bug.

**5. Gmail OAuth**
OOB flow is dead (blocked by Google since 2023). Loopback only. Register `http://127.0.0.1:PORT/oauth/callback` in Google Cloud Console.

**6. Gemini image gen**
Imagen 3 is shut down. Use `imagen-4.0-generate-001`. Use `@google/genai` package, not `@google/generative-ai`. Method is `ai.models.generateImages()`, not `getGenerativeModel()`.

**7. Overnight Engine token costs**
Per-agent nightly token limit + dollar cap enforced before this phase is built. Never let overnight agents `git push`.

---

## References

- **CLI flags (verified):** `CLAUDE_FLAGS.md`
- **Session context:** `CLAUDE.md`
- Boilerplate: `github.com/electron-vite/electron-vite-react`
- Monaco offline: `jameskerr.blog/posts/offline-monaco-editor-in-electron`
- node-pty example: `github.com/microsoft/node-pty/tree/main/examples/electron`
- Playwright CDP: `playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp`
- Gemini image gen: `ai.google.dev/gemini-api/docs/imagen`
- GramJS: `gram.js.org`
- Anthropic usage API: `platform.claude.com/docs/en/build-with-claude/usage-cost-api`
