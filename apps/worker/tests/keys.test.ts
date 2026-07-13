import { describe, expect, it } from "vitest";

import {
  dailyInventoryKey,
  generationPrefix,
  rawChunkKey,
  rawChunkPrefix,
} from "../src/storage/keys";

describe("R2 keys", () => {
  it("uses one gzip JSON object for all inventory on a date", () => {
    expect(dailyInventoryKey("2026-07-12", "gen")).toBe(
      "datasets/v1/month=2026-07/generation=gen/inventory/2026-07-12.json.gz",
    );
  });

  it("keeps generation-scoped inventory and transient chunks", () => {
    expect(generationPrefix("2026-07", "gen")).toBe("datasets/v1/month=2026-07/generation=gen");
    expect(rawChunkPrefix("2026-07", "gen")).toBe("staging/v1/month=2026-07/generation=gen/raw/");
    expect(rawChunkKey("2026-07", "gen", 12, 345)).toContain("000000000012-000000000345.json");
  });
});
