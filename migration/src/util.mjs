import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export function requiredString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function optionalString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length === 0 ? null : normalized;
}

export function positiveInteger(value, name) {
  const normalized = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return normalized;
}

export function nonnegativeInteger(value, name) {
  const normalized = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return normalized;
}

export function identifierString(value, name) {
  const normalized = requiredString(
    value === null || value === undefined ? "" : String(value),
    name,
  );
  if (!/^[1-9]\d*$/.test(normalized)) throw new Error(`${name} must contain only digits`);
  const numeric = Number(normalized);
  if (!Number.isSafeInteger(numeric)) throw new Error(`${name} is too large`);
  return normalized;
}

export function cleanCategory(value, prefix) {
  const normalized = optionalString(value);
  if (normalized === null) return null;
  const cleaned = normalized.replace(new RegExp(`^${prefix}\\s*`, "i"), "").trim();
  return cleaned.length === 0 ? null : cleaned;
}

export function jsonSafe(value) {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonSafe(entry)]));
  }
  return value;
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, path);
}

export async function writeCompactJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function fileMetadata(path, key, root) {
  const details = await stat(path);
  return {
    key,
    path: resolve(path).slice(resolve(root).length + 1),
    bytes: details.size,
    sha256: await sha256File(path),
  };
}

export async function mapConcurrent(values, concurrency, operation) {
  const queue = [...values];
  const results = [];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const value = queue.shift();
      if (value === undefined) return;
      results.push(await operation(value));
    }
  });
  await Promise.all(workers);
  return results;
}

export function absoluteOutputPath(value) {
  return value === undefined
    ? resolve(new URL("../data/export/", import.meta.url).pathname)
    : resolve(value);
}
