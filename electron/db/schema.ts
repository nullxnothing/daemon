export const SCHEMA_V3 = `
CREATE TABLE IF NOT EXISTS mcp_disabled (
  name TEXT PRIMARY KEY,
  config TEXT NOT NULL,
  disabled_at INTEGER DEFAULT (unixepoch())
);
`

export const SCHEMA_V4 = `
ALTER TABLE agents ADD COLUMN source TEXT DEFAULT 'daemon';
ALTER TABLE agents ADD COLUMN external_path TEXT;
`

export const SCHEMA_V5 = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);
`

export const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS secure_keys (
  key_name TEXT PRIMARY KEY,
  encrypted_value BLOB NOT NULL,
  hint TEXT,
  updated_at INTEGER DEFAULT (unixepoch())
);
`

export const SCHEMA_V1 = `
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

-- SECURITY: access_token and refresh_token store encrypted blobs via safeStorage.
-- All reads/writes MUST use safeStorage.encryptString() before INSERT
-- and safeStorage.decryptString() after SELECT (same pattern as SecureKeyService.ts).
CREATE TABLE IF NOT EXISTS oauth_tokens (
  service TEXT PRIMARY KEY,
  access_token BLOB,
  refresh_token BLOB,
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
`

export const SCHEMA_V6 = `
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_wallet ON portfolio_snapshots(wallet_id, snapshot_at);
CREATE INDEX IF NOT EXISTS idx_active_sessions_project ON active_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_agent ON active_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_ports_project ON ports(project_id);
`

export const SCHEMA_V7 = `
CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  config TEXT DEFAULT '{}',
  updated_at INTEGER DEFAULT (unixepoch())
);
`
