import { AppError } from "../errors/app-error";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import type { DerivedEmployeeWorkdayState } from "../types/employee-workday-state";
import type { EmployeeWorkdayAbsenceContext } from "../types/employee-workday-state";
import { isWorkDateCoveredByAbsence } from "../utils/absence-workday-coverage";
import { deriveEmployeeWorkdayState } from "../utils/derive-employee-workday-state";
import { buildPaginationMeta } from "../utils/pagination";
import type { ListOperationWorkdaysQuery } from "../schemas/operation-workday.schema";

export interface OperationWorkdaySummary {
  id: string;
  workDate: string;
  expectedStartAt: string;
  expectedEndAt: string | null;
  status: string;
  expectedEmployeesCount: number;
}

export interface OperationWorkdayEmployeeSummary {
  employeeId: string;
  employeeName: string;
  expectationStatus: string;
  effectiveState: DerivedEmployeeWorkdayState;
  absenceContext: EmployeeWorkdayAbsenceContext | null;
  hasAttendanceConflict: boolean;
}

export const operationWorkdayService = {
  async list(
    companyId: string,
    operationId: string,
    query: ListOperationWorkdaysQuery,
  ): Promise<{ data: OperationWorkdaySummary[]; meta: ReturnType<typeof buildPaginationMeta> }> {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    const { items, total } = await operationWorkdayRepository.listPaginated(companyId, operationId, {
      page: query.page,
      limit: query.limit,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      status: query.status,
    });

    const counts = await employeeWorkdayRepository.countExpectedByWorkdayIds(
      companyId,
      items.map((item) => item.id),
    );

    return {
      data: items.map((item) => ({
        id: item.id,
        workDate: item.workDate,
        expectedStartAt: item.expectedStartAt,
        expectedEndAt: item.expectedEndAt,
        status: item.status,
        expectedEmployeesCount: counts.get(item.id) ?? 0,
      })),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  },

  async getDetail(
    companyId: string,
    operationId: string,
    workdayId: string,
  ): Promise<{
    workday: OperationWorkdaySummary;
    expectedEmployees: OperationWorkdayEmployeeSummary[];
  }> {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    const workday = await operationWorkdayRepository.findById(companyId, workdayId);
    if (!workday || workday.operationId !== operationId) {
      throw new AppError(404, "OPERATION_WORKDAY_NOT_FOUND", "La jornada no existe");
    }

    const counts = await employeeWorkdayRepository.countExpectedByWorkdayIds(companyId, [workday.id]);
    const employees = await employeeWorkdayRepository.listEmployeeSummariesByOperationWorkdayId(
      companyId,
      workday.id,
    );

    const approvedAbsences = await absenceRequestRepository.listApprovedByEmployeesAndDateRange(
      companyId,
      employees.map((employee) => employee.employeeId),
      workday.workDate,
      workday.workDate,
    );

    const absencesByEmployee = new Map<string, typeof approvedAbsences>();
    for (const absence of approvedAbsences) {
      const existing = absencesByEmployee.get(absence.employeeId) ?? [];
      existing.push(absence);
      absencesByEmployee.set(absence.employeeId, existing);
    }

    const expectedEmployees: OperationWorkdayEmployeeSummary[] = employees.map((employee) => {
      const effectiveState = deriveEmployeeWorkdayState({
        employeeWorkday: { expectationStatus: employee.expectationStatus as never },
        hasAttendance: employee.hasAttendance,
        expectedStartAt: workday.expectedStartAt,
        expectedEndAt: workday.expectedEndAt,
        earlyToleranceMinutes: workday.earlyToleranceMinutes,
        lateToleranceMinutes: workday.lateToleranceMinutes,
      });

      const employeeAbsences = absencesByEmployee.get(employee.employeeId) ?? [];
      const hasCoveringApprovedAbsence = employeeAbsences.some((absence) =>
        isWorkDateCoveredByAbsence(workday.workDate, absence),
      );
      const hasAttendanceConflict =
        employee.hasAttendance &&
        employee.expectationStatus === "EXPECTED" &&
        hasCoveringApprovedAbsence;

      const absenceContext: EmployeeWorkdayAbsenceContext | null =
        employee.absenceRequestId &&
        employee.absenceTypeName &&
        employee.absenceStartDate &&
        employee.absenceEndDate
          ? {
              absenceRequestId: employee.absenceRequestId,
              absenceTypeName: employee.absenceTypeName,
              absenceStartDate: employee.absenceStartDate,
              absenceEndDate: employee.absenceEndDate,
              hasAttendanceConflict,
            }
          : hasAttendanceConflict
            ? {
                absenceRequestId: employeeAbsences[0]!.id,
                absenceTypeName: "",
                absenceStartDate: employeeAbsences[0]!.startDate,
                absenceEndDate: employeeAbsences[0]!.endDate,
                hasAttendanceConflict: true,
              }
            : null;

      return {
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        expectationStatus: employee.expectationStatus,
        effectiveState,
        absenceContext,
        hasAttendanceConflict,
      };
    });

    return {
      workday: {
        id: workday.id,
        workDate: workday.workDate,
        expectedStartAt: workday.expectedStartAt,
        expectedEndAt: workday.expectedEndAt,
        status: workday.status,
        expectedEmployeesCount: counts.get(workday.id) ?? 0,
      },
      expectedEmployees,
    };
  },
};
