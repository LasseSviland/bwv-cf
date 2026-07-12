import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FreshnessBanner } from "../src/components/FreshnessBanner";

const freshness = {
  datasetGeneratedAt: "2026-07-12T16:00:00.000Z",
  sourceWatermark: 123,
  coveredThrough: "2024-01-31",
};

describe("FreshnessBanner", () => {
  it("treats a fully covered historic period as complete", () => {
    render(<FreshnessBanner freshness={freshness} periodThrough="2024-01-31" />);

    expect(screen.getByText("Inventory covered through 31 Jan 2024")).toBeTruthy();
    expect(screen.queryByText("Inventory data may be behind")).toBeNull();
  });

  it("warns when the selected period extends beyond coverage", () => {
    render(<FreshnessBanner freshness={freshness} periodThrough="2024-02-01" />);

    expect(screen.getByText("Inventory data may be behind")).toBeTruthy();
  });
});
