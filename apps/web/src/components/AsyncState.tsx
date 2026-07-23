interface ErrorStateProps {
  error: Error;
  onRetry?: () => void;
}

export const LoadingState = ({ label = "Loading inventory…" }: { label?: string }) => (
  <Card
    className="rounded-lg bg-card shadow-none"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <CardContent className="flex items-center gap-4 py-5">
      <span className="grid size-9 place-items-center rounded-full bg-secondary text-primary">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      </span>
      <div>
        <strong className="font-medium">{label}</strong>
        <p className="mt-1 text-sm text-muted-foreground">
          We’re gathering the daily records for this view.
        </p>
      </div>
    </CardContent>
  </Card>
);

export const ErrorState = ({ error, onRetry }: ErrorStateProps) => (
  <Alert variant="destructive">
    <AlertCircle />
    <AlertTitle>We couldn’t load this view</AlertTitle>
    <AlertDescription className="space-y-3">
      <p>{error.message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" type="button" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </AlertDescription>
  </Alert>
);

export const EmptyState = ({ title, description }: { title: string; description: string }) => (
  <Card className="border-dashed py-10 text-center">
    <CardContent className="flex flex-col items-center gap-2">
      <CircleOff className="mb-2 size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="font-serif text-2xl">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);
import { AlertCircle, CircleOff, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
