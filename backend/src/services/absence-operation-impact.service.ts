import { env } from "../config/env";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import type { AffectedInventoryWarning } from "../types/absence";
import { absenceDateRangeToUtcBounds, getUtcOffsetHoursFromTimezone } from "../utils/absence-date";

export const absenceOperationImpactService = {
  async findAffectedInventories(
    companyId: string,
    input: {
      employeeId: string;
      startDate: string;
      endDate: string;
    },
  ): Promise<AffectedInventoryWarning[]> {
    const timezone = env.BOT_OPERATION_TIMEZONE;
    const utcOffsetHours = getUtcOffsetHoursFromTimezone(timezone);
    const { startAt, endAt } = absenceDateRangeToUtcBounds(
      input.startDate,
      input.endDate,
      utcOffsetHours,
    );

    const inventories = await absenceRequestRepository.findAffectedInventories(
      companyId,
      input.employeeId,
      startAt,
      endAt,
    );

    return inventories.map((inventory) => ({
      operationId: inventory.operationId,
      serviceId: inventory.serviceId,
      serviceName: inventory.serviceName,
      scheduledStart: inventory.scheduledStart,
      scheduledEnd: inventory.scheduledEnd,
      status: inventory.status,
    }));
  },

  getOperationTimezone(): string {
    return env.BOT_OPERATION_TIMEZONE;
  },
};
