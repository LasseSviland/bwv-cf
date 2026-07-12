interface ErrorStateProps {
  error: Error;
  onRetry?: () => void;
}

export const LoadingState = ({ label = "Loading inventory…" }: { label?: string }) => (
  <div className="state-panel" aria-live="polite" aria-busy="true">
    <div className="spinner" aria-hidden="true" />
    <div>
      <strong>{label}</strong>
      <p>We’re gathering the daily records for this view.</p>
    </div>
  </div>
);

export const ErrorState = ({ error, onRetry }: ErrorStateProps) => (
  <div className="state-panel state-panel--error" role="alert">
    <span className="state-panel__icon" aria-hidden="true">
      !
    </span>
    <div>
      <strong>We couldn’t load this view</strong>
      <p>{error.message}</p>
      {onRetry ? (
        <button className="button button--secondary button--small" type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  </div>
);

export const EmptyState = ({ title, description }: { title: string; description: string }) => (
  <div className="empty-state">
    <span className="empty-state__icon" aria-hidden="true">
      ◌
    </span>
    <h2>{title}</h2>
    <p>{description}</p>
  </div>
);
