import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { api } from "../src/api/client";
import { EntityMoreInfo } from "../src/components/EntityMoreInfo";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ apiKey: "session-key" }),
}));

describe("EntityMoreInfo", () => {
  it("loads and renders complete wine data only after it is opened", async () => {
    const user = userEvent.setup();
    let resolveDetail: ((value: Awaited<ReturnType<typeof api.getWine>>) => void) | undefined;
    const getWine = vi.spyOn(api, "getWine").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDetail = resolve;
        }),
    );

    render(<EntityMoreInfo kind="wine" entityId="17" label="Fjordglimt Riesling" />);
    expect(getWine).not.toHaveBeenCalled();

    await user.click(screen.getByText("More info"));
    expect(getWine).toHaveBeenCalledWith("session-key", "17", expect.any(AbortSignal));
    expect(screen.getByRole("status").textContent).toContain("Loading more information");

    resolveDetail?.({
      id: 17,
      productNumber: "001234",
      name: "Fjordglimt Riesling",
      country: "Tyskland",
      wineCategory: "Hvitvin",
      sourceData: {
        basic: { productLongName: "Fjordglimt Riesling", volume: 0.75 },
        properties: { organic: true },
        legacyDatabase: { metode: "Fermented in steel tanks" },
      },
    });

    expect(await screen.findByText(/product long name/i)).toBeTruthy();
    expect(screen.getByText("Fjordglimt Riesling")).toBeTruthy();
    expect(screen.getByText("Organic")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getByText(/legacy database/i)).toBeTruthy();
  });

  it("uses the monopoly detail endpoint for store information", async () => {
    const user = userEvent.setup();
    const getMonopoly = vi.spyOn(api, "getMonopoly").mockResolvedValue({
      id: 114,
      storeNumber: "114",
      name: "Oslo, Aker Brygge",
      postalCode: "0250",
      city: "Oslo",
      monopolyCategory: "6",
      sourceData: {
        address: { street: "Bryggegata 9" },
        telephone: "22 01 50 00",
      },
    });

    render(<EntityMoreInfo kind="monopoly" entityId="114" label="Oslo, Aker Brygge" />);
    await user.click(screen.getByText("More info"));

    expect(await screen.findByText("Bryggegata 9")).toBeTruthy();
    expect(getMonopoly).toHaveBeenCalledWith("session-key", "114", expect.any(AbortSignal));
  });
});
