import { attendanceRepository } from "../../repositories/attendance.repository";
import { operationRepository } from "../../repositories/operation.repository";
import type { CheckoutEligibleOperation, CompatibleOperation } from "../../types/twilio.types";
import { parseOperationSelection } from "../../utils/intent";

export type OperationSessionOption = {
  operationId: string;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  scheduledStart: string;
};

export const mapCompatibleOperationsToSessionOptions = (
  operations: CompatibleOperation[],
): OperationSessionOption[] =>
  operations.map((operation) => ({
    operationId: operation.id,
    serviceName: operation.serviceName,
    serviceAddress: operation.serviceAddress,
    serviceLocality: operation.serviceLocality,
    scheduledStart: operation.scheduledStart,
  }));

export const mapCheckoutOperationsToSessionOptions = (
  operations: CheckoutEligibleOperation[],
): OperationSessionOption[] =>
  operations.map((operation) => ({
    operationId: operation.id,
    serviceName: operation.serviceName,
    serviceAddress: operation.serviceAddress,
    serviceLocality: operation.serviceLocality,
    scheduledStart: operation.scheduledStart,
  }));

export const parseOperationSelectionIndex = (body: string): number | null =>
  parseOperationSelection(body);

export const isValidOperationSelection = (
  selection: number | null,
  optionsLength: number,
): selection is number =>
  selection !== null && selection > 0 && selection <= optionsLength;

export const findCompatibleOperationById = async (
  companyId: string,
  employeeId: string,
  operationId: string,
  at: Date,
): Promise<CompatibleOperation | null> => {
  const operations = await operationRepository.findCompatibleForEmployee(companyId, employeeId, at);
  return operations.find((operation) => operation.id === operationId) ?? null;
};

export const findCheckoutEligibleOperationById = async (
  companyId: string,
  employeeId: string,
  operationId: string,
  at: Date,
  pendingOperationExpirationHours: number,
): Promise<CheckoutEligibleOperation | null> => {
  const operations = await attendanceRepository.findCheckoutEligibleOperations(
    companyId,
    employeeId,
    { now: at, pendingOperationExpirationHours },
  );
  return operations.find((operation) => operation.id === operationId) ?? null;
};

export const listCompatibleOperations = async (
  companyId: string,
  employeeId: string,
  at: Date,
): Promise<CompatibleOperation[]> =>
  operationRepository.findCompatibleForEmployee(companyId, employeeId, at);

export const listCheckoutEligibleOperations = async (
  companyId: string,
  employeeId: string,
  at: Date,
  pendingOperationExpirationHours: number,
): Promise<CheckoutEligibleOperation[]> =>
  attendanceRepository.findCheckoutEligibleOperations(companyId, employeeId, {
    now: at,
    pendingOperationExpirationHours,
  });
