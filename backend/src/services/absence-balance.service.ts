import { AppError } from "../errors/app-error";
import sql from "mssql";
import { buildAbsenceBalanceIdempotencyKey } from "../constants/absence-balance-ledger";
import { getPool } from "../database/connection";
import { absenceBalanceRepository } from "../repositories/absence-balance.repository";
import { absenceBalanceLedgerRepository } from "../repositories/absence-balance-ledger.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { employeeRepository } from "../repositories/employee.repository";
import type {
  AdjustEmployeeAbsenceBalanceInput,
  ReverseAbsenceBalanceMovementInput,
  UpsertEmployeeAbsenceBalanceInput,
} from "../schemas/absence-balance.schema";
import type {
  AbsenceBalanceImpact,
  AbsenceBalanceSummary,
  AbsenceRequest,
  AbsenceType,
} from "../types/absence";
import { auditService } from "./audit.service";
import { absenceBalanceLedgerService } from "./absence-balance-ledger.service";
import {
  computeAvailableAfterApproval,
  computeBalanceCounters,
  getAbsenceRequestYear,
  hasSufficientBalanceForApproval,
} from "../utils/absence-balance.utils";
import { resolveYearAllocations } from "../utils/absence-year-allocations";
import { rollbackTransactionSafely } from "../utils/sql-transaction";

const sumDaysForStatuses = (
  aggregates: Array<{ absenceTypeId: string; status: string; totalDays: number }>,
  absenceTypeId: string,
  statuses: string[],
): number =>
  aggregates
    .filter((row) => row.absenceTypeId === absenceTypeId && statuses.includes(row.status))
    .reduce((sum, row) => sum + row.totalDays, 0);

const buildSummaryForType = (input: {
  absenceType: AbsenceType;
  year: number;
  assignedDays: number;
  notes: string | null;
  aggregates: Array<{ absenceTypeId: string; status: string; totalDays: number }>;
}): AbsenceBalanceSummary => {
  const approvedDays = sumDaysForStatuses(input.aggregates, input.absenceType.id, ["APPROVED"]);
  const pendingDays = sumDaysForStatuses(input.aggregates, input.absenceType.id, [
    "PENDING",
    "NEEDS_INFO",
  ]);
  const rejectedDays = sumDaysForStatuses(input.aggregates, input.absenceType.id, ["REJECTED"]);
  const cancelledDays = sumDaysForStatuses(input.aggregates, input.absenceType.id, ["CANCELLED"]);
  const counters = computeBalanceCounters({
    assignedDays: input.assignedDays,
    approvedDays,
    pendingDays,
  });

  return {
    absenceType: {
      id: input.absenceType.id,
      code: input.absenceType.code,
      name: input.absenceType.name,
      deductsBalance: input.absenceType.deductsBalance,
    },
    year: input.year,
    assignedDays: input.assignedDays,
    approvedDays,
    pendingDays,
    rejectedDays,
    cancelledDays,
    grantedDays: input.assignedDays,
    reservedDays: pendingDays,
    consumedDays: approvedDays,
    availableDays: counters.availableDays,
    projectedAvailableDays: counters.projectedAvailableDays,
    notes: input.notes,
  };
};

const buildLedgerSummaryForType = (input: {
  absenceType: AbsenceType;
  year: number;
  grantedDays: number;
  reservedDays: number;
  consumedDays: number;
  availableDays: number;
  notes: string | null;
  version?: number;
}): AbsenceBalanceSummary => ({
  absenceType: {
    id: input.absenceType.id,
    code: input.absenceType.code,
    name: input.absenceType.name,
    deductsBalance: input.absenceType.deductsBalance,
  },
  year: input.year,
  assignedDays: input.grantedDays,
  approvedDays: input.consumedDays,
  pendingDays: input.reservedDays,
  rejectedDays: 0,
  cancelledDays: 0,
  grantedDays: input.grantedDays,
  reservedDays: input.reservedDays,
  consumedDays: input.consumedDays,
  availableDays: input.availableDays,
  projectedAvailableDays: input.availableDays,
  notes: input.notes,
  version: input.version,
});

export const allocationsForRequest = (
  request: Pick<AbsenceRequest, "startDate" | "endDate" | "totalDays"> & {
    yearAllocationsJson?: string | null;
  },
) =>
  resolveYearAllocations({
    persistedJson: request.yearAllocationsJson ?? null,
    startDate: request.startDate,
    endDate: request.endDate,
    totalDays: request.totalDays,
  }).allocations;

export const absenceBalanceService = {
  async listEmployeeBalances(
    companyId: string,
    employeeId: string,
    year: number,
  ): Promise<AbsenceBalanceSummary[]> {
    const employee = await employeeRepository.findById(companyId, employeeId);
    if (!employee) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }

    const ledgerEnabled = await absenceBalanceLedgerService.isLedgerEnabled(companyId);
    const absenceTypes = await absenceTypeRepository.listAll(companyId, true);
    const balanceRows = await absenceBalanceRepository.listByEmployeeYear(
      companyId,
      employeeId,
      year,
    );

    if (ledgerEnabled) {
      const byType = new Map(balanceRows.map((row) => [row.absenceTypeId, row]));
      return absenceTypes.map((absenceType) => {
        const row = byType.get(absenceType.id);
        return buildLedgerSummaryForType({
          absenceType,
          year,
          grantedDays: row?.grantedDays ?? row?.totalDays ?? 0,
          reservedDays: row?.reservedDays ?? 0,
          consumedDays: row?.consumedDays ?? 0,
          availableDays: row?.availableDays ?? row?.grantedDays ?? row?.totalDays ?? 0,
          notes: row?.notes ?? null,
          version: row?.version,
        });
      });
    }

    const aggregates = await absenceBalanceRepository.aggregateRequestDaysByEmployeeYear(
      companyId,
      employeeId,
      year,
    );
    const assignedByType = new Map(balanceRows.map((row) => [row.absenceTypeId, row.totalDays]));
    const notesByType = new Map(balanceRows.map((row) => [row.absenceTypeId, row.notes]));

    return absenceTypes.map((absenceType) =>
      buildSummaryForType({
        absenceType,
        year,
        assignedDays: assignedByType.get(absenceType.id) ?? 0,
        notes: notesByType.get(absenceType.id) ?? null,
        aggregates,
      }),
    );
  },

  async getSummaryForRequest(
    companyId: string,
    request: Pick<
      AbsenceRequest,
      "employeeId" | "absenceTypeId" | "startDate" | "endDate" | "totalDays" | "status"
    >,
    absenceType: Pick<AbsenceType, "id" | "code" | "name" | "deductsBalance">,
  ): Promise<AbsenceBalanceImpact> {
    const year = getAbsenceRequestYear(request.startDate);

    if (!absenceType.deductsBalance) {
      return {
        deductsBalance: false,
        year,
        requestDays: request.totalDays,
        message: "Este tipo de ausencia no descuenta saldo.",
      };
    }

    const ledgerEnabled = await absenceBalanceLedgerService.isLedgerEnabled(companyId);
    if (ledgerEnabled) {
      const balanceRow = await absenceBalanceRepository.findByEmployeeTypeYear(
        companyId,
        request.employeeId,
        absenceType.id,
        year,
      );
      const grantedDays = balanceRow?.grantedDays ?? balanceRow?.totalDays ?? 0;
      const reservedDays = balanceRow?.reservedDays ?? 0;
      const consumedDays = balanceRow?.consumedDays ?? 0;
      const availableDays = balanceRow?.availableDays ?? grantedDays - reservedDays - consumedDays;
      const availableAfterApproval =
        request.status === "APPROVED"
          ? availableDays
          : availableDays -
            (request.status === "PENDING" || request.status === "NEEDS_INFO"
              ? 0
              : request.totalDays);

      return {
        deductsBalance: true,
        year,
        assignedDays: grantedDays,
        approvedDays: consumedDays,
        pendingDays: reservedDays,
        requestDays: request.totalDays,
        availableDays,
        availableAfterApproval,
        hasSufficientBalance:
          request.status === "PENDING" || request.status === "NEEDS_INFO"
            ? availableDays >= 0
            : availableDays >= request.totalDays,
      };
    }

    const [balanceRow, aggregates] = await Promise.all([
      absenceBalanceRepository.findByEmployeeTypeYear(
        companyId,
        request.employeeId,
        absenceType.id,
        year,
      ),
      absenceBalanceRepository.aggregateRequestDaysByEmployeeYear(
        companyId,
        request.employeeId,
        year,
      ),
    ]);

    const assignedDays = balanceRow?.totalDays ?? 0;
    const approvedDays = sumDaysForStatuses(aggregates, absenceType.id, ["APPROVED"]);
    const pendingDays = sumDaysForStatuses(aggregates, absenceType.id, ["PENDING", "NEEDS_INFO"]);
    const counters = computeBalanceCounters({ assignedDays, approvedDays, pendingDays });
    const availableAfterApproval = computeAvailableAfterApproval({
      assignedDays,
      approvedDays,
      requestDays: request.totalDays,
      requestStatus: request.status,
    });

    return {
      deductsBalance: true,
      year,
      assignedDays,
      approvedDays,
      pendingDays,
      requestDays: request.totalDays,
      availableDays: counters.availableDays,
      availableAfterApproval,
      hasSufficientBalance: hasSufficientBalanceForApproval({
        assignedDays,
        approvedDays,
        requestDays: request.totalDays,
      }),
    };
  },

  async ensureSufficientBalanceForApproval(
    companyId: string,
    request: Pick<
      AbsenceRequest,
      "id" | "employeeId" | "absenceTypeId" | "startDate" | "endDate" | "totalDays" | "status"
    >,
    transaction: sql.Transaction,
    options?: { mode?: "from-reserve" | "direct" },
  ): Promise<void> {
    const absenceType = await absenceTypeRepository.findById(companyId, request.absenceTypeId);
    if (!absenceType || !absenceType.deductsBalance) {
      return;
    }

    const ledgerEnabled = await absenceBalanceLedgerService.isLedgerEnabled(companyId);
    if (ledgerEnabled) {
      const mode =
        options?.mode ??
        (request.status === "PENDING" || request.status === "NEEDS_INFO"
          ? "from-reserve"
          : "direct");
      if (mode === "from-reserve") {
        return;
      }
      const allocations = allocationsForRequest(request);
      const { absenceBalanceLedgerRepository } = await import(
        "../repositories/absence-balance-ledger.repository"
      );
      for (const allocation of allocations) {
        const balance = await absenceBalanceLedgerRepository.lockBalanceForUpdate(
          companyId,
          request.employeeId,
          request.absenceTypeId,
          allocation.year,
          transaction,
        );
        const available = balance?.availableDays ?? 0;
        if (available < allocation.quantity) {
          throw new AppError(
            409,
            "INSUFFICIENT_ABSENCE_BALANCE",
            "El empleado no tiene saldo suficiente para aprobar esta ausencia",
          );
        }
      }
      return;
    }

    const year = getAbsenceRequestYear(request.startDate);
    const { assignedDays, approvedDays } =
      await absenceBalanceRepository.lockAndGetApprovalBalanceSnapshot(
        companyId,
        request.employeeId,
        request.absenceTypeId,
        year,
        transaction,
      );

    if (
      !hasSufficientBalanceForApproval({
        assignedDays,
        approvedDays,
        requestDays: request.totalDays,
      })
    ) {
      throw new AppError(
        409,
        "INSUFFICIENT_ABSENCE_BALANCE",
        "El empleado no tiene saldo suficiente para aprobar esta ausencia",
      );
    }
  },

  async upsertEmployeeBalance(
    companyId: string,
    employeeId: string,
    absenceTypeId: string,
    input: UpsertEmployeeAbsenceBalanceInput,
    userId: string,
  ) {
    const employee = await employeeRepository.findById(companyId, employeeId);
    if (!employee) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }

    const absenceType = await absenceTypeRepository.findById(companyId, absenceTypeId);
    if (!absenceType) {
      throw new AppError(404, "ABSENCE_TYPE_NOT_FOUND", "Tipo de ausencia no encontrado");
    }

    const ledgerEnabled = await absenceBalanceLedgerService.isLedgerEnabled(companyId);
    if (ledgerEnabled) {
      const pool = getPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const current = await absenceBalanceLedgerRepository.ensureBalanceRow(
          companyId,
          employeeId,
          absenceTypeId,
          input.year,
          transaction,
        );
        if (current.version !== input.expectedVersion) {
          throw new AppError(
            409,
            "ABSENCE_BALANCE_VERSION_CONFLICT",
            "El saldo fue modificado por otro proceso. Recargá e intentá de nuevo.",
          );
        }
        const delta = Number((input.totalDays - current.grantedDays).toFixed(1));
        if (delta !== 0) {
          await absenceBalanceLedgerService.manualAdjustment(
            companyId,
            {
              employeeId,
              absenceTypeId,
              year: input.year,
              quantity: Math.abs(delta),
              operation: delta > 0 ? "CREDIT" : "DEBIT",
              reason: input.notes?.trim() || "Ajuste de saldo (API legacy PUT)",
              idempotencyKey: buildAbsenceBalanceIdempotencyKey.manual(
                current.id,
                `put-v${input.expectedVersion}-to-${input.totalDays}`,
              ),
              actor: { userId },
            },
            transaction,
          );
        }

        if (input.notes !== undefined) {
          await absenceBalanceRepository.updateNotesInTransaction(
            companyId,
            current.id,
            input.notes ?? null,
            transaction,
          );
        }

        await transaction.commit();
      } catch (error) {
        return rollbackTransactionSafely(
          transaction,
          { operation: "absence-balance.upsert-ledger", companyId, entityId: employeeId },
          error,
        );
      }

      const [summary] = (
        await this.listEmployeeBalances(companyId, employeeId, input.year)
      ).filter((item) => item.absenceType.id === absenceTypeId);
      return summary;
    }

    const previous = await absenceBalanceRepository.findByEmployeeTypeYear(
      companyId,
      employeeId,
      absenceTypeId,
      input.year,
    );

    const saved = await absenceBalanceRepository.upsert(companyId, {
      employeeId,
      absenceTypeId,
      year: input.year,
      totalDays: input.totalDays,
      notes: input.notes ?? null,
    });

    await auditService.log(companyId, {
      entityType: "employee_absence_balance",
      entityId: saved.id,
      action: previous ? "UPDATED" : "CREATED",
      previousData: previous as unknown as Record<string, unknown> | null,
      newData: saved as unknown as Record<string, unknown>,
      reason: input.notes ?? null,
      userId,
    });

    const [summary] = (
      await this.listEmployeeBalances(companyId, employeeId, input.year)
    ).filter((item) => item.absenceType.id === absenceTypeId);

    return summary;
  },

  async adjustEmployeeBalance(
    companyId: string,
    employeeId: string,
    absenceTypeId: string,
    input: AdjustEmployeeAbsenceBalanceInput,
    userId: string,
  ) {
    if (!(await absenceBalanceLedgerService.isLedgerEnabled(companyId))) {
      throw new AppError(
        409,
        "ABSENCE_BALANCE_LEDGER_DISABLED",
        "El ledger de saldos no está activo para esta empresa",
      );
    }

    const employee = await employeeRepository.findById(companyId, employeeId);
    if (!employee) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }
    const absenceType = await absenceTypeRepository.findById(companyId, absenceTypeId);
    if (!absenceType) {
      throw new AppError(404, "ABSENCE_TYPE_NOT_FOUND", "Tipo de ausencia no encontrado");
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const balance = await absenceBalanceLedgerRepository.ensureBalanceRow(
        companyId,
        employeeId,
        absenceTypeId,
        input.year,
        transaction,
      );
      const movement = await absenceBalanceLedgerService.manualAdjustment(
        companyId,
        {
          employeeId,
          absenceTypeId,
          year: input.year,
          quantity: input.quantity,
          operation: input.operation,
          reason: input.reason,
          idempotencyKey: buildAbsenceBalanceIdempotencyKey.manual(
            balance.id,
            input.idempotencyKey,
          ),
          actor: { userId },
        },
        transaction,
      );
      await transaction.commit();
      return movement;
    } catch (error) {
      return rollbackTransactionSafely(
        transaction,
        { operation: "absence-balance.adjust", companyId, entityId: employeeId },
        error,
      );
    }
  },

  async reverseEmployeeBalanceMovement(
    companyId: string,
    employeeId: string,
    absenceTypeId: string,
    movementId: string,
    input: ReverseAbsenceBalanceMovementInput,
    userId: string,
  ) {
    if (!(await absenceBalanceLedgerService.isLedgerEnabled(companyId))) {
      throw new AppError(
        409,
        "ABSENCE_BALANCE_LEDGER_DISABLED",
        "El ledger de saldos no está activo para esta empresa",
      );
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const original = await absenceBalanceLedgerRepository.findMovementById(
        companyId,
        movementId,
        transaction,
      );
      if (
        !original ||
        original.employeeId !== employeeId ||
        original.absenceTypeId !== absenceTypeId
      ) {
        throw new AppError(404, "ABSENCE_BALANCE_MOVEMENT_NOT_FOUND", "Movimiento no encontrado");
      }

      const movement = await absenceBalanceLedgerService.reverseMovement(
        companyId,
        movementId,
        { userId },
        input.reason,
        transaction,
      );
      await transaction.commit();
      return movement;
    } catch (error) {
      return rollbackTransactionSafely(
        transaction,
        { operation: "absence-balance.reverse", companyId, entityId: movementId },
        error,
      );
    }
  },
};
