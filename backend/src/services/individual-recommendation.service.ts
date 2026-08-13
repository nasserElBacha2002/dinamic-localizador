import { AppError } from "../errors/app-error";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { recommendationFeatureRepository } from "../repositories/recommendation-feature.repository";
import { serviceRepository } from "../repositories/service.repository";
import type { EmployeeType } from "../constants/employee-types";
import { WORKFORCE_RECOMMENDATION_V1_LIMITS } from "../constants/workforce-recommendation-v1";
import {
  WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION,
  type IndividualEmployeeRecommendationResponse,
} from "../types/recommendation";
import { getDateIsoInTimezone } from "../utils/absence-date";
import { isOperationAssignable } from "../utils/operation-status";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { operationWorkDateService } from "./operation-work-date.service";
import {
  buildRecommendationReasons,
  compareScoredCandidates,
  distanceMetersBetween,
  minIsoDate,
  resolveLocationProximityBucket,
  scoreCandidateFeatures,
  type AffinityPairStats,
} from "./recommendation/recommendation-scorer";

/**
 * targetWorkDate: operation work context (who is currently assigned).
 * For ONE_TIME = operation work date; for RECURRING = today in company TZ.
 */
const resolveTargetWorkDate = async (
  companyId: string,
  operationId: string,
  operationKind: string | null | undefined,
  todayInTz: string,
): Promise<string> => {
  if (operationKind === "RECURRING") {
    return todayInTz;
  }
  return operationWorkDateService.resolveOperationWorkDate(companyId, operationId);
};

export const individualRecommendationService = {
  /**
   * Read-only individual employee recommendations for an existing operation.
   * Does not create assignments or mutate any operational state.
   *
   * Queries per request (typical):
   * 1 operation, 2 settings (timezone), 3 service, 4 active assignments,
   * 5 candidates, 6 affinity batch, 7 service-experience batch.
   */
  async recommendEmployees(
    companyId: string,
    operationId: string,
    limitInput?: number,
  ): Promise<IndividualEmployeeRecommendationResponse> {
    const startedAt = Date.now();
    const limit = Math.min(
      Math.max(1, limitInput ?? WORKFORCE_RECOMMENDATION_V1_LIMITS.defaultLimit),
      WORKFORCE_RECOMMENDATION_V1_LIMITS.maxLimit,
    );

    console.info("[recommendation.requested]", {
      companyId,
      operationId,
      algorithmVersion: WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION,
      limit,
    });

    try {
      const operation = await operationRepository.findById(companyId, operationId);
      if (!operation) {
        throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
      }

      if (!isOperationAssignable(operation.status)) {
        throw new AppError(
          409,
          "OPERATION_NOT_ASSIGNABLE",
          "No se pueden recomendar colaboradores para operaciones canceladas o completadas",
        );
      }

      const settings = await companySettingsRepository.findByCompanyId(companyId);
      const timezone = resolveOperationTimezone(settings?.operationTimezone);
      const todayDate = getDateIsoInTimezone(new Date(), timezone);

      const targetWorkDate = await resolveTargetWorkDate(
        companyId,
        operationId,
        operation.operationKind,
        todayDate,
      );
      /** Never treat a workday on/after "today" as historical experience. */
      const historyCutoffDate = minIsoDate(todayDate, targetWorkDate);

      const service = await serviceRepository.findById(companyId, operation.serviceId);
      if (!service) {
        throw new AppError(404, "SERVICE_NOT_FOUND", "Servicio de la operación no encontrado");
      }

      const activeAssignments = await operationEmployeeRepository.listActiveForOperationOnWorkDate(
        companyId,
        operationId,
        targetWorkDate,
      );
      const assignedEmployeeIds = [
        ...new Set(activeAssignments.map((assignment) => assignment.employeeId)),
      ];

      const candidates = await recommendationFeatureRepository.listEligibleCandidates(
        companyId,
        assignedEmployeeIds,
      );

      const [affinityPairs, serviceExperienceRows] = await Promise.all([
        recommendationFeatureRepository.listAffinityPairs({
          companyId,
          assignedEmployeeIds,
          historyCutoffDate,
          todayDate,
        }),
        recommendationFeatureRepository.listServiceExperience({
          companyId,
          serviceId: operation.serviceId,
          excludedEmployeeIds: assignedEmployeeIds,
          historyCutoffDate,
          excludeOperationId: operationId,
        }),
      ]);

      const affinityByCandidate = new Map<string, AffinityPairStats[]>();
      for (const pair of affinityPairs) {
        const list = affinityByCandidate.get(pair.candidateId) ?? [];
        list.push({
          assignedEmployeeId: pair.assignedEmployeeId,
          sharedOccurrences: pair.sharedOccurrences,
          lastSharedAt: pair.lastSharedAt,
          recent90: pair.recent90,
          mid365: pair.mid365,
          older: pair.older,
        });
        affinityByCandidate.set(pair.candidateId, list);
      }

      const serviceExperienceByCandidate = new Map(
        serviceExperienceRows.map((row) => [row.employeeId, row.serviceWorkdayCount]),
      );

      const serviceLocationZoneId = service.locationZoneId ?? null;

      const scored = candidates.map((candidate) => {
        const sameZone = Boolean(
          candidate.locationZoneId &&
            serviceLocationZoneId &&
            candidate.locationZoneId === serviceLocationZoneId,
        );
        const distanceMeters = sameZone
          ? null
          : distanceMetersBetween(
              candidate.centroidLatitude,
              candidate.centroidLongitude,
              service.latitude,
              service.longitude,
            );
        const locationBucket = resolveLocationProximityBucket(distanceMeters, sameZone);
        return scoreCandidateFeatures({
          employeeId: candidate.employeeId,
          assignedCount: assignedEmployeeIds.length,
          affinityPairs: affinityByCandidate.get(candidate.employeeId) ?? [],
          serviceWorkdayCount: serviceExperienceByCandidate.get(candidate.employeeId) ?? 0,
          locationBucket,
        });
      });

      scored.sort(compareScoredCandidates);

      const candidateById = new Map(candidates.map((candidate) => [candidate.employeeId, candidate]));
      const top = scored.slice(0, limit);
      const recommendations = top.map((features, index) => {
        const employee = candidateById.get(features.employeeId)!;
        return {
          employee: {
            id: employee.employeeId,
            name: employee.name,
            employeeType: employee.employeeType as EmployeeType,
            categoryId: employee.categoryId,
            categoryName: employee.categoryName,
          },
          score: features.score,
          rank: index + 1,
          reasons: buildRecommendationReasons(features),
        };
      });

      const response: IndividualEmployeeRecommendationResponse = {
        operationId,
        algorithmVersion: WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION,
        generatedAt: new Date().toISOString(),
        candidateCount: candidates.length,
        recommendations,
      };

      console.info("[recommendation.generated]", {
        companyId,
        operationId,
        algorithmVersion: WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION,
        candidateCount: candidates.length,
        returnedCount: recommendations.length,
        durationMs: Date.now() - startedAt,
      });

      return response;
    } catch (error) {
      console.info("[recommendation.error]", {
        companyId,
        operationId,
        algorithmVersion: WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION,
        durationMs: Date.now() - startedAt,
        code: error instanceof AppError ? error.code : "UNEXPECTED",
      });
      throw error;
    }
  },
};
