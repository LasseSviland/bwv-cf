import { HttpError, PermanentQueueError } from "../errors";
import { parseRawInventoryChunk } from "../ingestion/projections";
import type { RawInventoryChunk } from "../types";
import { rawChunkPrefix } from "./keys";

export async function putJson(
  bucket: R2Bucket,
  key: string,
  value: object | readonly unknown[],
  cacheControl = "no-store",
): Promise<R2Object> {
  return bucket.put(key, JSON.stringify(value), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl,
    },
  });
}

export async function putGzipJson(
  bucket: R2Bucket,
  key: string,
  value: object | readonly unknown[],
  cacheControl = "no-store",
): Promise<R2Object> {
  const source = new Blob([JSON.stringify(value)]).stream();
  const compressed = source.pipeThrough(new CompressionStream("gzip"));
  const object = await bucket.put(key, compressed, {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      contentEncoding: "gzip",
      cacheControl,
    },
  });
  if (object === null) throw new Error(`R2 rejected object write: ${key}`);
  return object;
}

export async function getRequiredGzipJson<T>(
  bucket: R2Bucket,
  key: string,
  parse: (value: unknown) => T,
): Promise<T> {
  const object = await bucket.get(key);
  if (object === null) throw new HttpError(503, "dataset_unavailable", "Dataset is unavailable");
  const decompressed = object.body.pipeThrough(new DecompressionStream("gzip"));
  return parse(await new Response(decompressed).json<unknown>());
}

export async function getRequiredIngestionJson<T>(
  bucket: R2Bucket,
  key: string,
  parse: (value: unknown) => T,
): Promise<T> {
  const object = await bucket.get(key);
  if (object === null) throw new PermanentQueueError(`Required R2 object is missing: ${key}`);
  return parse(await object.json<unknown>());
}

export async function listRawChunkKeys(
  bucket: R2Bucket,
  month: string,
  generation: string,
): Promise<string[]> {
  const prefix = rawChunkPrefix(month, generation);
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list(
      cursor === undefined ? { prefix, limit: 1_000 } : { prefix, cursor, limit: 1_000 },
    );
    keys.push(...page.objects.map(({ key }) => key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);

  keys.sort();
  return keys;
}

export async function* iterateRawChunks(
  bucket: R2Bucket,
  month: string,
  generation: string,
): AsyncGenerator<RawInventoryChunk> {
  const keys = await listRawChunkKeys(bucket, month, generation);
  for (const key of keys) {
    yield await getRequiredIngestionJson(bucket, key, parseRawInventoryChunk);
  }
}
