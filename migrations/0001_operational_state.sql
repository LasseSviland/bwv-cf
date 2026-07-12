PRAGMA foreign_keys = ON;

CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL CHECK (trigger IN ('scheduled', 'manual', 'backfill')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'partial')),
  from_month TEXT NOT NULL,
  through_month TEXT NOT NULL,
  total_months INTEGER NOT NULL CHECK (total_months >= 1),
  succeeded_months INTEGER NOT NULL DEFAULT 0 CHECK (succeeded_months >= 0),
  failed_months INTEGER NOT NULL DEFAULT 0 CHECK (failed_months >= 0),
  requested_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error TEXT
);

CREATE INDEX idx_sync_runs_requested_at ON sync_runs(requested_at DESC);
CREATE INDEX idx_sync_runs_status ON sync_runs(status, requested_at DESC);

CREATE TABLE month_syncs (
  job_id TEXT NOT NULL,
  month TEXT NOT NULL,
  generation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'retrying', 'succeeded', 'failed', 'skipped')),
  phase TEXT NOT NULL,
  cursor_id INTEGER,
  floor_id INTEGER,
  ceiling_id INTEGER,
  rows_scanned INTEGER NOT NULL DEFAULT 0 CHECK (rows_scanned >= 0),
  rows_kept INTEGER NOT NULL DEFAULT 0 CHECK (rows_kept >= 0),
  wine_object_count INTEGER NOT NULL DEFAULT 0 CHECK (wine_object_count >= 0),
  monopoly_object_count INTEGER NOT NULL DEFAULT 0 CHECK (monopoly_object_count >= 0),
  covered_from TEXT,
  covered_through TEXT,
  source_watermark INTEGER,
  manifest_key TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (job_id, month),
  FOREIGN KEY (job_id) REFERENCES sync_runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_month_syncs_month_status ON month_syncs(month, status, updated_at DESC);
CREATE INDEX idx_month_syncs_job_status ON month_syncs(job_id, status);

CREATE TABLE source_month_bounds (
  month TEXT PRIMARY KEY,
  floor_id INTEGER NOT NULL,
  ceiling_id INTEGER NOT NULL,
  source_row_count INTEGER NOT NULL DEFAULT 0 CHECK (source_row_count >= 0),
  discovered_at TEXT NOT NULL
);

CREATE TABLE sync_leases (
  month TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  generation TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES sync_runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_sync_leases_expires_at ON sync_leases(expires_at);

CREATE TABLE completed_steps (
  job_id TEXT NOT NULL,
  month TEXT NOT NULL,
  generation TEXT NOT NULL,
  phase TEXT NOT NULL,
  step_key TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (job_id, month, generation, phase, step_key),
  FOREIGN KEY (job_id, month) REFERENCES month_syncs(job_id, month) ON DELETE CASCADE
);

CREATE TABLE published_months (
  month TEXT PRIMARY KEY,
  generation TEXT NOT NULL,
  manifest_key TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  covered_from TEXT NOT NULL,
  covered_through TEXT NOT NULL,
  source_floor_id INTEGER NOT NULL,
  source_watermark INTEGER NOT NULL,
  source_row_count INTEGER NOT NULL CHECK (source_row_count >= 0),
  wine_object_count INTEGER NOT NULL CHECK (wine_object_count >= 0),
  monopoly_object_count INTEGER NOT NULL CHECK (monopoly_object_count >= 0),
  etag TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE INDEX idx_published_months_generated_at ON published_months(generated_at DESC);

CREATE TABLE catalog_versions (
  catalog TEXT PRIMARY KEY CHECK (catalog IN ('wines', 'monopolies')),
  generation TEXT NOT NULL,
  object_key TEXT NOT NULL,
  item_count INTEGER NOT NULL CHECK (item_count >= 0),
  etag TEXT NOT NULL,
  generated_at TEXT NOT NULL
);
