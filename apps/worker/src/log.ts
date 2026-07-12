type LogContext = Record<string, boolean | number | string | null | undefined>;

function record(message: string, context: LogContext): string {
  return JSON.stringify({ message, ...context });
}

export function logInfo(message: string, context: LogContext = {}): void {
  console.log(record(message, context));
}

export function logError(message: string, context: LogContext = {}): void {
  console.error(record(message, context));
}
