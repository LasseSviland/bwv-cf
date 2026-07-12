import type { ApiErrorResponse } from "@bwv/contracts";

function bytesToHex(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += byte.toString(16).padStart(2, "0");
  return value;
}

export async function etagForSeed(seed: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  return `"${bytesToHex(new Uint8Array(digest))}"`;
}

export async function jsonWithEtag(
  request: Request,
  value: unknown,
  etagSeed: string,
  status = 200,
): Promise<Response> {
  const etag = await etagForSeed(etagSeed);
  const headers = new Headers({
    "cache-control": "private, max-age=300, must-revalidate",
    "content-type": "application/json; charset=utf-8",
    etag,
    vary: "Authorization",
  });
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(JSON.stringify(value), { status, headers });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
): Response {
  const body: ApiErrorResponse = { error: { code, message, requestId } };
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
}
