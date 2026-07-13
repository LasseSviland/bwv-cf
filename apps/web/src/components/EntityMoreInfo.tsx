import {
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Database,
  ExternalLink,
  FlaskConical,
  Grape,
  Hash,
  Info,
  Layers3,
  LoaderCircle,
  MapPin,
  Phone,
  Sparkles,
  Store,
  Utensils,
  Wine,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
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

const objectValue = (value: JsonValue | undefined): JsonObject | null =>
  value && !Array.isArray(value) && typeof value === "object" ? value : null;

const valueAt = (source: JsonObject, path: string): JsonValue | undefined => {
  let current: JsonValue = source;
  for (const segment of path.split(".")) {
    const object = objectValue(current);
    if (!object) return undefined;
    current = object[segment] ?? null;
  }
  return meaningful(current) ? current : undefined;
};

const firstValue = (source: JsonObject, ...paths: string[]): JsonValue | undefined => {
  for (const path of paths) {
    const value = valueAt(source, path);
    if (value !== undefined) return value;
  }
  return undefined;
};

const display = (value: JsonValue | undefined): string | null => {
  if (value === undefined || value === null || typeof value === "object") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const textAt = (source: JsonObject, ...paths: string[]): string | null =>
  display(firstValue(source, ...paths));

const objectsAt = (source: JsonObject, path: string): JsonObject[] => {
  const value = valueAt(source, path);
  if (!Array.isArray(value)) return [];
  return value.map(objectValue).filter((item): item is JsonObject => item !== null);
};

const PrimitiveValue = ({ value }: { value: boolean | number | string }) => {
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (typeof value === "number") return <>{value.toLocaleString("en-GB")}</>;
  if (/^https?:\/\//i.test(value)) {
    return (
      <a
        className="inline-flex max-w-full items-center gap-1 break-all text-primary underline"
        href={value}
        rel="noreferrer"
        target="_blank"
      >
        {value}
        <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
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
          <div
            className="rounded-xl border border-border/70 bg-background/60 p-3"
            key={`${path}-${index}`}
          >
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
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(9rem,0.35fr)_minmax(0,0.65fr)]">
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

const ProfileCard = ({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) => (
  <div className="rounded-2xl border border-border/65 bg-background/55 p-4">
    <div className="flex items-center gap-2 text-primary">
      {icon}
      <p className="text-[0.62rem] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
        {label}
      </p>
    </div>
    <div className="mt-2 text-sm leading-6 font-medium text-foreground">{value}</div>
  </div>
);

const Section = ({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) => (
  <section className="rounded-2xl border border-border/65 bg-background/45 p-5 sm:p-6">
    <div className="flex items-center gap-2.5 text-primary">
      {icon}
      <h3 className="font-serif text-xl font-normal tracking-[-0.02em]">{title}</h3>
    </div>
    <div className="mt-4 text-sm leading-7 text-muted-foreground">{children}</div>
  </section>
);

const TechnicalSource = ({ sourceData }: { sourceData: JsonObject }) => {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="group/source rounded-2xl border border-border/70 bg-background/40"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-5">
        <span className="flex items-center gap-2">
          <Database className="size-4" aria-hidden="true" />
          Complete source data
        </span>
        <ChevronDown
          className="size-4 transition-transform group-open/source:rotate-180"
          aria-hidden="true"
        />
      </summary>
      {open ? (
        <div className="max-h-[34rem] overflow-auto border-t border-border/70 px-4 py-5 sm:px-5">
          <DataObject value={sourceData} path="sourceData" />
        </div>
      ) : null}
    </details>
  );
};

const WineProfile = ({ sourceData }: { sourceData: JsonObject }) => {
  const productNumber = textAt(sourceData, "basic.productId", "legacyDatabase.varenummer");
  const origin = [
    textAt(sourceData, "origins.origin.country", "legacyDatabase.land"),
    textAt(sourceData, "origins.origin.region", "legacyDatabase.distrikt"),
    textAt(sourceData, "origins.origin.subRegion", "legacyDatabase.underdistrikt"),
  ].filter(Boolean);
  const grapes = objectsAt(sourceData, "ingredients.grapes")
    .map((grape) => {
      const name = display(grape.grapeDesc);
      const percentage = display(grape.grapePct);
      return name ? `${name}${percentage ? ` ${percentage}%` : ""}` : null;
    })
    .filter(Boolean);
  const style = textAt(
    sourceData,
    "classification.productTypeName",
    "classification.productGroupName",
    "legacyDatabase.varetype",
  );
  const volume = textAt(sourceData, "basic.volume", "legacyDatabase.volum");
  const alcohol = textAt(sourceData, "basic.alcoholContent", "legacyDatabase.alkohol");
  const price = textAt(sourceData, "prices.salesPrice", "legacyDatabase.pris");
  const pricePerLitre = textAt(sourceData, "prices.salesPricePrLiter", "legacyDatabase.literpris");
  const assortment = textAt(sourceData, "assortment.assortment", "legacyDatabase.produktutvalg");
  const assortmentGrades = objectsAt(sourceData, "assortment.assortmentGrades")
    .map((grade) => textAt(grade, "assortmentGrade"))
    .filter((grade): grade is string => grade !== null);
  const colour = textAt(sourceData, "description.characteristics.colour", "legacyDatabase.farge");
  const odour = textAt(sourceData, "description.characteristics.odour", "legacyDatabase.lukt");
  const taste = textAt(sourceData, "description.characteristics.taste", "legacyDatabase.smak");
  const production = textAt(
    sourceData,
    "properties.productionMethodStorage",
    "legacyDatabase.metode",
  );
  const storage = textAt(sourceData, "properties.storagePotential", "legacyDatabase.lagringsgrad");
  const producer = textAt(sourceData, "basic.manufacturerName", "legacyDatabase.produsent");
  const sugar = textAt(sourceData, "ingredients.sugar", "legacyDatabase.sukker");
  const acid = textAt(sourceData, "ingredients.acid", "legacyDatabase.syre");
  const food = objectsAt(sourceData, "recommendedFood")
    .map((item) => display(item.foodDesc))
    .filter((item): item is string => item !== null);
  const legacyFood = ["passertil01", "passertil02", "passertil03"]
    .map((key) => textAt(sourceData, `legacyDatabase.${key}`))
    .filter((item): item is string => item !== null);
  const foodPairings = food.length ? food : legacyFood;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ProfileCard
          icon={<Hash className="size-4" aria-hidden="true" />}
          label="Product"
          value={productNumber || "Product number not supplied"}
        />
        <ProfileCard
          icon={<MapPin className="size-4" aria-hidden="true" />}
          label="Origin"
          value={origin.length ? origin.join(" · ") : "Origin not supplied"}
        />
        <ProfileCard
          icon={<Grape className="size-4" aria-hidden="true" />}
          label="Grapes"
          value={
            grapes.length
              ? grapes.join(" · ")
              : textAt(sourceData, "legacyDatabase.rastoff") || "Not supplied"
          }
        />
        <ProfileCard
          icon={<Wine className="size-4" aria-hidden="true" />}
          label="Style"
          value={
            <>
              {style || "Wine"}
              {(volume || alcohol) && (
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {[volume ? `${volume} L` : null, alcohol ? `${alcohol}% ABV` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </>
          }
        />
        <ProfileCard
          icon={<Layers3 className="size-4" aria-hidden="true" />}
          label="Assortment"
          value={
            assortment || assortmentGrades.length ? (
              <>
                {assortment || "Fixed assortment"}
                {assortmentGrades.length ? (
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {assortmentGrades.join(" · ")}
                  </span>
                ) : null}
              </>
            ) : (
              "Not supplied"
            )
          }
        />
        <ProfileCard
          icon={<CircleDollarSign className="size-4" aria-hidden="true" />}
          label="Current price"
          value={
            price ? (
              <>
                {Number(price).toLocaleString("nb-NO", { style: "currency", currency: "NOK" })}
                {pricePerLitre ? (
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {Number(pricePerLitre).toLocaleString("nb-NO")} kr / litre
                  </span>
                ) : null}
              </>
            ) : (
              "Price not supplied"
            )
          }
        />
      </div>

      {(colour || odour || taste) && (
        <Section icon={<Sparkles className="size-4" aria-hidden="true" />} title="Tasting profile">
          <dl className="grid gap-5 lg:grid-cols-3">
            {colour ? (
              <div>
                <dt className="text-[0.62rem] font-semibold tracking-[0.12em] text-foreground/55 uppercase">
                  Colour
                </dt>
                <dd className="mt-1">{colour}</dd>
              </div>
            ) : null}
            {odour ? (
              <div>
                <dt className="text-[0.62rem] font-semibold tracking-[0.12em] text-foreground/55 uppercase">
                  Aroma
                </dt>
                <dd className="mt-1">{odour}</dd>
              </div>
            ) : null}
            {taste ? (
              <div>
                <dt className="text-[0.62rem] font-semibold tracking-[0.12em] text-foreground/55 uppercase">
                  Palate
                </dt>
                <dd className="mt-1">{taste}</dd>
              </div>
            ) : null}
          </dl>
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {foodPairings.length ? (
          <Section
            icon={<Utensils className="size-4" aria-hidden="true" />}
            title="Pairs beautifully with"
          >
            <div className="flex flex-wrap gap-2">
              {foodPairings.map((item) => (
                <span
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground"
                  key={item}
                >
                  {item}
                </span>
              ))}
            </div>
          </Section>
        ) : null}
        {(production || storage || sugar || acid) && (
          <Section
            icon={<FlaskConical className="size-4" aria-hidden="true" />}
            title="Winemaking & keeping"
          >
            <dl className="space-y-3">
              {producer ? (
                <div>
                  <dt className="font-medium text-foreground">Producer</dt>
                  <dd>{producer}</dd>
                </div>
              ) : null}
              {production ? (
                <div>
                  <dt className="font-medium text-foreground">Production</dt>
                  <dd>{production}</dd>
                </div>
              ) : null}
              {storage ? (
                <div>
                  <dt className="font-medium text-foreground">Cellaring</dt>
                  <dd>{storage}</dd>
                </div>
              ) : null}
              {sugar || acid ? (
                <div>
                  <dt className="font-medium text-foreground">Balance</dt>
                  <dd>
                    {[sugar ? `${sugar} g/L sugar` : null, acid ? `${acid} g/L acidity` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Section>
        )}
      </div>
      <TechnicalSource sourceData={sourceData} />
    </div>
  );
};

const StoreProfile = ({ sourceData }: { sourceData: JsonObject }) => {
  const storeNumber = textAt(sourceData, "storeId", "legacyDatabase.butikk_id");
  const street = textAt(sourceData, "address.street", "legacyDatabase.gateadresse");
  const postalCode = textAt(sourceData, "address.postalCode", "legacyDatabase.gatePostnummer");
  const city = textAt(sourceData, "address.city", "legacyDatabase.gatePoststed");
  const phone = textAt(sourceData, "telephone", "legacyDatabase.telefonnummer");
  const email = textAt(sourceData, "email");
  const status = textAt(sourceData, "status");
  const category = textAt(sourceData, "category", "legacyDatabase.kategori");
  const profile = textAt(sourceData, "profile");
  const assortment = textAt(sourceData, "storeAssortment");
  const hours = objectsAt(sourceData, "openingHours.regularHours");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ProfileCard
          icon={<Hash className="size-4" aria-hidden="true" />}
          label="Store"
          value={storeNumber || "Store number not supplied"}
        />
        <ProfileCard
          icon={<MapPin className="size-4" aria-hidden="true" />}
          label="Address"
          value={
            [street, [postalCode, city].filter(Boolean).join(" ")].filter(Boolean).join(", ") ||
            "Not supplied"
          }
        />
        <ProfileCard
          icon={<Phone className="size-4" aria-hidden="true" />}
          label="Contact"
          value={
            <>
              {phone || "Not supplied"}
              {email ? (
                <span className="mt-1 block break-all text-xs font-normal text-muted-foreground">
                  {email}
                </span>
              ) : null}
            </>
          }
        />
        <ProfileCard
          icon={<Store className="size-4" aria-hidden="true" />}
          label="Store profile"
          value={
            [category ? `Category ${category}` : null, profile, assortment]
              .filter(Boolean)
              .join(" · ") || "Not supplied"
          }
        />
        <ProfileCard
          icon={<Sparkles className="size-4" aria-hidden="true" />}
          label="Status"
          value={status || "Status not supplied"}
        />
      </div>

      {hours.length ? (
        <Section
          icon={<Clock3 className="size-4" aria-hidden="true" />}
          title="Regular opening hours"
        >
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {hours.map((entry, index) => {
              const day = display(entry.dayOfTheWeek) || `Day ${index + 1}`;
              const closed = entry.closed === true;
              const opening = display(entry.openingTime);
              const closing = display(entry.closingTime);
              return (
                <div
                  className="flex items-center justify-between gap-4 border-b border-border/65 py-2"
                  key={`${day}-${index}`}
                >
                  <dt className="font-medium text-foreground">{day}</dt>
                  <dd>{closed ? "Closed" : [opening, closing].filter(Boolean).join("–")}</dd>
                </div>
              );
            })}
          </dl>
        </Section>
      ) : null}
      <TechnicalSource sourceData={sourceData} />
    </div>
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
      className={cn(
        "group/details rounded-2xl border border-transparent transition-colors open:border-border/70 open:bg-muted/25",
        className,
      )}
      onToggle={toggle}
    >
      <summary
        className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label={`More information about ${label}`}
      >
        <Info className="size-3.5" aria-hidden="true" />
        More info
        <ChevronDown
          className="size-3.5 transition-transform group-open/details:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-border/70 px-3 py-4 sm:px-5 sm:py-5">
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
          kind === "wine" ? (
            <WineProfile sourceData={sourceData} />
          ) : (
            <StoreProfile sourceData={sourceData} />
          )
        ) : null}
      </div>
    </details>
  );
};
