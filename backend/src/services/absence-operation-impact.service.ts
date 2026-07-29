import { companySettingsRepository } from "../repositories/company-settings.repository";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import type { AffectedOperationWarning } from "../types/absence";
import { absenceDateRangeToUtcBounds, getUtcOffsetHoursFromTimezone } from "../utils/absence-date";
import { resolveOperationTimezone } from "../utils/operation-timezone";

const rangesOverlap = (
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean => aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();

export const absenceOperationImpactService = {
  async getOperationTimezone(companyId: string): Promise<string> {
    const settings = await companySettingsRepository.findByCompanyId(companyId);
    return resolveOperationTimezone(settings?.operationTimezone);
  },

  async findAffectedOperations(
    companyId: string,
    input: {
      employeeId: string;
      startDate: string;
      endDate: string;
    },
    timezone?: string,
  ): Promise<AffectedOperationWarning[]> {
    const resolvedTimezone = timezone ?? (await this.getOperationTimezone(companyId));
    const utcOffsetHours = getUtcOffsetHoursFromTimezone(resolvedTimezone);
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

  /**
   * Batch count for list pages: one timezone lookup + one windowed query per distinct employee.
   */
  async countAffectedOperationsForList(
    companyId: string,
    items: Array<{ id: string; employeeId: string; startDate: string; endDate: string }>,
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (items.length === 0) {
      return counts;
    }

    const timezone = await this.getOperationTimezone(companyId);
    const utcOffsetHours = getUtcOffsetHoursFromTimezone(timezone);

    const byEmployee = new Map<
      string,
      Array<{ id: string; startAt: Date; endAt: Date }>
    >();

    for (const item of items) {
      const { startAt, endAt } = absenceDateRangeToUtcBounds(
        item.startDate,
        item.endDate,
        utcOffsetHours,
      );
      const list = byEmployee.get(item.employeeId) ?? [];
      list.push({ id: item.id, startAt, endAt });
      byEmployee.set(item.employeeId, list);
      counts.set(item.id, 0);
    }

    for (const [employeeId, ranges] of byEmployee) {
      const windowStart = new Date(Math.min(...ranges.map((r) => r.startAt.getTime())));
      const windowEnd = new Date(Math.max(...ranges.map((r) => r.endAt.getTime())));
      const operations = await absenceRequestRepository.findAffectedOperations(
        companyId,
        employeeId,
        windowStart,
        windowEnd,
      );

      for (const range of ranges) {
        const matching = operations.filter((operation) => {
          const opStart = new Date(operation.scheduledStart);
          const opEnd = operation.scheduledEnd
            ? new Date(operation.scheduledEnd)
            : opStart;
          return rangesOverlap(range.startAt, range.endAt, opStart, opEnd);
        });
        counts.set(range.id, matching.length);
      }
    }

    return counts;
  },
};
