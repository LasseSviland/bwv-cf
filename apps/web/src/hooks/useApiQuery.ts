import { useQuery } from "@tanstack/react-query";
import { apiQueryKey } from "../api/queryClient";
import { useAuth } from "../auth/AuthProvider";

export interface ApiQueryState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

export const useApiQuery = <T>(
  key: string,
  loader: (apiKey: string, signal: AbortSignal) => Promise<T>,
): ApiQueryState<T> => {
  const { apiKey } = useAuth();
  const request = useQuery({
    queryKey: apiQueryKey(key),
    enabled: Boolean(apiKey),
    queryFn: ({ signal }) => {
      if (!apiKey) throw new Error("An API key is required.");
      return loader(apiKey, signal);
    },
  });

  return {
    data: request.data ?? null,
    error: request.error,
    loading: Boolean(apiKey) && request.isFetching && request.data === undefined,
    reload: () => {
      void request.refetch();
    },
  };
};
