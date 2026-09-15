import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { companyShiftTemplateRepository } from "../repositories/company-shift-template.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationShiftExceptionRepository } from "../repositories/operation-shift-exception.repository";
import { operationShiftRepository } from "../repositories/operation-shift.repository";
import { operationShiftVersionRepository } from "../repositories/operation-shift-version.repository";
import type {
  CompanyShiftTemplate,
  CreateCompanyShiftTemplateInput,
  CreateOperationShiftWithInitialVersionInput,
  CreateOperationShiftVersionInput,
  OperationShift,
  OperationShiftWithVersions,
  UpdateCompanyShiftTemplateInput,
} from "../types/operation-shift";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { normalizeShiftCode } from "../utils/shift-code";
import {
  assertEffectiveRange,
  assertShiftTimesDistinct,
  normalizeShiftTime,
  ShiftTimeError,
} from "../utils/shift-time";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import {
  isDayEnabled,
  resolveShiftScheduleForDate,
  type ResolvedShiftScheduleForDate,
} from "../utils/operation-shift-version-resolver";
import {
  acquireTransactionAppLock,
  operationShiftExceptionLockResource,
} from "../utils/sql-app-lock";
import { reconcileShiftWorkdayInTransaction } from "./operation-shift-workday-reconcile.service";

const assertActiveCompany = async (companyId: string): Promise<void> => {
  const company = await companyRepository.findById(companyId);
  if (!company || company.status !== "ACTIVE") {
    throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
  }
};

const mapShiftTimeError = (error: unknown): never => {
  if (error instanceof ShiftTimeError) {
    throw new AppError(400, error.code, error.message);
  }
  throw error;
};

const parseShiftTimesOrThrow = (
  startRaw: string,
  endRaw: string,
): { startTime: string; endTime: string } => {
  try {
    const startTime = normalizeShiftTime(startRaw);
    const endTime = normalizeShiftTime(endRaw);
    assertShiftTimesDistinct(startTime, endTime);
    return { startTime, endTime };
  } catch (error) {
    return mapShiftTimeError(error);
  }
};

const parseEffectiveRangeOrThrow = (
  effectiveFrom: string,
  effectiveUntil: string | null,
): void => {
  try {
    assertEffectiveRange(effectiveFrom, effectiveUntil);
  } catch {
    throw new AppError(
      400,
      "INVALID_SHIFT_EFFECTIVE_RANGE",
      "El rango de vigencia del turno es inválido.",
    );
  }
};

const assertOperationExists = async (companyId: string, operationId: string) => {
  const operation = await operationRepository.findById(companyId, operationId);
  if (!operation) {
    throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada.");
  }
  return operation;
};

const assertTemplateBelongs = async (
  companyId: string,
  templateId: string | null | undefined,
): Promise<void> => {
  if (!templateId) {
    return;
  }
  const template = await companyShiftTemplateRepository.findById(companyId, templateId);
  if (!template) {
    throw new AppError(
      400,
      "SHIFT_TEMPLATE_NOT_FOUND",
      "La plantilla de turno no pertenece a esta empresa.",
    );
  }
};

const attachVersions = async (
  companyId: string,
  shifts: OperationShift[],
): Promise<OperationShiftWithVersions[]> => {
  const result: OperationShiftWithVersions[] = [];
  for (const shift of shifts) {
    const versions = await operationShiftVersionRepository.listByShiftId(companyId, shift.id);
    result.push({ ...shift, versions });
  }
  return result;
};

const createIdentityAndInitialVersion = async (
  companyId: string,
  input: CreateOperationShiftWithInitialVersionInput,
): Promise<OperationShiftWithVersions> => {
  await assertActiveCompany(companyId);
  await assertOperationExists(companyId, input.operationId);

  const { startTime, endTime } = parseShiftTimesOrThrow(input.startTime, input.endTime);
  const effectiveFrom = input.effectiveFrom;
  const effectiveUntil = input.effectiveUntil ?? null;
  parseEffectiveRangeOrThrow(effectiveFrom, effectiveUntil);

  const templateId: string | null = input.templateId ?? null;
  await assertTemplateBelongs(companyId, templateId);

  const code = normalizeShiftCode(input.code || input.name);
  const name = input.name.trim();
  if (!name) {
    throw new AppError(400, "SHIFT_NAME_REQUIRED", "El nombre del turno es obligatorio.");
  }

  const existingCode = await operationShiftRepository.findByCode(
    companyId,
    input.operationId,
    code,
  );
  if (existingCode) {
    throw new AppError(
      409,
      "OPERATION_SHIFT_CODE_EXISTS",
      "Ya existe un turno con ese código en la operación.",
    );
  }

  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const shift = await operationShiftRepository.createIdentityInTransaction(
      companyId,
      transaction,
      {
        operationId: input.operationId,
        templateId,
        code,
        name,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
    );

    const version = await operationShiftVersionRepository.createWithOverlapGuard(
      companyId,
      shift.id,
      {
        effectiveFrom,
        effectiveUntil,
        startTime,
        endTime,
        days: input.days,
      },
      transaction,
    );

    await transaction.commit();
    return { ...shift, versions: [version] };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // Transaction may already be aborted.
    }
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        409,
        "OPERATION_SHIFT_CODE_EXISTS",
        "Ya existe un turno con ese código en la operación.",
      );
    }
    throw error;
  }
};

export type ApplicableShiftConfigForDate = {
  shift: OperationShift;
  version: NonNullable<Awaited<ReturnType<typeof operationShiftVersionRepository.findEffectiveForDate>>>;
  dayEnabled: boolean;
  schedule: ResolvedShiftScheduleForDate;
  exception: Awaited<ReturnType<typeof operationShiftExceptionRepository.findByShiftAndDate>>;
};

/**
 * Phase 2 multi-shift core service (templates + stable identity + versions).
 * Does not flip schedule_mode by itself — use operationScheduleModeTransitionService.
 */
export const operationShiftService = {
  async listTemplates(companyId: string, activeOnly = false): Promise<CompanyShiftTemplate[]> {
    await assertActiveCompany(companyId);
    return companyShiftTemplateRepository.listByCompanyId(companyId, activeOnly);
  },

  async createTemplate(
    companyId: string,
    input: CreateCompanyShiftTemplateInput,
  ): Promise<CompanyShiftTemplate> {
    await assertActiveCompany(companyId);

    const { startTime, endTime } = parseShiftTimesOrThrow(input.startTime, input.endTime);

    const code = normalizeShiftCode(input.code || input.name);
    const name = input.name.trim();
    if (!name) {
      throw new AppError(400, "SHIFT_NAME_REQUIRED", "El nombre del turno es obligatorio.");
    }

    const existing = await companyShiftTemplateRepository.findByCode(companyId, code);
    if (existing) {
      throw new AppError(
        409,
        "SHIFT_TEMPLATE_CODE_EXISTS",
        "Ya existe una plantilla de turno con ese código en la empresa.",
      );
    }

    const existingList = await companyShiftTemplateRepository.listByCompanyId(companyId, false);
    const maxSort = existingList.reduce((max, row) => Math.max(max, row.sortOrder), 0);

    try {
      return await companyShiftTemplateRepository.create(companyId, {
        code,
        name,
        startTime,
        endTime,
        sortOrder: input.sortOrder ?? maxSort + 1,
        isActive: input.isActive ?? true,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          409,
          "SHIFT_TEMPLATE_CODE_EXISTS",
          "Ya existe una plantilla de turno con ese código en la empresa.",
        );
      }
      throw error;
    }
  },

  /**
   * Updates template catalog only. Does not rematerialize or mutate operation shifts.
   */
  async updateTemplate(
    companyId: string,
    templateId: string,
    input: UpdateCompanyShiftTemplateInput,
  ): Promise<CompanyShiftTemplate> {
    await assertActiveCompany(companyId);

    let startTime: string | undefined;
    let endTime: string | undefined;
    if (input.startTime !== undefined || input.endTime !== undefined) {
      const existing = await companyShiftTemplateRepository.findById(companyId, templateId);
      if (!existing) {
        throw new AppError(404, "SHIFT_TEMPLATE_NOT_FOUND", "Plantilla de turno no encontrada.");
      }
      const parsed = parseShiftTimesOrThrow(
        input.startTime ?? existing.startTime,
        input.endTime ?? existing.endTime,
      );
      startTime = parsed.startTime;
      endTime = parsed.endTime;
    }

    if (input.name !== undefined && !input.name.trim()) {
      throw new AppError(400, "SHIFT_NAME_REQUIRED", "El nombre del turno es obligatorio.");
    }

    const updated = await companyShiftTemplateRepository.update(companyId, templateId, {
      name: input.name?.trim(),
      startTime,
      endTime,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    });
    if (!updated) {
      throw new AppError(404, "SHIFT_TEMPLATE_NOT_FOUND", "Plantilla de turno no encontrada.");
    }
    return updated;
  },

  async reactivateTemplate(companyId: string, templateId: string): Promise<CompanyShiftTemplate> {
    return this.updateTemplate(companyId, templateId, { isActive: true });
  },

  async deactivateTemplate(companyId: string, templateId: string): Promise<CompanyShiftTemplate> {
    await assertActiveCompany(companyId);
    const updated = await companyShiftTemplateRepository.deactivate(companyId, templateId);
    if (!updated) {
      throw new AppError(404, "SHIFT_TEMPLATE_NOT_FOUND", "Plantilla de turno no encontrada.");
    }
    return updated;
  },

  async listOperationShifts(
    companyId: string,
    operationId: string,
    activeOnly = false,
  ): Promise<OperationShiftWithVersions[]> {
    await assertActiveCompany(companyId);
    await assertOperationExists(companyId, operationId);
    const shifts = await operationShiftRepository.listByOperationId(
      companyId,
      operationId,
      activeOnly,
    );
    return attachVersions(companyId, shifts);
  },

  async createCustomShift(
    companyId: string,
    input: CreateOperationShiftWithInitialVersionInput,
  ): Promise<OperationShiftWithVersions> {
    return createIdentityAndInitialVersion(companyId, input);
  },

  /**
   * Phase 1 name kept for tests/callers: identity + initial version (does not flip schedule_mode).
   */
  async createOperationShift(
    companyId: string,
    input: CreateOperationShiftWithInitialVersionInput,
  ): Promise<OperationShiftWithVersions> {
    return this.createCustomShift(companyId, input);
  },

  async createShiftFromTemplate(
    companyId: string,
    input: {
      operationId: string;
      templateId: string;
      effectiveFrom: string;
      effectiveUntil?: string | null;
      code?: string;
      name?: string;
      sortOrder?: number;
      days?: CreateOperationShiftVersionInput["days"];
    },
  ): Promise<OperationShiftWithVersions> {
    await assertActiveCompany(companyId);
    const template = await companyShiftTemplateRepository.findById(companyId, input.templateId);
    if (!template || !template.isActive) {
      throw new AppError(404, "SHIFT_TEMPLATE_NOT_FOUND", "Plantilla de turno no encontrada.");
    }

    return createIdentityAndInitialVersion(companyId, {
      operationId: input.operationId,
      templateId: template.id,
      code: input.code ?? template.code,
      name: input.name ?? template.name,
      sortOrder: input.sortOrder ?? template.sortOrder,
      startTime: template.startTime,
      endTime: template.endTime,
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil ?? null,
      days: input.days,
      isActive: true,
    });
  },

  async addVersion(
    companyId: string,
    operationShiftId: string,
    input: CreateOperationShiftVersionInput,
  ) {
    await assertActiveCompany(companyId);
    const shift = await operationShiftRepository.findById(companyId, operationShiftId);
    if (!shift) {
      throw new AppError(404, "OPERATION_SHIFT_NOT_FOUND", "Turno de operación no encontrado.");
    }

    const { startTime, endTime } = parseShiftTimesOrThrow(input.startTime, input.endTime);
    const effectiveUntil = input.effectiveUntil ?? null;
    parseEffectiveRangeOrThrow(input.effectiveFrom, effectiveUntil);

    return operationShiftVersionRepository.createWithOverlapGuard(companyId, operationShiftId, {
      effectiveFrom: input.effectiveFrom,
      effectiveUntil,
      startTime,
      endTime,
      days: input.days,
    });
  },

  async updateShiftIdentity(
    companyId: string,
    operationShiftId: string,
    input: { name?: string; sortOrder?: number },
  ): Promise<OperationShift> {
    await assertActiveCompany(companyId);
    if (input.name !== undefined && !input.name.trim()) {
      throw new AppError(400, "SHIFT_NAME_REQUIRED", "El nombre del turno es obligatorio.");
    }
    const updated = await operationShiftRepository.updateIdentity(companyId, operationShiftId, {
      name: input.name?.trim(),
      sortOrder: input.sortOrder,
    });
    if (!updated) {
      throw new AppError(404, "OPERATION_SHIFT_NOT_FOUND", "Turno de operación no encontrado.");
    }
    return updated;
  },

  async deactivateShift(companyId: string, operationShiftId: string): Promise<OperationShift> {
    await assertActiveCompany(companyId);
    const updated = await operationShiftRepository.deactivate(companyId, operationShiftId);
    if (!updated) {
      throw new AppError(404, "OPERATION_SHIFT_NOT_FOUND", "Turno de operación no encontrado.");
    }
    return updated;
  },

  async getApplicableConfigForDate(
    companyId: string,
    operationShiftId: string,
    workDate: string,
  ): Promise<ApplicableShiftConfigForDate | null> {
    await assertActiveCompany(companyId);
    const shift = await operationShiftRepository.findById(companyId, operationShiftId);
    if (!shift || !shift.isActive) {
      return null;
    }

    const version = await operationShiftVersionRepository.findEffectiveForDate(
      companyId,
      operationShiftId,
      workDate,
    );
    if (!version) {
      return null;
    }

    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);
    const exception = await operationShiftExceptionRepository.findByShiftAndDate(
      companyId,
      operationShiftId,
      workDate,
    );
    const dayEnabled = isDayEnabled(version, workDate, timezone);
    const schedule = resolveShiftScheduleForDate({
      version,
      exception,
      workDate,
      timezone,
    });

    return { shift, version, dayEnabled, schedule, exception };
  },

  async upsertDateException(
    companyId: string,
    input: {
      operationId: string;
      operationShiftId: string;
      workDate: string;
      exceptionKind: "CANCEL" | "TIME_OVERRIDE" | "RESTORE";
      startTime?: string | null;
      endTime?: string | null;
      reason?: string | null;
      createdByUserId?: string | null;
    },
  ) {
    await assertActiveCompany(companyId);
    const operation = await assertOperationExists(companyId, input.operationId);
    if (operation.scheduleMode !== "MULTI_SHIFT") {
      throw new AppError(
        409,
        "NOT_MULTI_SHIFT",
        "Las excepciones de turno solo aplican a operaciones multi-turno.",
      );
    }
    const shift = await operationShiftRepository.findByIdForOperation(
      companyId,
      input.operationId,
      input.operationShiftId,
    );
    if (!shift) {
      throw new AppError(404, "OPERATION_SHIFT_NOT_FOUND", "Turno de operación no encontrado.");
    }

    if (input.exceptionKind === "TIME_OVERRIDE") {
      parseShiftTimesOrThrow(input.startTime ?? "", input.endTime ?? "");
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
      await acquireTransactionAppLock(transaction, {
        resource: operationShiftExceptionLockResource(
          companyId,
          input.operationId,
          input.operationShiftId,
          input.workDate,
        ),
      });

      const exception = await operationShiftExceptionRepository.upsertInTransaction(
        companyId,
        transaction,
        {
          operationId: input.operationId,
          operationShiftId: input.operationShiftId,
          workDate: input.workDate,
          exceptionKind: input.exceptionKind,
          startTime: input.startTime,
          endTime: input.endTime,
          reason: input.reason,
          createdByUserId: input.createdByUserId,
        },
      );

      const workday = await reconcileShiftWorkdayInTransaction(companyId, transaction, {
        operationId: input.operationId,
        operationShiftId: input.operationShiftId,
        workDate: input.workDate,
        operation,
        shift,
        exception,
      });

      await transaction.commit();
      return { exception, workday };
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // already aborted
      }
      throw error;
    }
  },
};

/** @deprecated Use operationShiftService — kept for Phase 1 import compatibility. */
export const operationShiftFoundationService = operationShiftService;
