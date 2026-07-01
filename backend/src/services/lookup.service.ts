import { lookupRepository } from "../repositories/lookup.repository";
import type {
  EmployeeLookupQuery,
  InventoryLookupQuery,
  StoreLookupQuery,
} from "../schemas/lookup.schema";

export const lookupService = {
  async listEmployees(companyId: string, query: EmployeeLookupQuery) {
    return lookupRepository.listEmployees(companyId, query);
  },

  async listStores(companyId: string, query: StoreLookupQuery) {
    return lookupRepository.listStores(companyId, query);
  },

  async listInventories(companyId: string, query: InventoryLookupQuery) {
    return lookupRepository.listInventories(companyId, query);
  },
};
