import { useState, type FormEvent } from "react";
import type { Period } from "../api/types";
import {
  defaultPeriod,
  isValidPeriod,
  lastTwoMonthsPeriod,
  todayInOslo,
  yearToDatePeriod,
} from "../utils/dates";

interface PeriodPickerProps {
  period: Period;
  onChange: (period: Period) => void;
  availableMonths?: string[];
}

const samePeriod = (left: Period, right: Period) =>
  left.from === right.from && left.to === right.to;

export const PeriodPicker = ({ period, onChange, availableMonths = [] }: PeriodPickerProps) => {
  const [draftOverride, setDraftOverride] = useState<Period | null>(null);
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

  return (
    <section className="period-picker" aria-labelledby="period-title">
      <div className="period-picker__intro">
        <p className="eyebrow" id="period-title">
          Period
        </p>
        <div className="preset-row" aria-label="Quick date ranges">
          {presets.map((preset) => (
            <button
              key={preset.label}
              className={samePeriod(period, preset.value) ? "preset is-active" : "preset"}
              type="button"
              onClick={() => {
                setError(null);
                setDraftOverride(null);
                onChange(preset.value);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <form className="date-form" onSubmit={submit}>
        <label>
          From
          <input
            type="date"
            value={draft.from}
            max={draft.to || today}
            min={availableMonths.length > 0 ? `${[...availableMonths].sort()[0]}-01` : undefined}
            onChange={(event) => setDraftOverride({ ...draft, from: event.target.value })}
          />
        </label>
        <span className="date-form__arrow" aria-hidden="true">
          →
        </span>
        <label>
          To
          <input
            type="date"
            value={draft.to}
            min={draft.from}
            max={today}
            onChange={(event) => setDraftOverride({ ...draft, to: event.target.value })}
          />
        </label>
        <button className="button button--secondary" type="submit">
          Apply
        </button>
      </form>
      {error ? (
        <p className="form-error period-picker__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
};
