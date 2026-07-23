import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { api, ApiError, UNAUTHORIZED_EVENT } from "../api/client";
import type { StatusResponse } from "../api/types";

const SESSION_KEY = "better-wines:api-key";
const API_KEY_QUERY_PARAMETERS = ["apiKey", "api_key"] as const;

type AuthState = "checking" | "locked" | "unlocking" | "unlocked" | "unavailable";

interface AuthContextValue {
  apiKey: string | null;
  state: AuthState;
  status: StatusResponse | null;
  unlock: (apiKey: string) => Promise<void>;
  retrySavedKey: () => void;
  refreshStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const storedKey = (): string | null => {
  try {
    const persistent = localStorage.getItem(SESSION_KEY);
    if (persistent) return persistent;
    const legacySession = sessionStorage.getItem(SESSION_KEY);
    if (!legacySession) return null;
    localStorage.setItem(SESSION_KEY, legacySession);
    sessionStorage.removeItem(SESSION_KEY);
    return legacySession;
  } catch {
    return null;
  }
};

const storeKey = (value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, value);
  } catch {
    // Browsers with disabled storage can still use the in-memory session.
  }
};

const keyFromUrl = (): string | null => {
  try {
    const url = new URL(window.location.href);
    const parameter = API_KEY_QUERY_PARAMETERS.find((name) => url.searchParams.has(name));
    if (!parameter) return null;
    const candidate = url.searchParams.get(parameter)?.trim() ?? "";
    API_KEY_QUERY_PARAMETERS.forEach((name) => url.searchParams.delete(name));
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    if (!candidate) return null;
    return candidate;
  } catch {
    return null;
  }
};

const initialKey = (): string | null => keyFromUrl() ?? storedKey();

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [apiKey, setApiKey] = useState<string | null>(() => initialKey());
  const [state, setState] = useState<AuthState>(() => (apiKey ? "checking" : "locked"));
  const [status, setStatus] = useState<StatusResponse | null>(null);

  const lock = useCallback(() => {
    setStatus(null);
    setState("locked");
  }, []);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, lock);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, lock);
  }, [lock]);

  useEffect(() => {
    if (!apiKey || state !== "checking") return;
    const controller = new AbortController();
    void api
      .getStatus(apiKey, controller.signal, false)
      .then((nextStatus) => {
        storeKey(apiKey);
        setStatus(nextStatus);
        setState("unlocked");
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setStatus(null);
        setState(reason instanceof ApiError && reason.status === 401 ? "locked" : "unavailable");
      });
    return () => controller.abort();
  }, [apiKey, state]);

  const unlock = useCallback(async (candidate: string) => {
    if (!candidate) throw new Error("Enter the access password.");
    setState("unlocking");
    try {
      const nextStatus = await api.getStatus(candidate, undefined, false);
      setApiKey(candidate);
      setStatus(nextStatus);
      storeKey(candidate);
      setState("unlocked");
    } catch (error) {
      setState("locked");
      throw error;
    }
  }, []);

  const retrySavedKey = useCallback(() => {
    setState(apiKey ? "checking" : "locked");
  }, [apiKey]);

  const refreshStatus = useCallback(async () => {
    if (!apiKey) return;
    const nextStatus = await api.getStatus(apiKey);
    setStatus(nextStatus);
  }, [apiKey]);

  const value = useMemo<AuthContextValue>(
    () => ({ apiKey, state, status, unlock, retrySavedKey, refreshStatus }),
    [apiKey, refreshStatus, retrySavedKey, state, status, unlock],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
};
