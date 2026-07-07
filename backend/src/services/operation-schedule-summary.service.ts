import { companyWorkScheduleRepository } from "../repositories/company-work-schedule.repository";
import { operationScheduleRepository } from "../repositories/operation-schedule.repository";
import type { OperationWithService } from "../types/domain";
import type { CompanyWorkSchedule, OperationScheduleSummary } from "../types/schedule";
import { recurringScheduleService } from "./recurring-schedule.service";
import {
  assertRecurringOperationScheduleExists,
  assertRecurringScheduleConsistency,
} from "../utils/recurring-schedule-consistency";
import { buildScheduleSummaryLabel } from "../utils/weekly-schedule";

export const operationScheduleSummaryService = {
  async buildSummariesForOperations(
    companyId: string,
    operations: OperationWithService[],
  ): Promise<Map<string, OperationScheduleSummary>> {
    const recurringOperations = operations.filter(
      (operation) => operation.operationKind === "RECURRING",
    );
    if (recurringOperations.length === 0) {
      return new Map();
    }

    const recurringIds = recurringOperations.map((operation) => operation.id);
    const schedules = await operationScheduleRepository.findByOperationIds(companyId, recurringIds);

    const hasCompanySource = [...schedules.values()].some(
      (schedule) => schedule.scheduleSource === "COMPANY",
    );
    let companySchedule: CompanyWorkSchedule | null = null;
    if (hasCompanySource) {
      companySchedule = await companyWorkScheduleRepository.findByCompanyId(companyId);
    }

    const summaries = new Map<string, OperationScheduleSummary>();

    for (const operation of recurringOperations) {
      const schedule = assertRecurringOperationScheduleExists(operation.id, schedules.get(operation.id));
      assertRecurringScheduleConsistency(operation.id, schedule, companySchedule);

      const effectiveSchedule = await recurringScheduleService.resolveEffectiveSchedule(
        companyId,
        schedule,
        companySchedule,
      );
      const label = buildScheduleSummaryLabel(effectiveSchedule.days);

      summaries.set(operation.id, {
        scheduleSource: effectiveSchedule.scheduleSource,
        validFrom: schedule.validFrom,
        validUntil: schedule.validUntil,
        summaryLabel: label.summaryLabel,
        enabledWeekdayCount: label.enabledWeekdayCount,
        hasCustomWeekdayHours: label.hasCustomWeekdayHours,
      });
    }

    return summaries;
  },

  async buildSummaryForOperation(
    companyId: string,
    operation: OperationWithService,
  ): Promise<OperationScheduleSummary | undefined> {
    if (operation.operationKind !== "RECURRING") {
      return undefined;
    }

    const summaries = await this.buildSummariesForOperations(companyId, [operation]);
    return summaries.get(operation.id);
  },
};
