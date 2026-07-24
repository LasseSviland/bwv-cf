import { ArrowRight, CalendarDays, ChevronDown } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import type { Period } from "../api/types";
import {
  defaultPeriod,
  isValidPeriod,
  lastTwoMonthsPeriod,
  todayInOslo,
  yearToDatePeriod,
} from "../utils/dates";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface PeriodPickerProps {
  period: Period;
  onChange: (period: Period) => void;
  availableMonths?: string[];
}

const samePeriod = (left: Period, right: Period) =>
  left.from === right.from && left.to === right.to;

export const PeriodPicker = ({ period, onChange, availableMonths = [] }: PeriodPickerProps) => {
  const [draftOverride, setDraftOverride] = useState<Period | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customFormId = useId();
  const today = todayInOslo();
  const draft = draftOverride ?? period;

  const presets = [
    { id: "last-30-days", label: "Last 30 days", value: defaultPeriod(today) },
    { id: "last-two-months", label: "Last 2 months", value: lastTwoMonthsPeriod(today) },
    { id: "this-year", label: "This year", value: yearToDatePeriod(today) },
  ];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidPeriod(draft)) {
      setError("Choose a valid period ending today or earlier.");
      return;
    }
    setError(null);
    onChange(draft);
    setDraftOverride(null);
  };

  const selectedPreset = presets.find((preset) => samePeriod(period, preset.value));
  const showCustom = customOpen || !selectedPreset;

  const selectPreset = (value: Period) => {
    setError(null);
    setDraftOverride(null);
    setCustomOpen(false);
    onChange(value);
  };

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="space-y-2">
          <div className="relative sm:hidden">
            <CalendarDays
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <select
              className="h-11 w-full appearance-none rounded-md border border-border/80 bg-background pr-10 pl-10 text-sm font-medium text-foreground shadow-none outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Inventory period"
              aria-controls={customFormId}
              value={showCustom ? "custom" : selectedPreset?.id}
              onChange={(event) => {
                if (event.target.value === "custom") {
                  setError(null);
                  setCustomOpen(true);
                  return;
                }
                const preset = presets.find(({ id }) => id === event.target.value);
                if (preset) selectPreset(preset.value);
              }}
            >
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">Custom dates…</option>
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <div
            className="hidden max-w-full flex-nowrap gap-1 rounded-lg bg-muted/75 p-1 sm:inline-flex"
            role="group"
            aria-label="Quick date ranges"
          >
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant={samePeriod(period, preset.value) ? "default" : "ghost"}
                size="sm"
                className="rounded-md px-3"
                type="button"
                aria-pressed={samePeriod(period, preset.value)}
                onClick={() => selectPreset(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              variant={showCustom ? "default" : "ghost"}
              size="sm"
              className="rounded-md px-3"
              type="button"
              aria-controls={customFormId}
              aria-expanded={showCustom}
              aria-pressed={showCustom}
              onClick={() => {
                setError(null);
                setCustomOpen(true);
              }}
            >
              Custom
            </Button>
          </div>
        </div>
        {showCustom ? (
          <form
            id={customFormId}
            className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background p-3 sm:flex-row sm:items-end"
            onSubmit={submit}
          >
            <Label className="grid gap-1.5 text-xs text-muted-foreground">
              From
              <Input
                className="h-9 w-full border-border bg-card shadow-none sm:w-38"
                type="date"
                value={draft.from}
                max={draft.to || today}
                min={
                  availableMonths.length > 0 ? `${[...availableMonths].sort()[0]}-01` : undefined
                }
                onChange={(event) => setDraftOverride({ ...draft, from: event.target.value })}
              />
            </Label>
            <ArrowRight
              className="mb-2.5 hidden size-4 text-muted-foreground sm:block"
              aria-hidden="true"
            />
            <Label className="grid gap-1.5 text-xs text-muted-foreground">
              To
              <Input
                className="h-9 w-full border-border bg-card shadow-none sm:w-38"
                type="date"
                value={draft.to}
                min={draft.from}
                max={today}
                onChange={(event) => setDraftOverride({ ...draft, to: event.target.value })}
              />
            </Label>
            <Button variant="outline" className="h-9" type="submit">
              Apply
            </Button>
          </form>
        ) : null}
        {error ? (
          <p className="text-sm font-medium text-destructive lg:col-span-2" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
};
