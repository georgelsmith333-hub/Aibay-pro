-- AiBay D1 schema (SQLite dialect for Cloudflare D1).
-- Applied by the deployment workflow after the database exists.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS vault_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('watch', 'seller')),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  target_price TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vault_kind ON vault_items(kind, created_at);

CREATE TABLE IF NOT EXISTS vault_generated (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_scans (
  id TEXT PRIMARY KEY,
  url_count INTEGER NOT NULL DEFAULT 0,
  price_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trend_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  observed_date TEXT NOT NULL,
  count INTEGER NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trend_keyword ON trend_observations(keyword, observed_date);

CREATE TABLE IF NOT EXISTS provider_runs (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  task TEXT NOT NULL,
  route_id TEXT,
  status TEXT NOT NULL,
  error_category TEXT,
  latency_ms INTEGER,
  cached_hit INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_provider_runs_provider ON provider_runs(provider_id, started_at);

CREATE TABLE IF NOT EXISTS research_jobs (
  id TEXT PRIMARY KEY,
  mission TEXT,
  status TEXT NOT NULL,
  request_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  result_json TEXT
);
