import type Database from 'better-sqlite3'
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9, SCHEMA_V10, SCHEMA_V11, SCHEMA_V12, SCHEMA_V13, SCHEMA_V14 } from './schema'

export function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER DEFAULT (unixepoch())
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
        try { db.exec(stmt) } catch { /* column/index may already exist */ }
      }
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(9)
    })()
  }

  if (currentVersion < 10) {
    db.transaction(() => {
      const stmts = SCHEMA_V10.split(';').map((s) => s.trim()).filter(Boolean)
      for (const stmt of stmts) {
        try { db.exec(stmt) } catch { /* column/index may already exist */ }
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

  // Ensure Solana agent exists (idempotent — handles existing DBs before it was seeded)
  try {
    const hasSolanaAgent = db.prepare("SELECT id FROM agents WHERE id = 'solana-agent'").get()
    if (!hasSolanaAgent) {
      db.prepare(
        'INSERT OR IGNORE INTO agents (id, name, system_prompt, model, mcps, shortcut, source) VALUES (?,?,?,?,?,?,?)'
      ).run(
        'solana-agent',
        'Solana Agent',
        'You are a Solana development agent. You help build, debug, and audit Solana programs, tokens, and DeFi integrations. You have deep knowledge of the Solana ecosystem including Anchor, SPL tokens, Metaplex, Raydium, Pump.fun, and the Solana CLI. You can read and write Rust, TypeScript, and Python. Focus on correctness, security, and gas efficiency.',
        'claude-opus-4-20250514',
        '["filesystem"]',
        'cmd+shift+s',
        'daemon',
      )
    }
  } catch (err) {
    console.warn('[Migrations] solana agent seed check failed:', (err as Error).message)
  }

  // Ensure built-in tools exist (idempotent — handles upgrades where table exists but seed was missed)
  try {
    const hasRecovery = db.prepare("SELECT id FROM tools WHERE id = 'builtin-wallet-recovery'").get()
    if (!hasRecovery) seedBuiltinTools(db)
  } catch (err) {
    console.warn('[Migrations] built-in tools seed check failed:', (err as Error).message)
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
      prompt: 'You are a debug agent for the DAEMON application itself. Diagnose and fix issues with this Electron app. You have full filesystem access.',
      model: 'claude-opus-4-20250514',
      mcps: '["filesystem"]',
      shortcut: 'cmd+shift+d',
    },
    {
      id: 'security-audit',
      name: 'Security Audit',
      prompt: 'You perform security audits. Read-only mode — never write to files. Look for: reentrancy, missing signer validation, integer overflow, auth bypasses.',
      model: 'claude-opus-4-20250514',
      mcps: '["filesystem"]',
      shortcut: 'cmd+2',
    },
    {
      id: 'code-review',
      name: 'Code Review',
      prompt: 'You review and clean up code. Remove dead code, improve naming, add missing error handling, fix obvious bugs. Conservative changes only.',
      model: 'claude-sonnet-4-20250514',
      mcps: '["filesystem"]',
      shortcut: 'cmd+3',
    },
    {
      id: 'git-agent',
      name: 'Git Agent',
      prompt: 'You manage git operations. Summarize recent changes, write clear commit messages, stage and commit files. Never push unless explicitly told to.',
      model: 'claude-haiku-4-5-20251001',
      mcps: '["filesystem"]',
      shortcut: 'cmd+4',
    },
    {
      id: 'test-runner',
      name: 'Test Runner',
      prompt: 'You run tests and report results clearly. Run the test suite, identify failures, explain what is failing and why. Do not attempt to fix — report only.',
      model: 'claude-haiku-4-5-20251001',
      mcps: '["filesystem"]',
      shortcut: 'cmd+5',
    },
    {
      id: 'solana-agent',
      name: 'Solana Agent',
      prompt: 'You are a Solana development agent. You help build, debug, and audit Solana programs, tokens, and DeFi integrations. You have deep knowledge of the Solana ecosystem including Anchor, SPL tokens, Metaplex, Raydium, Pump.fun, and the Solana CLI. You can read and write Rust, TypeScript, and Python. Focus on correctness, security, and gas efficiency.',
      model: 'claude-opus-4-20250514',
      mcps: '["filesystem"]',
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
