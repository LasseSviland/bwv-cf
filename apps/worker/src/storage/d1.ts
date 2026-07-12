import type { SyncQueueMessage } from "@bwv/contracts";

import type {
  CatalogVersionRow,
  MonthManifest,
  MonthSyncRow,
  PublishedMonthRow,
  SyncRunRow,
} from "../types";

const LEASE_MILLISECONDS = 6 * 60 * 60 * 1_000;

export interface NewMonthSync {
  month: string;
  generation: string;
}

export interface SourceMonthBound {
  month: string;
  floorId: number;
  ceilingId: number;
  sourceRowCount: number;
}

export interface MonthProgressUpdate {
  cursorId: number;
  floorId: number;
  ceilingId: number;
  rowsScanned: number;
  rowsKept: number;
  coveredFrom: string | null;
  coveredThrough: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function createSyncRun(
  db: D1Database,
  jobId: string,
  trigger: SyncQueueMessage["trigger"],
  monthSyncs: NewMonthSync[],
  initialPhase: SyncQueueMessage["phase"],
): Promise<NewMonthSync[]> {
  const createdAt = nowIso();
  const months = monthSyncs.map(({ month }) => month);
  const statements = [
    db
      .prepare(
        `INSERT INTO sync_runs
          (id, trigger, status, from_month, through_month, total_months, requested_at)
         VALUES (?, ?, 'queued', ?, ?, ?, ?)`,
      )
      .bind(jobId, trigger, months[0], months.at(-1), months.length, createdAt),
    ...monthSyncs.map(({ month, generation }) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO month_syncs
            (job_id, month, generation, status, phase, created_at, updated_at)
           VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
        )
        .bind(jobId, month, generation, initialPhase, createdAt, createdAt),
    ),
  ];

  await db.batch(statements);
  const insertedResult = await db
    .prepare(
      `SELECT month, generation
         FROM month_syncs
        WHERE job_id = ? AND status = 'queued'
        ORDER BY month`,
    )
    .bind(jobId)
    .all<{ generation: string; month: string }>();
  const insertedByMonth = new Map(
    insertedResult.results.map(({ month, generation }) => [month, generation]),
  );
  const skipped = monthSyncs.filter(({ month }) => !insertedByMonth.has(month));
  if (skipped.length > 0) {
    await db.batch(
      skipped.map(({ month, generation }) =>
        db
          .prepare(
            `INSERT INTO month_syncs
              (job_id, month, generation, status, phase, error, created_at, updated_at, completed_at)
             VALUES (?, ?, ?, 'skipped', ?, 'An active sync already owns this month', ?, ?, ?)`,
          )
          .bind(jobId, month, generation, initialPhase, createdAt, createdAt, createdAt),
      ),
    );
  }
  const queued = monthSyncs.filter(
    ({ month, generation }) => insertedByMonth.get(month) === generation,
  );
  if (queued.length === 0) await refreshRunSummary(db, jobId);
  return queued;
}

export async function markRunStarted(db: D1Database, jobId: string): Promise<void> {
  const at = nowIso();
  await db
    .prepare(
      `UPDATE sync_runs
          SET status = CASE WHEN status = 'queued' THEN 'running' ELSE status END,
              started_at = COALESCE(started_at, ?)
        WHERE id = ?`,
    )
    .bind(at, jobId)
    .run();
}

export async function setRunSourceCeiling(
  db: D1Database,
  jobId: string,
  ceilingId: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE month_syncs
          SET ceiling_id = ?, source_watermark = ?, updated_at = ?
        WHERE job_id = ? AND status IN ('queued', 'running', 'retrying')`,
    )
    .bind(ceilingId, ceilingId, nowIso(), jobId)
    .run();
}

export async function getSyncRun(db: D1Database, jobId: string): Promise<SyncRunRow | null> {
  return db
    .prepare(
      `SELECT id,
              trigger,
              status,
              from_month AS fromMonth,
              through_month AS throughMonth,
              total_months AS totalMonths,
              succeeded_months AS succeededMonths,
              failed_months AS failedMonths,
              requested_at AS requestedAt,
              started_at AS startedAt,
              completed_at AS completedAt,
              error
         FROM sync_runs
        WHERE id = ?`,
    )
    .bind(jobId)
    .first<SyncRunRow>();
}

export async function listSyncRuns(db: D1Database, limit: number): Promise<SyncRunRow[]> {
  const result = await db
    .prepare(
      `SELECT id,
              trigger,
              status,
              from_month AS fromMonth,
              through_month AS throughMonth,
              total_months AS totalMonths,
              succeeded_months AS succeededMonths,
              failed_months AS failedMonths,
              requested_at AS requestedAt,
              started_at AS startedAt,
              completed_at AS completedAt,
              error
         FROM sync_runs
        ORDER BY requested_at DESC
        LIMIT ?`,
    )
    .bind(limit)
    .all<SyncRunRow>();
  return result.results;
}

export async function listMonthSyncs(db: D1Database, jobId: string): Promise<MonthSyncRow[]> {
  const result = await db
    .prepare(
      `SELECT job_id AS jobId,
              month,
              generation,
              status,
              phase,
              cursor_id AS cursorId,
              floor_id AS floorId,
              ceiling_id AS ceilingId,
              rows_scanned AS rowsScanned,
              rows_kept AS rowsKept,
              wine_object_count AS wineObjectCount,
              monopoly_object_count AS monopolyObjectCount,
              covered_from AS coveredFrom,
              covered_through AS coveredThrough,
              source_watermark AS sourceWatermark,
              manifest_key AS manifestKey,
              error,
              created_at AS createdAt,
              updated_at AS updatedAt,
              completed_at AS completedAt
         FROM month_syncs
        WHERE job_id = ?
        ORDER BY month`,
    )
    .bind(jobId)
    .all<MonthSyncRow>();
  return result.results;
}

export async function acquireMonthLease(
  db: D1Database,
  message: Pick<SyncQueueMessage, "generation" | "jobId" | "month">,
): Promise<boolean> {
  const now = new Date();
  const nowValue = now.toISOString();
  const expiresAt = new Date(now.getTime() + LEASE_MILLISECONDS).toISOString();
  const result = await db
    .prepare(
      `INSERT INTO sync_leases (month, job_id, generation, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(month) DO UPDATE SET
         job_id = excluded.job_id,
         generation = excluded.generation,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at
       WHERE sync_leases.expires_at <= excluded.updated_at
          OR (sync_leases.job_id = excluded.job_id AND sync_leases.generation = excluded.generation)`,
    )
    .bind(message.month, message.jobId, message.generation, expiresAt, nowValue)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function isStepComplete(
  db: D1Database,
  message: SyncQueueMessage,
  stepKey: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS completed
         FROM completed_steps
        WHERE job_id = ? AND month = ? AND generation = ? AND phase = ? AND step_key = ?`,
    )
    .bind(message.jobId, message.month, message.generation, message.phase, stepKey)
    .first<{ completed: number }>();
  return row !== null;
}

export async function projectionStepCounts(
  db: D1Database,
  message: Pick<SyncQueueMessage, "generation" | "jobId" | "month">,
): Promise<{ monopolies: number; wines: number }> {
  const row = await db
    .prepare(
      `SELECT SUM(CASE WHEN phase = 'project-wines' THEN 1 ELSE 0 END) AS wines,
              SUM(CASE WHEN phase = 'project-monopolies' THEN 1 ELSE 0 END) AS monopolies
         FROM completed_steps
        WHERE job_id = ? AND month = ? AND generation = ?
          AND phase IN ('project-wines', 'project-monopolies')`,
    )
    .bind(message.jobId, message.month, message.generation)
    .first<{ monopolies: number | null; wines: number | null }>();
  return { wines: row?.wines ?? 0, monopolies: row?.monopolies ?? 0 };
}

export async function completeStep(
  db: D1Database,
  message: SyncQueueMessage,
  stepKey: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO completed_steps
        (job_id, month, generation, phase, step_key, completed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(message.jobId, message.month, message.generation, message.phase, stepKey, nowIso())
    .run();
}

export async function upsertSourceMonthBounds(
  db: D1Database,
  bounds: SourceMonthBound[],
): Promise<void> {
  if (bounds.length === 0) return;
  const discoveredAt = nowIso();
  await db.batch(
    bounds.map((bound) =>
      db
        .prepare(
          `INSERT INTO source_month_bounds
            (month, floor_id, ceiling_id, source_row_count, discovered_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(month) DO UPDATE SET
             floor_id = MIN(source_month_bounds.floor_id, excluded.floor_id),
             ceiling_id = MAX(source_month_bounds.ceiling_id, excluded.ceiling_id),
             source_row_count = excluded.source_row_count,
             discovered_at = excluded.discovered_at`,
        )
        .bind(bound.month, bound.floorId, bound.ceilingId, bound.sourceRowCount, discoveredAt),
    ),
  );
}

export async function getSourceMonthBound(
  db: D1Database,
  month: string,
): Promise<SourceMonthBound | null> {
  return db
    .prepare(
      `SELECT month,
              floor_id AS floorId,
              ceiling_id AS ceilingId,
              source_row_count AS sourceRowCount
         FROM source_month_bounds
        WHERE month = ?`,
    )
    .bind(month)
    .first<SourceMonthBound>();
}

export async function updateMonthProgress(
  db: D1Database,
  message: SyncQueueMessage,
  update: MonthProgressUpdate,
): Promise<void> {
  const at = nowIso();
  await db
    .prepare(
      `UPDATE month_syncs
          SET status = 'running',
              phase = ?,
              cursor_id = ?,
              floor_id = ?,
              ceiling_id = ?,
              rows_scanned = rows_scanned + ?,
              rows_kept = rows_kept + ?,
              covered_from = CASE
                WHEN ? IS NULL THEN covered_from
                WHEN covered_from IS NULL OR ? < covered_from THEN ?
                ELSE covered_from
              END,
              covered_through = CASE
                WHEN ? IS NULL THEN covered_through
                WHEN covered_through IS NULL OR ? > covered_through THEN ?
                ELSE covered_through
              END,
              source_watermark = ?,
              error = NULL,
              updated_at = ?
        WHERE job_id = ? AND month = ? AND generation = ?`,
    )
    .bind(
      message.phase,
      update.cursorId,
      update.floorId,
      update.ceilingId,
      update.rowsScanned,
      update.rowsKept,
      update.coveredFrom,
      update.coveredFrom,
      update.coveredFrom,
      update.coveredThrough,
      update.coveredThrough,
      update.coveredThrough,
      update.ceilingId,
      at,
      message.jobId,
      message.month,
      message.generation,
    )
    .run();
}

export async function completeExtractionStep(
  db: D1Database,
  message: SyncQueueMessage,
  stepKey: string,
  update: MonthProgressUpdate,
): Promise<void> {
  const at = nowIso();
  await db.batch([
    db
      .prepare(
        `UPDATE month_syncs
            SET status = 'running',
                phase = ?,
                cursor_id = ?,
                floor_id = ?,
                ceiling_id = ?,
                rows_scanned = rows_scanned + ?,
                rows_kept = rows_kept + ?,
                covered_from = CASE
                  WHEN ? IS NULL THEN covered_from
                  WHEN covered_from IS NULL OR ? < covered_from THEN ?
                  ELSE covered_from
                END,
                covered_through = CASE
                  WHEN ? IS NULL THEN covered_through
                  WHEN covered_through IS NULL OR ? > covered_through THEN ?
                  ELSE covered_through
                END,
                source_watermark = ?,
                error = NULL,
                updated_at = ?
          WHERE job_id = ? AND month = ? AND generation = ?`,
      )
      .bind(
        message.phase,
        update.cursorId,
        update.floorId,
        update.ceilingId,
        update.rowsScanned,
        update.rowsKept,
        update.coveredFrom,
        update.coveredFrom,
        update.coveredFrom,
        update.coveredThrough,
        update.coveredThrough,
        update.coveredThrough,
        update.ceilingId,
        at,
        message.jobId,
        message.month,
        message.generation,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO completed_steps
          (job_id, month, generation, phase, step_key, completed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(message.jobId, message.month, message.generation, message.phase, stepKey, at),
  ]);
}

export async function incrementProjectionCount(
  db: D1Database,
  message: SyncQueueMessage,
  projection: "wine" | "monopoly",
  count: number,
): Promise<void> {
  const column = projection === "wine" ? "wine_object_count" : "monopoly_object_count";
  await db
    .prepare(
      `UPDATE month_syncs
          SET ${column} = ${column} + ?, phase = ?, status = 'running', updated_at = ?
        WHERE job_id = ? AND month = ? AND generation = ?`,
    )
    .bind(count, message.phase, nowIso(), message.jobId, message.month, message.generation)
    .run();
}

export async function completeProjectionStep(
  db: D1Database,
  message: SyncQueueMessage,
  stepKey: string,
  projection: "wine" | "monopoly",
  count: number,
): Promise<void> {
  const column = projection === "wine" ? "wine_object_count" : "monopoly_object_count";
  const at = nowIso();
  await db.batch([
    db
      .prepare(
        `UPDATE month_syncs
            SET ${column} = ${column} + ?, phase = ?, status = 'running', updated_at = ?
          WHERE job_id = ? AND month = ? AND generation = ?`,
      )
      .bind(count, message.phase, at, message.jobId, message.month, message.generation),
    db
      .prepare(
        `INSERT OR IGNORE INTO completed_steps
          (job_id, month, generation, phase, step_key, completed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(message.jobId, message.month, message.generation, message.phase, stepKey, at),
  ]);
}

export async function markMonthRetrying(
  db: D1Database,
  message: SyncQueueMessage,
  error: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE month_syncs
          SET status = 'retrying', phase = ?, error = ?, updated_at = ?
        WHERE job_id = ? AND month = ? AND generation = ?`,
    )
    .bind(
      message.phase,
      error.slice(0, 2_000),
      nowIso(),
      message.jobId,
      message.month,
      message.generation,
    )
    .run();
}

export async function markMonthFailed(
  db: D1Database,
  message: SyncQueueMessage,
  error: string,
): Promise<void> {
  const at = nowIso();
  await db.batch([
    db
      .prepare(
        `UPDATE month_syncs
            SET status = 'failed', phase = ?, error = ?, updated_at = ?, completed_at = ?
          WHERE job_id = ? AND month = ? AND generation = ?`,
      )
      .bind(
        message.phase,
        error.slice(0, 2_000),
        at,
        at,
        message.jobId,
        message.month,
        message.generation,
      ),
    db
      .prepare(
        `DELETE FROM sync_leases
          WHERE month = ? AND job_id = ? AND generation = ?`,
      )
      .bind(message.month, message.jobId, message.generation),
  ]);
  await refreshRunSummary(db, message.jobId);
}

export async function markCoordinatorFailed(
  db: D1Database,
  jobId: string,
  error: string,
): Promise<void> {
  const at = nowIso();
  await db.batch([
    db
      .prepare(
        `UPDATE month_syncs
            SET status = 'failed', error = ?, updated_at = ?, completed_at = ?
          WHERE job_id = ? AND status IN ('queued', 'running', 'retrying')`,
      )
      .bind(error.slice(0, 2_000), at, at, jobId),
    db.prepare("DELETE FROM sync_leases WHERE job_id = ?").bind(jobId),
    db
      .prepare(
        `UPDATE sync_runs
            SET status = 'failed', failed_months = total_months, error = ?, completed_at = ?
          WHERE id = ?`,
      )
      .bind(error.slice(0, 2_000), at, jobId),
  ]);
}

export async function markMonthSkipped(
  db: D1Database,
  message: SyncQueueMessage,
  reason: string,
): Promise<void> {
  const at = nowIso();
  await db.batch([
    db
      .prepare(
        `UPDATE month_syncs
            SET status = 'skipped', error = ?, updated_at = ?, completed_at = ?
          WHERE job_id = ? AND month = ? AND generation = ?`,
      )
      .bind(reason, at, at, message.jobId, message.month, message.generation),
    db
      .prepare(
        `DELETE FROM sync_leases
          WHERE month = ? AND job_id = ? AND generation = ?`,
      )
      .bind(message.month, message.jobId, message.generation),
  ]);
  await refreshRunSummary(db, message.jobId);
}

export async function getMonthSync(
  db: D1Database,
  jobId: string,
  month: string,
): Promise<MonthSyncRow | null> {
  return db
    .prepare(
      `SELECT job_id AS jobId,
              month,
              generation,
              status,
              phase,
              cursor_id AS cursorId,
              floor_id AS floorId,
              ceiling_id AS ceilingId,
              rows_scanned AS rowsScanned,
              rows_kept AS rowsKept,
              wine_object_count AS wineObjectCount,
              monopoly_object_count AS monopolyObjectCount,
              covered_from AS coveredFrom,
              covered_through AS coveredThrough,
              source_watermark AS sourceWatermark,
              manifest_key AS manifestKey,
              error,
              created_at AS createdAt,
              updated_at AS updatedAt,
              completed_at AS completedAt
         FROM month_syncs
        WHERE job_id = ? AND month = ?`,
    )
    .bind(jobId, month)
    .first<MonthSyncRow>();
}

export async function publishMonth(
  db: D1Database,
  message: SyncQueueMessage,
  manifest: MonthManifest,
  key: string,
  etag: string,
): Promise<void> {
  const publishedAt = nowIso();
  await db.batch([
    db
      .prepare(
        `INSERT INTO published_months
          (month, generation, manifest_key, generated_at, covered_from, covered_through,
           source_floor_id, source_watermark, source_row_count, wine_object_count,
           monopoly_object_count, etag, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(month) DO UPDATE SET
           generation = excluded.generation,
           manifest_key = excluded.manifest_key,
           generated_at = excluded.generated_at,
           covered_from = excluded.covered_from,
           covered_through = excluded.covered_through,
           source_floor_id = excluded.source_floor_id,
           source_watermark = excluded.source_watermark,
           source_row_count = excluded.source_row_count,
           wine_object_count = excluded.wine_object_count,
           monopoly_object_count = excluded.monopoly_object_count,
           etag = excluded.etag,
           published_at = excluded.published_at`,
      )
      .bind(
        manifest.month,
        manifest.generation,
        key,
        manifest.generatedAt,
        manifest.coveredFrom,
        manifest.coveredThrough,
        manifest.sourceFloorId,
        manifest.sourceWatermark,
        manifest.sourceRowCount,
        manifest.wineObjectCount,
        manifest.monopolyObjectCount,
        etag,
        publishedAt,
      ),
    db
      .prepare(
        `UPDATE month_syncs
            SET status = 'succeeded',
                phase = 'publish',
                manifest_key = ?,
                covered_from = ?,
                covered_through = ?,
                source_watermark = ?,
                error = NULL,
                updated_at = ?,
                completed_at = ?
          WHERE job_id = ? AND month = ? AND generation = ?`,
      )
      .bind(
        key,
        manifest.coveredFrom,
        manifest.coveredThrough,
        manifest.sourceWatermark,
        publishedAt,
        publishedAt,
        message.jobId,
        message.month,
        message.generation,
      ),
    db
      .prepare(
        `DELETE FROM sync_leases
          WHERE month = ? AND job_id = ? AND generation = ?`,
      )
      .bind(message.month, message.jobId, message.generation),
    db
      .prepare(
        `INSERT OR IGNORE INTO completed_steps
          (job_id, month, generation, phase, step_key, completed_at)
         VALUES (?, ?, ?, 'publish', 'publish', ?)`,
      )
      .bind(message.jobId, message.month, message.generation, publishedAt),
  ]);
  await refreshRunSummary(db, message.jobId);
}

export async function refreshRunSummary(db: D1Database, jobId: string): Promise<void> {
  const counts = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
              SUM(CASE WHEN status IN ('queued', 'running', 'retrying') THEN 1 ELSE 0 END) AS active
         FROM month_syncs
        WHERE job_id = ?`,
    )
    .bind(jobId)
    .first<{ active: number; failed: number; skipped: number; succeeded: number; total: number }>();
  if (counts === null) return;

  const done = counts.active === 0;
  const status = !done
    ? "running"
    : counts.failed > 0 || counts.skipped > 0
      ? counts.succeeded > 0
        ? "partial"
        : "failed"
      : "succeeded";
  const completedAt = done ? nowIso() : null;

  await db
    .prepare(
      `UPDATE sync_runs
          SET status = ?,
              succeeded_months = ?,
              failed_months = ?,
              completed_at = ?
        WHERE id = ?`,
    )
    .bind(status, counts.succeeded, counts.failed + counts.skipped, completedAt, jobId)
    .run();
}

export async function listPublishedMonths(db: D1Database): Promise<PublishedMonthRow[]> {
  const result = await db
    .prepare(
      `SELECT month,
              generation,
              manifest_key AS manifestKey,
              generated_at AS generatedAt,
              covered_from AS coveredFrom,
              covered_through AS coveredThrough,
              source_floor_id AS sourceFloorId,
              source_watermark AS sourceWatermark,
              source_row_count AS sourceRowCount,
              wine_object_count AS wineObjectCount,
              monopoly_object_count AS monopolyObjectCount,
              etag,
              published_at AS publishedAt
         FROM published_months
        ORDER BY month`,
    )
    .all<PublishedMonthRow>();
  return result.results;
}

export async function getPublishedMonths(
  db: D1Database,
  months: string[],
): Promise<PublishedMonthRow[]> {
  if (months.length === 0) return [];
  const placeholders = months.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT month,
              generation,
              manifest_key AS manifestKey,
              generated_at AS generatedAt,
              covered_from AS coveredFrom,
              covered_through AS coveredThrough,
              source_floor_id AS sourceFloorId,
              source_watermark AS sourceWatermark,
              source_row_count AS sourceRowCount,
              wine_object_count AS wineObjectCount,
              monopoly_object_count AS monopolyObjectCount,
              etag,
              published_at AS publishedAt
         FROM published_months
        WHERE month IN (${placeholders})
        ORDER BY month`,
    )
    .bind(...months)
    .all<PublishedMonthRow>();
  return result.results;
}

export interface CatalogVersionInput {
  catalog: "wines" | "monopolies";
  generation: string;
  objectKey: string;
  itemCount: number;
  etag: string;
  generatedAt: string;
}

export async function putCatalogVersions(
  db: D1Database,
  versions: readonly [CatalogVersionInput, CatalogVersionInput],
): Promise<void> {
  await db.batch(
    versions.map((version) =>
      db
        .prepare(
          `INSERT INTO catalog_versions
            (catalog, generation, object_key, item_count, etag, generated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(catalog) DO UPDATE SET
             generation = excluded.generation,
             object_key = excluded.object_key,
             item_count = excluded.item_count,
             etag = excluded.etag,
             generated_at = excluded.generated_at`,
        )
        .bind(
          version.catalog,
          version.generation,
          version.objectKey,
          version.itemCount,
          version.etag,
          version.generatedAt,
        ),
    ),
  );
}

export async function getCatalogVersion(
  db: D1Database,
  catalog: "wines" | "monopolies",
): Promise<CatalogVersionRow | null> {
  return db
    .prepare(
      `SELECT catalog,
              generation,
              object_key AS objectKey,
              item_count AS itemCount,
              etag,
              generated_at AS generatedAt
         FROM catalog_versions
        WHERE catalog = ?`,
    )
    .bind(catalog)
    .first<CatalogVersionRow>();
}
