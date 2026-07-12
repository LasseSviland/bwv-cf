import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { CatalogResponse } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { usePeriodSearch } from "../hooks/usePeriodSearch";
import { EmptyState, ErrorState, LoadingState } from "./AsyncState";
import { PageHeader } from "./PageHeader";
import { PeriodPicker } from "./PeriodPicker";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

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
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6">
      <PageHeader title={title} description={description} />
      <PeriodPicker
        period={period}
        onChange={setPeriod}
        availableMonths={status?.availableMonths}
      />
      <Card>
        <CardContent className="py-1">
          <form className="space-y-2" role="search" onSubmit={submit}>
            <Label htmlFor={`${kind}-search`}>{searchLabel}</Label>
            <div className="flex gap-2">
              <Input
                className="h-10"
                id={`${kind}-search`}
                type="search"
                value={draft}
                placeholder={searchPlaceholder}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Button className="h-10 px-4" type="submit">
                <Search />
                Search
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {query ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Results for <strong>“{query}”</strong>
          </p>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => {
              setDraft("");
              const params = new URLSearchParams(searchParams);
              params.delete("q");
              setSearchParams(params);
            }}
          >
            <X />
            Clear search
          </Button>
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <Badge variant="secondary" className="w-fit">
          {items.length.toLocaleString("en-GB")} results
        </Badge>
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
          <div className="grid gap-3">{visibleItems.map((item) => renderItem(item, period))}</div>
          <div className="flex min-h-12 items-center justify-center gap-4">
            {error ? <p className="text-sm font-medium text-destructive">{error.message}</p> : null}
            {visibleCount < sortedItems.length ? (
              <Button
                variant="outline"
                type="button"
                onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
              >
                Show more
              </Button>
            ) : (
              <span className="text-sm text-muted-foreground">
                You’ve reached the end of the results.
              </span>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
import { Search, X } from "lucide-react";
