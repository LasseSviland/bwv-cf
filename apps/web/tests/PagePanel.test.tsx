import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PagePanel } from "../src/components/PagePanel";

describe("PagePanel", () => {
  it("provides the shared opaque page surface while forwarding element props", () => {
    render(
      <PagePanel aria-label="Shared surface" className="p-5" data-surface="controls">
        Content
      </PagePanel>,
    );

    const panel = screen.getByLabelText("Shared surface");
    expect(panel.getAttribute("data-slot")).toBe("page-panel");
    expect(panel.getAttribute("data-surface")).toBe("controls");
    expect(panel.className).toContain("bg-card");
    expect(panel.className).toContain("border-border/80");
    expect(panel.className).toContain("p-5");
  });
});
