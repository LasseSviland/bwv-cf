import { KeyRound, LoaderCircle, Wine } from "lucide-react";
import { useEffect, useState, type FormEvent, type PropsWithChildren } from "react";
import { ApiError } from "../api/client";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "./AuthProvider";

export const PasswordGate = ({ children }: PropsWithChildren) => {
  const { state, unlock } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = state === "unlocked" ? "Better Wines" : "Private access";
  }, [state]);

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
      <main
        className="fixed inset-0 grid place-items-center overflow-y-auto bg-primary p-6"
        aria-busy="true"
      >
        <Card className="w-full max-w-md py-12 text-center shadow-2xl">
          <CardContent className="flex flex-col items-center gap-4 text-muted-foreground">
            <LoaderCircle className="size-7 animate-spin text-primary" aria-hidden="true" />
            <p>Checking access…</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 overflow-y-auto bg-primary">
      <div className="relative grid min-h-full place-items-center p-4 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.12),transparent_38%),radial-gradient(circle_at_15%_90%,rgba(255,255,255,0.07),transparent_30%)]" />
        <Card
          className="relative w-full max-w-md rounded-[2rem] border-white/15 bg-card py-8 shadow-[0_40px_100px_rgb(0_0_0/28%)] sm:py-10"
          aria-labelledby="gate-title"
        >
          <CardHeader className="px-6 sm:px-10">
            <span className="mb-5 grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Wine className="size-5" aria-hidden="true" />
            </span>
            <p className="text-[0.64rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Private access
            </p>
            <CardTitle className="mt-2 font-serif text-3xl leading-tight font-normal tracking-[-0.03em] sm:text-4xl">
              <h1 id="gate-title">Enter password to access</h1>
            </CardTitle>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Enter the access password to continue.
            </p>
          </CardHeader>
          <CardContent className="mt-2 px-6 sm:px-10">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                void submit(event);
              }}
            >
              <Label htmlFor="access-password">Access password</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  className="h-11 flex-1 rounded-xl"
                  id="access-password"
                  type="password"
                  autoComplete="off"
                  autoFocus
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-describedby={error ? "password-error" : undefined}
                />
                <Button
                  className="h-11 rounded-xl px-5"
                  type="submit"
                  disabled={state === "unlocking"}
                >
                  {state === "unlocking" ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
                  {state === "unlocking" ? "Checking…" : "Continue"}
                </Button>
              </div>
              {error ? (
                <Alert variant="destructive" id="password-error">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};
