import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import {
  payrollReceiptQueryDeliveryRepository,
  type PayrollReceiptQueryDelivery,
  type PayrollReceiptQueryReconciliationResolution,
} from "../repositories/payroll-receipt-query-delivery.repository";
import { auditService } from "./audit.service";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

export type ReconcilePayrollQueryDeliveryInput = {
  companyId: string;
  deliveryId: string;
  commandId: string;
  expectedProcessingVersion: number;
  resolution: PayrollReceiptQueryReconciliationResolution;
  reason: string;
  providerMessageSid: string | null;
  userId: string;
};

const matchesCommand = (
  row: PayrollReceiptQueryDelivery,
  input: ReconcilePayrollQueryDeliveryInput,
): boolean =>
  row.companyId === input.companyId &&
  row.id === input.deliveryId &&
  row.reconciliationResolution === input.resolution &&
  row.reconciliationReason === input.reason &&
  row.providerMessageSid === input.providerMessageSid;

export const payrollQueryReconciliationService = {
  async list(companyId: string): Promise<{
    items: PayrollReceiptQueryDelivery[];
    count: number;
    oldestUnresolvedAt: string | null;
  }> {
    const items =
      await payrollReceiptQueryDeliveryRepository.listReconciliationRequired(companyId);
    return {
      items,
      count: items.length,
      oldestUnresolvedAt: items[0]?.reconciliationRequiredAt ?? null,
    };
  },

  async reconcile(
    input: ReconcilePayrollQueryDeliveryInput,
  ): Promise<PayrollReceiptQueryDelivery> {
    if (input.resolution === "CONFIRMED_ACCEPTED" && !input.providerMessageSid) {
      throw new AppError(
        400,
        "PROVIDER_MESSAGE_SID_REQUIRED",
        "providerMessageSid es obligatorio para confirmar el envío.",
      );
    }
    if (input.resolution === "CONFIRMED_NOT_SENT" && input.providerMessageSid) {
      throw new AppError(
        400,
        "PROVIDER_MESSAGE_SID_NOT_ALLOWED",
        "providerMessageSid no corresponde cuando se confirma que no hubo envío.",
      );
    }

    const transaction = new sql.Transaction(getPool());
    await transaction.begin();
    try {
      const current =
        await payrollReceiptQueryDeliveryRepository.findForReconciliation(
          input.companyId,
          input.deliveryId,
          transaction,
        );
      if (!current) {
        throw new AppError(404, "PAYROLL_QUERY_DELIVERY_NOT_FOUND", "Entrega no encontrada.");
      }
      if (current.reconciliationCommandId === input.commandId) {
        if (!matchesCommand(current, input)) {
          throw new AppError(
            409,
            "RECONCILIATION_COMMAND_CONFLICT",
            "El commandId ya fue usado con otros datos.",
          );
        }
        await transaction.commit();
        return current;
      }
      if (
        current.status !== "RECONCILIATION_REQUIRED" ||
        current.processingVersion !== input.expectedProcessingVersion
      ) {
        throw new AppError(
          409,
          "RECONCILIATION_VERSION_CONFLICT",
          "La entrega ya cambió; actualizá el estado antes de resolverla.",
        );
      }

      const updated = await payrollReceiptQueryDeliveryRepository.applyReconciliation(
        { ...input, reconciledByUserId: input.userId },
        transaction,
      );
      if (!updated) {
        throw new AppError(
          409,
          "RECONCILIATION_VERSION_CONFLICT",
          "La entrega ya fue resuelta por otro proceso.",
        );
      }
      await auditService.log(
        input.companyId,
        {
          entityType: "PAYROLL_QUERY_DELIVERY",
          entityId: input.deliveryId,
          action: "PAYROLL_QUERY_DELIVERY_RECONCILED",
          previousData: {
            status: current.status,
            processingVersion: current.processingVersion,
            lastErrorCode: current.lastErrorCode,
          },
          newData: {
            status: updated.status,
            processingVersion: updated.processingVersion,
            commandId: input.commandId,
            resolution: input.resolution,
            providerMessageSid: input.providerMessageSid,
          },
          reason: input.reason,
          userId: input.userId,
        },
        transaction,
      );
      await transaction.commit();
      console.info("[payroll-query-reconciliation] resolved", {
        companyId: input.companyId,
        deliveryId: input.deliveryId,
        resolution: input.resolution,
      });
      return updated;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // Preserve the original failure.
      }
      if (isDuplicateKeyError(error)) {
        const existing =
          await payrollReceiptQueryDeliveryRepository.findByReconciliationCommandId(
            input.commandId,
          );
        if (existing && matchesCommand(existing, input)) {
          return existing;
        }
        throw new AppError(
          409,
          "RECONCILIATION_COMMAND_CONFLICT",
          "El commandId ya fue usado con otros datos.",
        );
      }
      throw error;
    }
  },
};
