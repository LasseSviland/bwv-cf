import {
  AdminAcceptedResponseSchema,
  ApiErrorResponseSchema,
  MonopolyDetailSchema,
  MonopolyCatalogResponseSchema,
  MonopolyInventoryResponseSchema,
  StatusResponseSchema,
  WineCatalogResponseSchema,
  WineDetailSchema,
  WineInventoryResponseSchema,
} from "@bwv/contracts";
import type {
  AdminAcceptedResponse,
  CatalogResponse,
  MonopolyInventoryResponse,
  MonopolyCatalogItem,
  MonopolyDetail,
  Period,
  StatusResponse,
  WineInventoryResponse,
  WineCatalogItem,
  WineDetail,
} from "./types";

export const UNAUTHORIZED_EVENT = "better-wines:unauthorized";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(message: string, status: number, code?: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  announceUnauthorized?: boolean;
  method?: "GET" | "POST";
  body?: unknown;
}

interface RuntimeSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown };
}

const errorFromBody = (body: unknown, status: number): ApiError => {
  const parsed = ApiErrorResponseSchema.safeParse(body);
  if (parsed.success) {
    return new ApiError(
      parsed.data.error.message,
      status,
      parsed.data.error.code,
      parsed.data.error.requestId,
    );
  }

  return new ApiError(
    status === 401 ? "The password was not accepted." : "The request could not be completed.",
    status,
  );
};

const responseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const request = async <T>(
  path: string,
  apiKey: string,
  schema: RuntimeSchema<T>,
  options: RequestOptions = {},
): Promise<T> => {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    signal: options.signal,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const body = await responseJson(response);

  if (!response.ok) {
    if (response.status === 401 && options.announceUnauthorized !== false) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw errorFromBody(body, response.status);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      "The server returned data in an unexpected format. Please try again later.",
      502,
      "invalid_response",
    );
  }
  return parsed.data;
};

const withQuery = (
  path: string,
  values: Record<string, string | number | undefined | null>,
): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && String(value) !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

export const api = {
  getStatus(
    apiKey: string,
    signal?: AbortSignal,
    announceUnauthorized = true,
  ): Promise<StatusResponse> {
    return request("/api/v1/status", apiKey, StatusResponseSchema, {
      signal,
      announceUnauthorized,
    });
  },

  getWines(
    apiKey: string,
    values: { query?: string; cursor?: string; limit?: number; from?: string; to?: string } = {},
    signal?: AbortSignal,
  ): Promise<CatalogResponse<WineCatalogItem>> {
    return request(
      withQuery("/api/v1/wines", {
        query: values.query,
        cursor: values.cursor,
        limit: values.limit ?? 50,
        from: values.from,
        to: values.to,
      }),
      apiKey,
      WineCatalogResponseSchema,
      { signal },
    );
  },

  getWine(apiKey: string, wineId: string, signal?: AbortSignal): Promise<WineDetail> {
    return request(`/api/v1/wines/${encodeURIComponent(wineId)}`, apiKey, WineDetailSchema, {
      signal,
    });
  },

  getWineInventory(
    apiKey: string,
    wineId: string,
    period: Period,
    signal?: AbortSignal,
  ): Promise<WineInventoryResponse> {
    return request(
      withQuery(`/api/v1/wines/${encodeURIComponent(wineId)}/inventory`, {
        from: period.from,
        to: period.to,
      }),
      apiKey,
      WineInventoryResponseSchema,
      { signal },
    );
  },

  getMonopolies(
    apiKey: string,
    values: { query?: string; cursor?: string; limit?: number; from?: string; to?: string } = {},
    signal?: AbortSignal,
  ): Promise<CatalogResponse<MonopolyCatalogItem>> {
    return request(
      withQuery("/api/v1/monopolies", {
        query: values.query,
        cursor: values.cursor,
        limit: values.limit ?? 50,
        from: values.from,
        to: values.to,
      }),
      apiKey,
      MonopolyCatalogResponseSchema,
      { signal },
    );
  },

  getMonopoly(apiKey: string, monopolyId: string, signal?: AbortSignal): Promise<MonopolyDetail> {
    return request(
      `/api/v1/monopolies/${encodeURIComponent(monopolyId)}`,
      apiKey,
      MonopolyDetailSchema,
      { signal },
    );
  },

  getMonopolyInventory(
    apiKey: string,
    monopolyId: string,
    period: Period,
    signal?: AbortSignal,
  ): Promise<MonopolyInventoryResponse> {
    return request(
      withQuery(`/api/v1/monopolies/${encodeURIComponent(monopolyId)}/inventory`, {
        from: period.from,
        to: period.to,
      }),
      apiKey,
      MonopolyInventoryResponseSchema,
      { signal },
    );
  },

  startInventorySync(apiKey: string, signal?: AbortSignal): Promise<AdminAcceptedResponse> {
    return request("/api/v1/admin/sync-inventories", apiKey, AdminAcceptedResponseSchema, {
      signal,
      method: "POST",
    });
  },
};
