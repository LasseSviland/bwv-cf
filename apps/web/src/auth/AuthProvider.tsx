import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { api, UNAUTHORIZED_EVENT } from "../api/client";
import type { StatusResponse } from "../api/types";

const SESSION_KEY = "better-wines:api-key";

type AuthState = "checking" | "locked" | "unlocking" | "unlocked";

interface AuthContextValue {
  apiKey: string | null;
  state: AuthState;
  status: StatusResponse | null;
  unlock: (apiKey: string) => Promise<void>;
  logout: () => void;
  refreshStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const storedKey = (): string | null => {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
};

const storeKey = (value: string | null): void => {
  try {
    if (value === null) sessionStorage.removeItem(SESSION_KEY);
    else sessionStorage.setItem(SESSION_KEY, value);
  } catch {
    // Browsers with disabled storage can still use the in-memory session.
  }
};

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [apiKey, setApiKey] = useState<string | null>(() => storedKey());
  const [state, setState] = useState<AuthState>(() => (storedKey() ? "checking" : "locked"));
  const [status, setStatus] = useState<StatusResponse | null>(null);

  const logout = useCallback(() => {
    setApiKey(null);
    setStatus(null);
    setState("locked");
    storeKey(null);
  }, []);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, logout);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, logout);
  }, [logout]);

  useEffect(() => {
    if (!apiKey || state !== "checking") return;
    const controller = new AbortController();
    void api
      .getStatus(apiKey, controller.signal, false)
      .then((nextStatus) => {
        setStatus(nextStatus);
        setState("unlocked");
      })
      .catch(() => {
        if (!controller.signal.aborted) logout();
      });
    return () => controller.abort();
  }, [apiKey, logout, state]);

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

  const refreshStatus = useCallback(async () => {
    if (!apiKey) return;
    const nextStatus = await api.getStatus(apiKey);
    setStatus(nextStatus);
  }, [apiKey]);

  const value = useMemo<AuthContextValue>(
    () => ({ apiKey, state, status, unlock, logout, refreshStatus }),
    [apiKey, logout, refreshStatus, state, status, unlock],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
};
