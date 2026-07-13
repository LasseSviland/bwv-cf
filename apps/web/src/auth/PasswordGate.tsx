import { KeyRound, LoaderCircle } from "lucide-react";
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
      <main className="grid min-h-screen place-items-center bg-primary p-6" aria-busy="true">
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
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-primary p-4 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.12),transparent_38%),radial-gradient(circle_at_15%_90%,rgba(255,255,255,0.07),transparent_30%)]" />
      <Card
        className="relative w-full max-w-md border-white/15 bg-card py-8 shadow-2xl sm:py-10"
        aria-labelledby="gate-title"
      >
        <CardHeader className="px-6 sm:px-10">
          <CardTitle className="font-serif text-3xl leading-tight font-normal tracking-tight sm:text-4xl">
            <h1 id="gate-title">Enter password to access</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 sm:px-10">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              void submit(event);
            }}
          >
            <Label htmlFor="access-password">Access password</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                className="h-10 flex-1"
                id="access-password"
                type="password"
                autoComplete="off"
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby={error ? "password-error" : undefined}
              />
              <Button className="h-10 px-5" type="submit" disabled={state === "unlocking"}>
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
    </main>
  );
};
