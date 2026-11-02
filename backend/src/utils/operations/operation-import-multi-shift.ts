import type { CreateRecurringOperationInput } from "../../schemas/operation.schema";
import type { ScheduleSource } from "../../constants/schedule-source";
import type {
  OperationImportPreviewRow,
  OperationImportRecurringConfirmRow,
  OperationImportRecurringCollapsedConfirmRow,
  OperationImportRecurringMultiShiftCollapsedRow,
  OperationImportRecurringShiftConfirmInput,
  OperationImportRecurringShiftConfirmSeed,
} from "../../types/operation-import";
import { WEEKDAYS, type Weekday } from "../../constants/weekday";
import { normalizeShiftCode } from "./shift-code";
import {
  assertShiftTimesDistinct,
  isOvernightShift,
  normalizeShiftTime,
  ShiftTimeError,
} from "./shift-time";
import {
  buildRecurringImportScheduleDays,
  hasAnyRecurringWeekdayColumn,
  parseRecurringImportTime,
} from "./operation-import-recurring";

export type RecurringImportScheduleMode = "SINGLE" | "MULTI_SHIFT";

export const IMPORT_RECURRING_MULTI_SHIFT_MIXED_MODE_MESSAGE =
  "No se puede mezclar modo horario SINGLE y MULTI_SHIFT para la misma sucursal y vigencia_desde.";

export const IMPORT_RECURRING_MULTI_SHIFT_SHIFT_CODE_REQUIRED_MESSAGE =
  "turno_codigo es obligatorio en filas MULTI_SHIFT.";

export const IMPORT_RECURRING_MULTI_SHIFT_SHIFT_CODE_DUPLICATE_MESSAGE =
  "turno_codigo duplicado dentro de la misma operación multi-turno.";

export const IMPORT_RECURRING_MULTI_SHIFT_GROUP_INCONSISTENT_MESSAGE =
  "Las filas de la misma operación multi-turno deben coincidir en sucursal, vigencia y tolerancias.";

export const IMPORT_RECURRING_MULTI_SHIFT_CUSTOM_SOURCE_MESSAGE =
  "Las operaciones multi-turno recurrentes usan origen_horario EMPRESA (como en el alta manual).";

export const IMPORT_RECURRING_MULTI_SHIFT_SHIFT_TIMES_REQUIRED_MESSAGE =
  "horario_inicio y horario_fin son obligatorios por turno en MULTI_SHIFT.";

export const IMPORT_RECURRING_MULTI_SHIFT_WEEKDAY_REQUIRED_MESSAGE =
  "Configurá al menos un día de trabajo para cada turno.";

export const buildRecurringMultiShiftGroupKey = (serviceId: string, validFrom: string): string =>
  `${serviceId}|${validFrom}|MULTI_SHIFT`;

export type RecurringMultiShiftGroupOperationSnapshot = {
  serviceId: string;
  validFrom: string;
  validUntil: string | null;
  scheduleMode: "MULTI_SHIFT";
  scheduleSource: ScheduleSource;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  earlyToleranceSource: "COMPANY_DEFAULT" | "CUSTOM";
  lateToleranceSource: "COMPANY_DEFAULT" | "CUSTOM";
};

const snapshotFromPreviewRow = (row: OperationImportPreviewRow): RecurringMultiShiftGroupOperationSnapshot | null => {
  if (
    row.scheduleMode !== "MULTI_SHIFT" ||
    !row.serviceId ||
    !row.validFrom ||
    row.earlyToleranceMinutes === null ||
    row.lateToleranceMinutes === null ||
    !row.scheduleSource
  ) {
    return null;
  }

  return {
    serviceId: row.serviceId,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    scheduleMode: "MULTI_SHIFT",
    scheduleSource: row.scheduleSource,
    earlyToleranceMinutes: row.earlyToleranceMinutes,
    lateToleranceMinutes: row.lateToleranceMinutes,
    earlyToleranceSource: row.earlyToleranceSource,
    lateToleranceSource: row.lateToleranceSource,
  };
};

const snapshotFromConfirmRow = (
  row: OperationImportRecurringConfirmRow,
): RecurringMultiShiftGroupOperationSnapshot | null => {
  if (row.scheduleMode !== "MULTI_SHIFT" || !row.shift) {
    return null;
  }

  return {
    serviceId: row.serviceId,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    scheduleMode: "MULTI_SHIFT",
    scheduleSource: row.scheduleSource,
    earlyToleranceMinutes: row.earlyToleranceMinutes,
    lateToleranceMinutes: row.lateToleranceMinutes,
    earlyToleranceSource: row.earlyToleranceSource ?? "CUSTOM",
    lateToleranceSource: row.lateToleranceSource ?? "CUSTOM",
  };
};

const snapshotsMatch = (
  left: RecurringMultiShiftGroupOperationSnapshot,
  right: RecurringMultiShiftGroupOperationSnapshot,
): boolean =>
  left.serviceId === right.serviceId &&
  left.validFrom === right.validFrom &&
  left.validUntil === right.validUntil &&
  left.scheduleMode === right.scheduleMode &&
  left.scheduleSource === right.scheduleSource &&
  left.earlyToleranceMinutes === right.earlyToleranceMinutes &&
  left.lateToleranceMinutes === right.lateToleranceMinutes &&
  left.earlyToleranceSource === right.earlyToleranceSource &&
  left.lateToleranceSource === right.lateToleranceSource;

export const isRecurringMultiShiftGroupOperationConsistent = (
  snapshots: RecurringMultiShiftGroupOperationSnapshot[],
): boolean => {
  if (snapshots.length <= 1) {
    return true;
  }

  const reference = snapshots[0]!;
  return snapshots.every((snapshot) => snapshotsMatch(reference, snapshot));
};

export const assertRecurringMultiShiftConfirmGroupsConsistent = (
  rows: OperationImportRecurringConfirmRow[],
): void => {
  const grouped = new Map<string, RecurringMultiShiftGroupOperationSnapshot[]>();

  for (const row of rows) {
    if (row.scheduleMode !== "MULTI_SHIFT") {
      continue;
    }
    const snapshot = snapshotFromConfirmRow(row);
    if (!snapshot) {
      continue;
    }
    const groupKey = buildRecurringMultiShiftGroupKey(snapshot.serviceId, snapshot.validFrom);
    const bucket = grouped.get(groupKey) ?? [];
    bucket.push(snapshot);
    grouped.set(groupKey, bucket);
  }

  for (const snapshots of grouped.values()) {
    if (!isRecurringMultiShiftGroupOperationConsistent(snapshots)) {
      throw new Error(IMPORT_RECURRING_MULTI_SHIFT_GROUP_INCONSISTENT_MESSAGE);
    }
  }
};

/**
 * Canonical shift ordering for import: company template sortOrder when present,
 * then normalized shift code (stable across row order). sortOrder indices match
 * manual create (0..n-1 after ordering).
 */
export const orderRecurringMultiShiftImportSeeds = (
  shifts: OperationImportRecurringShiftConfirmInput[],
  templateSortOrderById: ReadonlyMap<string, number> = new Map(),
): OperationImportRecurringShiftConfirmSeed[] => {
  const sorted = [...shifts].sort((left, right) => {
    const templateOrderLeft = left.templateId
      ? (templateSortOrderById.get(left.templateId) ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;
    const templateOrderRight = right.templateId
      ? (templateSortOrderById.get(right.templateId) ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;
    if (templateOrderLeft !== templateOrderRight) {
      return templateOrderLeft - templateOrderRight;
    }

    const codeLeft = normalizeRecurringImportShiftCode(left.code, left.name);
    const codeRight = normalizeRecurringImportShiftCode(right.code, right.name);
    return codeLeft.localeCompare(codeRight);
  });

  return sorted.map((shift, index) => ({
    ...shift,
    sortOrder: index,
  }));
};

export const parseRecurringImportScheduleMode = (
  raw: string,
): { mode: RecurringImportScheduleMode; error: string | null } => {
  const normalized = raw.trim().toLowerCase();
  if (!normalized || ["single", "unico", "único", "simple"].includes(normalized)) {
    return { mode: "SINGLE", error: null };
  }

  if (
    ["multi_shift", "multiturno", "multi_turno"].includes(normalized) ||
    normalized.replace(/-/g, "_") === "multi_shift"
  ) {
    return { mode: "MULTI_SHIFT", error: null };
  }

  return {
    mode: "SINGLE",
    error: "modo_horario debe ser SINGLE o MULTI_SHIFT",
  };
};

const WEEKDAY_TO_ISO: Record<Weekday, number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7,
};

export const buildRecurringImportShiftEnabledDays = (
  headers: string[],
  row: string[],
): { dayOfWeek: number; isEnabled: boolean }[] => {
  const scheduleDays = buildRecurringImportScheduleDays(headers, row, "00:00", "00:00");
  return WEEKDAYS.map((dayOfWeek) => ({
    dayOfWeek: WEEKDAY_TO_ISO[dayOfWeek],
    isEnabled: scheduleDays.find((day) => day.dayOfWeek === dayOfWeek)?.isEnabled ?? false,
  }));
};

export const parseRecurringImportShiftTimes = (
  rawStart: string,
  rawEnd: string,
): { startTime: string | null; endTime: string | null; errors: string[] } => {
  const errors: string[] = [];
  const startResolution = parseRecurringImportTime(rawStart, "horario_inicio");
  const endResolution = parseRecurringImportTime(rawEnd, "horario_fin");
  if (startResolution.error) {
    errors.push(startResolution.error);
  }
  if (endResolution.error) {
    errors.push(endResolution.error);
  }

  if (!startResolution.value || !endResolution.value) {
    return { startTime: null, endTime: null, errors };
  }

  try {
    const startTime = normalizeShiftTime(startResolution.value);
    const endTime = normalizeShiftTime(endResolution.value);
    assertShiftTimesDistinct(startTime, endTime);
    return { startTime, endTime, errors };
  } catch (error) {
    if (error instanceof ShiftTimeError) {
      errors.push(error.message);
    } else {
      errors.push("Horario de turno inválido");
    }
    return { startTime: null, endTime: null, errors };
  }
};

export type RecurringMultiShiftGroupState = {
  groupKey: string;
  rowIndexes: number[];
  shiftCodes: Set<string>;
};

export const invalidatePreviewRows = (rows: OperationImportPreviewRow[], indexes: number[], message: string) => {
  for (const index of indexes) {
    const row = rows[index];
    if (!row) {
      continue;
    }
    if (!row.errors.includes(message)) {
      row.errors.push(message);
    }
    row.status = "invalid";
    row.earlyToleranceMinutes = null;
    row.lateToleranceMinutes = null;
  }
};

export const finalizeRecurringMultiShiftPreviewGroups = (rows: OperationImportPreviewRow[]): void => {
  const groups = new Map<string, number[]>();

  rows.forEach((row, index) => {
    if (row.scheduleMode !== "MULTI_SHIFT" || !row.serviceId || !row.validFrom) {
      return;
    }
    const groupKey = buildRecurringMultiShiftGroupKey(row.serviceId, row.validFrom);
    row.multiShiftGroupKey = groupKey;
    const current = groups.get(groupKey) ?? [];
    current.push(index);
    groups.set(groupKey, current);
  });

  for (const [groupKey, indexes] of groups) {
    const members = indexes.map((index) => rows[index]!).filter(Boolean);
    if (members.length === 0) {
      continue;
    }

    const reference = members[0]!;
    const referenceSnapshot = snapshotFromPreviewRow(reference);
    const memberSnapshots = members
      .map((row) => snapshotFromPreviewRow(row))
      .filter((snapshot): snapshot is RecurringMultiShiftGroupOperationSnapshot => snapshot !== null);

    const inconsistent =
      referenceSnapshot &&
      memberSnapshots.length === members.length &&
      !isRecurringMultiShiftGroupOperationConsistent(memberSnapshots);

    if (inconsistent) {
      invalidatePreviewRows(rows, indexes, IMPORT_RECURRING_MULTI_SHIFT_GROUP_INCONSISTENT_MESSAGE);
      continue;
    }

    const hasInvalidMember = members.some((row) => row.status === "invalid");
    if (hasInvalidMember) {
      invalidatePreviewRows(
        rows,
        indexes.filter((index) => rows[index]?.status === "valid"),
        "La operación multi-turno contiene turnos inválidos",
      );
    }

    if (members.every((row) => row.status === "valid")) {
      for (const row of members) {
        row.multiShiftGroupKey = groupKey;
      }
    }
  }
};

export const collapseRecurringMultiShiftConfirmRows = (
  rows: OperationImportRecurringConfirmRow[],
): OperationImportRecurringCollapsedConfirmRow[] => {
  const singles = rows.filter(
    (row): row is OperationImportRecurringConfirmRow =>
      (row.scheduleMode ?? "SINGLE") === "SINGLE",
  );
  const shiftRows = rows.filter((row) => row.scheduleMode === "MULTI_SHIFT");

  const grouped = new Map<string, OperationImportRecurringConfirmRow[]>();
  for (const row of shiftRows) {
    if (!row.shift) {
      throw new Error("MULTI_SHIFT confirm row missing shift seed");
    }
    const groupKey = buildRecurringMultiShiftGroupKey(row.serviceId, row.validFrom);
    const bucket = grouped.get(groupKey) ?? [];
    bucket.push(row);
    grouped.set(groupKey, bucket);
  }

  const collapsed: OperationImportRecurringCollapsedConfirmRow[] = [...singles];

  for (const [groupKey, members] of grouped) {
    const reference = members[0]!;

    const collapsedRow: OperationImportRecurringMultiShiftCollapsedRow = {
      operationKind: "RECURRING",
      scheduleMode: "MULTI_SHIFT",
      multiShiftGroupKey: groupKey,
      serviceId: reference.serviceId,
      validFrom: reference.validFrom,
      validUntil: reference.validUntil,
      scheduleSource: "COMPANY",
      earlyToleranceMinutes: reference.earlyToleranceMinutes,
      lateToleranceMinutes: reference.lateToleranceMinutes,
      earlyToleranceSource: reference.earlyToleranceSource,
      lateToleranceSource: reference.lateToleranceSource,
      shifts: members.map((row) => ({
        ...row.shift!,
        sortOrder: row.shift!.sortOrder ?? 0,
      })),
    };

    collapsed.push(collapsedRow);
  }

  return collapsed;
};

export const toRecurringMultiShiftCreateInput = (
  row: OperationImportRecurringMultiShiftCollapsedRow,
): CreateRecurringOperationInput => ({
  operationKind: "RECURRING",
  scheduleMode: "MULTI_SHIFT",
  serviceId: row.serviceId,
  validFrom: row.validFrom,
  validUntil: row.validUntil,
  scheduleSource: "COMPANY",
  earlyToleranceMinutes: null,
  lateToleranceMinutes: null,
  shifts: row.shifts.map((shift) => ({
    code: shift.code,
    name: shift.name,
    templateId: shift.templateId ?? null,
    sortOrder: shift.sortOrder,
    startTime: shift.startTime,
    endTime: shift.endTime,
    ...(shift.days ? { days: shift.days } : {}),
  })),
});

export const formatMultiShiftScheduleDisplay = (startTime: string, endTime: string): string => {
  const endLabel = isOvernightShift(startTime, endTime) ? `${endTime} (día siguiente)` : endTime;
  return `${startTime}–${endLabel}`;
};

export const recurringImportRowHasWeekdayValues = (headers: string[], row: string[]): boolean => {
  if (!hasAnyRecurringWeekdayColumn(headers)) {
    return false;
  }
  return buildRecurringImportShiftEnabledDays(headers, row).some((day) => day.isEnabled);
};

export const normalizeRecurringImportShiftCode = (rawCode: string, rawName: string): string =>
  normalizeShiftCode(rawCode.trim() || rawName.trim());
