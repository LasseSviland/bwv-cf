import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  DEFAULT_R2_BUCKET,
  INVENTORY_PREFIX,
  MONOPOLIES_KEY,
  UPLOAD_REPORT_FILE,
  WINES_KEY,
} from "./constants.mjs";
import { mergeMonopolyCatalogs, mergeWineCatalogs, validateSnapshot } from "./format.mjs";
import {
  mapConcurrent,
  nonnegativeInteger,
  readJson,
  requiredString,
  writeCompactJson,
  writeJsonAtomic,
} from "./util.mjs";

function r2Configuration(environment) {
  const accountId = requiredString(environment.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID");
  const accessKeyId = requiredString(environment.AWS_ACCESS_KEY_ID, "AWS_ACCESS_KEY_ID");
  const secretAccessKey = requiredString(
    environment.AWS_SECRET_ACCESS_KEY,
    "AWS_SECRET_ACCESS_KEY",
  );
  const jurisdiction = environment.MIGRATION_R2_JURISDICTION ?? "default";
  const jurisdictionSegment = jurisdiction === "default" ? "" : `${jurisdiction}.`;
  return {
    bucket: environment.MIGRATION_R2_BUCKET ?? DEFAULT_R2_BUCKET,
    client: new S3Client({
      region: "auto",
      endpoint:
        environment.MIGRATION_R2_ENDPOINT ??
        `https://${accountId}.${jurisdictionSegment}r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(environment.AWS_SESSION_TOKEN ? { sessionToken: environment.AWS_SESSION_TOKEN } : {}),
      },
    }),
  };
}

function isMissing(error) {
  return error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404;
}

function isPreconditionFailure(error) {
  return error?.name === "PreconditionFailed" || error?.$metadata?.httpStatusCode === 412;
}

async function getRemoteJson(client, bucket, key) {
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return { value: JSON.parse(await response.Body.transformToString()), etag: response.ETag };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function listRemoteInventory(client, bucket) {
  const keys = new Set();
  let continuationToken;
  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: INVENTORY_PREFIX,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of response.Contents ?? []) {
      if (object.Key) keys.add(object.Key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken !== undefined);
  return keys;
}

async function uploadFile(client, bucket, key, path, condition, preconditionIsSkip = false) {
  const details = await stat(path);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(path),
        ContentLength: details.size,
        ContentType: "application/json; charset=utf-8",
        CacheControl: "no-store",
        ...condition,
      }),
    );
    return "uploaded";
  } catch (error) {
    if (preconditionIsSkip && isPreconditionFailure(error)) return "skipped";
    throw error;
  }
}

export async function uploadSnapshot({
  root,
  confirm = false,
  dryRun = false,
  overwriteInventory = false,
  concurrency = 16,
  environment = process.env,
}) {
  if (!dryRun && !confirm) {
    throw new Error("Refusing to upload without --confirm; use --dry-run to inspect the plan");
  }
  nonnegativeInteger(concurrency, "Upload concurrency");
  if (concurrency < 1 || concurrency > 64) {
    throw new Error("Upload concurrency must be between 1 and 64");
  }

  const manifest = await validateSnapshot(root);
  const { bucket, client } = r2Configuration(environment);
  try {
    const [remoteWines, remoteMonopolies, existingInventory] = await Promise.all([
      getRemoteJson(client, bucket, WINES_KEY),
      getRemoteJson(client, bucket, MONOPOLIES_KEY),
      listRemoteInventory(client, bucket),
    ]);

    const historicWines = await readJson(join(root, "cloudflare", WINES_KEY));
    const historicMonopolies = await readJson(join(root, "cloudflare", MONOPOLIES_KEY));
    const mergedAt = new Date().toISOString();
    const mergedWines = mergeWineCatalogs(historicWines, remoteWines?.value ?? null, mergedAt);
    const mergedMonopolies = mergeMonopolyCatalogs(
      historicMonopolies,
      remoteMonopolies?.value ?? null,
      mergedAt,
    );
    const uploadRoot = join(root, "upload");
    await mkdir(join(uploadRoot, "catalogs"), { recursive: true });
    await writeCompactJson(join(uploadRoot, WINES_KEY), mergedWines);
    await writeCompactJson(join(uploadRoot, MONOPOLIES_KEY), mergedMonopolies);

    const inventoryObjects = manifest.cloudflare.objects.filter(({ key }) =>
      key.startsWith(INVENTORY_PREFIX),
    );
    const candidates = inventoryObjects.filter(
      ({ key }) => overwriteInventory || !existingInventory.has(key),
    );
    let uploadedInventory = 0;
    let skippedInventory = inventoryObjects.length - candidates.length;

    if (!dryRun) {
      const results = await mapConcurrent(candidates, concurrency, async (object) => {
        const outcome = await uploadFile(
          client,
          bucket,
          object.key,
          resolve(root, object.path),
          overwriteInventory ? {} : { IfNoneMatch: "*" },
          !overwriteInventory,
        );
        return outcome;
      });
      uploadedInventory = results.filter((result) => result === "uploaded").length;
      skippedInventory += results.filter((result) => result === "skipped").length;

      // Catalogs are committed last. Conditional writes abort if a daily sync
      // changed either catalog after it was read and merged above.
      await uploadFile(
        client,
        bucket,
        WINES_KEY,
        join(uploadRoot, WINES_KEY),
        remoteWines?.etag ? { IfMatch: remoteWines.etag } : { IfNoneMatch: "*" },
      );
      await uploadFile(
        client,
        bucket,
        MONOPOLIES_KEY,
        join(uploadRoot, MONOPOLIES_KEY),
        remoteMonopolies?.etag ? { IfMatch: remoteMonopolies.etag } : { IfNoneMatch: "*" },
      );
    }

    const report = {
      schemaVersion: 1,
      status: dryRun ? "dry-run" : "completed",
      completedAt: new Date().toISOString(),
      bucket,
      catalogs: {
        wines: mergedWines.wines.length,
        monopolies: mergedMonopolies.monopolies.length,
        uploaded: !dryRun,
      },
      inventory: {
        prepared: inventoryObjects.length,
        planned: candidates.length,
        uploaded: uploadedInventory,
        skippedExisting: skippedInventory,
        overwriteExisting: overwriteInventory,
      },
    };
    await writeJsonAtomic(join(root, UPLOAD_REPORT_FILE), report);
    return report;
  } finally {
    client.destroy();
  }
}
