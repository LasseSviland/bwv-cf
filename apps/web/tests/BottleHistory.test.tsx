import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BottleHistory } from "../src/components/BottleHistory";

describe("BottleHistory", () => {
  it("shows the exact bottle total for every covered date", () => {
    render(
      <BottleHistory
        label="Langhe Nebbiolo"
        inventory={[
          { date: "2026-07-11", count: 0 },
          { date: "2026-07-12", count: 8 },
        ]}
      />,
    );

    expect(screen.getByLabelText("Daily bottle count for Langhe Nebbiolo")).toBeTruthy();
    expect(screen.getByTitle("11 Jul 2026: 0 bottles")).toBeTruthy();
    expect(screen.getByTitle("12 Jul 2026: 8 bottles")).toBeTruthy();
    expect(screen.getByText("8 latest")).toBeTruthy();
  });
});
