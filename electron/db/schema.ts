// CONVENTION: All timestamps use milliseconds (Date.now() in JS, CAST(unixepoch('now') * 1000 AS INTEGER) in SQL defaults).
// Historical data before this convention may contain seconds — consumers should handle both.

export const SCHEMA_V18 = `
CREATE TABLE IF NOT EXISTS agent_sessions_local (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  agent_id TEXT,
  agent_name TEXT,
  model TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  status TEXT DEFAULT 'active',
  lines_generated INTEGER DEFAULT 0,
  tools_used TEXT DEFAULT '[]',
  published_signature TEXT,
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_local_status ON agent_sessions_local(status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_local_created ON agent_sessions_local(created_at DESC);
`

export const SCHEMA_V3 = `
CREATE TABLE IF NOT EXISTS mcp_disabled (
  name TEXT PRIMARY KEY,
  config TEXT NOT NULL,
  disabled_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
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
  updated_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);
`

export const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS secure_keys (
  key_name TEXT PRIMARY KEY,
  encrypted_value BLOB NOT NULL,
  hint TEXT,
  updated_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
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
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
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
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER)),
  last_active INTEGER
);

CREATE TABLE IF NOT EXISTS active_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  agent_id TEXT,
  terminal_id TEXT,
  pid INTEGER,
  started_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);

CREATE TABLE IF NOT EXISTS ports (
  port INTEGER NOT NULL,
  project_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  pid INTEGER,
  registered_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER)),
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
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);

CREATE TABLE IF NOT EXISTS tweets (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  mode TEXT,
  source_tweet TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);

CREATE TABLE IF NOT EXISTS voice_profile (
  id TEXT PRIMARY KEY DEFAULT 'default',
  system_prompt TEXT NOT NULL,
  examples TEXT DEFAULT '[]',
  updated_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
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
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
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
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
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
  dispatched_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER)),
  depth TEXT DEFAULT 'standard'
);

CREATE TABLE IF NOT EXISTS notification_rules (
  id TEXT PRIMARY KEY,
  condition_text TEXT NOT NULL,
  priority TEXT DEFAULT 'surface',
  source TEXT,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);

CREATE TABLE IF NOT EXISTS aria_interactions (
  id TEXT PRIMARY KEY,
  input TEXT NOT NULL,
  parsed_tasks TEXT,
  outcome TEXT,
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);

CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  keypair_path TEXT,
  is_default INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);
`;

export const SCHEMA_V6 = `
CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  context TEXT,
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  total_usd REAL,
  sol_balance REAL,
  tokens TEXT,
  snapshot_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);

CREATE INDEX IF NOT EXISTS idx_error_logs_operation ON error_logs(operation);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at);
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
  updated_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);
`

export const SCHEMA_V8 = `
CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  language TEXT DEFAULT 'typescript',
  entrypoint TEXT NOT NULL,
  tool_path TEXT NOT NULL,
  icon TEXT DEFAULT 'wrench',
  version TEXT DEFAULT '1.0.0',
  author TEXT,
  tags TEXT DEFAULT '[]',
  config TEXT DEFAULT '{}',
  last_run_at INTEGER,
  run_count INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);

CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category);
`

export const SCHEMA_V9 = `
ALTER TABLE subscriptions ADD COLUMN created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER));
ALTER TABLE subscriptions ADD COLUMN updated_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER));
ALTER TABLE oauth_tokens ADD COLUMN updated_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER));

CREATE INDEX IF NOT EXISTS idx_wallets_default ON wallets(is_default);
CREATE INDEX IF NOT EXISTS idx_plugins_enabled ON plugins(enabled);
CREATE INDEX IF NOT EXISTS idx_tweets_status ON tweets(status);
`

export const SCHEMA_V10 = `
ALTER TABLE wallets ADD COLUMN agent_id TEXT;
ALTER TABLE wallets ADD COLUMN wallet_type TEXT DEFAULT 'user';

CREATE TABLE IF NOT EXISTS transaction_history (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  type TEXT NOT NULL,
  signature TEXT,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount REAL NOT NULL,
  mint TEXT,
  symbol TEXT,
  status TEXT DEFAULT 'pending',
  error TEXT,
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);

CREATE INDEX IF NOT EXISTS idx_transaction_history_wallet ON transaction_history(wallet_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tx_history_spend ON transaction_history(wallet_id, type, status, created_at);
CREATE INDEX IF NOT EXISTS idx_wallets_agent ON wallets(agent_id);
CREATE INDEX IF NOT EXISTS idx_wallets_type ON wallets(wallet_type);
`

export const SCHEMA_V11 = `
CREATE TABLE IF NOT EXISTS deploy_cache (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  status TEXT NOT NULL,
  url TEXT,
  branch TEXT,
  commit_sha TEXT,
  commit_message TEXT,
  created_at INTEGER,
  updated_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_deploy_cache_project ON deploy_cache(project_id, platform, created_at DESC);
`

export const SCHEMA_V12 = `
CREATE TABLE IF NOT EXISTS app_crashes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_crashes_created_at ON app_crashes(created_at);
`

export const SCHEMA_V13 = `
CREATE TABLE IF NOT EXISTS email_accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  access_token BLOB,
  refresh_token BLOB,
  imap_password BLOB,
  token_expiry INTEGER,
  client_id_ref TEXT,
  client_secret_ref TEXT,
  status TEXT DEFAULT 'connected',
  last_sync_at INTEGER,
  settings TEXT DEFAULT '{}',
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS email_message_cache (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_msg_id TEXT NOT NULL,
  from_addr TEXT,
  subject TEXT,
  snippet TEXT,
  body TEXT,
  date INTEGER,
  is_read INTEGER DEFAULT 0,
  labels TEXT DEFAULT '[]',
  cached_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_email_cache_account ON email_message_cache(account_id, date DESC);
`

export const SCHEMA_V14 = `
CREATE TABLE IF NOT EXISTS aria_messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  session_id TEXT,
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_aria_messages_session ON aria_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_aria_messages_created ON aria_messages(created_at);
`

export const SCHEMA_V15 = `
CREATE INDEX IF NOT EXISTS idx_agents_external_path ON agents(external_path);
CREATE INDEX IF NOT EXISTS idx_projects_wallet_id ON projects(wallet_id);
CREATE INDEX IF NOT EXISTS idx_crash_history_service ON crash_history(service_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_sessions_project ON dispatch_sessions(project_id);
UPDATE deploy_cache SET created_at = CAST(unixepoch('now') * 1000 AS INTEGER) WHERE created_at IS NULL;
UPDATE email_accounts SET created_at = CAST(unixepoch('now') * 1000 AS INTEGER) WHERE created_at IS NULL;
UPDATE email_accounts SET updated_at = CAST(unixepoch('now') * 1000 AS INTEGER) WHERE updated_at IS NULL;
`

export const SCHEMA_V16 = `
CREATE TABLE IF NOT EXISTS plugin_contexts (
  plugin_id TEXT PRIMARY KEY,
  system_prompt TEXT,
  templates TEXT DEFAULT '[]',
  skills TEXT DEFAULT '[]',
  model TEXT,
  effort TEXT,
  examples TEXT DEFAULT '[]',
  updated_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);

CREATE INDEX IF NOT EXISTS idx_projects_last_active ON projects(last_active DESC);
CREATE INDEX IF NOT EXISTS idx_email_cache_unread ON email_message_cache(account_id, is_read) WHERE is_read = 0;
`

export const SCHEMA_V19 = `
ALTER TABLE agent_sessions_local ADD COLUMN terminal_id TEXT;
ALTER TABLE agent_sessions_local ADD COLUMN custom_name TEXT;
`

export const SCHEMA_V20 = `
CREATE TABLE IF NOT EXISTS vault_files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  encrypted_data BLOB NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'other',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  owner_wallet TEXT,
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_vault_files_created ON vault_files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_files_wallet ON vault_files(owner_wallet);
`

export const SCHEMA_V22 = `
ALTER TABLE agents ADD COLUMN provider TEXT DEFAULT 'claude';
`

export const SCHEMA_V23 = `
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('info','success','warning','error')),
  message TEXT NOT NULL,
  context TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
`

export const SCHEMA_V24 = `
ALTER TABLE launched_tokens ADD COLUMN bonding_curve_address TEXT;
ALTER TABLE launched_tokens ADD COLUMN launchpad_config_json TEXT DEFAULT '{}';
ALTER TABLE launched_tokens ADD COLUMN protocol_receipts_json TEXT DEFAULT '{}';
ALTER TABLE launched_tokens ADD COLUMN error_message TEXT;
ALTER TABLE launched_tokens ADD COLUMN confirmed_at INTEGER;
ALTER TABLE launched_tokens ADD COLUMN updated_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER));

UPDATE launched_tokens SET launchpad_config_json = '{}' WHERE launchpad_config_json IS NULL;
UPDATE launched_tokens SET protocol_receipts_json = '{}' WHERE protocol_receipts_json IS NULL;
UPDATE launched_tokens SET updated_at = COALESCE(updated_at, created_at) WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_launched_tokens_status ON launched_tokens(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_launched_tokens_launchpad ON launched_tokens(launchpad, created_at DESC);
`

export const SCHEMA_V21 = `
CREATE TABLE IF NOT EXISTS pnl_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signature TEXT UNIQUE NOT NULL,
  wallet TEXT NOT NULL,
  mint TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
  token_amount REAL NOT NULL,
  sol_amount REAL NOT NULL,
  price_per_token REAL NOT NULL,
  source TEXT DEFAULT 'unknown',
  timestamp INTEGER NOT NULL,
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);

CREATE INDEX IF NOT EXISTS idx_pnl_trades_wallet_mint ON pnl_trades(wallet, mint);
CREATE INDEX IF NOT EXISTS idx_pnl_trades_timestamp ON pnl_trades(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pnl_trades_signature ON pnl_trades(signature);

CREATE TABLE IF NOT EXISTS pnl_cost_basis (
  wallet TEXT NOT NULL,
  mint TEXT NOT NULL,
  total_bought REAL DEFAULT 0,
  total_sol_spent REAL DEFAULT 0,
  total_sold REAL DEFAULT 0,
  total_sol_received REAL DEFAULT 0,
  avg_buy_price REAL DEFAULT 0,
  realized_pnl_sol REAL DEFAULT 0,
  last_updated INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER)),
  PRIMARY KEY (wallet, mint)
);

CREATE TABLE IF NOT EXISTS pnl_price_cache (
  mint TEXT PRIMARY KEY,
  price_usd REAL NOT NULL,
  price_sol REAL NOT NULL,
  source TEXT DEFAULT 'jupiter',
  updated_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);

CREATE TABLE IF NOT EXISTS pnl_sync_state (
  wallet TEXT PRIMARY KEY,
  last_signature TEXT,
  last_timestamp INTEGER,
  is_full_sync_done INTEGER DEFAULT 0
);
`

export const SCHEMA_V17 = `
CREATE TABLE IF NOT EXISTS launched_tokens (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  wallet_id TEXT NOT NULL,
  mint TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  image_uri TEXT,
  metadata_uri TEXT,
  launchpad TEXT NOT NULL DEFAULT 'pumpfun',
  pool_address TEXT,
  create_signature TEXT,
  initial_buy_sol REAL,
  status TEXT DEFAULT 'active',
  created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
);

CREATE INDEX IF NOT EXISTS idx_launched_tokens_wallet ON launched_tokens(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_launched_tokens_mint ON launched_tokens(mint);
`

export const SCHEMA_V25 = `
CREATE TABLE IF NOT EXISTS pro_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  wallet_id TEXT,
  wallet_address TEXT,
  expires_at INTEGER,
  features TEXT,
  tier TEXT,
  updated_at INTEGER NOT NULL
);
`

export const SCHEMA_V26 = `
ALTER TABLE activity_log ADD COLUMN session_id TEXT;
ALTER TABLE activity_log ADD COLUMN session_status TEXT CHECK(session_status IN ('created','running','blocked','failed','complete') OR session_status IS NULL);
ALTER TABLE activity_log ADD COLUMN project_id TEXT;
ALTER TABLE activity_log ADD COLUMN project_name TEXT;
CREATE INDEX IF NOT EXISTS idx_activity_log_session_id ON activity_log(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_project_id ON activity_log(project_id, created_at DESC);
`

export const SCHEMA_V27 = `
ALTER TABLE activity_log ADD COLUMN session_summary TEXT;
`

export const SCHEMA_V28 = `
ALTER TABLE activity_log ADD COLUMN artifacts_json TEXT DEFAULT '[]';
`
