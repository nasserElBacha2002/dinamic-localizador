import sql from "mssql";
import {
  ABSENCE_CALCULATION_VERSION,
  ABSENCE_DAY_COUNTING_MODES,
  ABSENCE_MAX_RANGE_CALENDAR_DAYS,
  type AbsenceDayCountingMode,
} from "../constants/absence-calendar";
import { WEEKDAY_NUMBERS, type WeekdayNumber } from "../constants/weekday";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import { absenceCalendarRepository } from "../repositories/absence-calendar.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeRepository } from "../repositories/employee.repository";
import type { AbsenceDayPeriod, AbsenceType } from "../types/absence";
import type { CompanyWorkCalendar } from "../types/absence-calendar";
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

const ensureDefaultCalendar = async (companyId: string): Promise<CompanyWorkCalendar> => {
  const existing = await absenceCalendarRepository.findDefaultCalendar(companyId);
  if (existing) {
    return existing;
  }

  const timezone = await absenceOperationImpactService.getOperationTimezone(companyId);
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
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
};

const resolveCalendarForType = async (
  companyId: string,
  absenceType: AbsenceType & { dayCountingMode?: AbsenceDayCountingMode; calendarId?: string | null },
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
  return ensureDefaultCalendar(companyId);
};

const isAdvancedCalendarEnabled = async (companyId: string): Promise<boolean> => {
  const settings = await companySettingsRepository.findByCompanyId(companyId);
  if (!settings) {
    return true;
  }
  const flag = settings.absenceAdvancedCalendarEnabled;
  return flag !== false;
};

export const absenceCalendarService = {
  async listCalendars(companyId: string) {
    await ensureDefaultCalendar(companyId);
    return absenceCalendarRepository.listCalendars(companyId);
  },

  async getDefaultCalendar(companyId: string) {
    return ensureDefaultCalendar(companyId);
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
      expectedUpdatedAt: string;
    },
    userId?: string | null,
  ) {
    const existing = await absenceCalendarRepository.findCalendarById(companyId, calendarId);
    if (!existing) {
      throw new AppError(404, "ABSENCE_CALENDAR_NOT_FOUND", "Calendario no encontrado");
    }

    if (input.isActive === false) {
      const usage = await absenceCalendarRepository.countRequestsUsingCalendar(
        companyId,
        calendarId,
      );
      if (usage > 0 && existing.isDefault) {
        throw new AppError(
          409,
          "ABSENCE_CALENDAR_IN_USE",
          "No se puede desactivar el calendario por defecto mientras haya solicitudes que lo referencian. Asigná otro calendario por defecto primero.",
        );
      }
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
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
      return rollbackTransactionSafely(
        transaction,
        { operation: "absence-calendar", companyId },
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
        /* ignore rollback failure */
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
      expectedUpdatedAt: string;
    },
    userId?: string | null,
  ) {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const updated = await absenceCalendarRepository.updateDate(
        companyId,
        dateId,
        input,
        transaction,
      );
      if (!updated) {
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
          newData: updated as unknown as Record<string, unknown>,
          userId: userId ?? null,
        },
        transaction,
      );
      await transaction.commit();
      return updated;
    } catch (error) {
      return rollbackTransactionSafely(
        transaction,
        { operation: "absence-calendar", companyId },
        error,
      );
    }
  },

  /**
   * Domain duration calculation used by create/edit/preview/WhatsApp.
   */
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
  ): Promise<AbsenceDurationCalculation> {
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
        calculationVersion: 1,
        breakdown: [],
        excludedSummary: [],
      };
    }

    const typed = absenceType as AbsenceType & {
      dayCountingMode?: AbsenceDayCountingMode;
      calendarId?: string | null;
    };
    const countingMode = parseCountingMode(
      typed.dayCountingMode ?? (absenceType as { dayCountingMode?: string }).dayCountingMode,
    );
    const calendar = await resolveCalendarForType(companyId, typed);

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

    return result;
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
