import { attendanceRepository } from "../../repositories/attendance.repository";
import { operationRepository } from "../../repositories/operation.repository";
import type { CheckoutEligibleOperation, CompatibleOperation } from "../../types/twilio.types";
import { parseInventorySelection } from "../../utils/intent";

export type InventorySessionOption = {
  operationId: string;
  serviceName: string;
  scheduledStart: string;
};

export const mapCompatibleInventoriesToSessionOptions = (
  inventories: CompatibleOperation[],
): InventorySessionOption[] =>
  inventories.map((inventory) => ({
    operationId: inventory.id,
    serviceName: inventory.serviceName,
    scheduledStart: inventory.scheduledStart,
  }));

export const mapCheckoutInventoriesToSessionOptions = (
  inventories: CheckoutEligibleOperation[],
): InventorySessionOption[] =>
  inventories.map((inventory) => ({
    operationId: inventory.id,
    serviceName: inventory.serviceName,
    scheduledStart: inventory.scheduledStart,
  }));

export const parseInventorySelectionIndex = (body: string): number | null =>
  parseInventorySelection(body);

export const isValidInventorySelection = (
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
  const inventories = await operationRepository.findCompatibleForEmployee(companyId, employeeId, at);
  return inventories.find((inventory) => inventory.id === operationId) ?? null;
};

export const findCheckoutEligibleInventoryById = async (
  companyId: string,
  employeeId: string,
  operationId: string,
): Promise<CheckoutEligibleOperation | null> => {
  const inventories = await attendanceRepository.findCheckoutEligibleInventories(companyId, employeeId);
  return inventories.find((inventory) => inventory.id === operationId) ?? null;
};

export const listCompatibleInventories = async (
  companyId: string,
  employeeId: string,
  at: Date,
): Promise<CompatibleOperation[]> =>
  operationRepository.findCompatibleForEmployee(companyId, employeeId, at);

export const listCheckoutEligibleInventories = async (
  companyId: string,
  employeeId: string,
): Promise<CheckoutEligibleOperation[]> =>
  attendanceRepository.findCheckoutEligibleInventories(companyId, employeeId);
