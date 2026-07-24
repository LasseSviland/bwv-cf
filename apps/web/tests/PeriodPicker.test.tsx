import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PeriodPicker } from "../src/components/PeriodPicker";
import { defaultPeriod, lastTwoMonthsPeriod, todayInOslo } from "../src/utils/dates";

describe("PeriodPicker", () => {
  it("submits a custom valid period", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PeriodPicker
        period={{ from: "2026-05-01", to: "2026-05-31" }}
        onChange={onChange}
        availableMonths={["2024-01", "2026-05"]}
      />,
    );

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-05-10" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-05-20" } });
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledWith({ from: "2026-05-10", to: "2026-05-20" });
  });

  it("offers a single mobile period control and applies presets immediately", () => {
    const onChange = vi.fn();
    const today = todayInOslo();
    render(<PeriodPicker period={defaultPeriod(today)} onChange={onChange} />);

    const picker = screen.getByRole("combobox", { name: "Inventory period" });
    expect(picker).toBeTruthy();
    expect(screen.getByRole("group", { name: "Quick date ranges" })).toBeTruthy();

    fireEvent.change(picker, { target: { value: "last-two-months" } });

    expect(onChange).toHaveBeenCalledWith(lastTwoMonthsPeriod(today));
  });
});
