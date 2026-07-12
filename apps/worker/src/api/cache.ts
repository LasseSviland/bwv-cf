const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;
const CACHE_HEADERS = ["cache-control", "content-type", "etag", "vary"] as const;

export interface CachedApiResponse {
  body: string;
  headers: Record<string, string>;
  status: number;
}

export function isCacheableApiRequest(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return (
    request.method === "GET" &&
    request.headers.get("if-none-match") === null &&
    path !== "/api/v1/health" &&
    !path.startsWith("/api/v1/admin/")
  );
}

export function apiResponseCacheKey(request: Request, version: number): string {
  const url = new URL(request.url);
  url.searchParams.sort();
  return `api-response:v${version}:${url.pathname}?${url.searchParams.toString()}`;
}

export async function cachedApiResponseEntry(response: Response): Promise<CachedApiResponse> {
  const headers: Record<string, string> = {};
  for (const name of CACHE_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  return { body: await response.clone().text(), headers, status: response.status };
}

export function responseFromCachedEntry(request: Request, cached: CachedApiResponse): Response {
  const headers = new Headers(cached.headers);
  if (request.headers.get("if-none-match") === headers.get("etag")) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(cached.body, { status: cached.status, headers });
}

export async function cacheApiResponse(
  namespace: KVNamespace,
  key: string,
  response: Response,
): Promise<void> {
  await namespace.put(key, JSON.stringify(await cachedApiResponseEntry(response)), {
    expirationTtl: CACHE_TTL_SECONDS,
  });
}
