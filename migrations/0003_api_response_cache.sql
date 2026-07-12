CREATE TABLE api_response_cache_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  version INTEGER NOT NULL CHECK (version >= 1),
  updated_at TEXT NOT NULL
);

INSERT INTO api_response_cache_state (singleton, version, updated_at)
VALUES (1, 1, CURRENT_TIMESTAMP);
