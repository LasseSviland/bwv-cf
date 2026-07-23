import type { R2JsonStorage } from "../src/storage/r2";

export class MemoryKV {
  readonly values = new Map<string, string>();
  readonly reads: string[] = [];
  readonly writes: string[] = [];
  failReads = false;
  failWrites = false;

  readonly namespace = {
    get: (key: string) => {
      this.reads.push(key);
      if (this.failReads) return Promise.reject(new Error("KV read failed"));
      return Promise.resolve(this.values.get(key) ?? null);
    },
    put: (key: string, value: string) => {
      this.writes.push(key);
      if (this.failWrites) return Promise.reject(new Error("KV write failed"));
      this.values.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string) => {
      this.values.delete(key);
      return Promise.resolve();
    },
  } as unknown as KVNamespace;
}

export class MemoryR2 {
  readonly values = new Map<string, unknown>();
  readonly uploaded = new Map<string, Date>();
  readonly sizes = new Map<string, number>();
  readonly gets: string[] = [];
  readonly cache = new MemoryKV();

  readonly bucket = {
    head: (key: string) => Promise.resolve(this.values.has(key) ? this.object(key) : null),
    get: (key: string) => {
      this.gets.push(key);
      return Promise.resolve(
        this.values.has(key)
          ? ({
              ...this.object(key),
              json: <T>() => Promise.resolve(this.values.get(key) as T),
              text: () => Promise.resolve(JSON.stringify(this.values.get(key))),
            } as unknown as R2ObjectBody)
          : null,
      );
    },
    put: (key: string, value: string, options?: R2PutOptions) => {
      if (options?.onlyIf && this.values.has(key)) return Promise.resolve(null);
      this.values.set(key, JSON.parse(value) as unknown);
      this.sizes.set(key, new TextEncoder().encode(value).byteLength);
      this.uploaded.set(key, new Date("2026-07-13T08:00:00.000Z"));
      return Promise.resolve(this.object(key));
    },
    delete: (key: string | string[]) => {
      for (const current of Array.isArray(key) ? key : [key]) {
        this.values.delete(current);
        this.uploaded.delete(current);
        this.sizes.delete(current);
      }
      return Promise.resolve();
    },
    list: (options?: R2ListOptions) => {
      const objects = [...this.values.keys()]
        .filter((key) => key.startsWith(options?.prefix ?? ""))
        .sort()
        .map((key) => this.object(key));
      return Promise.resolve({
        objects,
        truncated: false,
        delimitedPrefixes: [],
      } as unknown as R2Objects);
    },
  } as unknown as R2Bucket;

  get storage(): R2JsonStorage {
    return { DATA_BUCKET: this.bucket, R2_CACHE: this.cache.namespace };
  }

  seed(
    key: string,
    value: unknown,
    uploaded = new Date("2026-07-12T08:00:00.000Z"),
    size = new TextEncoder().encode(JSON.stringify(value)).byteLength,
  ): void {
    this.values.set(key, value);
    this.uploaded.set(key, uploaded);
    this.sizes.set(key, size);
  }

  private object(key: string): R2Object {
    return {
      key,
      etag: `etag-${key}`,
      httpEtag: `"etag-${key}"`,
      size:
        this.sizes.get(key) ??
        new TextEncoder().encode(JSON.stringify(this.values.get(key))).byteLength,
      uploaded: this.uploaded.get(key) ?? new Date("2026-07-13T08:00:00.000Z"),
      checksums: {},
      version: "version",
      writeHttpMetadata: () => undefined,
    } as unknown as R2Object;
  }
}
