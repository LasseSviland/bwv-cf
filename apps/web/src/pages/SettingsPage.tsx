import { Database, LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/PageHeader";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

export const SettingsPage = () => {
  const { apiKey } = useAuth();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const startSync = (): void => {
    if (!apiKey) return;
    setRunning(true);
    setMessage(null);
    setFailed(false);
    void api
      .startInventorySync(apiKey)
      .then((result) => {
        setMessage(`The inventory sync for ${result.date} was added to the queue.`);
      })
      .catch((error: unknown) => {
        setFailed(true);
        setMessage(error instanceof Error ? error.message : "The inventory sync could not start.");
      })
      .finally(() => setRunning(false));
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-8">
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Manage the daily Vinmonopolet data refresh and keep the portfolio current."
      />

      <Card className="rounded-xl border-0 p-2 shadow-[0_24px_70px_rgb(31_45_37/7%)] ring-1 ring-foreground/8 sm:p-4">
        <CardHeader>
          <span className="mb-4 grid size-11 place-items-center rounded-lg bg-secondary text-primary">
            <Database className="size-5" aria-hidden="true" />
          </span>
          <CardTitle className="font-serif text-2xl font-normal tracking-[-0.025em]">
            Inventory sync
          </CardTitle>
          <CardDescription>
            Refresh the merged wine and monopoly catalogs, then store today&apos;s complete stock
            response. The scheduled sync runs once every morning.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="h-11 rounded-md px-4"
            type="button"
            disabled={running || !apiKey}
            aria-busy={running}
            onClick={startSync}
          >
            {running ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            {running ? "Adding to queue…" : "Sync inventories now"}
          </Button>
          {message ? (
            <Alert variant={failed ? "destructive" : undefined} role="status">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};
