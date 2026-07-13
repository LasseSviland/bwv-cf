import { describe, expect, it } from "vitest";

import { getRequiredGzipJson, putGzipJson } from "../src/storage/r2";

describe("gzip JSON storage", () => {
  it("writes actual gzip bytes and restores the JSON value", async () => {
    let bytes = new ArrayBuffer(0);
    let metadata: R2HTTPMetadata | undefined;
    const bucket = {
      put: async (_key: string, value: ReadableStream, options: R2PutOptions) => {
        bytes = await new Response(value).arrayBuffer();
        metadata = options.httpMetadata as R2HTTPMetadata;
        return { etag: "etag" } as R2Object;
      },
      get: () => Promise.resolve({ body: new Blob([bytes]).stream() } as unknown as R2ObjectBody),
    } as unknown as R2Bucket;

    const value = {
      schemaVersion: 2,
      date: "2026-07-12",
      generation: "gen",
      inventory: [{ wineId: 1, monopolyId: 10, count: 4 }],
    };
    await putGzipJson(bucket, "inventory.json.gz", value);

    expect([...new Uint8Array(bytes).slice(0, 2)]).toEqual([0x1f, 0x8b]);
    expect(metadata?.contentEncoding).toBe("gzip");
    await expect(
      getRequiredGzipJson(bucket, "inventory.json.gz", (input) => input),
    ).resolves.toEqual(value);
  });
});
