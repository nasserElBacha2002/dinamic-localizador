import { env } from "../config/env";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import type { AffectedInventoryWarning } from "../types/absence";
import { absenceDateRangeToUtcBounds, getUtcOffsetHoursFromTimezone } from "../utils/absence-date";

export const absenceInventoryImpactService = {
  async findAffectedInventories(input: {
    employeeId: string;
    startDate: string;
    endDate: string;
  }): Promise<AffectedInventoryWarning[]> {
    const timezone = env.BOT_OPERATION_TIMEZONE;
    const utcOffsetHours = getUtcOffsetHoursFromTimezone(timezone);
    const { startAt, endAt } = absenceDateRangeToUtcBounds(
      input.startDate,
      input.endDate,
      utcOffsetHours,
    );

    const inventories = await absenceRequestRepository.findAffectedInventories(
      input.employeeId,
      startAt,
      endAt,
    );

    return inventories.map((inventory) => ({
      inventoryId: inventory.inventoryId,
      storeId: inventory.storeId,
      storeName: inventory.storeName,
      scheduledStart: inventory.scheduledStart,
      scheduledEnd: inventory.scheduledEnd,
      status: inventory.status,
    }));
  },

  getOperationTimezone(): string {
    return env.BOT_OPERATION_TIMEZONE;
  },
};
