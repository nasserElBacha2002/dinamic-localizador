import sql from "mssql";
import { AppError } from "../errors/app-error";
import { clientRepository } from "../repositories/client.repository";
import { employeeClientRepository } from "../repositories/employee-client.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { getPool } from "../database/connection";
import { auditService } from "./audit.service";

const getClient = async (companyId: string, clientId: string) => {
  const client = await clientRepository.findById(companyId, clientId);
  if (!client) throw new AppError(404, "CLIENT_NOT_FOUND", "Cliente no encontrado");
  return client;
};

const getEmployee = async (companyId: string, employeeId: string) => {
  const employee = await employeeRepository.findById(companyId, employeeId);
  if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
  return employee;
};

export const employeeClientService = {
  async listForClient(companyId: string, clientId: string) {
    await getClient(companyId, clientId);
    return { data: await employeeClientRepository.listByClient(companyId, clientId) };
  },

  async replaceForClient(companyId: string, clientId: string, employeeIds: string[], userId: string | null) {
    const client = await getClient(companyId, clientId);
    if (new Set(employeeIds).size !== employeeIds.length) {
      throw new AppError(400, "CLIENT_EMPLOYEE_DUPLICATES", "La lista de colaboradores contiene duplicados");
    }
    const existingIds = await employeeClientRepository.listEmployeeIdsByClient(companyId, clientId);
    const existing = new Set(existingIds);
    const requested = new Set(employeeIds);
    const added = employeeIds.filter((id) => !existing.has(id));
    const removed = existingIds.filter((id) => !requested.has(id));
    if (!client.isActive && added.length > 0) {
      throw new AppError(409, "CLIENT_INACTIVE", "Cliente inactivo");
    }
    const employees = await employeeRepository.listByIds(companyId, employeeIds);
    if (employees.length !== employeeIds.length) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    if (added.some((id) => !employeeById.get(id)?.active)) {
      throw new AppError(409, "EMPLOYEE_INACTIVE", "No se puede asociar un colaborador inactivo");
    }
    const transaction = new sql.Transaction(getPool());
    await transaction.begin();
    try {
      await employeeClientRepository.replaceForClient(transaction, companyId, clientId, employeeIds, userId);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    await auditService.log(companyId, { entityType: "client", entityId: clientId, action: "CLIENT_EMPLOYEES_REPLACED", previousData: { count: existingIds.length, employeeIds: existingIds }, newData: { count: employeeIds.length, addedEmployeeIds: added, removedEmployeeIds: removed }, userId });
    return this.listForClient(companyId, clientId);
  },

  async removeFromClient(companyId: string, clientId: string, employeeId: string, userId: string | null) {
    await getClient(companyId, clientId);
    const removed = await employeeClientRepository.remove(companyId, clientId, employeeId);
    if (!removed) throw new AppError(404, "CLIENT_EMPLOYEE_NOT_FOUND", "El colaborador no pertenece al cliente");
    await auditService.log(companyId, { entityType: "client", entityId: clientId, action: "CLIENT_EMPLOYEE_REMOVED", previousData: { employeeId }, userId });
    return this.listForClient(companyId, clientId);
  },

  async listForEmployee(companyId: string, employeeId: string) {
    await getEmployee(companyId, employeeId);
    return { data: await employeeClientRepository.listClientsByEmployee(companyId, employeeId) };
  },

  async replaceForEmployee(companyId: string, employeeId: string, clientIds: string[], userId: string | null) {
    const employee = await getEmployee(companyId, employeeId);
    if (new Set(clientIds).size !== clientIds.length) {
      throw new AppError(400, "EMPLOYEE_CLIENT_DUPLICATES", "La lista de clientes contiene duplicados");
    }
    const existingIds = await employeeClientRepository.listClientIdsByEmployee(companyId, employeeId);
    const existing = new Set(existingIds);
    const requested = new Set(clientIds);
    const added = clientIds.filter((id) => !existing.has(id));
    const removed = existingIds.filter((id) => !requested.has(id));
    const clients = await clientRepository.listByIds(companyId, clientIds);
    if (clients.length !== clientIds.length) {
      throw new AppError(404, "CLIENT_NOT_FOUND", "Cliente no encontrado");
    }
    if (added.length > 0 && !employee.active) {
      throw new AppError(409, "EMPLOYEE_INACTIVE", "No se puede asociar un colaborador inactivo");
    }
    const clientById = new Map(clients.map((client) => [client.id, client]));
    if (added.some((id) => !clientById.get(id)?.isActive)) {
      throw new AppError(409, "CLIENT_INACTIVE", "No se puede asociar un cliente inactivo");
    }
    const transaction = new sql.Transaction(getPool());
    await transaction.begin();
    try {
      await employeeClientRepository.replaceForEmployee(transaction, companyId, employeeId, clientIds, userId);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    await auditService.log(companyId, { entityType: "employee", entityId: employeeId, action: "EMPLOYEE_CLIENTS_REPLACED", previousData: { count: existingIds.length, clientIds: existingIds }, newData: { count: clientIds.length, addedClientIds: added, removedClientIds: removed }, userId });
    return this.listForEmployee(companyId, employeeId);
  },
};
