import { useState, type FormEvent, type PropsWithChildren } from "react";
import { ApiError } from "../api/client";
import { useAuth } from "./AuthProvider";

export const PasswordGate = ({ children }: PropsWithChildren) => {
  const { state, unlock } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await unlock(password);
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.status === 401
          ? "That password was not accepted. Please try again."
          : reason instanceof Error
            ? reason.message
            : "Unable to verify the password.",
      );
    }
  };

  if (state === "unlocked") return children;

  if (state === "checking") {
    return (
      <main className="gate-shell" aria-busy="true">
        <div className="gate-card gate-card--checking">
          <BrandMark />
          <div className="spinner" aria-hidden="true" />
          <p>Opening your inventory workspace…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="gate-shell">
      <section className="gate-card" aria-labelledby="gate-title">
        <BrandMark />
        <p className="eyebrow">Private inventory history</p>
        <h1 id="gate-title">Welcome to Better Wines</h1>
        <p className="gate-intro">
          Enter the API access password to explore daily availability across Vinmonopolet stores.
        </p>
        <form
          className="gate-form"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label htmlFor="access-password">Access password</label>
          <div className="gate-input-row">
            <input
              id="access-password"
              type="password"
              autoComplete="off"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby={error ? "password-error" : "password-help"}
            />
            <button
              className="button button--primary"
              type="submit"
              disabled={state === "unlocking"}
            >
              {state === "unlocking" ? "Checking…" : "Continue"}
            </button>
          </div>
          {error ? (
            <p className="form-error" id="password-error" role="alert">
              {error}
            </p>
          ) : (
            <p className="field-help" id="password-help">
              Kept only for this browser tab session.
            </p>
          )}
        </form>
      </section>
    </main>
  );
};

const BrandMark = () => (
  <div className="brand-mark" aria-label="Better Wines">
    <span className="brand-mark__monogram" aria-hidden="true">
      BW
    </span>
    <span>Better Wines</span>
  </div>
);
