import type Database from 'better-sqlite3'
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9, SCHEMA_V10, SCHEMA_V11, SCHEMA_V12, SCHEMA_V13, SCHEMA_V14, SCHEMA_V15, SCHEMA_V16, SCHEMA_V17, SCHEMA_V18, SCHEMA_V19, SCHEMA_V20, SCHEMA_V21, SCHEMA_V22 } from './schema'

export function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
    );
  `)

  const current = db.prepare('SELECT MAX(version) as v FROM _migrations').get() as { v: number | null }
  const currentVersion = current?.v ?? 0

  if (currentVersion < 1) {
    db.transaction(() => {
      db.exec(SCHEMA_V1)
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(1)
      seedDefaults(db)
    })()
  }

  if (currentVersion < 2) {
    db.transaction(() => {
      db.exec(SCHEMA_V2)
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(2)
      seedMcpRegistry(db)
    })()
  }

  if (currentVersion < 3) {
    db.transaction(() => {
      db.exec(SCHEMA_V3)
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(3)
    })()
  }

  if (currentVersion < 4) {
    db.transaction(() => {
      try { db.exec(SCHEMA_V4) } catch (err) {
        if (!(err instanceof Error && err.message.includes('duplicate column'))) throw err
      }
      db.prepare('UPDATE agents SET source = ? WHERE source IS NULL').run('daemon')
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(4)
    })()
  }

  if (currentVersion < 5) {
    db.transaction(() => {
      db.exec(SCHEMA_V5)
      db.prepare('INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?,?,?)')
        .run('show_market_tape', 'true', Date.now())
      db.prepare('INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?,?,?)')
        .run('show_titlebar_wallet', 'true', Date.now())
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(5)
    })()
  }

  if (currentVersion < 6) {
    db.transaction(() => {
      db.exec(SCHEMA_V6)
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(6)
    })()
  }

  if (currentVersion < 7) {
    db.transaction(() => {
      db.exec(SCHEMA_V7)
      seedPlugins(db)
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(7)
    })()
  }

  if (currentVersion < 8) {
    db.transaction(() => {
      db.exec(SCHEMA_V8)
      seedBuiltinTools(db)
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(8)
    })()
  }

  if (currentVersion < 9) {
    db.transaction(() => {
      // Each ALTER TABLE must be separate — SQLite doesn't support multi-ALTER in one exec
      const stmts = SCHEMA_V9.split(';').map((s) => s.trim()).filter(Boolean)
      for (const stmt of stmts) {
        try { db.exec(stmt) } catch (err) {
          const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
          if (!msg.includes('duplicate column') && !msg.includes('already exists')) throw err
        }
      }
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(9)
    })()
  }

  if (currentVersion < 10) {
    db.transaction(() => {
      const stmts = SCHEMA_V10.split(';').map((s) => s.trim()).filter(Boolean)
      for (const stmt of stmts) {
        try { db.exec(stmt) } catch (err) {
          const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
          if (!msg.includes('duplicate column') && !msg.includes('already exists')) throw err
        }
      }
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(10)
    })()
  }

  if (currentVersion < 11) {
    db.transaction(() => {
      db.exec(SCHEMA_V11)
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(11)
    })()
  }

  if (currentVersion < 12) {
    db.transaction(() => {
      db.exec(SCHEMA_V12)
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(12)
    })()
  }

  if (currentVersion < 13) {
    db.transaction(() => {
      db.exec(SCHEMA_V13)
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(13)
    })()
  }

  if (currentVersion < 14) {
    db.transaction(() => {
      db.exec(SCHEMA_V14)
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(14)
    })()
  }

  if (currentVersion < 15) {
    db.transaction(() => {
      const stmts = SCHEMA_V15.split(';').map((s) => s.trim()).filter(Boolean)
      for (const stmt of stmts) {
        try { db.exec(stmt) } catch (err) {
          const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
          if (!msg.includes('already exists')) throw err
        }
      }
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(15)
    })()
  }

  if (currentVersion < 16) {
    db.transaction(() => {
      const stmts = SCHEMA_V16.split(';').map((s) => s.trim()).filter(Boolean)
      for (const stmt of stmts) {
        try { db.exec(stmt) } catch (err) {
          const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
          if (!msg.includes('already exists')) throw err
        }
      }
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(16)
    })()
  }

  if (currentVersion < 17) {
    db.transaction(() => {
      const stmts = SCHEMA_V17.split(';').map((s) => s.trim()).filter(Boolean)
      for (const stmt of stmts) {
        try { db.exec(stmt) } catch (err) {
          const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
          if (!msg.includes('already exists')) throw err
        }
      }
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(17)
    })()
  }

  if (currentVersion < 18) {
    db.transaction(() => {
      const stmts = SCHEMA_V18.split(';').map((s) => s.trim()).filter(Boolean)
      for (const stmt of stmts) {
        try { db.exec(stmt) } catch (err) {
          const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
          if (!msg.includes('already exists')) throw err
        }
      }
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(18)
    })()
  }

  if (currentVersion < 19) {
    db.transaction(() => {
      const stmts = SCHEMA_V19.split(';').map((s) => s.trim()).filter(Boolean)
      for (const stmt of stmts) {
        try { db.exec(stmt) } catch (err) {
          const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
          if (!msg.includes('duplicate column') && !msg.includes('already exists')) throw err
        }
      }
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(19)
    })()
  }

  if (currentVersion < 20) {
    db.transaction(() => {
      const stmts = SCHEMA_V20.split(';').map((s) => s.trim()).filter(Boolean)
      for (const stmt of stmts) {
        try { db.exec(stmt) } catch (err) {
          const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
          if (!msg.includes('already exists')) throw err
        }
      }
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(20)
    })()
  }

  if (currentVersion < 21) {
    db.transaction(() => {
      const stmts = SCHEMA_V21.split(';').map((s) => s.trim()).filter(Boolean)
      for (const stmt of stmts) {
        try { db.exec(stmt) } catch (err) {
          const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
          if (!msg.includes('already exists')) throw err
        }
      }
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(21)
    })()
  }

  if (currentVersion < 22) {
    db.transaction(() => {
      const stmts = SCHEMA_V22.split(';').map((s) => s.trim()).filter(Boolean)
      for (const stmt of stmts) {
        try { db.exec(stmt) } catch (err) {
          const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
          if (!msg.includes('duplicate column') && !msg.includes('already exists')) throw err
        }
      }
      db.prepare('INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?,?,?)')
        .run('default_provider', 'claude', Date.now())
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(22)
    })()
  }

  // Ensure Solana agent exists (idempotent — handles existing DBs before it was seeded)
  try {
    const hasSolanaAgent = db.prepare("SELECT id FROM agents WHERE id = 'solana-agent'").get()
    if (!hasSolanaAgent) {
      db.prepare(
        'INSERT OR IGNORE INTO agents (id, name, system_prompt, model, mcps, shortcut, source) VALUES (?,?,?,?,?,?,?)'
      ).run(
        'solana-agent',
        'Solana Agent',
        `You are a Solana development agent specializing in on-chain programs and DeFi integrations.

<context-tags>project,solana,x402</context-tags>

Capabilities:
- Build, debug, and audit Anchor programs and native Solana BPF/SBF programs
- Work with SPL tokens, Metaplex, Raydium, Jupiter, Pump.fun, and PumpSwap
- Implement x402 payment protocols using PayAI facilitator for API monetization
- Use Machine Payments Protocol (MPP) for autonomous agent-to-agent payments
- Write and review Rust (on-chain), TypeScript (client/SDK), and Python (scripts/bots)
- Analyze transaction logs, CPI traces, and account state
- Optimize compute units and transaction size

Focus areas:
- Correctness: proper PDA derivation, signer validation, account ownership checks
- Security: reentrancy guards, integer overflow, missing close account logic
- Efficiency: minimize CU usage, pack instructions, use lookup tables

Output format:
- For code: provide complete, compilable snippets with imports
- For audits: use the severity format (CRITICAL/HIGH/MEDIUM/LOW)
- For debugging: show the failing instruction index and decoded error

Proceed immediately with the task. Ask for clarification only when the target program/network (devnet vs mainnet) is ambiguous.`,
        'claude-opus-4-20250514',
        '["filesystem"]',
        'cmd+shift+s',
        'daemon',
      )
    }
  } catch (err) {
    console.warn('[Migrations] solana agent seed check failed:', (err as Error).message)
  }

  // Ensure Colosseum Research agent exists
  try {
    const hasColosseumAgent = db.prepare("SELECT id FROM agents WHERE id = 'colosseum-research'").get()
    if (!hasColosseumAgent) {
      db.prepare(
        'INSERT OR IGNORE INTO agents (id, name, system_prompt, model, mcps, shortcut, source) VALUES (?,?,?,?,?,?,?)'
      ).run(
        'colosseum-research',
        'Colosseum Research',
        `You are a hackathon research agent with access to the Colosseum Copilot API containing 5,400+ Solana builder projects and curated crypto archives.

<context-tags>project</context-tags>

Use the /colosseum-copilot skill to search projects and archives. When researching:
- Search for similar projects using specific technical terms
- Check both regular and winner/accelerator-only results
- Reference archive sources (a16z, Paradigm, Nakamoto Institute) for market context
- Include project slugs and hackathon names in citations

You help builders:
- Validate idea uniqueness ("Is anyone else building this?")
- Analyze competition ("Who are the strongest competitors?")
- Choose submission tracks ("Which track fits best?")
- Study winners ("What do winning projects look like?")
- Find market gaps ("What's missing in the ecosystem?")

Output: bullet points with inline citations. Be direct. No fluff.`,
        'claude-sonnet-4-20250514',
        '["filesystem"]',
        null,
        'daemon',
      )
    }
  } catch (err) {
    console.warn('[Migrations] colosseum-research agent seed check failed:', (err as Error).message)
  }

  // Ensure built-in tools exist (idempotent — handles upgrades where table exists but seed was missed)
  try {
    const hasRecovery = db.prepare("SELECT id FROM tools WHERE id = 'builtin-wallet-recovery'").get()
    if (!hasRecovery) seedBuiltinTools(db)
  } catch (err) {
    console.warn('[Migrations] built-in tools seed check failed:', (err as Error).message)
  }

  // Ensure solana-mcp-server exists in registry (idempotent — handles DBs seeded before it was added)
  try {
    const hasSolanaMcp = db.prepare("SELECT name FROM mcp_registry WHERE name = 'solana-mcp-server'").get()
    if (!hasSolanaMcp) {
      db.prepare('INSERT OR IGNORE INTO mcp_registry (name, config, description, is_global) VALUES (?,?,?,?)').run(
        'solana-mcp-server',
        JSON.stringify({ command: 'npx', args: ['-y', 'solana-mcp-server'] }),
        'Solana program deployment, account inspection, and docs search',
        0,
      )
    }
  } catch (err) {
    console.warn('[Migrations] solana-mcp-server registry seed check failed:', (err as Error).message)
  }

  // Ensure payai-mcp-server exists in registry (x402 payment protocol for AI agents)
  try {
    const hasPayaiMcp = db.prepare("SELECT name FROM mcp_registry WHERE name = 'payai-mcp-server'").get()
    if (!hasPayaiMcp) {
      db.prepare('INSERT OR IGNORE INTO mcp_registry (name, config, description, is_global) VALUES (?,?,?,?)').run(
        'payai-mcp-server',
        JSON.stringify({ command: 'npx', args: ['-y', 'payai-mcp-server'] }),
        'x402 payment protocol — monetize APIs with USDC micropayments via PayAI facilitator',
        0,
      )
    }
  } catch (err) {
    console.warn('[Migrations] payai-mcp-server registry seed check failed:', (err as Error).message)
  }

  // Ensure x402-mcp exists in registry (Coinbase x402 protocol tools)
  try {
    const hasX402Mcp = db.prepare("SELECT name FROM mcp_registry WHERE name = 'x402-mcp'").get()
    if (!hasX402Mcp) {
      db.prepare('INSERT OR IGNORE INTO mcp_registry (name, config, description, is_global) VALUES (?,?,?,?)').run(
        'x402-mcp',
        JSON.stringify({ command: 'npx', args: ['-y', '@x402/mcp'] }),
        'x402 HTTP 402 payment tools — build and consume paid APIs with stablecoin micropayments',
        0,
      )
    }
  } catch (err) {
    console.warn('[Migrations] x402-mcp registry seed check failed:', (err as Error).message)
  }

  // Ensure all registry plugins have DB rows (handles plugins added after initial migration)
  try {
    const newPlugins = [
      { id: 'pumpfun', order: 9 },
    ]
    const insert = db.prepare('INSERT OR IGNORE INTO plugins (id, enabled, sort_order, config) VALUES (?,?,?,?)')
    for (const p of newPlugins) {
      insert.run(p.id, 1, p.order, '{}')
    }
  } catch (err) {
    console.warn('[Migrations] plugin seed check failed:', (err as Error).message)
  }

  // Clean stale sessions from previous crashed runs — PTY processes are dead after restart
  db.prepare('DELETE FROM active_sessions').run()
}

function seedDefaults(db: Database.Database) {
  const agentCount = (db.prepare('SELECT COUNT(*) as c FROM agents').get() as { c: number }).c
  if (agentCount > 0) return

  const insertAgent = db.prepare(
    'INSERT INTO agents (id, name, system_prompt, model, mcps, shortcut, source) VALUES (?,?,?,?,?,?,?)'
  )

  const agents = [
    {
      id: 'daemon-debug',
      name: 'DAEMON Debug',
      prompt: `You are a debug agent for the DAEMON Electron IDE (React 18, Zustand, Monaco, node-pty, better-sqlite3).

<context-tags>project,ports</context-tags>

Capabilities:
- Diagnose renderer crashes, IPC failures, and main-process exceptions
- Trace data flow: Zustand store -> React component -> IPC bridge -> main process -> SQLite
- Inspect terminal/PTY session lifecycle, Monaco editor initialization, and protocol handlers
- Read logs, stack traces, and error_logs table to correlate failures

Output format:
- State the root cause in one sentence
- Provide a numbered fix sequence with exact file paths and code changes
- If a fix touches IPC, show both the handler (electron/ipc/) and the renderer call site

Proceed with diagnosis immediately when given an error or symptom. Ask for clarification only when the symptom is ambiguous and multiple subsystems could be responsible.`,
      model: 'claude-sonnet-4-20250514',
      mcps: '["filesystem"]',
      shortcut: 'cmd+shift+d',
    },
    {
      id: 'security-audit',
      name: 'Security Audit',
      prompt: `You are a security auditor. You perform read-only analysis — never write to files.

<context-tags>project</context-tags>

Focus areas:
- Smart contracts: reentrancy, missing signer validation, integer overflow, unchecked arithmetic, PDA seed collisions
- Web/Electron: XSS via preload bridge, prototype pollution, insecure IPC handlers, missing input validation, plaintext secrets in SQLite
- Auth: privilege escalation, missing access checks, token handling flaws

Output format:
- Severity rating per finding: CRITICAL / HIGH / MEDIUM / LOW / INFO
- For each finding: location (file:line), description, impact, and remediation
- End with a summary table: total findings by severity

Ask for clarification only when the audit scope is unclear (e.g., "audit everything" with 50+ files). Otherwise, proceed with the files available.`,
      model: 'claude-sonnet-4-20250514',
      mcps: '["filesystem"]',
      shortcut: 'cmd+2',
    },
    {
      id: 'code-review',
      name: 'Code Review',
      prompt: `You are a code reviewer focused on maintainability and correctness.

<context-tags>project</context-tags>

Focus areas:
- Dead code, unused imports, redundant logic
- Naming clarity (variables, functions, types)
- Missing error handling, swallowed exceptions, unvalidated inputs
- DRY violations and opportunities for extraction
- TypeScript type safety gaps (any casts, missing return types)

Output format:
- Group findings by file
- For each finding: quote the problematic code, explain the issue, provide the corrected version
- Mark each as: BUG / CLEANUP / STYLE / PERF
- Conservative changes only — do not refactor architecture or change public APIs unless asked

Proceed immediately with the files or diff provided. Ask for clarification only if no files or diff are given.`,
      model: 'claude-sonnet-4-20250514',
      mcps: '["filesystem"]',
      shortcut: 'cmd+3',
    },
    {
      id: 'git-agent',
      name: 'Git Agent',
      prompt: `You are a git operations agent. You stage, commit, and summarize changes.

<context-tags>project</context-tags>

Capabilities:
- Summarize recent commits and working tree changes
- Write conventional commit messages (feat:, fix:, refactor:, docs:, test:, chore:)
- Stage specific files and create atomic commits
- Generate changelogs from commit ranges

Rules:
- NEVER push unless the user explicitly says "push"
- NEVER force-push or rebase without explicit instruction
- Commit messages: imperative mood, under 72 chars for subject, body for context
- When multiple logical changes exist, suggest separate commits

Output format:
- Show the proposed commit message before committing
- After committing, show the short hash and summary

Proceed with the requested git operation immediately. Ask for clarification only when the intent is ambiguous (e.g., "clean up" with mixed staged/unstaged changes).`,
      model: 'claude-haiku-4-5-20251001',
      mcps: '["filesystem"]',
      shortcut: 'cmd+4',
    },
    {
      id: 'test-runner',
      name: 'Test Runner',
      prompt: `You are a test execution and reporting agent. You run tests and report results — you do not fix code.

<context-tags>project</context-tags>

Capabilities:
- Run the project test suite (Vitest, Jest, or detected test runner)
- Parse test output to identify failures, errors, and skipped tests
- Correlate failures with recent changes when git context is available
- Report coverage summary if available

Output format:
- Status line: PASS (X passed) or FAIL (X passed, Y failed, Z skipped)
- For each failure: test name, assertion that failed, expected vs actual, file:line
- End with: "Likely cause" — one sentence per failure explaining what probably broke

Do not attempt to fix failing tests. Do not modify any files. Report only. Proceed immediately when asked to run tests.`,
      model: 'claude-haiku-4-5-20251001',
      mcps: '["filesystem"]',
      shortcut: 'cmd+5',
    },
    {
      id: 'solana-agent',
      name: 'Solana Agent',
      prompt: `You are an expert Solana development agent with access to live blockchain data, protocol SDKs, and security analysis tools.

<context-tags>project,ports,solana,x402</context-tags>

TOOLS — Use these for real-time chain data:
- Helius MCP: getBalance, getTokenBalances, getAsset, getAssetsByOwner, searchAssets, getTokenHolders, parseTransactions, getTransactionHistory, getWalletBalances, getPriorityFeeEstimate, transferSol, transferToken
- Solana MCP: program deployment, account inspection, Solana docs search

SKILLS — You have these skills available. Use /skill-name to invoke them:
- /solana-dev — Anchor programs, LiteSVM testing, program security reviews
- /build or /helius — Helius infrastructure (Sender, DAS API, WebSockets, webhooks, priority fees)
- /raydium — CLMM, CPMM, AMM pools, LaunchLab token launches, farming, CPI
- /meteora — DLMM pools, Dynamic AMM, bonding curves, Alpha Vaults, Zap
- /jupiter-lend — Lending/borrowing, vault operations, deposit/withdraw
- /integrating-jupiter — Jupiter swap APIs (Ultra, Lend, Perps, Trigger, Recurring)
- /metaplex — Core NFTs, Token Metadata, Bubblegum (cNFTs), Candy Machine
- /drift — Perpetual futures, spot trading, vaults, cross-collateral
- /orca — Concentrated liquidity (Whirlpools), swaps, position management
- /pumpfun — Token creation, bonding curves, PumpSwap AMM, creator fees
- /light-protocol — ZK Compression (200x cheaper tokens), compressed PDAs
- /solana-kit — Modern @solana/kit SDK (tree-shakeable, zero-dep)
- /pyth — Pyth oracle price feeds, confidence intervals
- /switchboard — Switchboard oracles, VRF randomness
- /vulnhunter — Security vulnerability detection and variant analysis
- /kamino — Concentrated liquidity management, lending
- /sanctum — Liquid staking (mSOL, jitoSOL, bSOL, INF)
- /payai-x402 — x402 payment protocol, PayAI facilitator, monetize APIs with USDC micropayments

Capabilities:
- Build, debug, and audit Anchor programs and native BPF/SBF programs
- Work with SPL tokens, Token-2022/Extensions, Metaplex Core, all major DEXes
- Write Rust (on-chain), TypeScript (client/SDK), and Python (scripts/bots)
- Query live blockchain state via Helius MCP tools
- Analyze transaction logs, CPI traces, and account state
- Optimize compute units and transaction size
- Implement x402 payment protocols (PayAI facilitator) for API monetization
- Use Machine Payments Protocol (MPP) for autonomous agent-to-agent payments

Rules:
- Always use getPriorityFeeEstimate before sending transactions
- Always use Helius Sender endpoints with skipPreflight: true + Jito tip
- For code: provide complete, compilable snippets with imports
- For audits: CRITICAL/HIGH/MEDIUM/LOW with file:line references
- For debugging: show failing instruction index and decoded error
- Invoke relevant /skill when working with a specific protocol

Proceed immediately. Ask for clarification only when target network is ambiguous.`,
      model: 'claude-opus-4-20250514',
      mcps: '["filesystem","helius","solana-mcp-server"]',
      shortcut: 'cmd+shift+s',
    },
  ]

  for (const a of agents) {
    insertAgent.run(a.id, a.name, a.prompt, a.model, a.mcps, a.shortcut, 'daemon')
  }

  db.prepare(
    'INSERT INTO voice_profile (id, system_prompt, examples) VALUES (?, ?, ?)'
  ).run(
    'default',
    'Write tweets for a solo Solana developer and builder.\nStyle: punchy, lowercase, CT-native, no corporate cringe, no hashtags.\nNever use emojis unless ironic. Under 240 chars unless threading.\nBuilder > marketer. Reference real Solana/crypto context when relevant.\nSound like someone who ships, not someone who talks about shipping.',
    '[]'
  )
}

function seedPlugins(db: Database.Database) {
  const insert = db.prepare('INSERT OR IGNORE INTO plugins (id, enabled, sort_order, config) VALUES (?,?,?,?)')

  const plugins = [
    { id: 'imagegen', order: 0 },
    { id: 'tweet-generator', order: 1 },
    { id: 'remotion', order: 2 },
    { id: 'browser', order: 3 },
    { id: 'gmail', order: 4 },
    { id: 'telegram', order: 5 },
    { id: 'subscriptions', order: 6 },
    { id: 'morning-briefing', order: 7 },
    { id: 'services', order: 8 },
  ]

  for (const p of plugins) {
    insert.run(p.id, 0, p.order, '{}')
  }
}

function seedMcpRegistry(db: Database.Database) {
  const count = (db.prepare('SELECT COUNT(*) as c FROM mcp_registry').get() as { c: number }).c
  if (count > 0) return

  const insert = db.prepare('INSERT INTO mcp_registry (name, config, description, is_global) VALUES (?,?,?,?)')

  const mcps = [
    {
      name: 'filesystem',
      config: JSON.stringify({ command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-filesystem', '/'] }),
      description: 'Read/write access to the filesystem',
      isGlobal: 1,
    },
    {
      name: 'github',
      config: JSON.stringify({ command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-github'], env: { GITHUB_TOKEN: '' } }),
      description: 'GitHub API access (repos, issues, PRs)',
      isGlobal: 1,
    },
    {
      name: 'puppeteer',
      config: JSON.stringify({ command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-puppeteer'] }),
      description: 'Browser automation via Puppeteer',
      isGlobal: 0,
    },
    {
      name: 'helius',
      config: JSON.stringify({ command: 'npx', args: ['-y', 'helius-mcp-server'], env: { HELIUS_API_KEY: '' } }),
      description: 'Solana RPC + DAS API via Helius',
      isGlobal: 0,
    },
    {
      name: 'solana-mcp-server',
      config: JSON.stringify({ command: 'npx', args: ['-y', 'solana-mcp-server'] }),
      description: 'Solana program deployment, account inspection, and docs search',
      isGlobal: 0,
    },
    {
      name: 'vercel',
      config: JSON.stringify({ command: 'npx', args: ['-y', 'vercel-mcp-server'] }),
      description: 'Vercel project management and deployments',
      isGlobal: 0,
    },
  ]

  for (const m of mcps) {
    insert.run(m.name, m.config, m.description, m.isGlobal)
  }
}

function seedBuiltinTools(db: Database.Database) {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO tools (id, name, description, category, language, entrypoint, tool_path, icon, tags) VALUES (?,?,?,?,?,?,?,?,?)'
  )

  insert.run(
    'builtin-wallet-recovery',
    'Wallet Recovery',
    'Scan and recover SOL from derived wallets, close empty token accounts, and collect creator fees',
    'solana',
    'builtin',
    '__builtin__',
    '__builtin__',
    'wallet',
    '["solana","recovery","wallet"]',
  )
}
