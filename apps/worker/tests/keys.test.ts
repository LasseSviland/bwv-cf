import { describe, expect, it } from "vitest";

import {
  catalogKey,
  generationPrefix,
  manifestKey,
  monopolyProjectionKey,
  rawChunkKey,
  rawChunkPrefix,
  wineProjectionKey,
} from "../src/storage/keys";

describe("R2 dataset keys", () => {
  it("keeps every published object inside a month and generation", () => {
    expect(generationPrefix("2026-07", "gen")).toBe("datasets/v1/month=2026-07/generation=gen");
    expect(wineProjectionKey("2026-07", "gen", 12)).toBe(
      "datasets/v1/month=2026-07/generation=gen/wines/12.json",
    );
    expect(monopolyProjectionKey("2026-07", "gen", 4)).toBe(
      "datasets/v1/month=2026-07/generation=gen/monopolies/4.json",
    );
    expect(manifestKey("2026-07", "gen")).toBe(
      "datasets/v1/month=2026-07/generation=gen/manifest.json",
    );
  });

  it("produces sortable deterministic raw chunk keys", () => {
    expect(rawChunkPrefix("2026-07", "gen")).toBe("staging/v1/month=2026-07/generation=gen/raw/");
    expect(rawChunkKey("2026-07", "gen", 9, 5009)).toBe(
      "staging/v1/month=2026-07/generation=gen/raw/000000000009-000000005009.json",
    );
  });

  it("versions catalogs independently from datasets", () => {
    expect(catalogKey("wines", "catalog-gen")).toBe("catalog/v1/generation=catalog-gen/wines.json");
  });
});
