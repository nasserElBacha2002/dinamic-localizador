import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import type {
  OperationShiftVersion,
  OperationShiftVersionDay,
} from "../types/operation-shift";
import { toDateOnlyString } from "../utils/row-mappers";
import { parseSqlTimeToHHmm } from "../utils/sql-time";
import {
  acquireTransactionAppLock,
  operationShiftVersionLockResource,
} from "../utils/sql-app-lock";
import { dateRangesOverlap } from "../utils/shift-time";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const requireTime = (value: unknown, field: string): string => {
  const parsed = parseSqlTimeToHHmm(value);
  if (!parsed) {
    throw new Error(`INVALID_SQL_TIME:${field}`);
  }
  return parsed;
};

const ALL_DAYS_ENABLED: OperationShiftVersionDay[] = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
  dayOfWeek,
  isEnabled: true,
}));

const mapDayRow = (row: Record<string, unknown>): OperationShiftVersionDay => ({
  dayOfWeek: Number(row.day_of_week),
  isEnabled: Boolean(row.is_enabled),
});

export const mapOperationShiftVersionRow = (
  row: Record<string, unknown>,
  days: OperationShiftVersionDay[] = [],
): OperationShiftVersion => ({
  id: String(row.id),
  companyId: String(row.company_id),
  operationShiftId: String(row.operation_shift_id),
  effectiveFrom: toDateOnlyString(row.effective_from as Date | string),
  effectiveUntil: row.effective_until
    ? toDateOnlyString(row.effective_until as Date | string)
    : null,
  startTime: requireTime(row.start_time, "start_time"),
  endTime: requireTime(row.end_time, "end_time"),
  days,
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export type CreateOperationShiftVersionRowInput = {
  effectiveFrom: string;
  effectiveUntil: string | null;
  startTime: string;
  endTime: string;
  days?: OperationShiftVersionDay[];
};

const loadDaysForVersions = async (
  companyId: string,
  versionIds: string[],
  requestFactory: () => sql.Request,
): Promise<Map<string, OperationShiftVersionDay[]>> => {
  const byVersion = new Map<string, OperationShiftVersionDay[]>();
  if (versionIds.length === 0) {
    return byVersion;
  }

  const request = requestFactory().input("companyId", sql.UniqueIdentifier, companyId);
  const placeholders = versionIds.map((versionId, index) => {
    const param = `versionId${index}`;
    request.input(param, sql.UniqueIdentifier, versionId);
    return `@${param}`;
  });

  const result = await request.query(`
    SELECT *
    FROM dbo.operation_shift_version_days
    WHERE company_id = @companyId
      AND operation_shift_version_id IN (${placeholders.join(", ")})
    ORDER BY day_of_week ASC
  `);

  for (const raw of result.recordset) {
    const row = raw as Record<string, unknown>;
    const versionId = String(row.operation_shift_version_id);
    const list = byVersion.get(versionId) ?? [];
    list.push(mapDayRow(row));
    byVersion.set(versionId, list);
  }

  return byVersion;
};

const replaceDaysInRequest = async (
  requestFactory: () => sql.Request,
  companyId: string,
  versionId: string,
  days: OperationShiftVersionDay[],
): Promise<OperationShiftVersionDay[]> => {
  const normalized =
    days.length > 0
      ? [...days]
          .map((day) => ({
            dayOfWeek: day.dayOfWeek,
            isEnabled: Boolean(day.isEnabled),
          }))
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      : ALL_DAYS_ENABLED;

  const daySet = new Set(normalized.map((d) => d.dayOfWeek));
  if (daySet.size !== normalized.length) {
    throw new AppError(
      400,
      "INVALID_SHIFT_VERSION_DAYS",
      "Los días de la versión del turno contienen duplicados.",
    );
  }
  for (const day of normalized) {
    if (!Number.isInteger(day.dayOfWeek) || day.dayOfWeek < 1 || day.dayOfWeek > 7) {
      throw new AppError(
        400,
        "INVALID_SHIFT_VERSION_DAYS",
        "Los días de la versión del turno deben estar entre 1 (lunes) y 7 (domingo).",
      );
    }
  }

  // Ensure full week coverage for CHECK uniqueness / materialization predictability.
  const byDow = new Map(normalized.map((d) => [d.dayOfWeek, d]));
  const fullWeek: OperationShiftVersionDay[] = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
    dayOfWeek,
    isEnabled: byDow.get(dayOfWeek)?.isEnabled ?? false,
  }));

  await requestFactory()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("versionId", sql.UniqueIdentifier, versionId)
    .query(`
      DELETE FROM dbo.operation_shift_version_days
      WHERE company_id = @companyId
        AND operation_shift_version_id = @versionId
    `);

  for (const day of fullWeek) {
    await requestFactory()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("versionId", sql.UniqueIdentifier, versionId)
      .input("dayOfWeek", sql.TinyInt, day.dayOfWeek)
      .input("isEnabled", sql.Bit, day.isEnabled ? 1 : 0)
      .query(`
        INSERT INTO dbo.operation_shift_version_days (
          company_id, operation_shift_version_id, day_of_week, is_enabled
        )
        VALUES (@companyId, @versionId, @dayOfWeek, @isEnabled)
      `);
  }

  return fullWeek;
};

const OVERLAP_ERROR = new AppError(
  409,
  "OPERATION_SHIFT_EFFECTIVE_OVERLAP",
  "Ya existe una versión de turno con vigencia superpuesta.",
);

export const operationShiftVersionRepository = {
  async listByShiftId(
    companyId: string,
    operationShiftId: string,
  ): Promise<OperationShiftVersion[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationShiftId", sql.UniqueIdentifier, operationShiftId)
      .query(`
        SELECT *
        FROM dbo.operation_shift_versions
        WHERE company_id = @companyId
          AND operation_shift_id = @operationShiftId
        ORDER BY effective_from ASC
      `);

    const rows = result.recordset as Record<string, unknown>[];
    const daysByVersion = await loadDaysForVersions(
      companyId,
      rows.map((row) => String(row.id)),
      () => getPool().request(),
    );

    return rows.map((row) =>
      mapOperationShiftVersionRow(row, daysByVersion.get(String(row.id)) ?? []),
    );
  },

  async findById(companyId: string, id: string): Promise<OperationShiftVersion | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT TOP 1 *
        FROM dbo.operation_shift_versions
        WHERE company_id = @companyId AND id = @id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    const daysByVersion = await loadDaysForVersions(companyId, [String(row.id)], () =>
      getPool().request(),
    );
    return mapOperationShiftVersionRow(row, daysByVersion.get(String(row.id)) ?? []);
  },

  /**
   * Exactly one version where effective_from <= date AND (effective_until IS NULL OR date <= effective_until).
   * Returns null when none match; throws if multiple match (data integrity).
   */
  async findEffectiveForDate(
    companyId: string,
    shiftId: string,
    workDate: string,
  ): Promise<OperationShiftVersion | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("shiftId", sql.UniqueIdentifier, shiftId)
      .input("workDate", sql.Date, workDate)
      .query(`
        SELECT *
        FROM dbo.operation_shift_versions
        WHERE company_id = @companyId
          AND operation_shift_id = @shiftId
          AND effective_from <= @workDate
          AND (effective_until IS NULL OR @workDate <= effective_until)
        ORDER BY effective_from ASC
      `);

    if (result.recordset.length === 0) {
      return null;
    }
    if (result.recordset.length > 1) {
      throw new AppError(
        409,
        "OPERATION_SHIFT_EFFECTIVE_OVERLAP",
        "Hay más de una versión de turno vigente para la fecha indicada.",
      );
    }

    const row = result.recordset[0] as Record<string, unknown>;
    const daysByVersion = await loadDaysForVersions(companyId, [String(row.id)], () =>
      getPool().request(),
    );
    return mapOperationShiftVersionRow(row, daysByVersion.get(String(row.id)) ?? []);
  },

  async replaceDays(
    companyId: string,
    versionId: string,
    days: OperationShiftVersionDay[],
  ): Promise<OperationShiftVersionDay[]> {
    return replaceDaysInRequest(() => getPool().request(), companyId, versionId, days);
  },

  /**
   * Insert under SERIALIZABLE + Transaction applock + UPDLOCK/HOLDLOCK on versions
   * for the shift so concurrent creates cannot both pass an empty overlap check.
   */
  async createWithOverlapGuard(
    companyId: string,
    operationShiftId: string,
    input: CreateOperationShiftVersionRowInput,
    existingTransaction?: sql.Transaction,
  ): Promise<OperationShiftVersion> {
    const ownsTransaction = !existingTransaction;
    const pool = getPool();
    const transaction = existingTransaction ?? new sql.Transaction(pool);
    if (ownsTransaction) {
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    }

    try {
      await acquireTransactionAppLock(transaction, {
        resource: operationShiftVersionLockResource(companyId, operationShiftId),
        lockTimeoutMs: 15000,
        timeoutError: OVERLAP_ERROR,
      });

      const existing = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationShiftId", sql.UniqueIdentifier, operationShiftId)
        .query(`
          SELECT *
          FROM dbo.operation_shift_versions WITH (UPDLOCK, HOLDLOCK)
          WHERE company_id = @companyId
            AND operation_shift_id = @operationShiftId
        `);

      const overlap = existing.recordset
        .map((row) => mapOperationShiftVersionRow(row as Record<string, unknown>))
        .find((row) =>
          dateRangesOverlap(
            row.effectiveFrom,
            row.effectiveUntil,
            input.effectiveFrom,
            input.effectiveUntil,
          ),
        );

      if (overlap) {
        throw OVERLAP_ERROR;
      }

      const insert = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationShiftId", sql.UniqueIdentifier, operationShiftId)
        .input("effectiveFrom", sql.Date, input.effectiveFrom)
        .input("effectiveUntil", sql.Date, input.effectiveUntil)
        .input("startTime", sql.NVarChar(8), input.startTime)
        .input("endTime", sql.NVarChar(8), input.endTime)
        .query(`
          INSERT INTO dbo.operation_shift_versions (
            company_id, operation_shift_id, effective_from, effective_until,
            start_time, end_time
          )
          OUTPUT INSERTED.*
          VALUES (
            @companyId, @operationShiftId, @effectiveFrom, @effectiveUntil,
            CAST(@startTime AS TIME), CAST(@endTime AS TIME)
          )
        `);

      const versionRow = insert.recordset[0] as Record<string, unknown>;
      const versionId = String(versionRow.id);
      const days = await replaceDaysInRequest(
        () => new sql.Request(transaction),
        companyId,
        versionId,
        input.days ?? ALL_DAYS_ENABLED,
      );

      if (ownsTransaction) {
        await transaction.commit();
      }

      return mapOperationShiftVersionRow(versionRow, days);
    } catch (error) {
      if (ownsTransaction) {
        try {
          await transaction.rollback();
        } catch {
          // Transaction may already be aborted (XACT_ABORT).
        }
      }
      throw error;
    }
  },
};
