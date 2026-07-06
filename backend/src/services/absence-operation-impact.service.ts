import { env } from "../config/env";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import type { AffectedOperationWarning } from "../types/absence";
import { absenceDateRangeToUtcBounds, getUtcOffsetHoursFromTimezone } from "../utils/absence-date";

export const absenceOperationImpactService = {
  async findAffectedOperations(
    companyId: string,
    input: {
      employeeId: string;
      startDate: string;
      endDate: string;
    },
  ): Promise<AffectedOperationWarning[]> {
    const timezone = env.BOT_OPERATION_TIMEZONE;
    const utcOffsetHours = getUtcOffsetHoursFromTimezone(timezone);
    const { startAt, endAt } = absenceDateRangeToUtcBounds(
      input.startDate,
      input.endDate,
      utcOffsetHours,
    );

    const operations = await absenceRequestRepository.findAffectedOperations(
      companyId,
      input.employeeId,
      startAt,
      endAt,
    );

    return operations.map((operation) => ({
      operationId: operation.operationId,
      serviceId: operation.serviceId,
      serviceName: operation.serviceName,
      scheduledStart: operation.scheduledStart,
      scheduledEnd: operation.scheduledEnd,
      status: operation.status,
    }));
  },

  getOperationTimezone(): string {
    return env.BOT_OPERATION_TIMEZONE;
  },
};
