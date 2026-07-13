import { ArrowUpDown, Search, X } from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import type { CatalogResponse } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { usePeriodSearch } from "../hooks/usePeriodSearch";
import { EmptyState, ErrorState, LoadingState } from "./AsyncState";
import { PageHeader } from "./PageHeader";
import { PeriodPicker } from "./PeriodPicker";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface CatalogBrowserProps<T> {
  kind: string;
  title: string;
  description?: string;
  headerEyebrow?: string | null;
  latestOnly?: boolean;
  searchLabel: string;
  hideSearchLabel?: boolean;
  searchPlaceholder: string;
  emptyTitle: string;
  emptyDescription: string;
  itemKey: (item: T) => string | number;
  searchText?: (item: T) => string;
  searchFields?: (item: T) => string[];
  pageSize?: number;
  load: (
    apiKey: string,
    values: { query?: string; cursor?: string; limit?: number; from?: string; to?: string },
    signal?: AbortSignal,
  ) => Promise<CatalogResponse<T>>;
  sortItems?: (left: T, right: T) => number;
  sortOptions?: Array<{
    value: string;
    label: string;
    compare: (left: T, right: T) => number;
  }>;
  defaultSort?: string;
  renderItem: (item: T, period: { from: string; to: string }) => ReactNode;
}

const DISPLAY_PAGE_SIZE = 75;

export const normalizeSearchText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

const editDistance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current.push(
        Math.min(
          (current[rightIndex] ?? 0) + 1,
          (previous[rightIndex + 1] ?? 0) + 1,
          (previous[rightIndex] ?? 0) + (left[leftIndex] === right[rightIndex] ? 0 : 1),
        ),
      );
    }
    for (let index = 0; index < current.length; index += 1) previous[index] = current[index] ?? 0;
  }
  return previous[right.length] ?? 0;
};

const tokenSimilarity = (query: string, candidate: string): number => {
  if (candidate === query) return 1;
  if (candidate.startsWith(query)) {
    return 0.85 + 0.15 * (query.length / candidate.length);
  }
  if (candidate.includes(query) || query.includes(candidate)) {
    return Math.min(query.length, candidate.length) / Math.max(query.length, candidate.length);
  }
  const length = Math.max(query.length, candidate.length);
  return length === 0 ? 1 : 1 - editDistance(query, candidate) / length;
};

export function rankSearchItems<T>(
  items: readonly T[],
  query: string,
  getFields: (item: T) => string[],
  tieBreaker?: (left: T, right: T) => number,
): T[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return tieBreaker ? [...items].sort(tieBreaker) : [...items];
  const queryTokens = normalizedQuery.split(" ");
  const ranked: Array<{ item: T; score: number }> = [];

  for (const item of items) {
    const fields = getFields(item).map(normalizeSearchText).filter(Boolean);
    const text = fields.join(" ");
    const exact = fields.some((field) => field === normalizedQuery);
    const substring = text.includes(normalizedQuery);
    const fieldTokens = fields.flatMap((field) => field.split(" "));
    const tokenScores = queryTokens.map((token) =>
      Math.max(...fieldTokens.map((candidate) => tokenSimilarity(token, candidate)), 0),
    );
    const averageSimilarity =
      tokenScores.reduce((total, score) => total + score, 0) / queryTokens.length;
    if (!exact && !substring && averageSimilarity < 0.52) continue;
    ranked.push({
      item,
      score: (exact ? 10_000 : 0) + (substring ? 1_000 : 0) + averageSimilarity * 100,
    });
  }

  ranked.sort(
    (left, right) => right.score - left.score || tieBreaker?.(left.item, right.item) || 0,
  );
  return ranked.map(({ item }) => item);
}

export const CatalogBrowser = <T,>({
  kind,
  title,
  description,
  headerEyebrow = "Portfolio",
  latestOnly = false,
  searchLabel,
  hideSearchLabel = false,
  searchPlaceholder,
  emptyTitle,
  emptyDescription,
  itemKey,
  searchText = (item) => String(item),
  searchFields = (item) => [searchText(item)],
  pageSize = DISPLAY_PAGE_SIZE,
  load,
  sortItems,
  sortOptions = [],
  defaultSort,
  renderItem,
}: CatalogBrowserProps<T>) => {
  const { apiKey, status } = useAuth();
  const { period, setPeriod } = usePeriodSearch();
  const latestDate = status?.freshness?.coveredThrough;
  const requestPeriod = latestOnly && latestDate ? { from: latestDate, to: latestDate } : period;
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get("q") ?? "";
  const [draft, setDraft] = useState(queryParam);
  const query = useDeferredValue(draft);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(DISPLAY_PAGE_SIZE);
  const [error, setError] = useState<Error | null>(null);
  const [revision, setRevision] = useState(0);
  const [sortValue, setSortValue] = useState(defaultSort ?? sortOptions[0]?.value ?? "");
  const activeSort = sortOptions.find(({ value }) => value === sortValue)?.compare ?? sortItems;

  useEffect(() => {
    if (!apiKey) return;
    const controller = new AbortController();
    // A new request identity intentionally resets the visible async state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setItems([]);
    setVisibleCount(DISPLAY_PAGE_SIZE);
    void (async () => {
      const allItems: T[] = [];
      let cursor: string | undefined;
      do {
        const result = await load(
          apiKey,
          {
            query: undefined,
            cursor,
            limit: pageSize,
            from: requestPeriod.from,
            to: requestPeriod.to,
          },
          controller.signal,
        );
        allItems.push(...result.items);
        cursor = result.nextCursor ?? undefined;
      } while (cursor && !controller.signal.aborted);
      return allItems;
    })()
      .then((allItems) => {
        if (controller.signal.aborted) return;
        setItems(allItems);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason : new Error("Unknown API error"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // `load` is a stable API method; query and revision are the request identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, pageSize, requestPeriod.from, requestPeriod.to, revision]);

  const sortedItems = useMemo(
    () => rankSearchItems(items, query, searchFields, activeSort),
    [activeSort, items, query, searchFields],
  );
  const visibleItems = sortedItems.slice(0, visibleCount);

  const updateSearch = (value: string) => {
    setDraft(value);
    setVisibleCount(DISPLAY_PAGE_SIZE);
    const params = new URLSearchParams(searchParams);
    if (value.trim()) params.set("q", value.trim());
    else params.delete("q");
    startTransition(() => setSearchParams(params, { replace: true }));
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-7 sm:gap-9">
      <PageHeader eyebrow={headerEyebrow ?? undefined} title={title} description={description} />
      <section
        className={
          latestOnly
            ? ""
            : "rounded-3xl border border-border/70 bg-card/88 p-4 shadow-[0_20px_60px_rgb(31_45_37/6%)] backdrop-blur sm:p-5"
        }
      >
        <div className="flex flex-col gap-5">
          {!latestOnly ? (
            <div>
              <p className="mb-2.5 text-[0.64rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
                Inventory period
              </p>
              <PeriodPicker
                period={period}
                onChange={setPeriod}
                availableMonths={status?.availableMonths}
              />
            </div>
          ) : null}
          <div className={latestOnly ? "" : "border-t border-border/70 pt-4"} role="search">
            <label
              className={
                hideSearchLabel
                  ? "sr-only"
                  : "mb-2.5 block text-[0.64rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase"
              }
              htmlFor={`${kind}-search`}
            >
              {searchLabel}
            </label>
            <div
              className={sortOptions.length ? "grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]" : ""}
            >
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  className={
                    latestOnly
                      ? "h-12 rounded-2xl border-foreground/20 bg-card pr-4 pl-11 shadow-[0_10px_30px_rgb(31_45_37/6%)]"
                      : "h-12 rounded-2xl border-border/80 bg-background/70 pr-4 pl-11 shadow-none"
                  }
                  id={`${kind}-search`}
                  type="search"
                  value={draft}
                  placeholder={searchPlaceholder || searchLabel}
                  aria-label={searchLabel}
                  onChange={(event) => updateSearch(event.target.value)}
                />
              </div>
              {sortOptions.length ? (
                <div className="relative">
                  <ArrowUpDown
                    className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <select
                    aria-label={`Sort ${kind}`}
                    className="h-12 w-full appearance-none rounded-2xl border border-border/80 bg-background/70 pr-9 pl-11 text-sm text-foreground shadow-none outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={sortValue}
                    onChange={(event) => {
                      setSortValue(event.target.value);
                      setVisibleCount(DISPLAY_PAGE_SIZE);
                    }}
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span
                    className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xs text-muted-foreground"
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {!loading && sortedItems.length > 0 ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {sortedItems.length.toLocaleString("en-GB")} results
            {query ? (
              <>
                {" "}
                for <strong>“{query}”</strong>
              </>
            ) : null}
          </p>
          {query ? (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                updateSearch("");
              }}
            >
              <X />
              Clear search
            </Button>
          ) : null}
        </div>
      ) : null}

      {loading ? <LoadingState label={`Loading ${kind}…`} /> : null}
      {!loading && error && items.length === 0 ? (
        <ErrorState error={error} onRetry={() => setRevision((value) => value + 1)} />
      ) : null}
      {!loading && !error && sortedItems.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : null}
      {sortedItems.length > 0 ? (
        <>
          <div className="overflow-hidden rounded-3xl border border-border/80 bg-card/90 px-5 shadow-[0_24px_70px_rgb(31_45_37/6%)] sm:px-7">
            {visibleItems.map((item, index) => (
              <div
                className={
                  index === visibleItems.length - 1
                    ? "px-0"
                    : "-mx-5 border-b border-border/70 px-5 sm:-mx-7 sm:px-7"
                }
                key={itemKey(item)}
              >
                {renderItem(item, requestPeriod)}
              </div>
            ))}
          </div>
          {visibleCount < sortedItems.length ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                type="button"
                onClick={() =>
                  startTransition(() => setVisibleCount((current) => current + DISPLAY_PAGE_SIZE))
                }
              >
                Show more
              </Button>
            </div>
          ) : null}
          {error ? <p className="text-sm font-medium text-destructive">{error.message}</p> : null}
        </>
      ) : null}
    </div>
  );
};
