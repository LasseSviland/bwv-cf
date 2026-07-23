import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
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
  const today = todayInOslo();
  const draft = draftOverride ?? period;

  const presets = [
    { label: "Last 30 days", value: defaultPeriod(today) },
    { label: "Last 2 months", value: lastTwoMonthsPeriod(today) },
    { label: "This year", value: yearToDatePeriod(today) },
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

  const presetSelected = presets.some((preset) => samePeriod(period, preset.value));
  const showCustom = customOpen || !presetSelected;

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="space-y-2">
          <div
            className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted/75 p-1"
            aria-label="Quick date ranges"
          >
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant={samePeriod(period, preset.value) ? "default" : "ghost"}
                size="sm"
                className="rounded-md px-3"
                type="button"
                onClick={() => {
                  setError(null);
                  setDraftOverride(null);
                  setCustomOpen(false);
                  onChange(preset.value);
                }}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              variant={showCustom ? "default" : "ghost"}
              size="sm"
              className="rounded-md px-3"
              type="button"
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
