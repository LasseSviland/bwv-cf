import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { CatalogResponse } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { usePeriodSearch } from "../hooks/usePeriodSearch";
import { EmptyState, ErrorState, LoadingState } from "./AsyncState";
import { PageHeader } from "./PageHeader";
import { PeriodPicker } from "./PeriodPicker";

interface CatalogBrowserProps<T> {
  kind: string;
  title: string;
  description: string;
  searchLabel: string;
  searchPlaceholder: string;
  emptyTitle: string;
  emptyDescription: string;
  load: (
    apiKey: string,
    values: { query?: string; cursor?: string; limit?: number; from?: string; to?: string },
    signal?: AbortSignal,
  ) => Promise<CatalogResponse<T>>;
  sortItems?: (left: T, right: T) => number;
  renderItem: (item: T, period: { from: string; to: string }) => ReactNode;
}

const PAGE_SIZE = 75;

export const CatalogBrowser = <T,>({
  kind,
  title,
  description,
  searchLabel,
  searchPlaceholder,
  emptyTitle,
  emptyDescription,
  load,
  sortItems,
  renderItem,
}: CatalogBrowserProps<T>) => {
  const { apiKey, status } = useAuth();
  const { period, setPeriod } = usePeriodSearch();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [draft, setDraft] = useState(query);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
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
    setVisibleCount(PAGE_SIZE);
    void (async () => {
      const allItems: T[] = [];
      let cursor: string | undefined;
      do {
        const result = await load(
          apiKey,
          {
            query: query || undefined,
            cursor,
            limit: PAGE_SIZE,
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
  }, [apiKey, period.from, period.to, query, revision]);

  const sortedItems = useMemo(
    () => (sortItems ? [...items].sort(sortItems) : items),
    [items, sortItems],
  );
  const visibleItems = sortedItems.slice(0, visibleCount);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (draft.trim()) params.set("q", draft.trim());
    else params.delete("q");
    setSearchParams(params);
  };

  return (
    <div className="page-stack">
      <PageHeader title={title} description={description} />
      <PeriodPicker
        period={period}
        onChange={setPeriod}
        availableMonths={status?.availableMonths}
      />
      <form className="catalog-search" role="search" onSubmit={submit}>
        <label htmlFor={`${kind}-search`}>{searchLabel}</label>
        <div className="catalog-search__row">
          <input
            id={`${kind}-search`}
            type="search"
            value={draft}
            placeholder={searchPlaceholder}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="button button--primary" type="submit">
            Search
          </button>
        </div>
      </form>

      {query ? (
        <div className="result-context">
          <p>
            Results for <strong>“{query}”</strong>
          </p>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setDraft("");
              const params = new URLSearchParams(searchParams);
              params.delete("q");
              setSearchParams(params);
            }}
          >
            Clear search
          </button>
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <p className="catalog-result-count">{items.length.toLocaleString("en-GB")} results</p>
      ) : null}

      {loading ? <LoadingState label={`Ranking ${kind}…`} /> : null}
      {!loading && error && items.length === 0 ? (
        <ErrorState error={error} onRetry={() => setRevision((value) => value + 1)} />
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : null}
      {items.length > 0 ? (
        <>
          <div className="catalog-list">{visibleItems.map((item) => renderItem(item, period))}</div>
          <div className="load-more-row">
            {error ? <p className="form-error">{error.message}</p> : null}
            {visibleCount < sortedItems.length ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
              >
                Show more
              </button>
            ) : (
              <span className="end-of-results">You’ve reached the end of the results.</span>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
