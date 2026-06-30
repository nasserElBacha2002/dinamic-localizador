import { attendanceRepository } from "../../repositories/attendance.repository";
import { inventoryRepository } from "../../repositories/inventory.repository";
import type { CheckoutEligibleInventory, CompatibleInventory } from "../../types/twilio.types";
import { parseInventorySelection } from "../../utils/intent";

export type InventorySessionOption = {
  inventoryId: string;
  storeName: string;
  scheduledStart: string;
};

export const mapCompatibleInventoriesToSessionOptions = (
  inventories: CompatibleInventory[],
): InventorySessionOption[] =>
  inventories.map((inventory) => ({
    inventoryId: inventory.id,
    storeName: inventory.storeName,
    scheduledStart: inventory.scheduledStart,
  }));

export const mapCheckoutInventoriesToSessionOptions = (
  inventories: CheckoutEligibleInventory[],
): InventorySessionOption[] =>
  inventories.map((inventory) => ({
    inventoryId: inventory.id,
    storeName: inventory.storeName,
    scheduledStart: inventory.scheduledStart,
  }));

export const parseInventorySelectionIndex = (body: string): number | null =>
  parseInventorySelection(body);

export const isValidInventorySelection = (
  selection: number | null,
  optionsLength: number,
): selection is number =>
  selection !== null && selection > 0 && selection <= optionsLength;

export const findCompatibleInventoryById = async (
  employeeId: string,
  inventoryId: string,
  at: Date,
): Promise<CompatibleInventory | null> => {
  const inventories = await inventoryRepository.findCompatibleForEmployee(employeeId, at);
  return inventories.find((inventory) => inventory.id === inventoryId) ?? null;
};

export const findCheckoutEligibleInventoryById = async (
  employeeId: string,
  inventoryId: string,
): Promise<CheckoutEligibleInventory | null> => {
  const inventories = await attendanceRepository.findCheckoutEligibleInventories(employeeId);
  return inventories.find((inventory) => inventory.id === inventoryId) ?? null;
};

export const listCompatibleInventories = async (
  employeeId: string,
  at: Date,
): Promise<CompatibleInventory[]> => inventoryRepository.findCompatibleForEmployee(employeeId, at);

export const listCheckoutEligibleInventories = async (
  employeeId: string,
): Promise<CheckoutEligibleInventory[]> =>
  attendanceRepository.findCheckoutEligibleInventories(employeeId);
