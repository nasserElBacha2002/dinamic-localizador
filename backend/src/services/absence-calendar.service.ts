import sql from "mssql";
import {
  ABSENCE_CALCULATION_VERSION,
  ABSENCE_DAY_COUNTING_MODES,
  ABSENCE_MAX_RANGE_CALENDAR_DAYS,
  type AbsenceDayCountingMode,
} from "../constants/absence-calendar";
import { isValidOperationTimezone } from "../constants/company-settings";
import { WEEKDAY_NUMBERS, type WeekdayNumber } from "../constants/weekday";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import { absenceCalendarRepository } from "../repositories/absence-calendar.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeRepository } from "../repositories/employee.repository";
import type { AbsenceDayPeriod, AbsenceType } from "../types/absence";
import type {
  AbsenceCalculationFingerprint,
  CompanyWorkCalendar,
} from "../types/absence-calendar";
import { buildAbsenceCalculationInputHash } from "../utils/absence-calculation-hash";
import {
  calculateAbsenceDuration,
  type AbsenceDurationCalculation,
} from "../utils/absence-duration";
import {
  calculateTotalAbsenceDays,
  compareAbsenceDates,
  parseAbsenceDateInput,
} from "../utils/absence-date";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import { rollbackTransactionSafely } from "../utils/sql-transaction";
import { safeRollback } from "../utils/safe-transaction";
import { auditService } from "./audit.service";
import { absenceOperationImpactService } from "./absence-operation-impact.service";

const DEFAULT_WEEKDAYS: Array<{ dayOfWeek: WeekdayNumber; isWorkingDay: boolean }> =
  WEEKDAY_NUMBERS.map((dayOfWeek) => ({
    dayOfWeek,
    isWorkingDay: dayOfWeek >= 1 && dayOfWeek <= 5,
  }));

const parseCountingMode = (value: unknown): AbsenceDayCountingMode => {
  const mode = String(value ?? "CALENDAR_DAYS");
  if ((ABSENCE_DAY_COUNTING_MODES as readonly string[]).includes(mode)) {
    return mode as AbsenceDayCountingMode;
  }
  return "CALENDAR_DAYS";
};

const assertValidTimezone = (timezone: string) => {
  if (!isValidOperationTimezone(timezone)) {
    throw new AppError(400, "INVALID_TIMEZONE", "La zona horaria no es una zona IANA válida");
  }
};

/**
 * Explicit bootstrap for company create / admin repair. Not used by GET handlers.
 */
const bootstrapDefaultCalendarInTransaction = async (
  companyId: string,
  timezone: string,
  transaction: sql.Transaction,
  userId?: string | null,
): Promise<CompanyWorkCalendar> => {
  assertValidTimezone(timezone);
  const existing = await absenceCalendarRepository.findDefaultCalendar(companyId, transaction);
  if (existing) {
    return existing;
  }

  const created = await absenceCalendarRepository.createCalendar(
    companyId,
    {
      name: "Calendario laboral",
      timezone,
      isDefault: true,
      weekdays: DEFAULT_WEEKDAYS,
    },
    transaction,
  );
  await auditService.log(
    companyId,
    {
      entityType: "company_work_calendar",
      entityId: created.id,
      action: "CREATE",
      newData: created as unknown as Record<string, unknown>,
      userId: userId ?? null,
      reason: "Bootstrap calendario por defecto",
    },
    transaction,
  );
  return created;
};

const resolveCalendarForType = async (
  companyId: string,
  absenceType: AbsenceType,
): Promise<CompanyWorkCalendar> => {
  if (absenceType.calendarId) {
    const typed = await absenceCalendarRepository.findCalendarById(
      companyId,
      absenceType.calendarId,
    );
    if (!typed || !typed.isActive) {
      throw new AppError(409, "ABSENCE_CALENDAR_INACTIVE", "El calendario del tipo no está activo");
    }
    return typed;
  }
  const defaultCalendar = await absenceCalendarRepository.findDefaultCalendar(companyId);
  if (!defaultCalendar) {
    throw new AppError(
      409,
      "ABSENCE_CALENDAR_MISSING",
      "La empresa no tiene un calendario laboral por defecto. Creá uno desde configuración.",
    );
  }
  return defaultCalendar;
};

const isAdvancedCalendarEnabled = async (companyId: string): Promise<boolean> => {
  const settings = await companySettingsRepository.findByCompanyId(companyId);
  return Boolean(settings?.absenceAdvancedCalendarEnabled);
};

export const absenceCalendarService = {
  async listCalendars(companyId: string) {
    return absenceCalendarRepository.listCalendars(companyId);
  },

  async getDefaultCalendar(companyId: string) {
    const calendar = await absenceCalendarRepository.findDefaultCalendar(companyId);
    if (!calendar) {
      throw new AppError(
        404,
        "ABSENCE_CALENDAR_NOT_FOUND",
        "No hay un calendario laboral por defecto para esta empresa",
      );
    }
    return calendar;
  },

  async bootstrapDefaultCalendar(
    companyId: string,
    options?: { timezone?: string; userId?: string | null; transaction?: sql.Transaction },
  ): Promise<CompanyWorkCalendar> {
    const timezone =
      options?.timezone ?? (await absenceOperationImpactService.getOperationTimezone(companyId));
    assertValidTimezone(timezone);

    if (options?.transaction) {
      return bootstrapDefaultCalendarInTransaction(
        companyId,
        timezone,
        options.transaction,
        options.userId,
      );
    }

    const existing = await absenceCalendarRepository.findDefaultCalendar(companyId);
    if (existing) {
      return existing;
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const created = await bootstrapDefaultCalendarInTransaction(
        companyId,
        timezone,
        transaction,
        options?.userId,
      );
      await transaction.commit();
      return created;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      const raced = await absenceCalendarRepository.findDefaultCalendar(companyId);
      if (raced) {
        return raced;
      }
      throw error;
    }
  },

  async createCalendar(
    companyId: string,
    input: {
      name: string;
      timezone: string;
      isDefault?: boolean;
      weekdays?: Array<{ dayOfWeek: WeekdayNumber; isWorkingDay: boolean }>;
    },
    userId?: string | null,
  ) {
    assertValidTimezone(input.timezone);
    const weekdays = input.weekdays ?? DEFAULT_WEEKDAYS;
    if (weekdays.length !== 7) {
      throw new AppError(400, "INVALID_WEEKDAYS", "Debés definir los 7 días de la semana");
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const created = await absenceCalendarRepository.createCalendar(
        companyId,
        {
          name: input.name.trim(),
          timezone: input.timezone,
          isDefault: input.isDefault ?? false,
          weekdays,
        },
        transaction,
      );
      await auditService.log(
        companyId,
        {
          entityType: "company_work_calendar",
          entityId: created.id,
          action: "CREATE",
          newData: created as unknown as Record<string, unknown>,
          userId: userId ?? null,
        },
        transaction,
      );
      await transaction.commit();
      return created;
    } catch (error) {
      return rollbackTransactionSafely(
        transaction,
        { operation: "absence-calendar.create", companyId },
        error,
      );
    }
  },

  async updateCalendar(
    companyId: string,
    calendarId: string,
    input: {
      name?: string;
      timezone?: string;
      isDefault?: boolean;
      isActive?: boolean;
      weekdays?: Array<{ dayOfWeek: WeekdayNumber; isWorkingDay: boolean }>;
      expectedVersion: number;
    },
    userId?: string | null,
  ) {
    if (input.timezone !== undefined) {
      assertValidTimezone(input.timezone);
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const existing = await absenceCalendarRepository.findCalendarById(
        companyId,
        calendarId,
        transaction,
      );
      if (!existing) {
        throw new AppError(404, "ABSENCE_CALENDAR_NOT_FOUND", "Calendario no encontrado");
      }

      if (input.isActive === false) {
        const typeCount = await absenceCalendarRepository.countActiveTypesUsingCalendar(
          companyId,
          calendarId,
          transaction,
        );
        const requestCount = await absenceCalendarRepository.countRequestsUsingCalendar(
          companyId,
          calendarId,
          transaction,
        );

        if (typeCount > 0) {
          throw new AppError(
            409,
            "ABSENCE_CALENDAR_IN_USE",
            `No se puede desactivar: ${typeCount} tipo(s) de ausencia activos lo referencian`,
            { typeCount, requestCount },
          );
        }
        if (requestCount > 0) {
          throw new AppError(
            409,
            "ABSENCE_CALENDAR_IN_USE",
            `No se puede desactivar: ${requestCount} solicitud(es) históricas lo referencian`,
            { typeCount, requestCount },
          );
        }
        if (existing.isDefault) {
          const defaults =
            await absenceCalendarRepository.countActiveDefaultCalendars(companyId, transaction);
          if (defaults <= 1) {
            throw new AppError(
              409,
              "ABSENCE_CALENDAR_DEFAULT_REQUIRED",
              "La empresa no puede quedar sin un calendario por defecto activo. Asigná otro default antes de desactivar.",
            );
          }
        }
      }

      const updated = await absenceCalendarRepository.updateCalendar(
        companyId,
        calendarId,
        input,
        transaction,
      );
      if (!updated) {
        throw new AppError(
          409,
          "ABSENCE_CALENDAR_CONFLICT",
          "El calendario fue modificado por otro usuario. Recargá e intentá de nuevo.",
        );
      }
      await auditService.log(
        companyId,
        {
          entityType: "company_work_calendar",
          entityId: calendarId,
          action: "UPDATE",
          previousData: existing as unknown as Record<string, unknown>,
          newData: updated as unknown as Record<string, unknown>,
          userId: userId ?? null,
        },
        transaction,
      );
      await transaction.commit();
      return updated;
    } catch (error) {
      if (error instanceof AppError) {
        await safeRollback(transaction);
        throw error;
      }
      return rollbackTransactionSafely(
        transaction,
        { operation: "absence-calendar.update", companyId, entityId: calendarId },
        error,
      );
    }
  },

  async listDates(
    companyId: string,
    calendarId: string,
    options?: { year?: number; includeInactive?: boolean },
  ) {
    const calendar = await absenceCalendarRepository.findCalendarById(companyId, calendarId);
    if (!calendar) {
      throw new AppError(404, "ABSENCE_CALENDAR_NOT_FOUND", "Calendario no encontrado");
    }
    return absenceCalendarRepository.listDates(companyId, calendarId, options);
  },

  async createDate(
    companyId: string,
    input: {
      calendarId: string;
      date: string;
      name: string;
      dateType: import("../constants/absence-calendar").AbsenceCalendarDateType;
      isWorkingDay: boolean;
      notes?: string | null;
    },
    userId?: string | null,
  ) {
    const calendar = await absenceCalendarRepository.findCalendarById(companyId, input.calendarId);
    if (!calendar || !calendar.isActive) {
      throw new AppError(404, "ABSENCE_CALENDAR_NOT_FOUND", "Calendario no encontrado");
    }
    if (!parseAbsenceDateInput(input.date)) {
      throw new AppError(400, "INVALID_ABSENCE_DATE", "Formato de fecha inválido");
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const created = await absenceCalendarRepository.createDate(companyId, input, transaction);
      await auditService.log(
        companyId,
        {
          entityType: "company_calendar_date",
          entityId: created.id,
          action: "CREATE",
          newData: created as unknown as Record<string, unknown>,
          userId: userId ?? null,
        },
        transaction,
      );
      await transaction.commit();
      return created;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          409,
          "ABSENCE_CALENDAR_DATE_DUPLICATE",
          "Ya existe una fecha especial activa para ese día en este calendario",
        );
      }
      throw error;
    }
  },

  async updateDate(
    companyId: string,
    dateId: string,
    input: {
      name?: string;
      dateType?: import("../constants/absence-calendar").AbsenceCalendarDateType;
      isWorkingDay?: boolean;
      notes?: string | null;
      isActive?: boolean;
      expectedVersion: number;
    },
    userId?: string | null,
  ) {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await absenceCalendarRepository.updateDate(
        companyId,
        dateId,
        input,
        transaction,
      );
      if (!result) {
        throw new AppError(
          409,
          "ABSENCE_CALENDAR_DATE_CONFLICT",
          "La fecha especial fue modificada por otro usuario o no existe",
        );
      }
      await auditService.log(
        companyId,
        {
          entityType: "company_calendar_date",
          entityId: dateId,
          action: "UPDATE",
          previousData: result.previous as unknown as Record<string, unknown>,
          newData: result.updated as unknown as Record<string, unknown>,
          userId: userId ?? null,
        },
        transaction,
      );
      await transaction.commit();
      return result.updated;
    } catch (error) {
      if (error instanceof AppError) {
        try {
          await transaction.rollback();
        } catch {
          /* ignore */
        }
        throw error;
      }
      return rollbackTransactionSafely(
        transaction,
        { operation: "absence-calendar-date.update", companyId, entityId: dateId },
        error,
      );
    }
  },

  async calculateDuration(
    companyId: string,
    input: {
      absenceTypeId: string;
      startDate: string;
      endDate: string;
      startPeriod: AbsenceDayPeriod;
      endPeriod: AbsenceDayPeriod;
      employeeId?: string;
    },
  ): Promise<AbsenceDurationCalculation & { fingerprint: AbsenceCalculationFingerprint }> {
    const start = parseAbsenceDateInput(input.startDate);
    const end = parseAbsenceDateInput(input.endDate);
    if (!start || !end) {
      throw new AppError(400, "INVALID_ABSENCE_DATE", "Formato de fecha inválido");
    }
    if (compareAbsenceDates(start.iso, end.iso) > 0) {
      throw new AppError(
        400,
        "INVALID_ABSENCE_DATE_RANGE",
        "La fecha de inicio no puede ser posterior a la fecha de fin",
      );
    }

    const startUtc = Date.UTC(start.year, start.month - 1, start.day);
    const endUtc = Date.UTC(end.year, end.month - 1, end.day);
    const span = Math.round((endUtc - startUtc) / 86_400_000) + 1;
    if (span > ABSENCE_MAX_RANGE_CALENDAR_DAYS) {
      throw new AppError(
        400,
        "ABSENCE_RANGE_TOO_LONG",
        `El rango no puede superar ${ABSENCE_MAX_RANGE_CALENDAR_DAYS} días`,
      );
    }

    if (input.employeeId) {
      const employee = await employeeRepository.findById(companyId, input.employeeId);
      if (!employee || !employee.active) {
        throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
      }
    }

    const absenceType = await absenceTypeRepository.findById(companyId, input.absenceTypeId);
    if (!absenceType || !absenceType.isActive) {
      throw new AppError(404, "ABSENCE_TYPE_NOT_FOUND", "Tipo de ausencia no encontrado");
    }

    const startPeriod = absenceType.allowsHalfDay ? input.startPeriod : "FULL_DAY";
    const endPeriod = absenceType.allowsHalfDay ? input.endPeriod : "FULL_DAY";

    if (
      !absenceType.allowsHalfDay &&
      (input.startPeriod !== "FULL_DAY" || input.endPeriod !== "FULL_DAY")
    ) {
      throw new AppError(
        400,
        "ABSENCE_HALF_DAY_NOT_ALLOWED",
        "Este tipo de ausencia no permite medios días",
      );
    }

    const advanced = await isAdvancedCalendarEnabled(companyId);
    if (!advanced) {
      const totalDays = calculateTotalAbsenceDays({
        startDate: start.iso,
        endDate: end.iso,
        startPeriod,
        endPeriod,
      });
      const timezone = await absenceOperationImpactService.getOperationTimezone(companyId);
      const inputHash = buildAbsenceCalculationInputHash({
        absenceTypeId: absenceType.id,
        startDate: start.iso,
        endDate: end.iso,
        startPeriod,
        endPeriod,
        countingMode: "CALENDAR_DAYS",
        calendarId: "legacy",
        calendarVersion: 0,
        timezone,
      });
      const fingerprint: AbsenceCalculationFingerprint = {
        absenceTypeId: absenceType.id,
        startDate: start.iso,
        endDate: end.iso,
        startPeriod,
        endPeriod,
        calendarId: "legacy",
        calendarVersion: 0,
        countingMode: "CALENDAR_DAYS",
        timezone,
        totalDays,
        calculationVersion: 1,
        inputHash,
      };
      return {
        totalDays,
        countingMode: "CALENDAR_DAYS",
        calendarDays: span,
        workingDays: span,
        nonWorkingDays: 0,
        holidayDays: 0,
        partialDays: totalDays % 1 === 0.5 ? 0.5 : 0,
        timezone,
        calendarId: "legacy",
        calendarVersion: 0,
        calculationVersion: 1,
        calculationInputHash: inputHash,
        breakdown: [],
        excludedSummary: [],
        fingerprint,
      };
    }

    const countingMode = parseCountingMode(absenceType.dayCountingMode);
    const calendar = await resolveCalendarForType(companyId, absenceType);

    const exceptions = await absenceCalendarRepository.listDatesInRange(
      companyId,
      calendar.id,
      start.iso,
      end.iso,
    );

    const result = calculateAbsenceDuration({
      startDate: start.iso,
      endDate: end.iso,
      startPeriod,
      endPeriod,
      countingMode,
      timezone: calendar.timezone,
      calendarId: calendar.id,
      calendarVersion: calendar.version,
      calculationVersion: ABSENCE_CALCULATION_VERSION,
      weekdays: calendar.weekdays.map((day) => ({
        dayOfWeek: day.dayOfWeek,
        isWorkingDay: day.isWorkingDay,
      })),
      exceptions: exceptions.map((item) => ({
        date: item.date,
        name: item.name,
        dateType: item.dateType,
        isWorkingDay: item.isWorkingDay,
      })),
    });

    if (result.totalDays <= 0) {
      throw new AppError(
        400,
        "ABSENCE_ZERO_DAYS",
        countingMode === "BUSINESS_DAYS"
          ? "El rango no incluye días laborables según el calendario de la empresa"
          : "La duración calculada es cero",
      );
    }

    const inputHash = buildAbsenceCalculationInputHash({
      absenceTypeId: absenceType.id,
      startDate: start.iso,
      endDate: end.iso,
      startPeriod,
      endPeriod,
      countingMode,
      calendarId: calendar.id,
      calendarVersion: calendar.version,
      timezone: calendar.timezone,
    });

    const fingerprint: AbsenceCalculationFingerprint = {
      absenceTypeId: absenceType.id,
      startDate: start.iso,
      endDate: end.iso,
      startPeriod,
      endPeriod,
      calendarId: calendar.id,
      calendarVersion: calendar.version,
      countingMode,
      timezone: calendar.timezone,
      totalDays: result.totalDays,
      calculationVersion: ABSENCE_CALCULATION_VERSION,
      inputHash,
    };

    return {
      ...result,
      calculationInputHash: inputHash,
      fingerprint,
    };
  },

  async preview(
    companyId: string,
    input: {
      employeeId: string;
      absenceTypeId: string;
      startDate: string;
      endDate: string;
      startPeriod: AbsenceDayPeriod;
      endPeriod: AbsenceDayPeriod;
    },
  ) {
    const calculation = await this.calculateDuration(companyId, input);
    return {
      ...calculation,
      warnings:
        calculation.countingMode === "BUSINESS_DAYS" && calculation.excludedSummary.length
          ? [
              `Se excluyen ${calculation.nonWorkingDays} día(s) no laborables` +
                (calculation.holidayDays
                  ? ` (incluye ${calculation.holidayDays} feriado(s))`
                  : ""),
            ]
          : ([] as string[]),
    };
  },
};
