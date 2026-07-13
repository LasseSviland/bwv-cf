import { ChevronDown, Info, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { api } from "../api/client";
import type { JsonObject, JsonValue } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { cn } from "../lib/utils";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";

type EntityKind = "wine" | "monopoly";
type LoadState = "idle" | "loading" | "loaded" | "error";

interface EntityMoreInfoProps {
  kind: EntityKind;
  entityId: string;
  label: string;
  className?: string;
}

const meaningful = (value: JsonValue): boolean => {
  if (value === null || value === "") return false;
  if (Array.isArray(value)) return value.some(meaningful);
  if (typeof value === "object") return Object.values(value).some(meaningful);
  return true;
};

const fieldLabel = (key: string): string => {
  const spaced = key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  const capitalized = spaced.charAt(0).toLocaleUpperCase() + spaced.slice(1);
  return capitalized
    .replace(/\bId\b/g, "ID")
    .replace(/\bGtin\b/g, "GTIN")
    .replace(/\bGps\b/g, "GPS")
    .replace(/\bUrl\b/g, "URL")
    .replace(/\bVat\b/g, "VAT");
};

const PrimitiveValue = ({ value }: { value: boolean | number | string }) => {
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (typeof value === "number") return <>{value.toLocaleString("en-GB")}</>;
  if (/^https?:\/\//i.test(value)) {
    return (
      <a className="break-all text-primary underline" href={value} rel="noreferrer" target="_blank">
        {value}
      </a>
    );
  }
  return <span className="whitespace-pre-wrap">{value}</span>;
};

const DataValue = ({ value, path }: { value: JsonValue; path: string }) => {
  if (value === null) return null;
  if (typeof value !== "object") return <PrimitiveValue value={value} />;
  if (Array.isArray(value)) {
    const items = value.filter(meaningful);
    if (items.length === 0) return null;
    if (items.every((item) => typeof item !== "object" || item === null)) {
      return <span>{items.map((item) => (item === null ? "" : String(item))).join(", ")}</span>;
    }
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item, index) => (
          <div className="rounded-lg border bg-background/60 p-3" key={`${path}-${index}`}>
            <DataValue value={item} path={`${path}.${String(index)}`} />
          </div>
        ))}
      </div>
    );
  }
  return <DataObject value={value} path={path} />;
};

const DataObject = ({ value, path }: { value: JsonObject; path: string }) => {
  const entries = Object.entries(value).filter(([, entry]) => meaningful(entry));
  if (entries.length === 0) return null;
  return (
    <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-[minmax(9rem,0.35fr)_minmax(0,0.65fr)]">
      {entries.map(([key, entry]) => (
        <div className="grid gap-1 sm:col-span-2 sm:grid-cols-subgrid" key={`${path}.${key}`}>
          <dt className="text-xs font-medium tracking-wide text-muted-foreground">
            {fieldLabel(key)}
          </dt>
          <dd className="min-w-0 text-sm text-foreground">
            <DataValue value={entry} path={`${path}.${key}`} />
          </dd>
        </div>
      ))}
    </dl>
  );
};

export const EntityMoreInfo = ({ kind, entityId, label, className }: EntityMoreInfoProps) => {
  const { apiKey } = useAuth();
  const [state, setState] = useState<LoadState>("idle");
  const [sourceData, setSourceData] = useState<JsonObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const load = (): void => {
    if (!apiKey || state === "loading" || state === "loaded") return;
    controller.current?.abort();
    const requestController = new AbortController();
    controller.current = requestController;
    setState("loading");
    setError(null);
    const request =
      kind === "wine"
        ? api.getWine(apiKey, entityId, requestController.signal)
        : api.getMonopoly(apiKey, entityId, requestController.signal);
    void request
      .then((detail) => {
        if (requestController.signal.aborted) return;
        setSourceData(detail.sourceData);
        setState("loaded");
      })
      .catch((reason: unknown) => {
        if (requestController.signal.aborted) return;
        setError(
          reason instanceof Error ? reason.message : "More information could not be loaded.",
        );
        setState("error");
      });
  };

  const toggle = (event: SyntheticEvent<HTMLDetailsElement>): void => {
    if (event.currentTarget.open) load();
  };

  return (
    <details
      className={cn("group rounded-lg border border-transparent open:border-border", className)}
      onToggle={toggle}
    >
      <summary
        className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label={`More information about ${label}`}
      >
        <Info className="size-3.5" aria-hidden="true" />
        More info
        <ChevronDown
          className="size-3.5 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t px-3 py-4 sm:px-4">
        {state === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Loading more information…
          </div>
        ) : null}
        {state === "error" && error ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button size="sm" variant="outline" type="button" onClick={load}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {sourceData ? (
          <div className="max-h-[32rem] overflow-auto pr-2">
            <DataObject value={sourceData} path="sourceData" />
          </div>
        ) : null}
      </div>
    </details>
  );
};
