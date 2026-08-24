import path from "node:path";
import { mock } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const notUsed = async () => {
  throw new Error("API mock: function not used in this test");
};

/**
 * Mock an API module by absolute file URL so Node's experimental
 * `mock.module` matches the same resolved module that hooks import.
 *
 * `exportNames` must list every named export the real module provides
 * (ESM import fails if a requested export is missing from the mock).
 */
export function mockApiModule(
  relativeFromSrc: string,
  namedExports: Record<string, unknown>,
  exportNames: readonly string[] = Object.keys(namedExports),
): void {
  const absolutePath = path.resolve(
    srcRoot,
    relativeFromSrc.endsWith(".ts") ? relativeFromSrc : `${relativeFromSrc}.ts`,
  );
  const completeExports: Record<string, unknown> = {};
  for (const name of exportNames) {
    completeExports[name] = namedExports[name] ?? notUsed;
  }
  for (const [name, value] of Object.entries(namedExports)) {
    completeExports[name] = value;
  }
  mock.module(pathToFileURL(absolutePath).href, { namedExports: completeExports });
}

export const AUTH_API_EXPORTS = [
  "login",
  "loginWithTwoFactor",
  "getCurrentUser",
  "requestPasswordReset",
  "resetPassword",
  "getTwoFactorStatus",
  "setupTwoFactor",
  "confirmTwoFactor",
  "disableTwoFactor",
  "regenerateRecoveryCodes",
  "startTwoFactorReconfigure",
  "confirmTwoFactorReconfigure",
  "cancelTwoFactorReconfigure",
  "clearStoredToken",
  "getStoredToken",
  "setStoredToken",
] as const;

export const OPERATIONS_API_EXPORTS = [
  "getOperations",
  "getOperationById",
  "createOperation",
  "updateOperation",
  "cancelOperation",
  "reactivateOperation",
  "getOperationEmployees",
  "assignEmployeeToOperation",
  "assignEmployeesBatchToOperation",
  "cancelOperationAssignment",
  "unassignEmployeeFromOperation",
  "endOperationAssignment",
  "getOperationAttendanceSummary",
  "getOperationWorkdays",
  "getOperationWorkdayDetail",
  "materializeOperationWorkdays",
  "previewOperationImport",
  "confirmOperationImport",
] as const;

export const WORK_TEAMS_API_EXPORTS = [
  "getWorkTeams",
  "getWorkTeamById",
  "createWorkTeam",
  "updateWorkTeam",
  "activateWorkTeam",
  "deactivateWorkTeam",
  "replaceWorkTeamMembers",
  "getWorkTeamUsage",
  "previewWorkTeamAssignment",
  "confirmWorkTeamAssignment",
  "getWorkTeamAssignmentBatch",
] as const;

export const ATTENDANCE_API_EXPORTS = [
  "getAttendanceRecords",
  "getAttendanceById",
  "createAttendanceRecord",
  "getAttendanceReviews",
  "reviewAttendanceRecord",
  "exportAttendanceCsv",
] as const;

export const PLATFORM_COMPANIES_API_EXPORTS = [
  "getPlatformCompanies",
  "createPlatformCompany",
  "deactivatePlatformCompany",
  "reactivatePlatformCompany",
  "getPlatformCompanyDeletionStatus",
] as const;

export const EMPLOYEES_API_EXPORTS = [
  "getEmployees",
  "getEmployeeById",
  "getEmployeeDeactivationImpact",
  "getEmployeeOperationalAvailability",
  "getEmployeeOperations",
  "createEmployee",
  "updateEmployee",
  "deactivateEmployee",
] as const;

export const ABSENCES_API_EXPORTS = [
  "getAbsenceTypes",
  "updateAbsenceType",
  "getAbsenceRequests",
  "getAbsenceRequestById",
  "createAbsenceRequest",
  "approveAbsenceRequest",
  "rejectAbsenceRequest",
  "needsInfoAbsenceRequest",
  "cancelAbsenceRequest",
  "updateNeedsInfoAbsenceRequest",
  "resubmitAbsenceRequest",
  "getAbsenceOperationalImpact",
  "getAbsenceOperationalConflicts",
  "resolveAbsenceOperationalConflict",
  "getEmployeeAbsenceBalances",
  "upsertEmployeeAbsenceBalance",
  "adjustEmployeeAbsenceBalance",
  "getEmployeeAbsenceBalanceMovements",
  "listAbsenceAttachments",
  "uploadAbsenceAttachment",
  "createAbsenceRequestDraft",
  "uploadAbsenceDraftAttachment",
  "submitAbsenceRequestDraft",
  "deleteAbsenceAttachment",
  "getAbsenceAttachmentContentUrl",
  "downloadAbsenceAttachmentContent",
  "getAbsenceAttachmentStorageHealth",
] as const;

export const PAYROLL_RECEIPTS_API_EXPORTS = [
  "createPayrollReceiptBatch",
  "getPayrollReceiptBatches",
  "getPayrollReceiptBatch",
  "uploadPayrollReceiptToBatch",
  "getPayrollReceipts",
  "getPayrollReceiptById",
  "getPayrollReceiptContentUrl",
  "downloadPayrollReceiptContent",
  "replacePayrollReceipt",
  "deletePayrollReceipt",
  "reconcilePayrollReceiptAssociation",
] as const;

export const WHATSAPP_OBSERVABILITY_API_EXPORTS = [
  "getWhatsappConversations",
  "getWhatsappObservabilityEmployeeLookups",
  "getWhatsappConversationById",
  "getWhatsappConversationMessages",
  "getWhatsappMessageById",
  "getWhatsappFlowExecutionById",
  "getWhatsappErrors",
  "getWhatsappErrorByCode",
  "getWhatsappNotificationById",
  "getWhatsappConversationProviderEvents",
  "revealWhatsappConversationPhone",
] as const;
