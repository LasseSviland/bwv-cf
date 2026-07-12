CREATE UNIQUE INDEX idx_month_syncs_one_active_month
  ON month_syncs(month)
  WHERE status IN ('queued', 'running', 'retrying');
