import { AppError } from "../errors/app-error";
import sql from "mssql";
import { absenceBalanceRepository } from "../repositories/absence-balance.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { employeeRepository } from "../repositories/employee.repository";
import type { UpsertEmployeeAbsenceBalanceInput } from "../schemas/absence-balance.schema";
import type {
  AbsenceBalanceImpact,
  AbsenceBalanceSummary,
  AbsenceRequest,
  AbsenceType,
} from "../types/absence";
import { auditService } from "./audit.service";
import {
  computeAvailableAfterApproval,
  computeBalanceCounters,
  getAbsenceRequestYear,
  hasSufficientBalanceForApproval,
} from "../utils/absence-balance.utils";

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
    availableDays: counters.availableDays,
    projectedAvailableDays: counters.projectedAvailableDays,
    notes: input.notes,
  };
};

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

    const [absenceTypes, balanceRows, aggregates] = await Promise.all([
      absenceTypeRepository.listAll(companyId, true),
      absenceBalanceRepository.listByEmployeeYear(companyId, employeeId, year),
      absenceBalanceRepository.aggregateRequestDaysByEmployeeYear(companyId, employeeId, year),
    ]);

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
      "employeeId" | "absenceTypeId" | "startDate" | "totalDays" | "status"
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

    const [balanceRow, aggregates] = await Promise.all([
      absenceBalanceRepository.findByEmployeeTypeYear(
        companyId,
        request.employeeId,
        absenceType.id,
        year,
      ),
      absenceBalanceRepository.aggregateRequestDaysByEmployeeYear(companyId, request.employeeId, year),
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
      "employeeId" | "absenceTypeId" | "startDate" | "totalDays" | "status"
    >,
    transaction: sql.Transaction,
  ): Promise<void> {
    const absenceType = await absenceTypeRepository.findById(companyId, request.absenceTypeId);
    if (!absenceType || !absenceType.deductsBalance) {
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
};
