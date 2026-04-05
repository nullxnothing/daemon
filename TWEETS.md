# DAEMON Tweet Plan

15 tweets covering every major feature. Each includes the tweet copy, a visual asset direction (marketing card or video), and posting notes.

The 80/20 rule: 80% value/demo, 20% promo. Lead with the problem or the "holy shit" moment, not the product name. Videos get 10x engagement. Threads get bookmarked. Hot takes get quoted.

---

## Tweet 1: The Problem (Launch Anchor)

**Format:** Marketing card carousel (4 slides)

**Tweet:**
```
Solana devs juggle 8+ tools every session:

VS Code, terminal, browser wallet, Solana Explorer, DexScreener, Helius dashboard, Claude Code, Jupiter...

Your AI agent has zero on-chain context. You explain what Helius is. Every. Single. Time.

We built one app that replaces all of it.
```

**Card 1:** "THE PROBLEM" + screenshot of cluttered desktop with 8 windows open
**Card 2:** "THE SOLUTION" + clean DAEMON screenshot showing everything in one window
**Card 3:** Feature list with green dots (Wallet, Agents, Terminal, Deploy, Git, Token Launch)
**Card 4:** Download CTA + daemon-landing.vercel.app

**Notes:** Pin this tweet. This is the "why we exist" anchor.

---

## Tweet 2: Grind Mode Demo

**Format:** 30-second screen recording

**Tweet:**
```
4 AI agents. One IDE. All working on your project at the same time.

Agent 1: scaffolding the Anchor program
Agent 2: wiring Jupiter swap hooks  
Agent 3: writing tests
Agent 4: building the frontend

This is Grind Mode.
```

**Video:** Screen record opening Grind Mode (Ctrl+Shift+G), typing a prompt into each panel, then fast-forward showing all 4 working simultaneously. End on the 4-panel grid with green status dots.

**Notes:** This is the "wow" tweet. Keep the video tight, no dead air. Add captions.

---

## Tweet 3: Built-in Wallet Hot Take

**Format:** Text + single screenshot

**Tweet:**
```
Unpopular opinion: if your IDE doesn't have a wallet built in, it's not a Solana IDE.

DAEMON ships with live portfolio tracking, SPL token balances, Jupiter swaps, and PumpFun launches. No extensions. No browser tabs.

Your code and your wallet in the same window.
```

**Screenshot:** Wallet panel showing SOL balance, token list with USD values, and the status bar ticker at the bottom.

**Notes:** Hot takes get engagement. "Unpopular opinion" format consistently drives quote tweets.

---

## Tweet 4: Token Launch in 60 Seconds

**Format:** 60-second screen recording

**Tweet:**
```
Launch a token on PumpFun without leaving your editor.

1. Open the wallet panel
2. Fill in name, ticker, description
3. Click Launch
4. Watch it hit the bonding curve

60 seconds. No browser. No MetaMask popup. No context switching.
```

**Video:** Full walkthrough of launching a token from inside DAEMON. Show the form, the confirmation, and the live token appearing in the dashboard. Real transaction on devnet.

**Notes:** "Without leaving your editor" is the hook. Crypto Twitter loves seeing real transactions.

---

## Tweet 5: Not a Fork (Architecture Thread)

**Format:** Thread (5 tweets)

**Tweet 1:**
```
"Is this just VS Code with a skin?"

No. Here's what makes DAEMON different from every other AI IDE:

A thread on building a real desktop app from scratch. 🧵
```

**Tweet 2:**
```
1/ Process isolation.

All database and filesystem access runs in the main process. The renderer never touches SQLite directly. Everything flows through 20 typed IPC handlers.

This isn't a web app pretending to be native.
```

**Tweet 3:**
```
2/ Real PTY terminals.

node-pty + xterm.js. Not a web terminal emulator. Real shell sessions with signal handling, tab completion, and per-project context.

Your AI agents run as actual CLI processes, not sandboxed toys.
```

**Tweet 4:**
```
3/ Offline-first editor.

Monaco runs through a custom protocol handler. Zero network requests for core editing. Your code stays on your machine.

No CDN dependency. No "connecting to server..." spinner.
```

**Tweet 5:**
```
4/ Native modules unpacked from ASAR.

better-sqlite3 and node-pty extracted for production builds. Real database. Real PTY sessions.

Not browser polyfills pretending to be native.

Download: daemon-landing.vercel.app
```

**Notes:** Architecture threads get bookmarked by devs. Each tweet should be standalone-valuable.

---

## Tweet 6: Agent System Deep Dive

**Format:** Marketing card (single image)

**Tweet:**
```
Every Claude agent in DAEMON runs as a real CLI process.

Custom system prompts per agent.
Model selection (Opus, Sonnet, Haiku).
Per-project MCP configs.
Full tool access.

Not a chat window. A real coding agent with a real terminal.
```

**Card:** Dark card showing the Agent Launcher UI with model selector dropdown, system prompt field, and MCP toggle list. DAEMON logo top-left.

---

## Tweet 7: Git Without Leaving

**Format:** 15-second GIF or short video

**Tweet:**
```
Branch, stage, commit, push, stash, tag.

All visual. All inside your IDE.

Never open a separate terminal for git again.
```

**Video/GIF:** Quick demo of the Git panel - switching branches, staging files, writing a commit message, pushing. Fast cuts, no narration needed.

**Notes:** Keep this short. The visual sells itself.

---

## Tweet 8: Deploy in One Click

**Format:** Text + screenshot

**Tweet:**
```
Ship to Vercel from your editor:

1. Connect once in Settings
2. Click deploy
3. Done

Same for Railway. No browser. No CLI. No context switching.
```

**Screenshot:** Deploy panel showing a successful Vercel deployment with the live URL.

---

## Tweet 9: The Status Bar Flex

**Format:** Cropped screenshot (status bar only)

**Tweet:**
```
My IDE's status bar shows:

- Git branch
- Live BTC price
- Live SOL price  
- Wallet balance in USD

Tell me your IDE does that.
```

**Screenshot:** Tight crop of just the DAEMON status bar showing the ticker prices and wallet balance.

**Notes:** Challenge format ("tell me yours does that") drives replies and quote tweets.

---

## Tweet 10: Build in Public Update

**Format:** Text only

**Tweet:**
```
DAEMON v1.3.0 shipped this week:

- Grind Mode (4 parallel AI agents)
- Docs panel built into the app
- Animated Solana icon in sidebar
- One-click Vercel deploys
- 281 tests passing across 19 suites

Solo dev. Built from scratch. Not a fork.

What should v1.4 have?
```

**Notes:** Build-in-public updates drive engagement. The question at the end invites replies. Post these after every release.

---

## Tweet 11: Monaco Editor Flex

**Format:** Screenshot + text

**Tweet:**
```
Full Monaco editor running completely offline.

Multi-tab. Breadcrumbs. Syntax highlighting for 30+ languages. Minimap. Find and replace. Code folding.

All through a custom protocol handler. Zero CDN. Zero network requests.

Your code never leaves your machine.
```

**Screenshot:** Editor with multiple tabs open, syntax highlighted Rust code, breadcrumb nav visible.

---

## Tweet 12: The Solo Dev Angle

**Format:** Text only (personal)

**Tweet:**
```
I built an entire IDE from scratch as a solo dev.

Electron 33. React 18. Monaco. node-pty. better-sqlite3. 20 IPC modules. 21 panels. 281 tests.

No team. No funding. No VS Code fork.

If you're a solo Solana builder, this was made for you.
```

**Notes:** Solo dev stories resonate. This is the "founder story" tweet. Post on a weekend evening when engagement from devs is highest.

---

## Tweet 13: MCP Server Management

**Format:** Screenshot + text

**Tweet:**
```
Toggle MCP servers per project from the sidebar.

Changes write directly to .claude/settings.json. Restart indicator when configs change. Global and project-level scopes.

Your AI agents get the right tools for the right project. Automatically.
```

**Screenshot:** Settings panel showing MCP toggles with green/gray dots.

---

## Tweet 14: Comparison Bait

**Format:** Marketing card (comparison table)

**Tweet:**
```
VS Code + 12 extensions vs. one app built for the job.
```

**Card:** Clean comparison table:
| Feature | VS Code | DAEMON |
|---------|---------|--------|
| Built-in wallet | No | Yes |
| 4 parallel AI agents | No | Yes |
| Token launches | No | Yes |
| Jupiter swaps | No | Yes |
| Live price ticker | No | Yes |
| Typed IPC | N/A | 20 modules |
| Native SQLite | No | Yes |
| Offline editor | Needs CDN | Custom protocol |

**Notes:** Comparison tweets are engagement magnets. People love debating these in quote tweets.

---

## Tweet 15: The Download CTA

**Format:** Video (15 seconds) + CTA

**Tweet:**
```
Download DAEMON. Free. Open source. MIT license.

Windows: direct download
Mac: build from source (Apple doesn't let indie devs skip notarization yet)

One app for code, agents, wallet, deploys, and token launches.

daemon-landing.vercel.app
```

**Video:** Quick montage: editor typing, terminal running, wallet panel, grind mode grid, deploy success. 3 seconds each, fast cuts, end on the DAEMON logo.

**Notes:** Post this as a reply to any viral tweet in the thread. Also good as a standalone every 2 weeks.

---

## Posting Schedule

| Day | Tweet | Why |
|-----|-------|-----|
| Mon | Tweet 1 (Problem) | Pin immediately, anchor tweet |
| Tue | Tweet 2 (Grind Mode video) | Video gets 10x engagement |
| Wed | Tweet 3 (Wallet hot take) | Hot takes peak mid-week |
| Thu | Tweet 5 (Architecture thread) | Threads get bookmarked on work days |
| Fri | Tweet 4 (Token launch video) | Crypto Twitter is active Fridays |
| Sat | Tweet 12 (Solo dev story) | Personal stories on weekends |
| Sun | Tweet 10 (Build in public) | BIP updates on Sundays |
| Mon | Tweet 9 (Status bar flex) | Challenge format drives Mon engagement |
| Tue | Tweet 6 (Agent system card) | Educational content mid-week |
| Wed | Tweet 14 (Comparison bait) | Debate format peaks mid-week |
| Thu | Tweet 7 (Git GIF) | Short visual content |
| Fri | Tweet 8 (Deploy screenshot) | Ship day vibes |
| Sat | Tweet 11 (Monaco flex) | Technical deep dive for weekend devs |
| Sun | Tweet 13 (MCP management) | Niche technical content |
| Mon | Tweet 15 (Download CTA) | Start week 3 with direct CTA |

## Production Tips

- **Videos:** 15-30 seconds for demos, 60 seconds max for walkthroughs. Captions always (80% watch on mute). High contrast text. 1080x1080 or 1920x1080.
- **Cards:** Dark background (#0a0a0a), DAEMON green (#3ecf8e) accents, Plus Jakarta Sans font. Match the landing page aesthetic.
- **Screenshots:** Crop tight. No window chrome unless it adds context. Add a subtle green border/glow like the reference card.
- **Timing:** Post between 9-11 AM EST or 6-8 PM EST. Solana/crypto content peaks Thursday-Saturday.
- **Replies:** Reply to your own tweets with the download link. Never put the link in the main tweet (algorithm buries external links).
- **Engagement:** Reply to every comment in the first hour. The algorithm weighs early engagement heavily. First 60-90 minutes determine reach.
