import { ZodError } from "zod";

import { SyncQueueMessageSchema, type Month, type SyncQueueMessage } from "@bwv/contracts";
import {
  addDays,
  dateInOslo,
  enumerateMonths,
  firstDateOfMonth,
  inclusiveDayCount,
  lastDateOfMonth,
} from "@bwv/data-format";

import { errorMessage, isPermanentQueueError, PermanentQueueError } from "../errors";
import { logError, logInfo } from "../log";
import {
  acquireMonthLease,
  completeExtractionStep,
  completeInventoryStep,
  completeStep,
  getMonthSync,
  getSourceMonthBound,
  isStepComplete,
  listMonthSyncs,
  markCoordinatorFailed,
  markMonthFailed,
  markMonthRetrying,
  markMonthSkipped,
  markRunStarted,
  inventoryStepCount,
  publishMonth,
  setRunSourceCeiling,
  upsertSourceMonthBounds,
  type SourceMonthBound,
} from "../storage/d1";
import { dailyInventoryKey, rawChunkKey } from "../storage/keys";
import { iterateRawChunks, putGzipJson, putJson } from "../storage/r2";
import type { InventorySourceRowData, MonthManifest, RawInventoryChunk } from "../types";
import { getMonopolyCatalog, getWineCatalog, refreshCatalogs } from "./catalogs";
import {
  DEFAULT_SOURCE_PAGE_SIZE,
  discoverSingleMonthBound,
  discoverSourceMonthBounds,
  getSourceCeiling,
  readInventoryPage,
  withSourceConnection,
} from "./mysql";
import { buildDailyInventorySnapshotFromChunks } from "./projections";
import { monthFromSourceDate, sourceDateToIso } from "./source-date";

function bootstrapStepKey(message: SyncQueueMessage): string {
  return `${message.fromMonth ?? message.month}:${message.throughMonth ?? message.month}`;
}

export function queueStepKey(message: SyncQueueMessage): string {
  switch (message.phase) {
    case "bootstrap-bounds":
      return bootstrapStepKey(message);
    case "extract":
      return `cursor:${message.cursorId ?? "start"}`;
    case "project-inventory":
      return `date:${message.date ?? "missing"}`;
    case "publish":
      return "publish";
    case "refresh-catalogs":
      return `catalog:${message.generation}`;
    case "reset":
      return bootstrapStepKey(message);
  }
}

export function queueRetryDelay(attempts: number): number {
  const exponent = Math.max(0, Math.min(attempts - 1, 7));
  return Math.min(30 * 2 ** exponent, 3_600);
}

export const MAX_QUEUE_DELIVERIES = 6;

export function queueDeliveryExhausted(attempts: number): boolean {
  return attempts >= MAX_QUEUE_DELIVERIES;
}

export const SOURCE_FLOOR_SAFETY_OVERLAP = 10_000;

export function initialExtractionCursor(floorId: number): number {
  return Math.max(0, floorId - 1 - SOURCE_FLOOR_SAFETY_OVERLAP);
}

export function nextExtractionMessage(
  message: SyncQueueMessage,
  cursorId: number,
  ceilingId: number,
): SyncQueueMessage {
  return cursorId < ceilingId
    ? { ...message, phase: "extract", cursorId, ceilingId }
    : {
        version: 1,
        jobId: message.jobId,
        trigger: message.trigger,
        month: message.month,
        generation: message.generation,
        phase: "project-inventory",
        date: firstDateOfMonth(message.month),
      };
}

export function coveredThroughForPublish(
  month: Month,
  observedThrough: string | null,
  today = dateInOslo(),
): string {
  if (month !== today.slice(0, 7)) return lastDateOfMonth(month);
  if (observedThrough === null) {
    throw new Error(`Current month ${month} has no source observation yet`);
  }
  return observedThrough < today ? observedThrough : today;
}

function monthFromKey(monthKey: number): Month {
  if (!Number.isSafeInteger(monthKey)) {
    throw new PermanentQueueError(`Invalid source month key: ${String(monthKey)}`);
  }
  const value = String(monthKey).padStart(6, "0");
  const parsed = `${value.slice(0, 4)}-${value.slice(4)}`;
  const result = SyncQueueMessageSchema.shape.month.safeParse(parsed);
  if (!result.success) throw new PermanentQueueError(`Invalid source month key: ${monthKey}`);
  return result.data;
}

async function sendBatch(env: Env, messages: SyncQueueMessage[]): Promise<void> {
  if (messages.length === 0) return;
  for (let offset = 0; offset < messages.length; offset += 100) {
    await env.SYNC_QUEUE.sendBatch(
      messages.slice(offset, offset + 100).map((body) => ({
        body,
        contentType: "json" as const,
      })),
    );
  }
}

async function processBootstrapBounds(message: SyncQueueMessage, env: Env): Promise<void> {
  if (message.fromMonth === undefined || message.throughMonth === undefined) {
    throw new PermanentQueueError("Bootstrap message is missing its month range");
  }
  const targetMonths = enumerateMonths(message.fromMonth, message.throughMonth, 100);
  const discovery = await withSourceConnection(env.HYPERDRIVE, async (connection) => {
    const sourceCeiling = await getSourceCeiling(connection);
    const bounds = await discoverSourceMonthBounds(
      connection,
      message.fromMonth as Month,
      message.throughMonth as Month,
      sourceCeiling,
    );
    return { bounds, sourceCeiling };
  });

  const discovered = new Map<Month, SourceMonthBound>();
  for (const row of discovery.bounds) {
    if (row.floorId === null || row.ceilingId === null) continue;
    const month = monthFromKey(row.monthKey);
    if (month < message.fromMonth || month > message.throughMonth) continue;
    discovered.set(month, {
      month,
      floorId: row.floorId,
      ceilingId: row.ceilingId,
      sourceRowCount: Number(row.sourceRowCount),
    });
  }
  const allBounds = targetMonths.map(
    (month): SourceMonthBound =>
      discovered.get(month) ?? {
        month,
        floorId: discovery.sourceCeiling + 1,
        ceilingId: discovery.sourceCeiling,
        sourceRowCount: 0,
      },
  );
  await upsertSourceMonthBounds(env.DB, allBounds);

  // The coordinator refreshes catalogs before releasing any month projection work.
  await refreshCatalogs(env, message.generation, discovery.sourceCeiling);

  const monthJobs = await listMonthSyncs(env.DB, message.jobId);
  const boundsByMonth = new Map(allBounds.map((bound) => [bound.month, bound]));
  const monthMessages = monthJobs
    .filter((job) => ["queued", "running", "retrying"].includes(job.status))
    .map((job): SyncQueueMessage => {
      const bound = boundsByMonth.get(job.month);
      if (bound === undefined) {
        throw new PermanentQueueError(`No source bounds were discovered for ${job.month}`);
      }
      return {
        version: 1,
        jobId: job.jobId,
        trigger: message.trigger,
        month: job.month,
        generation: job.generation,
        phase: "extract",
        ceilingId: bound.ceilingId,
      };
    });
  await completeStep(env.DB, message, bootstrapStepKey(message));
  await sendBatch(env, monthMessages);
}

async function ensureSourceBound(
  env: Env,
  month: Month,
  ceilingId: number,
): Promise<SourceMonthBound> {
  const stored = await getSourceMonthBound(env.DB, month);
  if (stored !== null) return stored;

  const discovered = await withSourceConnection(env.HYPERDRIVE, async (connection) => {
    const row = await discoverSingleMonthBound(connection, month, ceilingId);
    if (row === null || row.floorId === null || row.ceilingId === null) {
      return {
        month,
        floorId: ceilingId + 1,
        ceilingId,
        sourceRowCount: 0,
      } satisfies SourceMonthBound;
    }
    return {
      month,
      floorId: row.floorId,
      ceilingId: row.ceilingId,
      sourceRowCount: Number(row.sourceRowCount),
    } satisfies SourceMonthBound;
  });
  await upsertSourceMonthBounds(env.DB, [discovered]);
  return discovered;
}

function validateSourceRow(row: InventorySourceRowData): void {
  if (!Number.isSafeInteger(row.id) || row.id <= 0) {
    throw new PermanentQueueError(`Invalid inventory id: ${String(row.id)}`);
  }
  if (!Number.isSafeInteger(row.wineId) || row.wineId <= 0) {
    throw new PermanentQueueError(`Invalid inventory wine_id at row ${row.id}`);
  }
  if (!Number.isSafeInteger(row.monopolyId) || row.monopolyId <= 0) {
    throw new PermanentQueueError(`Invalid inventory monopoly_id at row ${row.id}`);
  }
  if (!Number.isSafeInteger(row.count) || row.count < 0) {
    throw new PermanentQueueError(`Invalid inventory count at row ${row.id}`);
  }
  sourceDateToIso(row.date);
}

async function processExtract(message: SyncQueueMessage, env: Env): Promise<void> {
  const startedAt = Date.now();
  const fixedCeiling =
    message.ceilingId ??
    (await withSourceConnection(env.HYPERDRIVE, async (connection) =>
      getSourceCeiling(connection),
    ));
  const bound = await ensureSourceBound(env, message.month, fixedCeiling);
  const page = await withSourceConnection(env.HYPERDRIVE, async (connection) => {
    const ceilingId = fixedCeiling;
    const cursorId = message.cursorId ?? initialExtractionCursor(bound.floorId);
    if (cursorId > ceilingId) return { ceilingId, cursorId, rows: [] };
    const rows = await readInventoryPage(connection, cursorId, ceilingId);
    return { ceilingId, cursorId, rows };
  });

  const retained: InventorySourceRowData[] = [];
  let coveredFrom: string | null = null;
  let coveredThrough: string | null = null;
  for (const sourceRow of page.rows) {
    const row: InventorySourceRowData = {
      id: Number(sourceRow.id),
      date: Number(sourceRow.date),
      count: Number(sourceRow.count),
      wineId: Number(sourceRow.wineId),
      monopolyId: Number(sourceRow.monopolyId),
    };
    validateSourceRow(row);
    if (monthFromSourceDate(row.date) !== message.month) continue;
    retained.push(row);
    const date = sourceDateToIso(row.date);
    if (coveredFrom === null || date < coveredFrom) coveredFrom = date;
    if (coveredThrough === null || date > coveredThrough) coveredThrough = date;
  }

  const lastId = page.rows.at(-1)?.id ?? page.cursorId;
  if (page.rows.length > 0) {
    const chunk: RawInventoryChunk = {
      schemaVersion: 1,
      month: message.month,
      generation: message.generation,
      cursorFrom: page.cursorId,
      cursorThrough: Number(lastId),
      rows: retained,
    };
    await putJson(
      env.DATA_BUCKET,
      rawChunkKey(message.month, message.generation, page.cursorId, Number(lastId)),
      chunk,
    );
  }

  const hasMore = page.rows.length === DEFAULT_SOURCE_PAGE_SIZE && Number(lastId) < page.ceilingId;
  const progressCursor = hasMore ? Number(lastId) : page.ceilingId;
  const next = nextExtractionMessage(message, progressCursor, page.ceilingId);
  await completeExtractionStep(env.DB, message, queueStepKey(message), {
    cursorId: progressCursor,
    floorId: bound.floorId,
    ceilingId: page.ceilingId,
    rowsScanned: page.rows.length,
    rowsKept: retained.length,
    coveredFrom,
    coveredThrough,
  });
  logInfo("Extracted inventory page", {
    jobId: message.jobId,
    month: message.month,
    generation: message.generation,
    cursorFrom: page.cursorId,
    cursorThrough: progressCursor,
    ceilingId: page.ceilingId,
    pageSize: DEFAULT_SOURCE_PAGE_SIZE,
    rowsRead: page.rows.length,
    rowsKept: retained.length,
    elapsedMs: Date.now() - startedAt,
  });
  await env.SYNC_QUEUE.send(next, { contentType: "json" });
}

async function processInventoryProjection(message: SyncQueueMessage, env: Env): Promise<void> {
  const startedAt = Date.now();
  const date = message.date;
  if (date === undefined || date.slice(0, 7) !== message.month) {
    throw new PermanentQueueError(`Invalid inventory projection date: ${String(date)}`);
  }
  const monthSync = await getMonthSync(env.DB, message.jobId, message.month);
  if (monthSync === null) throw new PermanentQueueError("Inventory projection state is missing");
  if (message.month === dateInOslo().slice(0, 7) && monthSync.coveredThrough === null) {
    await env.SYNC_QUEUE.send(
      { ...message, phase: "publish", date: undefined },
      { contentType: "json" },
    );
    return;
  }
  const [wines, monopolies] = await Promise.all([getWineCatalog(env), getMonopolyCatalog(env)]);
  const snapshot = await buildDailyInventorySnapshotFromChunks(
    iterateRawChunks(env.DATA_BUCKET, message.month, message.generation),
    date,
    message.generation,
    new Set(wines.map(({ id }) => id)),
    new Set(monopolies.map(({ id }) => id)),
  );
  await putGzipJson(
    env.DATA_BUCKET,
    dailyInventoryKey(date, message.generation),
    snapshot,
    "private, max-age=300",
  );
  await completeInventoryStep(env.DB, message, queueStepKey(message));
  const next = await nextInventoryMessage(message, env.DB);
  logInfo("Projected daily inventory", {
    jobId: message.jobId,
    month: message.month,
    generation: message.generation,
    date,
    rowCount: snapshot.inventory.length,
    elapsedMs: Date.now() - startedAt,
  });
  await env.SYNC_QUEUE.send(next, { contentType: "json" });
}

async function processPublish(message: SyncQueueMessage, env: Env): Promise<void> {
  const [monthSync, bound] = await Promise.all([
    getMonthSync(env.DB, message.jobId, message.month),
    getSourceMonthBound(env.DB, message.month),
  ]);
  if (monthSync === null || bound === null) {
    throw new PermanentQueueError(`Operational state is missing for ${message.month}`);
  }
  if (
    monthSync.cursorId === null ||
    monthSync.ceilingId === null ||
    monthSync.cursorId !== monthSync.ceilingId
  ) {
    throw new Error(`Extraction checkpoint is incomplete for ${message.month}`);
  }
  if (message.month === dateInOslo().slice(0, 7) && monthSync.coveredThrough === null) {
    await markMonthSkipped(
      env.DB,
      message,
      "No source observation exists for the current month at this run ceiling",
    );
    return;
  }
  const coveredThrough = coveredThroughForPublish(message.month, monthSync.coveredThrough);
  const expectedObjects = inclusiveDayCount(firstDateOfMonth(message.month), coveredThrough);
  const completedObjects = await inventoryStepCount(env.DB, message);
  if (completedObjects !== expectedObjects) {
    throw new Error(
      `Inventory projection is incomplete (${completedObjects}/${expectedObjects} dates)`,
    );
  }
  const generatedAt = new Date().toISOString();
  const manifest: MonthManifest = {
    schemaVersion: 2,
    month: message.month,
    generation: message.generation,
    generatedAt,
    coveredFrom: firstDateOfMonth(message.month),
    coveredThrough,
    sourceFloorId: bound.floorId,
    sourceWatermark: monthSync.ceilingId ?? bound.ceilingId,
    sourceRowCount: monthSync.rowsKept,
    inventoryObjectCount: monthSync.inventoryObjectCount,
  };
  await publishMonth(
    env.DB,
    message,
    manifest,
    `d1:published-months/${message.month}`,
    message.generation,
  );
  logInfo("Published monthly inventory", {
    jobId: message.jobId,
    month: message.month,
    generation: message.generation,
    sourceWatermark: manifest.sourceWatermark,
    sourceRowCount: manifest.sourceRowCount,
    inventoryObjectCount: manifest.inventoryObjectCount,
    coveredThrough: manifest.coveredThrough,
  });
}

async function processRefreshCatalogs(message: SyncQueueMessage, env: Env): Promise<void> {
  const sourceCeiling = await refreshCatalogs(env, message.generation);
  await setRunSourceCeiling(env.DB, message.jobId, sourceCeiling);
  const monthJobs = await listMonthSyncs(env.DB, message.jobId);
  const messages = monthJobs
    .filter((job) => ["queued", "running", "retrying"].includes(job.status))
    .map((job): SyncQueueMessage => ({
      version: 1,
      jobId: job.jobId,
      trigger: message.trigger,
      month: job.month,
      generation: job.generation,
      phase: "extract",
      ceilingId: sourceCeiling,
    }));
  await completeStep(env.DB, message, queueStepKey(message));
  await sendBatch(env, messages);
}

async function processReset(message: SyncQueueMessage, env: Env): Promise<void> {
  if (message.fromMonth === undefined || message.throughMonth === undefined) {
    throw new PermanentQueueError("Reset message is missing its reload range");
  }
  const page = await env.DATA_BUCKET.list({ limit: 1_000 });
  const keys = page.objects.map(({ key }) => key);
  if (keys.length > 0) {
    await env.DATA_BUCKET.delete(keys);
    logInfo("Cleared R2 data before reload", {
      jobId: message.jobId,
      objectCount: keys.length,
    });
    await env.SYNC_QUEUE.send(message, { contentType: "json" });
    return;
  }
  await completeStep(env.DB, message, queueStepKey(message));
  await env.SYNC_QUEUE.send({ ...message, phase: "bootstrap-bounds" }, { contentType: "json" });
}

export async function nextInventoryMessage(
  message: SyncQueueMessage,
  db: D1Database,
): Promise<SyncQueueMessage> {
  if (message.date === undefined) throw new PermanentQueueError("Projection date is missing");
  const monthSync = await getMonthSync(db, message.jobId, message.month);
  if (monthSync === null) throw new PermanentQueueError("Projection state is missing");
  const coveredThrough = coveredThroughForPublish(message.month, monthSync.coveredThrough);
  return nextInventoryContinuation(message, coveredThrough);
}

export function nextInventoryContinuation(
  message: SyncQueueMessage,
  coveredThrough: string,
): SyncQueueMessage {
  if (message.date === undefined) throw new PermanentQueueError("Projection date is missing");
  const nextDate = addDays(message.date, 1);
  return nextDate <= coveredThrough
    ? { ...message, date: nextDate }
    : {
        version: 1,
        jobId: message.jobId,
        trigger: message.trigger,
        month: message.month,
        generation: message.generation,
        phase: "publish",
      };
}

async function resumeCompletedStep(message: SyncQueueMessage, env: Env): Promise<void> {
  if (message.phase === "publish") return;
  if (message.phase === "project-inventory") {
    await env.SYNC_QUEUE.send(await nextInventoryMessage(message, env.DB), {
      contentType: "json",
    });
    return;
  }
  const monthJobs = await listMonthSyncs(env.DB, message.jobId);
  if (message.phase === "extract") {
    const job = monthJobs.find(({ month }) => month === message.month);
    if (job?.cursorId === null || job?.cursorId === undefined || job.ceilingId === null) {
      throw new Error(`Completed extraction state is missing for ${message.month}`);
    }
    const next = nextExtractionMessage(message, job.cursorId, job.ceilingId);
    await env.SYNC_QUEUE.send(next, { contentType: "json" });
    return;
  }
  if (message.phase === "refresh-catalogs") {
    const messages = monthJobs
      .filter((job) => ["queued", "running", "retrying"].includes(job.status))
      .map((job): SyncQueueMessage => {
        if (job.ceilingId === null) throw new Error(`Run ceiling is missing for ${job.month}`);
        return {
          version: 1,
          jobId: job.jobId,
          trigger: message.trigger,
          month: job.month,
          generation: job.generation,
          phase: "extract",
          ceilingId: job.ceilingId,
        };
      });
    await sendBatch(env, messages);
    return;
  }
  if (message.phase === "bootstrap-bounds") {
    const messages: SyncQueueMessage[] = [];
    for (const job of monthJobs) {
      if (!["queued", "running", "retrying"].includes(job.status)) continue;
      const bound = await getSourceMonthBound(env.DB, job.month);
      if (bound === null) throw new Error(`Source bounds are missing for ${job.month}`);
      messages.push({
        version: 1,
        jobId: job.jobId,
        trigger: message.trigger,
        month: job.month,
        generation: job.generation,
        phase: "extract",
        ceilingId: bound.ceilingId,
      });
    }
    await sendBatch(env, messages);
    return;
  }
  if (message.phase === "reset") {
    if (message.fromMonth === undefined || message.throughMonth === undefined) {
      throw new Error("Reset range is missing");
    }
    await env.SYNC_QUEUE.send({ ...message, phase: "bootstrap-bounds" }, { contentType: "json" });
  }
}

export async function processQueueMessage(
  message: SyncQueueMessage,
  env: Env,
): Promise<"completed" | "duplicate" | "skipped"> {
  await markRunStarted(env.DB, message.jobId);
  const stepKey = queueStepKey(message);
  const monthSync = await getMonthSync(env.DB, message.jobId, message.month);
  if (monthSync === null) throw new PermanentQueueError("Queue message has no month job state");
  if (["failed", "skipped"].includes(monthSync.status)) return "skipped";
  if (monthSync.status === "succeeded") return "duplicate";
  if (await isStepComplete(env.DB, message, stepKey)) {
    await resumeCompletedStep(message, env);
    return "duplicate";
  }

  if (["extract", "project-inventory", "publish"].includes(message.phase)) {
    const acquired = await acquireMonthLease(env.DB, message);
    if (!acquired) {
      await markMonthSkipped(env.DB, message, "A newer or active sync already owns this month");
      return "skipped";
    }
  }

  switch (message.phase) {
    case "bootstrap-bounds":
      await processBootstrapBounds(message, env);
      break;
    case "extract":
      await processExtract(message, env);
      break;
    case "project-inventory":
      await processInventoryProjection(message, env);
      break;
    case "publish":
      await processPublish(message, env);
      break;
    case "refresh-catalogs":
      await processRefreshCatalogs(message, env);
      break;
    case "reset":
      await processReset(message, env);
      break;
  }
  return "completed";
}

export async function handleQueueBatch(
  batch: MessageBatch<SyncQueueMessage>,
  env: Env,
): Promise<void> {
  for (const queueMessage of batch.messages) {
    const parsed = SyncQueueMessageSchema.safeParse(queueMessage.body);
    if (!parsed.success) {
      logError("Rejected invalid queue message", {
        queueMessageId: queueMessage.id,
        attempts: queueMessage.attempts,
        error: parsed.error.message,
      });
      queueMessage.ack();
      continue;
    }

    const message = parsed.data;
    try {
      const outcome = await processQueueMessage(message, env);
      logInfo("Processed sync queue message", {
        queueMessageId: queueMessage.id,
        jobId: message.jobId,
        month: message.month,
        phase: message.phase,
        outcome,
      });
      queueMessage.ack();
    } catch (error) {
      const detail = errorMessage(error);
      const permanent = isPermanentQueueError(error) || error instanceof ZodError;
      logError("Sync queue message failed", {
        queueMessageId: queueMessage.id,
        jobId: message.jobId,
        month: message.month,
        phase: message.phase,
        attempts: queueMessage.attempts,
        permanent,
        error: detail,
      });
      const exhausted = !permanent && queueDeliveryExhausted(queueMessage.attempts);
      if (permanent || exhausted) {
        if (
          message.phase === "bootstrap-bounds" ||
          message.phase === "refresh-catalogs" ||
          message.phase === "reset"
        ) {
          await markCoordinatorFailed(env.DB, message.jobId, detail);
        } else {
          await markMonthFailed(env.DB, message, detail);
        }
        if (permanent) {
          queueMessage.ack();
        } else {
          // The final negative acknowledgement moves the message into the DLQ;
          // D1 already reflects the terminal failure and its lease is released.
          queueMessage.retry({ delaySeconds: queueRetryDelay(queueMessage.attempts) });
        }
      } else {
        await markMonthRetrying(env.DB, message, detail);
        queueMessage.retry({ delaySeconds: queueRetryDelay(queueMessage.attempts) });
      }
    }
  }
}
