import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { once } from "node:events";

import { jsonSafe } from "./util.mjs";

export async function writeLine(stream, value) {
  const line = `${JSON.stringify(jsonSafe(value))}\n`;
  if (!stream.write(line)) await once(stream, "drain");
  return Buffer.byteLength(line);
}

export async function closeWritable(stream) {
  stream.end();
  await once(stream, "close");
}

export async function* readNdjson(path) {
  const input = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (line.trim().length === 0) continue;
    try {
      yield JSON.parse(line);
    } catch (error) {
      throw new Error(`${path}:${lineNumber} contains invalid JSON`, { cause: error });
    }
  }
}

export class LruNdjsonWriters {
  constructor(limit = 64) {
    this.limit = limit;
    this.writers = new Map();
  }

  async append(path, value) {
    let writer = this.writers.get(path);
    if (writer === undefined) {
      if (this.writers.size >= this.limit) {
        const oldestPath = this.writers.keys().next().value;
        const oldest = this.writers.get(oldestPath);
        this.writers.delete(oldestPath);
        await closeWritable(oldest);
      }
      await mkdir(dirname(path), { recursive: true });
      writer = createWriteStream(path, { encoding: "utf8", flags: "a", mode: 0o600 });
    } else {
      this.writers.delete(path);
    }
    this.writers.set(path, writer);
    await writeLine(writer, value);
  }

  async close() {
    const writers = [...this.writers.values()];
    this.writers.clear();
    await Promise.all(writers.map(closeWritable));
  }
}
