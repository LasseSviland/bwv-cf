CREATE TABLE wines (
  generation TEXT NOT NULL,
  id INTEGER NOT NULL,
  product_number TEXT NOT NULL,
  name TEXT NOT NULL,
  country TEXT,
  wine_category TEXT,
  PRIMARY KEY (generation, id)
);

CREATE INDEX idx_wines_generation_name ON wines(generation, name, id);

CREATE TABLE monopolies (
  generation TEXT NOT NULL,
  id INTEGER NOT NULL,
  store_number TEXT NOT NULL,
  name TEXT NOT NULL,
  postal_code TEXT,
  city TEXT,
  monopoly_category TEXT,
  PRIMARY KEY (generation, id)
);

CREATE INDEX idx_monopolies_generation_name ON monopolies(generation, name, id);

CREATE TABLE catalog_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  generation TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  wine_count INTEGER NOT NULL CHECK (wine_count >= 0),
  monopoly_count INTEGER NOT NULL CHECK (monopoly_count >= 0)
);

ALTER TABLE month_syncs
  ADD COLUMN inventory_object_count INTEGER NOT NULL DEFAULT 0 CHECK (inventory_object_count >= 0);

ALTER TABLE published_months
  ADD COLUMN inventory_object_count INTEGER NOT NULL DEFAULT 0 CHECK (inventory_object_count >= 0);
