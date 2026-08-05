import {
  deleteCompanyCascade,
  deleteEmployeeCascade,
  deleteOperationCascade,
} from "../services/company-data-cascade.service";

export { deleteCompanyCascade, deleteEmployeeCascade, deleteOperationCascade };

export interface IntegrationFixtureTracker {
  trackOperation: (companyId: string, operationId: string) => void;
  trackEmployee: (companyId: string, employeeId: string) => void;
  trackCompany: (companyId: string) => void;
  cleanup: () => Promise<void>;
}

/** Tracks fixture IDs created during a suite and deletes them in reverse dependency order. */
export const createIntegrationFixtureTracker = (): IntegrationFixtureTracker => {
  const operations: Array<{ companyId: string; operationId: string }> = [];
  const employees: Array<{ companyId: string; employeeId: string }> = [];
  const companies: string[] = [];

  return {
    trackOperation: (companyId, operationId) => {
      operations.push({ companyId, operationId });
    },
    trackEmployee: (companyId, employeeId) => {
      employees.push({ companyId, employeeId });
    },
    trackCompany: (companyId) => {
      companies.push(companyId);
    },
    cleanup: async () => {
      for (const { companyId, operationId } of [...operations].reverse()) {
        await deleteOperationCascade(companyId, operationId);
      }
      operations.length = 0;

      for (const { companyId, employeeId } of [...employees].reverse()) {
        await deleteEmployeeCascade(companyId, employeeId);
      }
      employees.length = 0;

      for (const companyId of [...companies].reverse()) {
        await deleteCompanyCascade(companyId);
      }
      companies.length = 0;
    },
  };
};
