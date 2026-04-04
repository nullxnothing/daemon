# DAEMON Mobile - UI/UX Plan

## 1. Strategic Framing

### Primary Use Cases (Ranked by Frequency)

1. **AI Agent Chat** - Talk to ARIA, review agent output, approve actions, monitor running agents
2. **Wallet Operations** - Send SOL/tokens, swap via Jupiter, check balances, approve agent spend
3. **Code Review** - Read files, browse diffs, review PRs, navigate project structure
4. **Terminal Monitoring** - Check build output, view logs, run quick commands
5. **Quick Edits** - Fix a typo, update a config value, edit a string literal
6. **Token Launch** - PumpFun wizard, monitor bonding curve, trade tab
7. **Git Operations** - Stage, commit, branch, view history
8. **Colosseum** - Check deadlines, browse hackathons (reference only)

### What Mobile is NOT For

Full-feature development sessions. Nobody is writing 200-line functions on a phone. The mobile app is a **companion and command center**, not a replacement for the desktop IDE. The desktop app stays the primary development surface.

### Platform Decision: React Native (Expo)

**Why not PWA:** No access to Solana keypair storage via secure enclave, no background agent monitoring, no push notifications for agent completions, no biometric auth for wallet ops.

**Why not Flutter:** Team already has deep React/TypeScript knowledge. The desktop app is React 18 + Zustand. Shared types, shared store logic, shared API contracts. Flutter means rewriting everything in Dart.

**Why React Native (Expo):**
- Shared TypeScript types with `electron/shared/types.ts`
- Zustand stores can be adapted directly (same state shape, different persistence)
- Expo SecureStore for encrypted keypairs (maps to `safeStorage` on desktop)
- Expo Router for file-based navigation (familiar from Next.js patterns)
- React Native Reanimated for gesture-driven interactions
- Hermes engine - fast startup on Android
- OTA updates via EAS Update - ship fixes without app store review
- Expo Notifications for agent completion alerts

Backend stays the same - the mobile app talks to the same Helius RPC, Jupiter API, PumpFun API, and Anthropic API. The Electron IPC layer gets replaced by direct API calls + a lightweight sync server for project state.

---

## 2. Information Architecture

### Navigation Model: Bottom Tab Bar + Contextual Sheets

Five primary tabs. Everything else lives inside these tabs or surfaces as a bottom sheet / modal.

```
[Agent]  [Code]  [Terminal]  [Wallet]  [More]
   *       <>      >_          W        ...
```

**Tab 1: Agent** (default home)
- Active agent sessions list
- Chat interface with ARIA
- Agent action approval queue
- Voice input button
- Session history

**Tab 2: Code**
- Project file explorer (tree view)
- File viewer with syntax highlighting
- Git diff viewer
- Search across files
- Breadcrumb navigation

**Tab 3: Terminal**
- Active terminal sessions
- Output log viewer
- Quick command input
- Process list (running builds, servers)

**Tab 4: Wallet**
- Balance overview (SOL + tokens)
- Send / Receive / Swap
- Transaction history
- Agent wallet status + spend limits
- Token launch quick actions

**Tab 5: More**
- Git panel (branches, staging, commits)
- Colosseum hackathons
- Plugin dashboard
- Settings
- Connected projects
- Env manager (read-only)

### Gesture Model

| Gesture | Context | Action |
|---------|---------|--------|
| Swipe right on tab | Any tab | Go to left tab |
| Swipe left on tab | Any tab | Go to right tab |
| Long press file | Code tab | Context menu (copy path, git blame, open in desktop) |
| Pull down | Agent chat | Refresh / load older messages |
| Swipe left on session | Agent list | Archive session |
| Swipe right on file change | Git diff | Stage file |
| Pinch to zoom | Code viewer | Adjust font size |
| Double tap | Code viewer | Select word |
| Long press on code | Code viewer | Copy selection sheet |

---

## 3. Screen Designs

### 3.1 Agent Tab (Primary Screen)

This is the home screen. Most mobile usage will be here.

```
+------------------------------------------+
|  DAEMON            [project-name v]  [+]  |
+------------------------------------------+
|                                          |
|  SESSION: refactor auth middleware        |
|  Model: opus-4  |  Running 12m           |
|  ..............................................|
|                                          |
|  [ARIA bubble]                           |
|  I've updated the middleware to use       |
|  JWT validation. Here's what changed:     |
|                                          |
|  > src/middleware/auth.ts  (+42 -18)     |
|  > src/types/session.ts   (+8  -2)      |
|  > tests/auth.test.ts     (+65 -0)      |
|                                          |
|  [Approve Changes]  [View Diff]          |
|                                          |
|  ─────────────────────────────────────   |
|  [USER bubble]                           |
|  also add rate limiting to the login      |
|  endpoint, 5 attempts per minute          |
|                                          |
|  [ARIA bubble]                           |
|  On it. I'll use the existing             |
|  RateLimiter from utils and wire it...    |
|  ● typing...                              |
|                                          |
+------------------------------------------+
|  [mic]  Type a message...        [send]  |
+------------------------------------------+
| [Agent] [Code] [Terminal] [Wallet] [More]|
+------------------------------------------+
```

**Key interactions:**
- **Project switcher** (top right dropdown) - switch active project context
- **[+] button** - launch new agent session (opens sheet with model picker, system prompt, project selector)
- **Tapping a file diff** (e.g., `src/middleware/auth.ts (+42 -18)`) navigates to Code tab with that diff open
- **[Approve Changes]** sends approval signal to running agent
- **[mic] button** - hold to record voice, release to transcribe and send (Whisper API or on-device)
- **ARIA status dot** - 5px green dot (pulsing) when agent is active, amber when waiting for approval, grey when idle

**Agent Session List** (when no session is active or tapping back):
```
+------------------------------------------+
|  DAEMON                         [+ New]  |
+------------------------------------------+
|                                          |
|  ACTIVE                                  |
|  . refactor auth middleware    12m  opus  |
|    > Waiting for approval                |
|                                          |
|  . fix deployment pipeline     3m  haiku |
|    > Running tests...                    |
|                                          |
|  RECENT                                  |
|  . setup monitoring dashboard  2h ago    |
|  . update token metadata       yesterday |
|  . debug swap routing          2d ago    |
|                                          |
+------------------------------------------+
```

### 3.2 Code Tab

The code viewer is read-optimized with surgical edit capability.

**File Explorer View:**
```
+------------------------------------------+
|  [< Back]  my-project         [search]   |
+------------------------------------------+
|  > .claude/                              |
|  > electron/                             |
|  v src/                                  |
|    > components/                         |
|    > panels/                             |
|    > store/                              |
|      App.tsx                    2.1kb    |
|      main.tsx                   0.4kb    |
|  > styles/                               |
|  > test/                                 |
|    package.json                 1.8kb    |
|    tsconfig.json                0.6kb    |
|    vite.config.ts               0.3kb    |
|                                          |
+------------------------------------------+
|  Modified (3)  |  Staged (1)  |  Search  |
+------------------------------------------+
```

- Bottom segmented control switches between file tree, git changes, and search
- Folders show chevron, files show size
- Modified files get an amber dot, staged files get a green dot
- Tapping a file opens the viewer

**File Viewer:**
```
+------------------------------------------+
|  [< tree]  auth.ts       [edit] [share]  |
+------------------------------------------+
|  src/middleware/auth.ts                   |
+------------------------------------------+
|  1  import { verify } from 'jsonwebtoken'|
|  2  import { RateLimiter } from '../utils'|
|  3                                       |
|  4  export async function authMiddle...  |
|  5    const token = req.headers.auth...  |
|  6    if (!token) {                      |
|  7      return res.status(401).json({    |
|  8        error: 'No token provided'     |
|  9      })                               |
| 10    }                                  |
| 11                                       |
| 12    try {                              |
| 13      const decoded = verify(token,    |
| 14        process.env.JWT_SECRET)        |
| 15      req.user = decoded              |
| 16      next()                           |
| 17    } catch (err) {                    |
| 18      return res.status(403).json({    |
| 19        error: 'Invalid token'         |
| 20      })                               |
| 21    }                                  |
| 22  }                                    |
+------------------------------------------+
|  Ln 1, Col 1  |  TypeScript  |  UTF-8    |
+------------------------------------------+
```

- Horizontal scroll for long lines (no wrapping by default, toggle available)
- Pinch to zoom adjusts font size (persisted per session)
- Tapping a line number opens a context menu: copy line, go to definition (if LSP available), git blame
- **[edit] button** opens inline edit mode (see 3.2.1)
- Syntax highlighting via a lightweight highlighter (Shiki or Prism, not full Monaco)

**3.2.1 Inline Edit Mode:**

Full Monaco is too heavy for mobile. Instead: a focused edit experience.

```
+------------------------------------------+
|  [Cancel]   Editing auth.ts    [Save]    |
+------------------------------------------+
|  Line 7-9 selected                       |
+------------------------------------------+
|      return res.status(401).json({       |
|        error: 'No token provided'        |
|      })                                  |
+------------------------------------------+
|                                          |
|  [expanded keyboard with code symbols]   |
|  [tab] [{}] [()] [=>] [;] [./] [''] [|] |
|                                          |
|  [standard keyboard]                     |
+------------------------------------------+
```

- Tap a line range to select it for editing
- Only the selected region is editable (reduces cognitive load)
- Extra keyboard row with code-relevant symbols: `{}`, `()`, `[]`, `=>`, `===`, `./`, `''`, `""`, `;`, `|`
- Save commits the change to a staging area (not directly to file on remote)
- "Ask ARIA to fix this" button sends selected code to agent with context

### 3.3 Terminal Tab

```
+------------------------------------------+
|  Terminal            [+]  [sessions v]   |
+------------------------------------------+
|                                          |
|  $ pnpm run build                        |
|  > daemon@0.2.0 build                    |
|  > vite build && electron-builder        |
|                                          |
|  vite v6.1.0 building for production...  |
|  transforming (847) src/panels/Edit...   |
|  ...                                     |
|  ✓ 847 modules transformed.              |
|  dist/index.html          0.42 kB        |
|  dist/assets/index-Dk8.js 512.33 kB     |
|                                          |
|  $ _                                     |
|                                          |
+------------------------------------------+
|  [tab] [ctrl] [up] [dn] [c] [d] [esc]  |
+------------------------------------------+
|  Type command...                  [run]  |
+------------------------------------------+
```

- **Recents**: Command input shows recent commands as autocomplete chips
- **Special key row**: Tab, Ctrl, arrow keys, Ctrl+C, Ctrl+D, Esc - the keys you actually need in a terminal
- **Session switcher**: Dropdown shows all active terminal sessions (matches desktop's TerminalTabs)
- **Output is read-only by default** - you see the stream. Input field at bottom for new commands
- **Long press on output** - copy selection
- **Auto-scroll** toggle (green dot indicator when pinned to bottom)

**Terminal on tablet**: Side-by-side terminal + code viewer when in landscape.

### 3.4 Wallet Tab

This is where mobile might actually surpass desktop. Wallet ops on a phone feel native.

```
+------------------------------------------+
|  Wallet                      [settings]  |
+------------------------------------------+
|                                          |
|         12.847 SOL                       |
|         $2,441.93                        |
|                                          |
|    [Send]    [Receive]    [Swap]         |
|                                          |
+------------------------------------------+
|  TOKENS                                  |
|  ┌──────────────────────────────────┐    |
|  │  USDC          234.50    $234.50 │    |
|  │  BONK    1,234,567.00      $8.12 │    |
|  │  JUP           45.20     $29.38 │    |
|  └──────────────────────────────────┘    |
|                                          |
|  AGENT WALLET                            |
|  ┌──────────────────────────────────┐    |
|  │  Balance: 0.5 SOL                │    |
|  │  Spend today: 0.12 / 2.0 SOL    │    |
|  │  [Fund]  [Adjust Limit]          │    |
|  └──────────────────────────────────┘    |
|                                          |
|  RECENT TRANSACTIONS                     |
|  Sent 0.5 SOL to 7xK...        2m ago  |
|  Swap 100 USDC -> SOL          1h ago  |
|  Agent: buy 1M BONK            3h ago  |
|                                          |
+------------------------------------------+
```

**Send Flow** (bottom sheet):
```
+------------------------------------------+
|  ──────  Send                   [close]  |
+------------------------------------------+
|                                          |
|  To:                                     |
|  [address or .sol domain          ] [qr] |
|                                          |
|  Token:  [SOL v]                         |
|  Amount: [0.0                    ] [MAX] |
|           Available: 12.847 SOL          |
|                                          |
|  Priority Fee: [Normal v]                |
|                                          |
|  ──────────────────────────────────────  |
|  Network fee:     ~0.000005 SOL          |
|  Priority fee:    ~0.0001 SOL            |
|  ──────────────────────────────────────  |
|                                          |
|  [        Confirm Send (Face ID)       ] |
|                                          |
+------------------------------------------+
```

- **QR scanner** for recipient address (camera opens in sheet)
- **Biometric confirmation** for all sends (Face ID / fingerprint)
- **Swap** uses Jupiter V6 API - same as desktop, with route visualization simplified to a single best-route display
- **Receive** shows QR code of your address + copy button
- **Transaction history** - tappable rows open Solscan in an in-app browser

### 3.5 Token Launch (Accessed from Wallet Tab or More)

Simplified wizard - 3 steps instead of the desktop's full panel.

```
Step 1: Token Info
+------------------------------------------+
|  [< Back]  Launch Token       [1/3]      |
+------------------------------------------+
|                                          |
|  Token Name:                             |
|  [                                     ] |
|                                          |
|  Symbol:                                 |
|  [                                     ] |
|                                          |
|  Description:                            |
|  [                                     ] |
|  [                                     ] |
|                                          |
|  Image:                                  |
|  [tap to upload from camera/gallery]     |
|                                          |
|  Links (optional):                       |
|  Twitter: [                            ] |
|  Telegram:[                            ] |
|  Website: [                            ] |
|                                          |
|  [              Next ->                ] |
+------------------------------------------+

Step 2: Launch Config
+------------------------------------------+
|  [< Back]  Launch Config      [2/3]      |
+------------------------------------------+
|                                          |
|  Platform:  [PumpFun v]                  |
|                                          |
|  Initial Buy:                            |
|  [1.0         ] SOL                      |
|                                          |
|  Slippage:   [10] %                      |
|                                          |
|  Priority Fee:                           |
|  [Low]  [Normal]  [High]  [Turbo]        |
|                                          |
|  ─── Live Pricing ───                    |
|  SOL/USD: $189.72                        |
|  Est. initial mcap: ~$6,200              |
|                                          |
|  [              Next ->                ] |
+------------------------------------------+

Step 3: Confirm & Launch
+------------------------------------------+
|  [< Back]  Confirm Launch     [3/3]      |
+------------------------------------------+
|                                          |
|  ┌──────────────────────────────────┐    |
|  │  TOKEN_NAME ($SYMBOL)            │    |
|  │  [image preview]                  │    |
|  │                                   │    |
|  │  Platform:    PumpFun             │    |
|  │  Initial buy: 1.0 SOL            │    |
|  │  Slippage:    10%                 │    |
|  │  Priority:    Normal              │    |
|  │  Est. fee:    ~0.0005 SOL         │    |
|  └──────────────────────────────────┘    |
|                                          |
|  [      Launch Token (Face ID)         ] |
|                                          |
|  By launching you accept the risks of    |
|  on-chain token creation.                |
+------------------------------------------+
```

### 3.6 More Tab

Grid layout for less-frequently-used features.

```
+------------------------------------------+
|  More                                    |
+------------------------------------------+
|                                          |
|  ┌────────┐  ┌────────┐  ┌────────┐    |
|  │  Git   │  │Colosseum│ │Plugins │    |
|  │  <>    │  │  🏛     │  │  ⬡    │    |
|  └────────┘  └────────┘  └────────┘    |
|                                          |
|  ┌────────┐  ┌────────┐  ┌────────┐    |
|  │Settings│  │Projects │  │  Env   │    |
|  │  ⚙    │  │  📂    │  │  .env  │    |
|  └────────┘  └────────┘  └────────┘    |
|                                          |
|  ┌────────┐  ┌────────┐                 |
|  │ Ports  │  │Recovery │                 |
|  │ :3000  │  │  ♻     │                 |
|  └────────┘  └────────┘                 |
|                                          |
|  ─────────────────────────────────────   |
|  QUICK ACTIONS                           |
|  [Open in Desktop]  [Sync Project]       |
|                                          |
+------------------------------------------+
```

### 3.7 Git Panel (Inside More)

```
+------------------------------------------+
|  [< More]  Git               [fetch]     |
+------------------------------------------+
|  [Changes]  [Branches]  [History]        |
+------------------------------------------+
|                                          |
|  UNSTAGED (3)                            |
|  [Stage All]                             |
|  M  src/middleware/auth.ts               |
|  M  src/types/session.ts                 |
|  A  tests/auth.test.ts                   |
|                                          |
|  STAGED (1)                              |
|  M  package.json                         |
|                                          |
|  ──────────────────────────────────────  |
|  Commit message:                         |
|  [feat: add JWT auth middleware        ] |
|                                          |
|  [            Commit            ]        |
|                                          |
+------------------------------------------+
```

- Swipe right on a file to stage it
- Swipe left on a staged file to unstage
- Tapping a file opens its diff in the Code tab
- Branch selector shows a searchable list

---

## 4. Tablet Layout Strategy

Tablets get a split-pane layout that mirrors the desktop more closely.

### iPad / Large Tablet (> 768px width)

**Landscape:**
```
+------------------------------------------------------------------+
|  DAEMON    [project v]                           [agent: active]  |
+------------------------------------------------------------------+
|        |                              |                          |
| File   |  Code Viewer / Editor        |  Agent Chat              |
| Tree   |                              |                          |
|        |  (or Terminal when active)    |  [ARIA messages...]      |
| 200px  |                              |                          |
|        |                              |  [input field]           |
|        |                              |                          |
+------------------------------------------------------------------+
|  [Agent]  [Code]  [Terminal]  [Wallet]  [Git]  [More]            |
+------------------------------------------------------------------+
```

- Three-column layout: explorer | center content | agent chat
- Agent chat is always visible in the right column (like desktop's RightPanel)
- Wallet opens as a full-screen overlay (it's a focused task)
- Terminal can replace center content or split horizontally below editor

**Portrait:**
```
+----------------------------------------+
|  DAEMON    [project v]    [agent dot]  |
+----------------------------------------+
|                                        |
|  [same as phone layout but with        |
|   more breathing room, larger           |
|   touch targets, wider panels]          |
|                                        |
+----------------------------------------+
|  [Agent] [Code] [Terminal] [Wallet]... |
+----------------------------------------+
```

Same as phone but with wider margins, larger font sizes, and the ability to show more content per screen.

---

## 5. Design System: Mobile Token Adaptations

The mobile app inherits DAEMON's token system with adjustments for touch and readability.

### Colors (Unchanged)

The existing dark theme works perfectly on mobile OLED screens. Keep the full token set from `tokens.css`:

```
Background scale: --bg (#0a0a0a) through --s6 (#3a3a3a)
Text scale: --t1 (#f0f0f0) through --t4 (#666666)
Accents: --green (#3ecf8e), --amber (#f0b429), --red (#ef5350), --blue (#60a5fa)
```

All contrast ratios already meet WCAG AA. No changes needed.

### Spacing (Scaled Up)

Mobile needs more generous spacing for touch targets.

| Token | Desktop | Mobile |
|-------|---------|--------|
| `--space-xs` | 4px | 4px |
| `--space-sm` | 8px | 8px |
| `--space-md` | 12px | 14px |
| `--space-lg` | 16px | 18px |
| `--space-xl` | 24px | 28px |
| `--touch-target` | N/A | 44px (minimum) |
| `--touch-target-lg` | N/A | 52px (for primary actions) |

### Typography

| Element | Desktop | Mobile Phone | Mobile Tablet |
|---------|---------|-------------|---------------|
| Code | 13px JetBrains Mono | 13px (pinch-zoomable) | 14px |
| Body | 13px Plus Jakarta Sans | 16px | 16px |
| Label | 11px | 14px | 14px |
| Heading | 14px semibold | 18px semibold | 20px semibold |
| Tab bar label | N/A | 10px | 12px |

### Border Radius

More rounded on mobile to match platform conventions:

| Token | Desktop | Mobile |
|-------|---------|--------|
| `--radius-sm` | 3px | 6px |
| `--radius-md` | 4px | 8px |
| `--radius-lg` | 6px | 12px |
| `--radius-xl` | N/A | 16px (cards, sheets) |
| `--radius-full` | N/A | 9999px (pills, avatars) |

### Shadows and Elevation

Mobile uses the existing shadow tokens plus one new one for bottom sheets:

```
--shadow-sheet: 0 -4px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03);
```

### Motion

| Pattern | Duration | Easing |
|---------|----------|--------|
| Tab switch | 200ms | ease-out |
| Bottom sheet open | 300ms | cubic-bezier(0.32, 0.72, 0, 1) |
| Bottom sheet close | 250ms | ease-in |
| Page push | 350ms | cubic-bezier(0.32, 0.72, 0, 1) |
| Micro-feedback (button press) | 100ms | ease-out |
| List item appear | 150ms staggered 30ms | ease-out |

All animations respect `prefers-reduced-motion: reduce` - replaced with instant transitions.

---

## 6. AI Agent on Mobile

### Chat Interface

The agent chat is the primary mobile experience. Design decisions:

**Voice Input (High Priority)**
- Hold-to-record button in the input bar (microphone icon)
- Visual feedback: pulsing green ring while recording
- Uses Whisper API for transcription (or on-device if available)
- Transcribed text appears in input field for review before sending
- Reason: Typing code-related instructions on a phone keyboard is painful. Voice removes that friction

**Smart Suggestions**
- After each agent message, show 2-3 contextual quick-reply chips:
  - "Approve and continue"
  - "Show me the diff"
  - "Run the tests"
  - "Explain this change"
- These save typing for the most common responses

**File References in Chat**
- Agent messages that reference files render as tappable pills: `[src/auth.ts +42 -18]`
- Tapping navigates to the Code tab with that file open
- Diff references open the diff viewer directly

**Agent Approval Flow**
- When the agent needs approval (destructive action, large change), a sticky banner appears:
```
+------------------------------------------+
|  ARIA needs approval                     |
|  Delete 3 files and modify 12 others     |
|  [Deny]              [Review] [Approve]  |
+------------------------------------------+
```
- [Review] opens a summary sheet with all proposed changes
- [Approve] requires biometric confirmation for destructive operations
- Push notification when agent reaches an approval gate (app backgrounded)

**Notification Integration**
- Agent completion: "ARIA finished: refactor auth middleware (4 files changed)"
- Approval needed: "ARIA is waiting for approval: delete deprecated modules"
- Error: "Agent crashed: out of context window"
- Wallet: "Received 2.5 SOL from 7xK..."

### Session Management

- Sessions list shows active (pulsing dot) and recent sessions
- Tapping an active session opens its live chat
- Sessions persist across app launches (synced from desktop via project state)
- "Resume on Desktop" button opens the session in the desktop app (deep link)

---

## 7. Sync Architecture

The mobile app needs to access project state that lives on the desktop machine.

### Approach: Lightweight Sync Server

A thin HTTP server runs on the desktop DAEMON instance (opt-in, authenticated):

```
Desktop DAEMON (Electron)
  |
  +-- Sync Server (port 19847, mTLS)
       |
       +-- GET  /api/projects          (list projects)
       +-- GET  /api/files/:path       (read file)
       +-- PUT  /api/files/:path       (write file)
       +-- GET  /api/git/status        (git state)
       +-- POST /api/git/commit        (commit)
       +-- GET  /api/terminal/output   (stream terminal)
       +-- POST /api/terminal/input    (send command)
       +-- GET  /api/agent/sessions    (agent list)
       +-- WS   /api/agent/stream      (live agent output)
       +-- GET  /api/wallet/balance    (wallet state)
```

**Authentication**: mTLS with client certificate generated during pairing. QR code scan on mobile to pair (contains server URL + cert).

**Alternative for remote access**: Tunnel via Cloudflare Tunnel or Tailscale when not on the same network.

**Offline wallet ops**: Wallet functionality works without desktop connection (keypair stored locally on phone via SecureStore). Only project/code/terminal features require the sync connection.

---

## 8. Feature Priority Matrix

### Phase 1: MVP (8 weeks)

| Feature | Priority | Notes |
|---------|----------|-------|
| Agent chat interface | P0 | Core value prop on mobile |
| Wallet (balance, send, receive) | P0 | Works independently, no sync needed |
| Project file browser (read-only) | P0 | Requires sync server |
| Push notifications | P0 | Agent completions + wallet events |
| Bottom tab navigation | P0 | App shell |
| Biometric auth | P0 | Wallet security |

### Phase 2: Core Features (6 weeks)

| Feature | Priority | Notes |
|---------|----------|-------|
| Swap (Jupiter V6) | P1 | High-value wallet feature |
| Terminal output viewer | P1 | Read-only initially |
| Git status + commit | P1 | Quick git ops |
| Inline code editing | P1 | Focused edit mode |
| Voice input for agent | P1 | Key mobile differentiator |
| Token launch wizard | P1 | Revenue-driving feature |

### Phase 3: Power Features (6 weeks)

| Feature | Priority | Notes |
|---------|----------|-------|
| Terminal input | P2 | Run commands from phone |
| Git branches + history | P2 | Full git panel |
| Tablet split layout | P2 | iPad optimization |
| Agent approval queue | P2 | Background agent management |
| Colosseum panel | P2 | Hackathon companion |
| File search | P2 | Grep across project |

### Phase 4: Polish (4 weeks)

| Feature | Priority | Notes |
|---------|----------|-------|
| Offline mode | P3 | Cached project state |
| Widget (iOS/Android) | P3 | Wallet balance + agent status |
| Apple Watch complication | P3 | SOL balance at a glance |
| Haptic feedback | P3 | Micro-interactions |
| Dark/light toggle | P3 | (light mode, though dark is default) |

### Cut Entirely

| Feature | Reason |
|---------|--------|
| Monaco editor | Too heavy, not useful on phone. Use focused edit mode instead |
| Split terminal panes | Screen too small. One session at a time |
| Plugin system | Desktop-only complexity. Mobile gets curated features |
| Image editor | Desktop tool. Mobile can view images only |
| Remotion panel | Video production is a desktop workflow |
| Email panel | Use native email app |
| Embedded browser | Use system browser with deep links back |
| Env manager write | Too dangerous on mobile. Read-only with "edit on desktop" prompt |
| ARIA animated character | Replace with status dot + text presence indicator |

---

## 9. Accessibility

### Touch Targets
- All interactive elements: minimum 44x44px
- Primary action buttons: 52px height
- Bottom tab bar icons: 48x48px hit area
- List items: 56px minimum row height

### Screen Reader
- All screens navigable via VoiceOver (iOS) and TalkBack (Android)
- Code viewer announces line numbers and syntax context
- Agent chat messages announce sender, content, and any action buttons
- Wallet amounts announce full value with currency

### Dynamic Type / Font Scaling
- Support iOS Dynamic Type and Android font scaling
- Code viewer uses pinch-to-zoom instead of system scaling (to preserve layout)
- UI text scales up to 200% without truncation

### Reduced Motion
- All animations have `prefers-reduced-motion` fallbacks
- Sheet transitions become instant slides
- Pulsing indicators become static

### Color
- No information conveyed by color alone - always paired with icon or text
- Git status: color dot + letter (M, A, D, R)
- Agent status: color dot + text label ("Running", "Waiting", "Idle")

---

## 10. Key Interaction Patterns

### Bottom Sheet (Primary Overlay)

Used for: Send flow, Swap flow, Agent launcher, File context menu, Branch selector.

```
- Drag handle at top (48px grab area)
- Three snap points: peek (30%), half (50%), full (90%)
- Drag velocity > threshold = snap to next point
- Drag below peek = dismiss
- Backdrop: rgba(0, 0, 0, 0.5), tappable to dismiss
- Content scrolls independently inside sheet
```

### Contextual Actions

Long-press surfaces a floating action menu (not a system context menu):

```
+---------------------------+
|  Copy Path                |
|  Git Blame                |
|  Open in Desktop          |
|  Ask ARIA About This      |
+---------------------------+
```

Appears anchored to the press point, with a subtle scale-in animation (150ms).

### Pull-to-Refresh

Available on: Agent chat (load history), File explorer (re-fetch), Wallet (refresh balances), Terminal (reconnect).

Uses the standard platform pull-to-refresh pattern with DAEMON's green accent color for the spinner.

### Swipe Actions

| Context | Swipe Left | Swipe Right |
|---------|-----------|-------------|
| Agent session row | Archive | Pin |
| Git changed file | View diff | Stage |
| Git staged file | Unstage | -- |
| Transaction row | Copy tx hash | Open in Solscan |
| Terminal session | Kill | -- |

---

## 11. Security Considerations

### Keypair Storage
- Expo SecureStore (backed by Keychain on iOS, Keystore on Android)
- Never leaves secure enclave
- Biometric gate on all signing operations

### Session Auth
- JWT tokens for sync server, stored in SecureStore
- 15-minute expiry, silent refresh
- Device revocation from desktop app

### Agent Spend Limits
- Same 2 SOL/day cap as desktop
- Mobile can adjust limits (requires biometric)
- Push notification on any agent spend > 0.1 SOL

### Data at Rest
- No project files cached on device by default
- Optional "pin for offline" caches encrypted snapshots
- App lock (biometric or PIN) on launch

---

## 12. Technical Architecture

```
mobile/
  app/                    # Expo Router file-based routes
    (tabs)/
      agent.tsx           # Agent tab
      code.tsx            # Code tab
      terminal.tsx        # Terminal tab
      wallet.tsx          # Wallet tab
      more.tsx            # More tab
    agent/
      [sessionId].tsx     # Agent chat screen
    code/
      [filePath].tsx      # File viewer
    wallet/
      send.tsx            # Send flow
      swap.tsx            # Swap flow
      receive.tsx         # Receive QR
      launch.tsx          # Token launch wizard
    git/
      index.tsx           # Git panel
      branches.tsx
    settings.tsx
  
  components/             # Shared UI components
    BottomSheet.tsx
    CodeViewer.tsx        # Syntax-highlighted read-only viewer
    CodeEditor.tsx        # Focused edit mode
    StatusDot.tsx         # 5px colored dots (matching desktop)
    TokenAmount.tsx       # Formatted SOL/token display
    BiometricGate.tsx     # Wrapper for biometric confirmation
    SwipeAction.tsx       # Swipeable list item

  store/                  # Zustand stores (adapted from desktop)
    agent.ts
    wallet.ts
    ui.ts
    sync.ts               # Sync server connection state

  services/
    sync.ts               # Desktop sync client (HTTP + WS)
    wallet.ts             # Solana wallet operations (direct, no IPC)
    jupiter.ts            # Jupiter V6 swap API
    pumpfun.ts            # PumpFun launch API
    notifications.ts      # Push notification handlers

  lib/
    solana.ts             # @solana/web3.js setup
    secure-storage.ts     # Expo SecureStore wrapper
    highlight.ts          # Syntax highlighting (Shiki)

  assets/
    fonts/
      PlusJakartaSans-*.ttf
      JetBrainsMono-*.ttf
```

### Shared Code Strategy

Create a shared package that both desktop and mobile import:

```
packages/
  daemon-shared/
    types/              # TypeScript interfaces (Agent, Session, Wallet, etc.)
    constants/          # API endpoints, model names, limits
    validators/         # Input validation (address format, amounts, etc.)
    formatters/         # SOL formatting, address truncation, date formatting
```

This avoids drift between desktop and mobile type definitions.

---

## 13. Performance Targets

| Metric | Target |
|--------|--------|
| Cold start | < 1.5s to interactive |
| Tab switch | < 100ms |
| Agent message render | < 50ms |
| File tree load (500 files) | < 300ms |
| File content load | < 200ms |
| Wallet balance refresh | < 500ms |
| Sheet open animation | 60fps, no drops |
| Memory (idle) | < 80MB |
| Memory (active agent chat) | < 150MB |
| Bundle size (initial) | < 5MB |

### Optimization Strategies

- **Lazy load** all tab content except Agent (home tab)
- **Virtualized lists** for file trees, transaction history, agent session list
- **Incremental file loading** - load first 200 lines, fetch more on scroll
- **WebSocket** for agent streaming (not polling)
- **Image caching** for token icons (SWR pattern)
- **Preload** wallet balance on app launch (background fetch)

---

## 14. Deep Linking

```
daemon://agent/{sessionId}          # Open specific agent session
daemon://code/{projectId}/{path}    # Open file in code viewer
daemon://wallet/send?to={addr}      # Pre-fill send form
daemon://wallet/swap?from=SOL&to={mint}  # Pre-fill swap
daemon://launch                     # Open token launch wizard
daemon://git/{projectId}            # Open git panel for project
```

These enable:
- Push notification tap -> direct navigation
- Desktop "Open on Mobile" button
- QR code sharing of specific files/sessions
- Wallet Connect-style transaction approval

---

## 15. Summary

DAEMON Mobile is a **companion app**, not a port. It optimizes for the three things you actually do on your phone: talk to your AI agent, manage your wallet, and review code. Everything else is either simplified (terminal becomes read-only output), deferred to desktop (full editing, plugins, browser), or cut entirely (Remotion, image editor, email).

The agent-first design (Agent tab as home screen + voice input) is the key differentiator. No other mobile IDE puts AI conversation at the center. Combined with native wallet operations (biometric-gated, QR scanning, push notifications for transactions), this creates a genuinely useful mobile experience rather than a cramped desktop replica.
