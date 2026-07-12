import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { Period } from "../api/types";
import { defaultPeriod, isValidPeriod } from "../utils/dates";

export const usePeriodSearch = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const fallback = useMemo(() => defaultPeriod(), []);
  const period = useMemo<Period>(() => {
    const candidate = { from, to };
    return isValidPeriod(candidate) ? candidate : fallback;
  }, [fallback, from, to]);

  const setPeriod = (next: Period) => {
    const params = new URLSearchParams(searchParams);
    params.set("from", next.from);
    params.set("to", next.to);
    setSearchParams(params, { replace: true });
  };

  return { period, setPeriod };
};
