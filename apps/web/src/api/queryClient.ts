import { QueryClient } from "@tanstack/react-query";

export const API_DATA_FRESHNESS_MS = 4 * 60 * 60 * 1_000;

export const apiQueryKey = (key: string) => ["api", key] as const;

export const catalogQueryKey = (
  kind: string,
  period: { from: string; to: string },
  pageSize: number,
) => ["api", "catalog", kind, period.from, period.to, pageSize] as const;

export const createAppQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // A hard refresh creates a new QueryClient. During the current page lifetime, keep
        // successful data available and only consider it refreshable after four hours.
        staleTime: API_DATA_FRESHNESS_MS,
        gcTime: Infinity,
        refetchOnMount: true,
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
        retry: false,
      },
    },
  });

export const queryClient = createAppQueryClient();
