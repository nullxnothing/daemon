import {
  DocHeading,
  DocSubheading,
  H2,
  H3,
  Paragraph,
  Code,
  CodeBlock,
  Table,
  InfoCard,
  CardGrid,
  Hint,
  List,
  Divider,
} from './docs-primitives'

// ─── Introduction ───────────────────────────────────────────────────────────

export function IntroductionDoc() {
  return (
    <>
      <DocHeading>Introduction</DocHeading>
      <DocSubheading>What is DAEMON, why it exists, and what makes it different.</DocSubheading>

      <H2 id="what-is-daemon">What is DAEMON?</H2>
      <Paragraph>
        DAEMON is <strong>Solana's first IDE</strong>, a standalone desktop application built from
        scratch for Solana development. It combines a full-featured code editor, AI agents, built-in
        wallet, token launcher, and one-click deployment into a single app.
      </Paragraph>
      <Paragraph>
        DAEMON is not a VS Code fork. It is not a plugin or extension. It is a purpose-built
        Electron application with its own editor, terminal, state management, and database layer,
        designed from day one for the Solana ecosystem.
      </Paragraph>

      <H2 id="why-daemon">Why DAEMON?</H2>
      <Paragraph>
        Building on Solana today means juggling a dozen tools: a code editor, a separate terminal,
        Phantom wallet in the browser, PumpFun in another tab, Jupiter in another, a deploy
        dashboard somewhere else, and AI assistants in yet another window.
      </Paragraph>
      <Paragraph>DAEMON consolidates all of that into one app:</Paragraph>
      <List
        items={[
          <><strong>Write code</strong> in a fully offline Monaco editor with syntax highlighting, multi-tab, and breadcrumbs</>,
          <><strong>Run AI agents</strong> that work on your codebase in parallel to debug, review, test, and ship simultaneously</>,
          <><strong>Manage your wallet</strong> with live portfolio tracking via Helius, SPL token balances, and real-time prices</>,
          <><strong>Launch tokens</strong> on PumpFun with a one-click wizard</>,
          <><strong>Swap tokens</strong> via Jupiter aggregation directly from the wallet panel</>,
          <><strong>Deploy</strong> to Vercel or Railway without leaving the editor</>,
          <><strong>Track everything</strong> with a built-in dashboard showing price, holders, market cap, and sparkline charts</>,
        ]}
      />

      <H2 id="comparison">How DAEMON Compares</H2>
      <Table
        headers={['Feature', 'DAEMON', 'VS Code + Extensions']}
        rows={[
          ['Solana wallet', 'Built-in, native', 'Requires browser extension'],
          ['Token launches', 'One-click PumpFun wizard', 'Not available'],
          ['AI agents', 'Parallel execution with Grind Mode', 'Single Copilot chat'],
          ['Terminal', 'Real PTY via node-pty', 'Integrated terminal'],
          ['Deploys', 'One-click Vercel/Railway', 'Requires CLI or dashboard'],
          ['Offline editor', 'Custom protocol, zero CDN', 'Depends on extensions'],
        ]}
      />

      <Divider />

      <H2 id="open-source">Open Source</H2>
      <Paragraph>DAEMON is free and open source under the MIT License.</Paragraph>
      <List
        items={[
          <><strong>GitHub:</strong>{' '}<a href="https://github.com/nullxnothing/daemon" target="_blank" rel="noopener noreferrer">github.com/nullxnothing/daemon</a></>,
          <><strong>Twitter:</strong>{' '}<a href="https://x.com/DaemonTerminal" target="_blank" rel="noopener noreferrer">@DaemonTerminal</a></>,
          <><strong>Built by:</strong>{' '}<a href="https://github.com/nullxnothing" target="_blank" rel="noopener noreferrer">nullxnothing</a></>,
        ]}
      />
    </>
  )
}

// ─── Installation ────────────────────────────────────────────────────────────

export function InstallationDoc() {
  return (
    <>
      <DocHeading>Installation</DocHeading>
      <DocSubheading>Download DAEMON and get set up in under 2 minutes.</DocSubheading>

      <H2 id="download">Download</H2>
      <Paragraph>
        Download the latest release from{' '}
        <a href="https://github.com/nullxnothing/daemon/releases" target="_blank" rel="noopener noreferrer">
          github.com/nullxnothing/daemon/releases
        </a>
        . Windows (.exe) and macOS (.dmg) builds are available.
      </Paragraph>

      <H2 id="prerequisites">Prerequisites</H2>
      <List
        items={[
          <><strong>Node.js 22+</strong>, required for agent spawning and terminal sessions</>,
          <><strong>pnpm</strong> (recommended), faster installs and used internally by DAEMON</>,
        ]}
      />

      <H2 id="first-launch">First Launch</H2>
      <Paragraph>
        On first run, DAEMON shows a boot loader sequence followed by the onboarding wizard. This
        walks you through workspace configuration, Claude setup, and optional integrations. Takes
        about 2 minutes.
      </Paragraph>

      <H2 id="requirements">System Requirements</H2>
      <Table
        headers={['Requirement', 'Minimum']}
        rows={[
          ['OS', 'Windows 10+ or macOS 12+'],
          ['Node.js', 'v22 or higher'],
          ['RAM', '4 GB (8 GB recommended)'],
          ['Disk', '~500 MB for installation'],
        ]}
      />

      <H2 id="updating">Updating</H2>
      <Paragraph>
        DAEMON includes auto-update support via electron-builder. When a new version is available,
        you'll see a notification in the status bar. Click to download and install with no manual
        steps required.
      </Paragraph>
    </>
  )
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

export function OnboardingDoc() {
  return (
    <>
      <DocHeading>Onboarding</DocHeading>
      <DocSubheading>
        First-launch wizard: workspace profile, Claude setup, and integrations.
      </DocSubheading>

      <H2 id="workspace-profile">Workspace Profile</H2>
      <Paragraph>Choose a profile that pre-configures your tool panels and agent skills:</Paragraph>
      <Table
        headers={['Profile', "What's Included"]}
        rows={[
          [<strong key="w">Web</strong>, 'Next.js, Vercel, Railway, Browser, Playwright'],
          [<strong key="s">Solana</strong>, 'Wallet, Token Launcher, Jupiter, Helius, Session Registry'],
          [<strong key="c">Custom</strong>, 'Pick exactly which panels and tools to enable'],
        ]}
      />
      <Hint type="info">
        The <strong>Solana</strong> profile enables all Solana-specific panels by default, including
        the Wallet, Token Dashboard, and Jupiter Swap panel. If you're building on Solana, start here.
      </Hint>

      <H2 id="claude-setup">Claude Setup</H2>
      <Paragraph>
        DAEMON auto-installs the Claude CLI if it's not detected on your system. You can
        authenticate in two ways:
      </Paragraph>
      <List
        items={[
          <><strong>OAuth sign-in</strong> opens a browser window to authenticate with your Anthropic account</>,
          <><strong>API key</strong> lets you paste your Anthropic API key directly in the settings</>,
        ]}
      />
      <Paragraph>
        The Claude CLI powers all agent spawning, Grind Mode, and AI-assisted features throughout
        the IDE.
      </Paragraph>

      <H2 id="integrations">Optional Integrations</H2>
      <Paragraph>
        These connections are fully optional and can be skipped during onboarding. Configure them
        later in <strong>Settings &gt; Integrations</strong>:
      </Paragraph>
      <List
        items={[
          <><strong>Gmail</strong> for email notifications and summaries</>,
          <><strong>Vercel</strong> for one-click project deployment</>,
          <><strong>Railway</strong> for one-click backend deployment</>,
        ]}
      />

      <H2 id="after-onboarding">After Onboarding</H2>
      <Paragraph>
        Once setup is complete, DAEMON opens to your workspace with the panels and tools configured
        for your selected profile. Access all settings at any time via <Code>Ctrl+,</Code> or
        through the Command Drawer (<Code>Ctrl+K</Code>).
      </Paragraph>
    </>
  )
}

// ─── UI Overview ─────────────────────────────────────────────────────────────

export function UIOverviewDoc() {
  return (
    <>
      <DocHeading>UI Overview</DocHeading>
      <DocSubheading>
        DAEMON's interface: sidebar, editor, panels, terminal, and status bar.
      </DocSubheading>

      <H2 id="sidebar">Left Sidebar</H2>
      <Paragraph>The sidebar provides icon-based navigation for all major panels:</Paragraph>
      <CardGrid>
        <InfoCard title="F - Files">File explorer and project tree</InfoCard>
        <InfoCard title="S - Search">Full-text search across your project</InfoCard>
        <InfoCard title="G - Git">Visual git interface (branch, commit, push)</InfoCard>
        <InfoCard title="T - Terminal">Terminal session manager</InfoCard>
        <InfoCard title="W - Wallet">Solana wallet and token dashboard</InfoCard>
      </CardGrid>

      <H2 id="center">Center Area</H2>
      <Paragraph>
        The center area contains the Monaco editor with tabbed navigation. Two tabs are permanently
        pinned:
      </Paragraph>
      <List
        items={[
          <><strong>Browser</strong> with built-in security sandbox for previewing your app</>,
          <><strong>Dashboard</strong> with real-time token price, holders, and charts</>,
        ]}
      />

      <H2 id="right-panel">Right Panel</H2>
      <List
        items={[
          <><strong>Claude</strong> showing agent connection status, active MCP servers, current model, and available skills</>,
          <><strong>Dashboard</strong> for quick access to token metrics</>,
          <><strong>Sessions</strong> to view and manage active agent sessions</>,
        ]}
      />

      <H2 id="terminal">Bottom Terminal</H2>
      <Paragraph>A full xterm.js terminal powered by real PTY sessions via node-pty:</Paragraph>
      <List
        items={[
          'Multiple terminal tabs',
          'Split panes (horizontal and vertical)',
          'Per-project terminal sessions',
          <>Command history with <Code>Ctrl+R</Code></>,
          'Tab completion',
          <>Search with <Code>Ctrl+Shift+F</Code></>,
        ]}
      />

      <H2 id="status-bar">Status Bar</H2>
      <Paragraph>
        Runs along the bottom and displays the current git branch, market ticker (live token
        prices), and wallet balance (SOL + USD value).
      </Paragraph>
    </>
  )
}

// ─── AI Agents ───────────────────────────────────────────────────────────────

export function AIAgentsDoc() {
  return (
    <>
      <DocHeading>AI Agents</DocHeading>
      <DocSubheading>
        Spawn Claude Code agents with full tool access. Every agent runs as a real CLI process.
      </DocSubheading>

      <H2 id="agent-launcher">Agent Launcher</H2>
      <Paragraph>
        Open the Agent Launcher with <Code>Ctrl+Shift+A</Code>. From here you can select a
        built-in agent preset, create a custom agent with your own system prompt, choose a model
        (Opus, Sonnet, Haiku), and configure per-project MCP servers.
      </Paragraph>

      <H2 id="built-in-agents">Built-in Agents</H2>
      <Paragraph>DAEMON ships with six pre-configured agents:</Paragraph>
      <Table
        headers={['Agent', 'Purpose']}
        rows={[
          [<strong key="d">Debug</strong>, 'Trace errors and fix stack traces'],
          [<strong key="s">Security Audit</strong>, 'Scan for vulnerabilities and exploits'],
          [<strong key="c">Code Review</strong>, 'Review code quality and patterns'],
          [<strong key="g">Git</strong>, 'Commit, branch, and PR management'],
          [<strong key="t">Test Runner</strong>, 'Write and run test suites'],
          [<strong key="sol">Solana</strong>, 'On-chain interactions and program development'],
        ]}
      />
      <Paragraph>
        Each agent runs as an independent Claude Code process with full filesystem access, terminal
        capabilities, and tool use.
      </Paragraph>

      <H2 id="custom-agents">Custom Agents</H2>
      <List
        items={[
          <><strong>Custom system prompts</strong> to define exactly how the agent should behave</>,
          <><strong>Model selection</strong> to choose between Opus, Sonnet, and Haiku based on your task</>,
          <><strong>MCP configuration</strong> to assign project-level or global MCP servers to each agent</>,
        ]}
      />
      <Hint type="info">
        DAEMON includes <strong>41 pre-built Claude agents</strong> available for import from the
        Agent Launcher, covering web, Solana, testing, and DevOps workflows.
      </Hint>

      <H2 id="mcp">MCP Management</H2>
      <Paragraph>
        Toggle project-level and global MCP servers from the Claude panel or Settings. Changes are
        written to <Code>.claude/settings.json</Code> (project-level) and <Code>.mcp.json</Code> (global).
      </Paragraph>

      <H2 id="sessions">Agent Sessions</H2>
      <Paragraph>
        Every agent session is tracked in the Sessions tab on the right panel. Session data includes
        start/end timestamps, commands executed, files modified, and token usage.
      </Paragraph>
      <Paragraph>
        For Solana projects, sessions can optionally be recorded on-chain via the Session Registry.
      </Paragraph>
    </>
  )
}

// ─── Grind Mode ──────────────────────────────────────────────────────────────

export function GrindModeDoc() {
  return (
    <>
      <DocHeading>Grind Mode</DocHeading>
      <DocSubheading>
        Multi-panel agent grid. Run multiple Claude agents on different parts of your project
        simultaneously.
      </DocSubheading>

      <H2 id="how-it-works">How It Works</H2>
      <Paragraph>
        Launch Grind Mode with <Code>Ctrl+Shift+G</Code>. DAEMON opens a multi-panel grid where
        each panel runs an independent Claude Code agent. All agents work on your codebase at the
        same time, each with their own context, tools, and terminal access.
      </Paragraph>

      <H2 id="when-to-use">When to Use Grind Mode</H2>
      <Paragraph>
        Grind Mode is most effective when you have independent tasks that don't depend on each other:
      </Paragraph>
      <List
        items={[
          'Scaffolding different parts of a project simultaneously',
          'Running tests while building new features',
          'Writing documentation while refactoring code',
          'Building frontend and backend in parallel',
          'Auditing security while shipping features',
        ]}
      />

      <H2 id="tips">Tips</H2>
      <List
        items={[
          <><strong>Keep tasks independent.</strong> Agents work best on separate files or modules. Avoid overlapping files.</>,
          <><strong>Use specific prompts.</strong> Give each agent a clear, focused task.</>,
          <><strong>Monitor progress.</strong> Watch each panel's output. You can interact with any agent at any time.</>,
          <><strong>Scale as needed.</strong> Start with two agents for simpler tasks, scale up for larger projects.</>,
        ]}
      />

      <H2 id="shortcut">Keyboard Shortcut</H2>
      <Table
        headers={['Shortcut', 'Action']}
        rows={[
          [<Code key="k">Ctrl+Shift+G</Code>, 'Toggle Grind Mode'],
        ]}
      />
    </>
  )
}

// ─── Solana Development ──────────────────────────────────────────────────────

export function SolanaDevelopmentDoc() {
  return (
    <>
      <DocHeading>Solana Development</DocHeading>
      <DocSubheading>
        Built-in wallet, token launches, Jupiter swaps, dashboard, and session registry.
      </DocSubheading>

      <H2 id="wallet">Connect Wallet</H2>
      <Paragraph>
        Import an existing keypair (base58 private key) or generate a new wallet directly inside
        DAEMON. Your wallet is stored locally and encrypted via the OS keychain.
      </Paragraph>
      <Paragraph>Once connected, the wallet panel shows:</Paragraph>
      <List
        items={[
          'SOL balance (live via Helius)',
          'All SPL token holdings with USD values',
          'Transaction history',
        ]}
      />

      <H2 id="launch-tokens">Launch Tokens</H2>
      <Paragraph>Create tokens on PumpFun with DAEMON's built-in Launch Wizard:</Paragraph>
      <List
        items={[
          'Open the Token Launcher panel',
          <><strong>Set token name, symbol, and image</strong></>,
          'Add socials (Twitter, Telegram, website)',
          <><strong>Click Launch</strong> and DAEMON handles the bonding curve interaction</>,
        ]}
      />
      <Hint type="info">
        The entire process is one click from inside the IDE. No need to visit PumpFun in a browser.
      </Hint>

      <H2 id="import-tokens">Import Tokens</H2>
      <List
        items={[
          <><strong>By mint address</strong> to paste any SPL token's mint address</>,
          <><strong>Auto-detect</strong> to scan your connected wallet and automatically import all holdings</>,
        ]}
      />

      <H2 id="dashboard">Dashboard</H2>
      <Table
        headers={['Metric', 'Description']}
        rows={[
          [<strong key="p">Price</strong>, 'Live price via Helius/Jupiter'],
          [<strong key="h">Holders</strong>, 'Current holder count'],
          [<strong key="m">Market Cap</strong>, 'Fully diluted market cap'],
          [<strong key="s">Sparkline</strong>, '24h price chart'],
          [<strong key="v">Volume</strong>, 'Trading volume'],
        ]}
      />

      <H2 id="jupiter-swaps">Jupiter Swaps</H2>
      <Paragraph>Swap tokens directly from the wallet panel using Jupiter aggregation:</Paragraph>
      <List
        items={[
          'Best route finding across all Solana DEXs',
          'Slippage protection',
          'Transaction preview before signing',
          'No need to leave the IDE',
        ]}
      />

      <H2 id="session-registry">Session Registry</H2>
      <Paragraph>
        The Session Registry is an on-chain proof-of-development feature unique to DAEMON. It
        records AI agent sessions to the Solana blockchain for transparency.
      </Paragraph>
      <CardGrid>
        <InfoCard title="What's recorded">Session start/end, agent type, task summary</InfoCard>
        <InfoCard title="Why">Verifiable proof that AI-assisted development occurred</InfoCard>
      </CardGrid>
      <Paragraph>
        This is optional and can be enabled per-project in{' '}
        <strong>Settings &gt; Solana &gt; Session Registry</strong>.
      </Paragraph>

      <H2 id="daemon-pro">Daemon Pro</H2>
      <Paragraph>
        Daemon Pro is the hosted layer on top of the open DAEMON IDE. It adds Arena, Pro Skill Pack,
        Hosted MCP Sync, and the Priority API without changing the core app's open-source licensing.
      </Paragraph>
      <List
        items={[
          'Arena: submit projects, vote on entries, and track what ships next',
          'Pro Skill Pack: curated agents, templates, and workflows synced into the app',
          'Hosted MCP Sync: one MCP setup, multiple machines',
          'Priority API: higher-value routes like explain-tx and audit-idl without per-call friction',
        ]}
      />
      <Paragraph>
        Access can be claimed two ways: subscribe with USDC via x402, or hold at least{' '}
        <strong>1,000,000 DAEMON</strong> in a local wallet and claim holder access directly in the app.
      </Paragraph>
      <Paragraph>
        To submit to Arena, open <strong>Tools &gt; Daemon Pro &gt; Arena</strong>. The public Arena page
        mirrors the same live board the app reads from, so submissions and votes stay in sync.
      </Paragraph>
    </>
  )
}

// ─── Editor & Terminal ───────────────────────────────────────────────────────

export function EditorTerminalDoc() {
  return (
    <>
      <DocHeading>Monaco Editor & Terminal</DocHeading>
      <DocSubheading>
        Full-featured offline editor and real PTY terminal, both running natively.
      </DocSubheading>

      <H2 id="editor">Monaco Editor</H2>
      <Paragraph>
        The editor is powered by the same Monaco engine used in VS Code, loaded via a custom
        Electron protocol handler for fully offline operation. Zero CDN requests, zero network
        dependencies.
      </Paragraph>

      <H3>Features</H3>
      <List
        items={[
          <><strong>Multi-tab editing</strong> with drag-and-drop reordering</>,
          <><strong>Breadcrumb navigation</strong> to click through the file path</>,
          <><strong>Syntax highlighting</strong> for TypeScript, Rust, Python, JSON, TOML, and more</>,
          <><strong>Multi-cursor editing</strong> with Ctrl+D to select next, Ctrl+Shift+L to select all</>,
          <><strong>Minimap</strong> for code overview on the right side</>,
          <><strong>Find and replace</strong> with Ctrl+F for search, Ctrl+H for replace</>,
          <><strong>Code folding</strong> to collapse and expand code blocks</>,
          <><strong>Auto-indent</strong> for consistent code formatting</>,
        ]}
      />

      <H3>Offline-First</H3>
      <Paragraph>
        The Monaco editor runs through a custom protocol handler registered in Electron's main
        process. No network requests for the editor itself, no CDN dependencies, and your code
        never leaves your machine.
      </Paragraph>

      <H2 id="terminal">Terminal</H2>
      <Paragraph>
        DAEMON's terminal is a real PTY implementation using node-pty and xterm.js, not a
        browser-based emulator.
      </Paragraph>

      <H3>Features</H3>
      <List
        items={[
          <><strong>Real PTY sessions</strong> with full shell access and proper signal handling</>,
          <><strong>Multiple tabs</strong> to open as many terminal sessions as you need</>,
          <><strong>Split panes</strong> to divide terminals horizontally or vertically</>,
          <><strong>Per-project sessions</strong> where each project gets its own terminal context</>,
          <><strong>Command history</strong> with Ctrl+R for reverse search</>,
          <><strong>Tab completion</strong> with standard shell tab completion</>,
          <><strong>Copy/paste</strong> using select to copy and right-click to paste</>,
        ]}
      />

      <Hint type="info">
        Unlike browser-based emulators, DAEMON's terminal supports interactive programs (vim, htop),
        handles ANSI escape codes correctly, and provides proper signal handling (Ctrl+C, Ctrl+Z).
      </Hint>
    </>
  )
}

// ─── Git Integration ─────────────────────────────────────────────────────────

export function GitIntegrationDoc() {
  return (
    <>
      <DocHeading>Git Integration</DocHeading>
      <DocSubheading>
        Complete visual git interface powered by simple-git. Branch, commit, and push, all without
        a separate terminal.
      </DocSubheading>

      <H2 id="git-panel">Visual Git Panel</H2>
      <Paragraph>
        Access the git panel from the left sidebar (G icon) or with the Command Drawer (Ctrl+K).
        The panel shows the current branch, changed files with diff previews, staged files, and
        the stash list.
      </Paragraph>

      <H2 id="branching">Branching</H2>
      <List
        items={[
          'Create new branches from the current HEAD or any ref',
          'Switch between branches with a single click',
          'Delete local branches',
          'View branch history',
        ]}
      />

      <H2 id="staging">Staging & Committing</H2>
      <List
        items={[
          'Stage individual files or all changes',
          'Unstage files from the staging area',
          'Write commit messages with a built-in editor',
          'Amend the last commit',
        ]}
      />

      <H2 id="push-pull">Pushing & Pulling</H2>
      <List
        items={[
          'Push to remote with tracking',
          'Pull with rebase or merge',
          'Fetch from all remotes',
          'View push/pull status in the status bar',
        ]}
      />

      <H2 id="stashing">Stashing</H2>
      <List
        items={[
          'Stash working changes with an optional message',
          'Apply or pop stashes from the stash list',
          'Drop individual stashes',
        ]}
      />

      <H2 id="tagging">Tagging</H2>
      <List
        items={[
          'Create lightweight or annotated tags',
          'Push tags to remote',
          'View tag list',
        ]}
      />

      <H2 id="status-bar">Status Bar</H2>
      <Paragraph>
        The bottom status bar always shows the current branch name, ahead/behind count relative to
        the remote, and sync status. All git operations are also available through the Command
        Palette (Ctrl+Shift+P).
      </Paragraph>
    </>
  )
}

// ─── Deployment ──────────────────────────────────────────────────────────────

export function DeploymentDoc() {
  return (
    <>
      <DocHeading>Deployment</DocHeading>
      <DocSubheading>
        One-click deployment to Vercel and Railway directly from the editor.
      </DocSubheading>

      <H2 id="vercel">Vercel</H2>
      <Paragraph>Deploy frontend projects to Vercel with a single click:</Paragraph>
      <List
        items={[
          <><strong>Connect once</strong> by linking your Vercel account in Settings &gt; Integrations</>,
          <><strong>Deploy</strong> by clicking the deploy button in the Command Drawer</>,
          <><strong>Monitor</strong> deployment status and logs directly in DAEMON</>,
        ]}
      />
      <Paragraph>
        DAEMON automatically detects your framework (Next.js, React, Vite, static sites) and
        configures the build settings.
      </Paragraph>

      <H2 id="railway">Railway</H2>
      <Paragraph>Deploy backend services and databases to Railway:</Paragraph>
      <List
        items={[
          <><strong>Connect once</strong> by linking your Railway account in Settings &gt; Integrations</>,
          <><strong>Deploy</strong> by selecting your project and clicking deploy</>,
          <><strong>Monitor</strong> logs and service status in DAEMON</>,
        ]}
      />

      <H3>Use Cases</H3>
      <List
        items={[
          'Node.js API servers',
          'Database provisioning',
          'Background workers',
          'Full-stack apps (Vercel frontend + Railway backend)',
        ]}
      />

      <H2 id="workflow">Workflow</H2>
      <Paragraph>A typical deployment workflow in DAEMON:</Paragraph>
      <List
        items={[
          'Write and test your code in the Monaco editor',
          'Run tests with an AI agent or the terminal',
          'Commit changes via the visual git panel',
          'Click deploy and your app is live',
        ]}
      />
      <Paragraph>
        The entire cycle from code to production happens inside one app. Deployment settings are
        stored per-project and persist across sessions.
      </Paragraph>
    </>
  )
}

// ─── Architecture ────────────────────────────────────────────────────────────

export function ArchitectureDoc() {
  return (
    <>
      <DocHeading>Architecture</DocHeading>
      <DocSubheading>
        Not a fork. Not a wrapper. A standalone Electron app built intentionally for Solana
        development.
      </DocSubheading>

      <H2 id="principles">Core Principles</H2>

      <H3>1. Process Isolation</H3>
      <Paragraph>
        All database and filesystem access runs in the main process. The renderer never touches
        SQLite directly. Everything flows through typed IPC handlers. This ensures stability,
        security, and clean separation of concerns.
      </Paragraph>

      <H3>2. Typed IPC Contract</H3>
      <Paragraph>
        Every IPC handler returns {'{ ok, data }'} or {'{ ok, error }'}. No raw throws across the
        Electron bridge. There are 20 IPC modules covering agents, wallet, git, terminals, and more.
      </Paragraph>

      <H3>3. Offline First</H3>
      <Paragraph>
        The Monaco editor runs through a custom protocol handler registered in Electron's main
        process. Zero network requests for core editing. Your code stays on your machine.
      </Paragraph>

      <H3>4. Native Modules</H3>
      <Paragraph>
        better-sqlite3 and node-pty are unpacked from ASAR for production builds. Real PTY
        sessions, real database. Not browser polyfills pretending to be native.
      </Paragraph>

      <H2 id="tech-stack">Tech Stack</H2>
      <Table
        headers={['Layer', 'Technology', 'Detail']}
        rows={[
          ['Shell', 'Electron 33', 'Chromium + Node in one process'],
          ['Build', 'Vite', 'Sub-second HMR'],
          ['UI', 'React 18 + TypeScript', 'Strict types, zero any'],
          ['Editor', 'Monaco Editor', 'Custom protocol, fully offline'],
          ['Terminal', 'node-pty + xterm.js', 'Real PTY, not emulated'],
          ['State', 'Zustand', 'One store per domain'],
          ['Database', 'better-sqlite3', 'WAL mode, main process only'],
          ['Git', 'simple-git', 'Branch, stash, tag, push'],
          ['Package', 'electron-builder', '.exe + .dmg, auto-update'],
        ]}
      />

      <H2 id="project-structure">Project Structure</H2>
      <CodeBlock>{`electron/
  main/       App entry, windows, protocols
  ipc/        One handler per domain (20 modules)
  services/   Business logic layer
  db/         SQLite schema, migrations, WAL
  shared/     Types shared between main and renderer

src/
  panels/     One directory per UI panel (21 panels)
  store/      Zustand state management
  plugins/    Plugin registry + lazy loading
  components/ Shared UI primitives

styles/       Global CSS tokens and base styles
test/         Vitest test suites`}</CodeBlock>

      <H2 id="ipc">IPC Architecture</H2>
      <Paragraph>
        The IPC layer bridges the renderer (UI) and main process (backend). Each domain has its own
        handler file:
      </Paragraph>
      <CodeBlock title="electron/ipc/">{`agents.ts       Agent spawning and management
wallet.ts       Wallet operations and Helius API
git.ts          Git operations via simple-git
terminal.ts     PTY session management
editor.ts       File operations and Monaco protocol
deploy.ts       Vercel and Railway deployment
settings.ts     User preferences and configuration
tokens.ts       Token tracking and PumpFun integration
...             (20 modules total)`}</CodeBlock>

      <H2 id="state">State Management</H2>
      <Paragraph>DAEMON uses Zustand with one store per domain:</Paragraph>
      <List
        items={[
          <><Code>useEditorStore</Code> for open files, active tab, and editor state</>,
          <><Code>useWalletStore</Code> for wallet connection, balances, and tokens</>,
          <><Code>useAgentStore</Code> for active agents, sessions, and Grind Mode state</>,
          <><Code>useGitStore</Code> for branch, status, diff, and stash</>,
          <><Code>useTerminalStore</Code> for terminal sessions, splits, and history</>,
        ]}
      />

      <H2 id="database">Database</H2>
      <Paragraph>
        DAEMON uses better-sqlite3 in WAL (Write-Ahead Logging) mode for fast concurrent reads. The
        database runs exclusively in the main process and stores user settings, agent session
        history, token tracking data, project configurations, and the MCP server registry.
      </Paragraph>
    </>
  )
}

// ─── Keyboard Shortcuts ──────────────────────────────────────────────────────

export function KeyboardShortcutsDoc() {
  return (
    <>
      <DocHeading>Keyboard Shortcuts</DocHeading>
      <DocSubheading>Full shortcut reference for DAEMON.</DocSubheading>

      <H2 id="essential">Essential</H2>
      <Table
        headers={['Shortcut', 'Action']}
        rows={[
          [<Code key="k">Ctrl+K</Code>, 'Command Drawer (access all tools)'],
          [<Code key="p">Ctrl+P</Code>, 'Quick Open (file search)'],
          [<Code key="sp">Ctrl+Shift+P</Code>, 'Command Palette'],
          [<Code key="sa">Ctrl+Shift+A</Code>, 'Agent Launcher'],
          [<Code key="sg">Ctrl+Shift+G</Code>, 'Grind Mode'],
          [<Code key="c">Ctrl+,</Code>, 'Settings'],
        ]}
      />

      <H2 id="editor">Editor</H2>
      <Table
        headers={['Shortcut', 'Action']}
        rows={[
          [<Code key="s">Ctrl+S</Code>, 'Save file'],
          [<Code key="z">Ctrl+Z</Code>, 'Undo'],
          [<Code key="sz">Ctrl+Shift+Z</Code>, 'Redo'],
          [<Code key="f">Ctrl+F</Code>, 'Find in file'],
          [<Code key="h">Ctrl+H</Code>, 'Find and replace'],
          [<Code key="d">Ctrl+D</Code>, 'Select next occurrence'],
          [<Code key="sl">Ctrl+Shift+L</Code>, 'Select all occurrences'],
          [<Code key="slash">Ctrl+/</Code>, 'Toggle line comment'],
          [<Code key="au">Alt+Up/Down</Code>, 'Move line up/down'],
          [<Code key="sk">Ctrl+Shift+K</Code>, 'Delete line'],
        ]}
      />

      <H2 id="navigation">Navigation</H2>
      <Table
        headers={['Shortcut', 'Action']}
        rows={[
          [<Code key="p2">Ctrl+P</Code>, 'Quick Open (file search)'],
          [<Code key="sb">Ctrl+Shift+B</Code>, 'Browser Tab'],
          [<Code key="sd">Ctrl+Shift+D</Code>, 'Dashboard Tab'],
          [<Code key="tab">Ctrl+Tab</Code>, 'Next editor tab'],
          [<Code key="stab">Ctrl+Shift+Tab</Code>, 'Previous editor tab'],
        ]}
      />

      <H2 id="terminal">Terminal</H2>
      <Table
        headers={['Shortcut', 'Action']}
        rows={[
          [<Code key="bt">Ctrl+`</Code>, 'Toggle Terminal'],
          [<Code key="sf">Ctrl+Shift+F</Code>, 'Terminal Search'],
          [<Code key="r">Ctrl+R</Code>, 'Reverse search history'],
        ]}
      />

      <H2 id="agents">AI Agents</H2>
      <Table
        headers={['Shortcut', 'Action']}
        rows={[
          [<Code key="sa2">Ctrl+Shift+A</Code>, 'Agent Launcher'],
          [<Code key="sg2">Ctrl+Shift+G</Code>, 'Grind Mode'],
        ]}
      />

      <Hint type="info">
        All shortcuts use <strong>Ctrl</strong> on Windows and <strong>Cmd</strong> on macOS.
      </Hint>
    </>
  )
}

// ─── Troubleshooting ─────────────────────────────────────────────────────────

export function TroubleshootingDoc() {
  return (
    <>
      <DocHeading>Troubleshooting</DocHeading>
      <DocSubheading>Common issues and how to fix them.</DocSubheading>

      <H2 id="editor-crash">Editor crash: "Press Ctrl+K to access tools"</H2>
      <Paragraph>
        Click the <strong>Retry</strong> button in the error boundary. If the editor doesn't
        recover, close and reopen the tab.
      </Paragraph>
      <Paragraph>
        DAEMON wraps the Monaco editor in an ErrorBoundary that catches initialization failures.
        This usually happens on first launch or after a system sleep.
      </Paragraph>

      <H2 id="claude-not-connecting">Claude not connecting</H2>
      <Paragraph>
        Open <strong>Settings &gt; Integrations</strong> and verify the Claude CLI is installed and
        authenticated.
      </Paragraph>
      <List
        items={[
          <>Run <Code>claude --version</Code> in the terminal to confirm the CLI is installed</>,
          'If not installed, DAEMON can auto-install it from Settings > Integrations > Claude',
          'If installed but not connecting, re-run the OAuth sign-in (sessions can expire)',
          "If using an API key, verify it's valid and has available credits",
        ]}
      />

      <H2 id="terminal-paste">Terminal paste not working</H2>
      <Paragraph>
        Right-click to paste in the terminal. The xterm.js terminal does not show a context menu.
        Right-click triggers paste directly. <Code>Ctrl+V</Code> may not work in all terminal
        contexts because the terminal captures keyboard input for the running process.
      </Paragraph>

      <H2 id="missing-panels">Missing tools or panels</H2>
      <Paragraph>
        Check your <strong>Workspace Profile</strong> in{' '}
        <strong>Settings &gt; Display</strong>. Some panels are only enabled for specific profiles:
      </Paragraph>
      <List
        items={[
          <><strong>Wallet</strong> requires Solana profile (by default)</>,
          <><strong>Token Dashboard</strong> requires Solana profile</>,
          <><strong>Jupiter Swap</strong> requires Solana profile</>,
          <><strong>Browser</strong> requires Web or Custom profile</>,
        ]}
      />
      <Hint type="info">
        Switch to the <strong>Custom</strong> profile to enable everything manually.
      </Hint>

      <H2 id="native-modules">Native module build errors</H2>
      <Paragraph>
        If you see errors related to better-sqlite3 or node-pty after installation, run:
      </Paragraph>
      <CodeBlock>pnpm run rebuild</CodeBlock>
      <Paragraph>These are C++ native modules that need to be compiled for your system.</Paragraph>

      <H2 id="agents-not-spawning">Agents not spawning</H2>
      <List
        items={[
          'Verify Claude CLI is authenticated (see above)',
          <>Check that Node.js 22+ is installed (<Code>node --version</Code>)</>,
          'Ensure you have sufficient API credits',
          'Check the terminal output for error messages',
        ]}
      />

      <H2 id="memory">High memory usage</H2>
      <Paragraph>
        DAEMON runs multiple processes (Electron main, renderer, PTY sessions, agent processes). To
        reduce memory usage:
      </Paragraph>
      <List
        items={[
          'Close unused terminal tabs',
          'End idle agent sessions',
          'Reduce the number of Grind Mode panels for lighter tasks',
          'Close unused editor tabs',
        ]}
      />
    </>
  )
}

// ─── Roadmap ─────────────────────────────────────────────────────────────────

export function RoadmapDoc() {
  return (
    <>
      <DocHeading>Roadmap</DocHeading>
      <DocSubheading>What's coming next for DAEMON.</DocSubheading>

      <H2 id="in-development">In Development</H2>

      <CardGrid>
        <InfoCard title="Multi-Agent Orchestration">
          Run multiple AI agents simultaneously with intelligent task distribution and coordination.
          Building on Grind Mode's foundation with smarter inter-agent communication.
        </InfoCard>
        <InfoCard title="Local LLM Support">
          Run local language models for offline AI assistance with Ollama and LM Studio integration.
          Use open-source models when you don't need Claude's full capabilities.
        </InfoCard>
      </CardGrid>

      <H2 id="planned">Planned</H2>

      <CardGrid>
        <InfoCard title="Real-Time Collaboration">
          Work with teammates in real-time with live cursors, presence indicators, and shared
          sessions.
        </InfoCard>
        <InfoCard title="Enhanced Security">
          Advanced sandboxing, code signing verification, and secure credential management.
        </InfoCard>
        <InfoCard title="Cloud Sync">
          Sync your settings, plugins, and workspace configurations across devices. Pick up where
          you left off on any machine.
        </InfoCard>
        <InfoCard title="Team Workspaces">
          Shared project configurations, MCP servers, and agent templates for teams.
        </InfoCard>
      </CardGrid>

      <Divider />

      <H2 id="suggest">Suggest a Feature</H2>
      <Paragraph>Want to influence the roadmap? Open an issue or contribute directly:</Paragraph>
      <Paragraph>
        <a href="https://github.com/nullxnothing/daemon/issues" target="_blank" rel="noopener noreferrer">
          Open an issue on GitHub
        </a>
      </Paragraph>
    </>
  )
}

// ─── Contributing ────────────────────────────────────────────────────────────

export function ContributingDoc() {
  return (
    <>
      <DocHeading>Contributing</DocHeading>
      <DocSubheading>
        How to set up DAEMON for local development and submit contributions.
      </DocSubheading>

      <H2 id="getting-started">Getting Started</H2>
      <CodeBlock title="Terminal">{`git clone https://github.com/nullxnothing/daemon.git
cd daemon
pnpm install
pnpm run dev`}</CodeBlock>
      <Paragraph>In a second terminal, run the type checker in watch mode:</Paragraph>
      <CodeBlock>pnpm run typecheck:watch</CodeBlock>

      <H2 id="requirements">Requirements</H2>
      <Table
        headers={['Requirement', 'Version']}
        rows={[
          ['Node.js', '22+'],
          ['pnpm', '9+'],
          ['OS', 'Windows or macOS (Linux experimental)'],
        ]}
      />

      <H2 id="commands">Development Commands</H2>
      <Table
        headers={['Command', 'Description']}
        rows={[
          [<Code key="dev">pnpm run dev</Code>, 'Start dev server with hot reload'],
          [<Code key="tc">pnpm run typecheck</Code>, 'Run TypeScript checks'],
          [<Code key="test">pnpm run test</Code>, 'Run the test suite'],
          [<Code key="build">pnpm run build</Code>, 'Production build'],
          [<Code key="pkg">pnpm run package</Code>, 'Create distributable (.exe / .dmg)'],
          [<Code key="rb">pnpm run rebuild</Code>, 'Rebuild native modules'],
        ]}
      />

      <H2 id="native-modules">Native Modules</H2>
      <Paragraph>
        better-sqlite3 and node-pty are C++ native modules rebuilt automatically via postinstall.
        If you hit issues after pnpm install:
      </Paragraph>
      <CodeBlock>pnpm run rebuild</CodeBlock>

      <H2 id="architecture">Architecture</H2>
      <CodeBlock>{`electron/          Main process - IPC handlers, services, database
  ipc/             One handler file per domain
  services/        Business logic (never imported from renderer)
  db/              SQLite schema + migrations
  shared/          Types shared between main and renderer

src/               Renderer - React 18 + TypeScript
  panels/          One directory per panel
  store/           Zustand stores
  components/      Shared UI components

styles/            Global CSS tokens and base styles
test/              Vitest test suites`}</CodeBlock>

      <H2 id="rules">Rules</H2>
      <List
        items={[
          'All DB access stays in the main process. Renderer uses IPC only',
          <>All IPC handlers use <Code>IpcHandlerFactory</Code> and return {'{ ok, data/error }'}</>,
          'CSS Modules only, no Tailwind. Follow existing token system',
          'No emoji in UI chrome. Status via colored dots only',
          'Test with pnpm run package before PRs that touch native modules',
        ]}
      />

      <H2 id="commits">Commit Convention</H2>
      <Table
        headers={['Prefix', 'Use']}
        rows={[
          [<Code key="feat">feat:</Code>, 'New feature'],
          [<Code key="fix">fix:</Code>, 'Bug fix'],
          [<Code key="ref">refactor:</Code>, 'Code change (not a fix or feature)'],
          [<Code key="docs">docs:</Code>, 'Documentation only'],
          [<Code key="test">test:</Code>, 'Adding or updating tests'],
          [<Code key="chore">chore:</Code>, 'Maintenance tasks'],
        ]}
      />

      <H2 id="pull-requests">Pull Requests</H2>
      <List
        items={[
          'Keep PRs focused. One feature or fix per PR',
          'Include screenshots for UI changes',
          'Ensure pnpm run typecheck and pnpm run test pass',
          'Fill out the PR template',
        ]}
      />
    </>
  )
}

// ─── Slug-to-component map ───────────────────────────────────────────────────

export const DOC_COMPONENTS: Record<string, () => JSX.Element> = {
  introduction: IntroductionDoc,
  installation: InstallationDoc,
  onboarding: OnboardingDoc,
  'ui-overview': UIOverviewDoc,
  'ai-agents': AIAgentsDoc,
  'grind-mode': GrindModeDoc,
  'solana-development': SolanaDevelopmentDoc,
  'editor-terminal': EditorTerminalDoc,
  'git-integration': GitIntegrationDoc,
  deployment: DeploymentDoc,
  architecture: ArchitectureDoc,
  'keyboard-shortcuts': KeyboardShortcutsDoc,
  troubleshooting: TroubleshootingDoc,
  roadmap: RoadmapDoc,
  contributing: ContributingDoc,
}
