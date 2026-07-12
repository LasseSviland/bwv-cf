import { KeyRound, LoaderCircle, Wine } from "lucide-react";
import { useState, type FormEvent, type PropsWithChildren } from "react";
import { ApiError } from "../api/client";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
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
      <main className="grid min-h-screen place-items-center bg-primary p-6" aria-busy="true">
        <Card className="w-full max-w-md py-12 text-center shadow-2xl">
          <BrandMark />
          <CardContent className="flex flex-col items-center gap-4 text-muted-foreground">
            <LoaderCircle className="size-7 animate-spin text-primary" aria-hidden="true" />
            <p>Opening your inventory workspace…</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-primary p-4 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.12),transparent_38%),radial-gradient(circle_at_15%_90%,rgba(255,255,255,0.07),transparent_30%)]" />
      <Card
        className="relative w-full max-w-xl border-white/15 bg-card py-8 shadow-2xl sm:py-12"
        aria-labelledby="gate-title"
      >
        <CardHeader className="gap-5 px-6 sm:px-12">
          <BrandMark />
          <div>
            <p className="mb-3 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Private inventory history
            </p>
            <CardTitle className="max-w-sm font-serif text-4xl leading-none font-normal tracking-tight sm:text-6xl">
              <h1 id="gate-title">Welcome to Better Wines</h1>
            </CardTitle>
            <CardDescription className="mt-5 max-w-lg text-base leading-7">
              Enter the API access password to explore daily availability across Vinmonopolet
              stores.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-6 sm:px-12">
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
                aria-describedby={error ? "password-error" : "password-help"}
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
            ) : (
              <p className="text-sm text-muted-foreground" id="password-help">
                Saved in this browser until you log out.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
};

const BrandMark = () => (
  <div className="flex items-center gap-3 px-4 text-primary" aria-label="Better Wines">
    <span
      className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground"
      aria-hidden="true"
    >
      <Wine className="size-5" />
    </span>
    <span className="font-semibold">Better Wines</span>
  </div>
);
