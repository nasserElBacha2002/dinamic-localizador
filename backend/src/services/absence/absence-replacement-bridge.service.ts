import { absenceOperationalImpactQueryService } from "./absence-operational-impact-query.service";
import { absenceRequestRepository } from "../../repositories/absence/absence-request.repository";
import { replacementRequestService } from "../replacement-request.service";
import { AppError } from "../../errors/app-error";

/**
 * After an absence is approved and workdays reconciled, enqueue WhatsApp replacement
 * coverage for each eligible operational vacancy (reuses existing request when present).
 */
export const absenceReplacementBridgeService = {
  async syncReplacementsForApprovedAbsence(
    companyId: string,
    absenceRequestId: string,
  ): Promise<{ attempted: number; skipped: number; failedWorkdayIds: string[] }> {
    if (!(await absenceOperationalImpactQueryService.isFeatureEnabled(companyId))) {
      return { attempted: 0, skipped: 0, failedWorkdayIds: [] };
    }

    const request = await absenceRequestRepository.findById(companyId, absenceRequestId);
    if (!request || request.status !== "APPROVED") {
      return { attempted: 0, skipped: 0, failedWorkdayIds: [] };
    }

    const impact = await absenceOperationalImpactQueryService.computeImpact(
      companyId,
      absenceRequestId,
    );

    let attempted = 0;
    let skipped = 0;
    const failedWorkdayIds: string[] = [];

    for (const workday of impact.workdays) {
      if (!workday.needsCoverage || !workday.employeeWorkdayId) {
        skipped += 1;
        continue;
      }

      const vacancyInput = {
        companyId,
        employeeWorkdayId: workday.employeeWorkdayId,
        employeeId: request.employeeId,
        absenceRequestId,
        trigger: "ABSENCE_APPROVED" as const,
      };

      try {
        await replacementRequestService.createForEligibleVacancy(vacancyInput);
        attempted += 1;
      } catch (error) {
        console.error("[absence-replacement-bridge] vacancy sync failed", {
          companyId,
          absenceRequestId,
          employeeWorkdayId: workday.employeeWorkdayId,
          error: error instanceof Error ? error.message : String(error),
        });
        try {
          await replacementRequestService.ensureVacancyNotificationsForWorkday(vacancyInput);
          attempted += 1;
        } catch (recoveryError) {
          console.error("[absence-replacement-bridge] notification recovery failed", {
            companyId,
            absenceRequestId,
            employeeWorkdayId: workday.employeeWorkdayId,
            error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
          });
          failedWorkdayIds.push(workday.employeeWorkdayId);
        }
      }
    }

    if (failedWorkdayIds.length > 0) {
      throw new AppError(
        500,
        "ABSENCE_REPLACEMENT_BRIDGE_PARTIAL_FAILURE",
        `No se pudo sincronizar cobertura para ${failedWorkdayIds.length} jornada(s)`,
        { failedWorkdayIds },
      );
    }

    return { attempted, skipped, failedWorkdayIds };
  },
};