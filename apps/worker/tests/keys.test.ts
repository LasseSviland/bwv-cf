import { describe, expect, it } from "vitest";

import {
  MONOPOLIES_KEY,
  WINES_KEY,
  dailyInventoryKey,
  dateFromDailyInventoryKey,
} from "../src/storage/keys";

describe("R2 keys", () => {
  it("uses one stable catalog file for each catalog", () => {
    expect(WINES_KEY).toBe("catalogs/wines.json");
    expect(MONOPOLIES_KEY).toBe("catalogs/monopolies.json");
  });

  it("uses exactly one inventory file per day", () => {
    expect(dailyInventoryKey("2026-07-13")).toBe("inventory/2026-07-13.json");
    expect(dateFromDailyInventoryKey("inventory/2026-07-13.json")).toBe("2026-07-13");
    expect(dateFromDailyInventoryKey("inventory/not-a-date.json")).toBeNull();
  });
});
