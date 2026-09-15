import { AppError } from "../errors/app-error";
import { companyShiftTemplateRepository } from "../repositories/company-shift-template.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationShiftRepository } from "../repositories/operation-shift.repository";
import { companyRepository } from "../repositories/company.repository";
import type {
  CreateCompanyShiftTemplateInput,
  CreateOperationShiftInput,
  CompanyShiftTemplate,
  OperationShift,
} from "../types/operation-shift";
import { normalizeShiftCode } from "../utils/shift-code";
import {
  assertEffectiveRange,
  assertShiftTimesDistinct,
  normalizeShiftTime,
  ShiftTimeError,
} from "../utils/shift-time";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

/**
 * Internal Phase 1 catalog helpers (no HTTP routes).
 * Productive MULTI_SHIFT materialization / assignment wiring belongs to Phase 2.
 */
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

export const operationShiftFoundationService = {
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
  ): Promise<OperationShift[]> {
    await assertActiveCompany(companyId);
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada.");
    }
    return operationShiftRepository.listByOperationId(companyId, operationId, activeOnly);
  },

  /**
   * Creates an operation_shift row for foundation/tests.
   * Does NOT flip schedule_mode to MULTI_SHIFT (Phase 2).
   * Overlap for the same active code is enforced under SERIALIZABLE + applock.
   */
  async createOperationShift(
    companyId: string,
    input: CreateOperationShiftInput,
  ): Promise<OperationShift> {
    await assertActiveCompany(companyId);
    const operation = await operationRepository.findById(companyId, input.operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada.");
    }

    const { startTime, endTime } = parseShiftTimesOrThrow(input.startTime, input.endTime);

    const effectiveFrom = input.effectiveFrom;
    const effectiveUntil = input.effectiveUntil ?? null;
    try {
      assertEffectiveRange(effectiveFrom, effectiveUntil);
    } catch {
      throw new AppError(
        400,
        "INVALID_SHIFT_EFFECTIVE_RANGE",
        "El rango de vigencia del turno es inválido.",
      );
    }

    const templateId: string | null = input.templateId ?? null;
    if (templateId) {
      const template = await companyShiftTemplateRepository.findById(companyId, templateId);
      if (!template) {
        throw new AppError(
          400,
          "SHIFT_TEMPLATE_NOT_FOUND",
          "La plantilla de turno no pertenece a esta empresa.",
        );
      }
    }

    const code = normalizeShiftCode(input.code || input.name);
    const name = input.name.trim();
    if (!name) {
      throw new AppError(400, "SHIFT_NAME_REQUIRED", "El nombre del turno es obligatorio.");
    }

    return operationShiftRepository.createWithOverlapGuard(companyId, {
      operationId: input.operationId,
      templateId,
      code,
      name,
      startTime,
      endTime,
      effectiveFrom,
      effectiveUntil,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    });
  },
};
