import { employeeAssignmentQueryRepository } from "../repositories/employee-assignment-query.repository";
import { employeeRepository } from "../repositories/employee.repository";
import type { ListEmployeeOperationsQuery } from "../schemas/employee.schema";
import type { EmployeeAssignedOperation } from "../types/employee-assignment-query";
import { AppError } from "../errors/app-error";
import { buildPaginationMeta, getPagination } from "../utils/pagination";

export const employeeOperationsService = {
  async list(
    companyId: string,
    employeeId: string,
    query: ListEmployeeOperationsQuery,
  ): Promise<{
    data: EmployeeAssignedOperation[];
    meta: ReturnType<typeof buildPaginationMeta>;
  }> {
    const employee = await employeeRepository.findById(companyId, employeeId);
    if (!employee) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }

    const pagination = getPagination(query.page, query.limit);
    const at = new Date();
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : null;
    const dateTo = query.dateTo ? new Date(query.dateTo) : null;

    const result = await employeeAssignmentQueryRepository.listEmployeeOperations(
      companyId,
      employeeId,
      query.segment,
      at,
      pagination,
      dateFrom,
      dateTo,
    );

    return {
      data: result.rows,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },
};
