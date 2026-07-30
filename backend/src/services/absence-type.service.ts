import sql from "mssql";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import { absenceCalendarRepository } from "../repositories/absence-calendar.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import type { UpdateAbsenceTypeInput } from "../schemas/absence-type.schema";
import { rollbackTransactionSafely } from "../utils/sql-transaction";
import { auditService } from "./audit.service";

export const absenceTypeService = {
  async list(companyId: string, activeOnly: boolean) {
    return absenceTypeRepository.listAll(companyId, activeOnly);
  },

  async update(
    companyId: string,
    typeId: string,
    input: UpdateAbsenceTypeInput,
    userId?: string | null,
  ) {
    if (
      input.dayCountingMode === undefined &&
      input.calendarId === undefined &&
      input.attachmentPolicy === undefined
    ) {
      throw new AppError(400, "ABSENCE_TYPE_NO_CHANGES", "No hay cambios para aplicar");
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const existing = await absenceTypeRepository.findById(companyId, typeId);
      if (!existing) {
        throw new AppError(404, "ABSENCE_TYPE_NOT_FOUND", "Tipo de ausencia no encontrado");
      }

      if (input.calendarId) {
        const calendar = await absenceCalendarRepository.findCalendarById(
          companyId,
          input.calendarId,
          transaction,
        );
        if (!calendar || !calendar.isActive) {
          throw new AppError(
            404,
            "ABSENCE_CALENDAR_NOT_FOUND",
            "Calendario no encontrado o inactivo",
          );
        }
      }

      const updated = await absenceTypeRepository.updateCalendarPolicy(
        companyId,
        typeId,
        {
          dayCountingMode: input.dayCountingMode,
          calendarId: input.calendarId,
          attachmentPolicy: input.attachmentPolicy,
        },
        transaction,
      );
      if (!updated) {
        throw new AppError(404, "ABSENCE_TYPE_NOT_FOUND", "Tipo de ausencia no encontrado");
      }

      await auditService.log(
        companyId,
        {
          entityType: "absence_type",
          entityId: typeId,
          action: "UPDATE_TYPE_POLICY",
          previousData: {
            dayCountingMode: existing.dayCountingMode,
            calendarId: existing.calendarId,
            attachmentPolicy: existing.attachmentPolicy,
          },
          newData: {
            dayCountingMode: updated.dayCountingMode,
            calendarId: updated.calendarId,
            attachmentPolicy: updated.attachmentPolicy,
          },
          userId: userId ?? null,
        },
        transaction,
      );
      await transaction.commit();
      return updated;
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
        { operation: "absence-type.update", companyId, entityId: typeId },
        error,
      );
    }
  },
};
