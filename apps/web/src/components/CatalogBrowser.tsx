import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, Search, X } from "lucide-react";
import { normalizeSearchText } from "@bwv/data-format";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { catalogQueryKey } from "../api/queryClient";
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
  filterWithoutSearch?: (item: T) => boolean;
  categoryFilterLabel?: string;
  categoryValues?: (item: T) => readonly string[];
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
const SEARCH_URL_DELAY_MS = 250;
const CATEGORY_QUERY_PARAMETER = "category";

export { normalizeSearchText };

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

interface SearchIndexEntry<T> {
  item: T;
  fields: string[];
  text: string;
  tokens: string[];
}

const indexSearchItems = <T,>(
  items: readonly T[],
  getFields: (item: T) => string[],
): SearchIndexEntry<T>[] =>
  items.map((item) => {
    const fields = getFields(item).map(normalizeSearchText).filter(Boolean);
    return {
      item,
      fields,
      text: fields.join(" "),
      tokens: fields.flatMap((field) => field.split(" ")),
    };
  });

const rankSearchIndex = <T,>(
  index: readonly SearchIndexEntry<T>[],
  query: string,
  tieBreaker?: (left: T, right: T) => number,
  filterWithoutSearch?: (item: T) => boolean,
): T[] => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    const items = index
      .map(({ item }) => item)
      .filter((item) => filterWithoutSearch?.(item) ?? true);
    return tieBreaker ? items.sort(tieBreaker) : items;
  }
  const queryTokens = normalizedQuery.split(" ");
  const ranked: Array<{ item: T; score: number }> = [];

  for (const { item, fields, text, tokens } of index) {
    const exact = fields.some((field) => field === normalizedQuery);
    const substring = text.includes(normalizedQuery);
    const tokenScores = queryTokens.map((token) =>
      Math.max(...tokens.map((candidate) => tokenSimilarity(token, candidate)), 0),
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
};

export function rankSearchItems<T>(
  items: readonly T[],
  query: string,
  getFields: (item: T) => string[],
  tieBreaker?: (left: T, right: T) => number,
): T[] {
  return rankSearchIndex(indexSearchItems(items, getFields), query, tieBreaker);
}

export const CatalogBrowser = <T,>({
  kind,
  title,
  description,
  headerEyebrow,
  latestOnly = false,
  searchLabel,
  hideSearchLabel = false,
  searchPlaceholder,
  emptyTitle,
  emptyDescription,
  itemKey,
  searchText = (item) => String(item),
  searchFields = (item) => [searchText(item)],
  filterWithoutSearch,
  categoryFilterLabel = "Categories",
  categoryValues,
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
  const selectedCategories = useMemo(
    () =>
      new Set(
        searchParams.getAll(CATEGORY_QUERY_PARAMETER).filter((value) => /^[1-6]$/.test(value)),
      ),
    [searchParams],
  );
  const [draft, setDraft] = useState(queryParam);
  const query = useDeferredValue(draft);
  const [visibleCount, setVisibleCount] = useState(DISPLAY_PAGE_SIZE);
  const [sortValue, setSortValue] = useState(defaultSort ?? sortOptions[0]?.value ?? "");
  const activeSort = sortOptions.find(({ value }) => value === sortValue)?.compare ?? sortItems;

  useEffect(() => {
    // Keep back/forward navigation authoritative without resetting the draft on each keystroke.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(queryParam);
  }, [queryParam]);

  useEffect(() => {
    const nextQuery = draft.trim();
    if (nextQuery === queryParam) return;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (nextQuery) params.set("q", nextQuery);
      else params.delete("q");
      startTransition(() => setSearchParams(params, { replace: true }));
    }, SEARCH_URL_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [draft, queryParam, searchParams, setSearchParams]);

  const request = useQuery({
    queryKey: catalogQueryKey(kind, requestPeriod, pageSize),
    enabled: Boolean(apiKey),
    queryFn: async ({ signal }) => {
      if (!apiKey) throw new Error("An API key is required.");
      const allItems: T[] = [];
      let cursor: string | undefined;
      do {
        const result = await load(
          apiKey,
          {
            cursor,
            limit: pageSize,
            from: requestPeriod.from,
            to: requestPeriod.to,
          },
          signal,
        );
        signal.throwIfAborted();
        allItems.push(...result.items);
        cursor = result.nextCursor ?? undefined;
      } while (cursor);
      return allItems;
    },
  });

  useEffect(() => {
    // Each period starts with a compact result set, including when its data came from cache.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleCount(DISPLAY_PAGE_SIZE);
  }, [kind, pageSize, requestPeriod.from, requestPeriod.to]);

  const items = useMemo(() => request.data ?? [], [request.data]);
  const loading = Boolean(apiKey) && request.isFetching && request.data === undefined;
  const error = request.error;
  const searchIndex = useMemo(() => indexSearchItems(items, searchFields), [items, searchFields]);
  const categoryOptions = useMemo(
    () =>
      categoryValues
        ? [
            ...new Set(
              items.flatMap((item) =>
                categoryValues(item).filter((value) => /^[1-6]$/.test(value)),
              ),
            ),
          ].sort((left, right) => Number(left) - Number(right))
        : [],
    [categoryValues, items],
  );
  const sortedItems = useMemo(() => {
    const rankedItems = rankSearchIndex(searchIndex, query, activeSort, filterWithoutSearch);
    if (!categoryValues || selectedCategories.size === 0) return rankedItems;
    return rankedItems.filter((item) =>
      categoryValues(item).some((category) => selectedCategories.has(category)),
    );
  }, [activeSort, categoryValues, filterWithoutSearch, query, searchIndex, selectedCategories]);
  const visibleItems = sortedItems.slice(0, visibleCount);

  const updateSearch = (value: string) => {
    setDraft(value);
    setVisibleCount(DISPLAY_PAGE_SIZE);
  };

  const updateCategories = (nextCategories: ReadonlySet<string>) => {
    const params = new URLSearchParams(searchParams);
    params.delete(CATEGORY_QUERY_PARAMETER);
    [...nextCategories]
      .sort((left, right) => Number(left) - Number(right))
      .forEach((category) => params.append(CATEGORY_QUERY_PARAMETER, category));
    setVisibleCount(DISPLAY_PAGE_SIZE);
    startTransition(() => setSearchParams(params, { replace: true }));
  };

  const toggleCategory = (category: string) => {
    const nextCategories = new Set(selectedCategories);
    if (nextCategories.has(category)) nextCategories.delete(category);
    else nextCategories.add(category);
    updateCategories(nextCategories);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-7 sm:gap-9">
      <PageHeader eyebrow={headerEyebrow ?? undefined} title={title} description={description} />
      <section
        className={
          latestOnly
            ? ""
            : "rounded-xl border border-border/70 bg-card/95 p-4 shadow-[0_20px_60px_rgb(31_45_37/6%)] backdrop-blur sm:p-5"
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
                      ? "h-12 rounded-lg border-foreground/20 bg-card pr-4 pl-11 shadow-[0_10px_30px_rgb(31_45_37/6%)]"
                      : "h-12 rounded-lg border-border/80 bg-background pr-4 pl-11 shadow-none"
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
                    className="h-12 w-full appearance-none rounded-lg border border-border/80 bg-background pr-9 pl-11 text-sm text-foreground shadow-none outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={sortValue}
                    onChange={(event) => {
                      const value = event.target.value;
                      startTransition(() => {
                        setSortValue(value);
                        setVisibleCount(DISPLAY_PAGE_SIZE);
                      });
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
          {categoryValues && categoryOptions.length > 0 ? (
            <div className="border-t border-border/70 pt-4">
              <p className="mb-2.5 text-[0.64rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
                {categoryFilterLabel}
              </p>
              <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label={`${categoryFilterLabel} filter`}
              >
                {categoryOptions.map((category) => {
                  const selected = selectedCategories.has(category);
                  return (
                    <Button
                      key={category}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      className="min-w-9 tabular-nums"
                      aria-label={`Category ${category}`}
                      aria-pressed={selected}
                      onClick={() => toggleCategory(category)}
                    >
                      {category}
                    </Button>
                  );
                })}
                {selectedCategories.size > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => updateCategories(new Set())}
                  >
                    <X />
                    Clear categories
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
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
        <ErrorState
          error={error}
          onRetry={() => {
            void request.refetch();
          }}
        />
      ) : null}
      {!loading && !error && sortedItems.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={
            selectedCategories.size > 0
              ? "Try selecting other categories or clearing the category filter."
              : emptyDescription
          }
        />
      ) : null}
      {sortedItems.length > 0 ? (
        <>
          <div className="min-w-0 overflow-hidden rounded-xl border border-border/80 bg-card/95 px-5 shadow-[0_24px_70px_rgb(31_45_37/6%)] sm:px-7">
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
