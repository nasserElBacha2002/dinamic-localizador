import { AppError } from "../errors/app-error";
import { employeeRepository } from "../repositories/employee.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { isOperationAssignable } from "../utils/operation-status";

export const operationAssignmentService = {
  async assignEmployee(companyId: string, operationId: string, employeeId: string) {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }
    if (!isOperationAssignable(operation.status)) {
      throw new AppError(
        409,
        "OPERATION_NOT_ASSIGNABLE",
        "No se puede asignar empleados a operaciones canceladas o completadas",
      );
    }

    const employee = await employeeRepository.findById(companyId, employeeId);
    if (!employee) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }
    if (!employee.active) {
      throw new AppError(409, "EMPLOYEE_INACTIVE", "No se puede asignar un empleado inactivo");
    }

    const exists = await operationEmployeeRepository.exists(companyId, operationId, employeeId);
    if (exists) {
      throw new AppError(409, "OPERATION_EMPLOYEE_ALREADY_ASSIGNED", "La asignación ya existe");
    }

    return operationEmployeeRepository.assign(companyId, operationId, employeeId);
  },

  async listAssignedEmployees(companyId: string, operationId: string) {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }
    return operationEmployeeRepository.listByOperation(companyId, operationId);
  },

  async unassignEmployee(companyId: string, operationId: string, employeeId: string) {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    const hasAttendance = await operationEmployeeRepository.hasAttendanceRecord(
      companyId,
      operationId,
      employeeId,
    );
    if (hasAttendance) {
      throw new AppError(
        409,
        "ASSIGNMENT_HAS_ATTENDANCE_RECORDS",
        "No se puede desasignar porque ya existe asistencia registrada",
      );
    }

    const removed = await operationEmployeeRepository.remove(companyId, operationId, employeeId);
    if (!removed) {
      throw new AppError(404, "OPERATION_EMPLOYEE_NOT_ASSIGNED", "La asignación no existe");
    }
  },
};
