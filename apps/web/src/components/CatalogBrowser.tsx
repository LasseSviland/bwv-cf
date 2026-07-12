import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { CatalogResponse } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { EmptyState, ErrorState, LoadingState } from "./AsyncState";
import { PageHeader } from "./PageHeader";

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
    values: { query?: string; cursor?: string; limit?: number },
    signal?: AbortSignal,
  ) => Promise<CatalogResponse<T>>;
  renderItem: (item: T) => ReactNode;
}

export const CatalogBrowser = <T,>({
  kind,
  title,
  description,
  searchLabel,
  searchPlaceholder,
  emptyTitle,
  emptyDescription,
  load,
  renderItem,
}: CatalogBrowserProps<T>) => {
  const { apiKey } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [draft, setDraft] = useState(query);
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!apiKey) return;
    const controller = new AbortController();
    // A new request identity intentionally resets the visible async state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    void load(apiKey, { query: query || undefined, limit: 50 }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setItems(result.items);
        setNextCursor(result.nextCursor ?? null);
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
  }, [apiKey, query, revision]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (draft.trim()) params.set("q", draft.trim());
    else params.delete("q");
    setSearchParams(params);
  };

  const loadMore = async () => {
    if (!apiKey || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await load(apiKey, {
        query: query || undefined,
        cursor: nextCursor,
        limit: 50,
      });
      setItems((current) => [...current, ...result.items]);
      setNextCursor(result.nextCursor ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error("Unknown API error"));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Browse" title={title} description={description} />
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
              setSearchParams({});
            }}
          >
            Clear search
          </button>
        </div>
      ) : null}

      {loading ? <LoadingState label={`Loading ${kind}…`} /> : null}
      {!loading && error && items.length === 0 ? (
        <ErrorState error={error} onRetry={() => setRevision((value) => value + 1)} />
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : null}
      {items.length > 0 ? (
        <>
          <div className="catalog-grid">{items.map(renderItem)}</div>
          <div className="load-more-row">
            {error ? <p className="form-error">{error.message}</p> : null}
            {nextCursor ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  void loadMore();
                }}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
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
