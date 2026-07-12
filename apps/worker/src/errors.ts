export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export class PermanentQueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentQueueError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isPermanentQueueError(error: unknown): boolean {
  return error instanceof PermanentQueueError;
}
