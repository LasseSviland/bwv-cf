import { X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
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
  searchLabel: string;
  searchPlaceholder: string;
  emptyTitle: string;
  emptyDescription: string;
  searchText?: (item: T) => string;
  searchFields?: (item: T) => string[];
  pageSize?: number;
  load: (
    apiKey: string,
    values: { query?: string; cursor?: string; limit?: number; from?: string; to?: string },
    signal?: AbortSignal,
  ) => Promise<CatalogResponse<T>>;
  sortItems?: (left: T, right: T) => number;
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
  searchLabel,
  searchPlaceholder,
  emptyTitle,
  emptyDescription,
  searchText = (item) => String(item),
  searchFields = (item) => [searchText(item)],
  pageSize = DISPLAY_PAGE_SIZE,
  load,
  sortItems,
  renderItem,
}: CatalogBrowserProps<T>) => {
  const { apiKey, status } = useAuth();
  const { period, setPeriod } = usePeriodSearch();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get("q") ?? "";
  const [draft, setDraft] = useState(queryParam);
  const query = useDeferredValue(draft);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!apiKey) return;
    const controller = new AbortController();
    // A new request identity intentionally resets the visible async state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setItems([]);
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
            from: period.from,
            to: period.to,
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
  }, [apiKey, pageSize, period.from, period.to, revision]);

  const sortedItems = useMemo(
    () => rankSearchItems(items, query, searchFields, sortItems),
    [items, query, searchFields, sortItems],
  );

  const updateSearch = (value: string) => {
    setDraft(value);
    const params = new URLSearchParams(searchParams);
    if (value.trim()) params.set("q", value.trim());
    else params.delete("q");
    setSearchParams(params);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6">
      <PageHeader title={title} description={description} />
      <PeriodPicker
        period={period}
        onChange={setPeriod}
        availableMonths={status?.availableMonths}
      />
      <div className="space-y-2" role="search">
        <Input
          className="h-10 bg-card"
          id={`${kind}-search`}
          type="search"
          value={draft}
          placeholder={searchPlaceholder || searchLabel}
          aria-label={searchLabel}
          onChange={(event) => updateSearch(event.target.value)}
        />
      </div>

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
          <div className="rounded-xl border bg-card px-5 sm:px-6">
            {sortedItems.map((item, index) => (
              <div
                className={
                  index === sortedItems.length - 1 ? "px-0" : "-mx-5 border-b px-5 sm:-mx-6 sm:px-6"
                }
                key={index}
              >
                {renderItem(item, period)}
              </div>
            ))}
          </div>
          {error ? <p className="text-sm font-medium text-destructive">{error.message}</p> : null}
        </>
      ) : null}
    </div>
  );
};
