export class MemoryR2 {
  readonly values = new Map<string, unknown>();
  readonly uploaded = new Map<string, Date>();

  readonly bucket = {
    head: (key: string) => Promise.resolve(this.values.has(key) ? this.object(key) : null),
    get: (key: string) =>
      Promise.resolve(
        this.values.has(key)
          ? ({
              ...this.object(key),
              json: <T>() => Promise.resolve(this.values.get(key) as T),
            } as unknown as R2ObjectBody)
          : null,
      ),
    put: (key: string, value: string, options?: R2PutOptions) => {
      if (options?.onlyIf && this.values.has(key)) return Promise.resolve(null);
      this.values.set(key, JSON.parse(value) as unknown);
      this.uploaded.set(key, new Date("2026-07-13T08:00:00.000Z"));
      return Promise.resolve(this.object(key));
    },
    delete: (key: string | string[]) => {
      for (const current of Array.isArray(key) ? key : [key]) {
        this.values.delete(current);
        this.uploaded.delete(current);
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

  seed(key: string, value: unknown, uploaded = new Date("2026-07-12T08:00:00.000Z")): void {
    this.values.set(key, value);
    this.uploaded.set(key, uploaded);
  }

  private object(key: string): R2Object {
    return {
      key,
      etag: `etag-${key}`,
      httpEtag: `"etag-${key}"`,
      size: JSON.stringify(this.values.get(key)).length,
      uploaded: this.uploaded.get(key) ?? new Date("2026-07-13T08:00:00.000Z"),
      checksums: {},
      version: "version",
      writeHttpMetadata: () => undefined,
    } as unknown as R2Object;
  }
}
