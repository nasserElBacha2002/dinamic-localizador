import { lookupRepository } from "../repositories/lookup.repository";
import type {
  EmployeeLookupQuery,
  OperationLookupQuery,
  ServiceLookupQuery,
} from "../schemas/lookup.schema";

export const lookupService = {
  async listEmployees(companyId: string, query: EmployeeLookupQuery) {
    return lookupRepository.listEmployees(companyId, query);
  },

  async listServices(companyId: string, query: ServiceLookupQuery) {
    return lookupRepository.listServices(companyId, query);
  },

  async listOperations(companyId: string, query: OperationLookupQuery) {
    return lookupRepository.listOperations(companyId, query);
  },
};
