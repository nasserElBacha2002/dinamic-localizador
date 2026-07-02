import { AppError } from "../errors/app-error";
import { employeeRepository } from "../repositories/employee.repository";
import { inventoryEmployeeRepository } from "../repositories/inventory-employee.repository";
import { inventoryRepository } from "../repositories/inventory.repository";
import { isInventoryAssignable } from "../utils/inventory-status";

export const inventoryAssignmentService = {
  async assignEmployee(companyId: string, inventoryId: string, employeeId: string) {
    const inventory = await inventoryRepository.findById(companyId, inventoryId);
    if (!inventory) {
      throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventario no encontrado");
    }
    if (!isInventoryAssignable(inventory.status)) {
      throw new AppError(
        409,
        "INVENTORY_NOT_ASSIGNABLE",
        "No se puede asignar empleados a inventarios cancelados o completados",
      );
    }

    const employee = await employeeRepository.findById(companyId, employeeId);
    if (!employee) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }
    if (!employee.active) {
      throw new AppError(409, "EMPLOYEE_INACTIVE", "No se puede asignar un empleado inactivo");
    }

    const exists = await inventoryEmployeeRepository.exists(companyId, inventoryId, employeeId);
    if (exists) {
      throw new AppError(409, "INVENTORY_EMPLOYEE_ALREADY_ASSIGNED", "La asignación ya existe");
    }

    return inventoryEmployeeRepository.assign(companyId, inventoryId, employeeId);
  },

  async listAssignedEmployees(companyId: string, inventoryId: string) {
    const inventory = await inventoryRepository.findById(companyId, inventoryId);
    if (!inventory) {
      throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventario no encontrado");
    }
    return inventoryEmployeeRepository.listByInventory(companyId, inventoryId);
  },

  async unassignEmployee(companyId: string, inventoryId: string, employeeId: string) {
    const inventory = await inventoryRepository.findById(companyId, inventoryId);
    if (!inventory) {
      throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventario no encontrado");
    }

    const hasAttendance = await inventoryEmployeeRepository.hasAttendanceRecord(
      companyId,
      inventoryId,
      employeeId,
    );
    if (hasAttendance) {
      throw new AppError(
        409,
        "ASSIGNMENT_HAS_ATTENDANCE_RECORDS",
        "No se puede desasignar porque ya existe asistencia registrada",
      );
    }

    const removed = await inventoryEmployeeRepository.remove(companyId, inventoryId, employeeId);
    if (!removed) {
      throw new AppError(404, "INVENTORY_EMPLOYEE_NOT_ASSIGNED", "La asignación no existe");
    }
  },
};
