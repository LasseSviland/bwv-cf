import { useEffect, useState } from "react";
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
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!apiKey) return;
    const controller = new AbortController();
    // A new request identity intentionally resets the visible async state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    void loader(apiKey, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
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
    // The string key is the deliberate request identity; callers need not memoize loaders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, key, revision]);

  return {
    data,
    error,
    loading,
    reload: () => setRevision((value) => value + 1),
  };
};
