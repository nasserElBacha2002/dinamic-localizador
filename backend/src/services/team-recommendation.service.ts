import { AppError } from "../errors/app-error";
import {
  WORKFORCE_TEAM_RECOMMENDATION_ALGORITHM_VERSION,
  WORKFORCE_TEAM_RECOMMENDATION_V1_CAPS,
  WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS,
} from "../constants/workforce-team-recommendation-v1";
import { WORKFORCE_RECOMMENDATION_V1_RECENCY } from "../constants/workforce-recommendation-v1";
import type { EmployeeType } from "../constants/employee-types";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import {
  recommendationFeatureRepository,
  type RecommendationCandidateRow,
} from "../repositories/recommendation-feature.repository";
import { serviceRepository } from "../repositories/service.repository";
import type {
  TeamRecommendationMember,
  TeamRecommendationOption,
  TeamRecommendationResponse,
} from "../types/recommendation";
import { getDateIsoInTimezone } from "../utils/absence-date";
import { isOperationAssignable } from "../utils/operation-status";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { operationWorkDateService } from "./operation-work-date.service";
import { preselectCandidateIds } from "./recommendation/candidate-preselection";
import { composeTeamAlternatives } from "./recommendation/team-composition-engine";
import {
  buildTeamPairMap,
  type TeamMemberFeatures,
} from "./recommendation/team-scorer";
import {
  distanceMetersBetween,
  minIsoDate,
  resolveLocationProximityBucket,
  saturate,
} from "./recommendation/recommendation-scorer";

const resolveTargetWorkDate = async (
  companyId: string,
  operationId: string,
  operationKind: string | null | undefined,
  todayInTz: string,
  effectiveDate?: string,
): Promise<string> => {
  if (operationKind === "RECURRING") {
    return effectiveDate ?? todayInTz;
  }
  return operationWorkDateService.resolveOperationWorkDate(companyId, operationId);
};

const toMemberFeatures = (
  row: RecommendationCandidateRow,
  serviceWorkdayCount: number,
  service: {
    latitude: number | null;
    longitude: number | null;
    locationZoneId: string | null;
  } | null,
): TeamMemberFeatures => {
  if (!service) {
    return {
      employeeId: row.employeeId,
      serviceWorkdayCount: 0,
      locationBucket: "UNKNOWN",
    };
  }
  const sameZone = Boolean(
    row.locationZoneId &&
      service.locationZoneId &&
      row.locationZoneId === service.locationZoneId,
  );
  const distanceMeters = sameZone
    ? null
    : distanceMetersBetween(
        row.centroidLatitude,
        row.centroidLongitude,
        service.latitude,
        service.longitude,
      );
  return {
    employeeId: row.employeeId,
    serviceWorkdayCount,
    locationBucket: resolveLocationProximityBucket(distanceMeters, sameZone),
  };
};

const toEmployeeSummary = (row: RecommendationCandidateRow) => ({
  id: row.employeeId,
  name: row.name,
  employeeType: row.employeeType as EmployeeType,
  categoryId: row.categoryId,
  categoryName: row.categoryName,
});

const mapOption = (
  composed: {
    rank: number;
    memberIds: string[];
    breakdown: { score: number };
    reasons: TeamRecommendationOption["reasons"];
  },
  rowById: Map<string, RecommendationCandidateRow>,
  existingIds: ReadonlySet<string>,
  lockedIds: ReadonlySet<string>,
): TeamRecommendationOption => {
  const members: TeamRecommendationMember[] = [...composed.memberIds]
    .sort((a, b) => {
      const aExisting = existingIds.has(a) ? 0 : 1;
      const bExisting = existingIds.has(b) ? 0 : 1;
      if (aExisting !== bExisting) {
        return aExisting - bExisting;
      }
      const aLocked = lockedIds.has(a) && !existingIds.has(a) ? 0 : 1;
      const bLocked = lockedIds.has(b) && !existingIds.has(b) ? 0 : 1;
      if (aLocked !== bLocked) {
        return aLocked - bLocked;
      }
      const nameA = rowById.get(a)?.name ?? a;
      const nameB = rowById.get(b)?.name ?? b;
      return nameA.localeCompare(nameB, "es") || a.localeCompare(b);
    })
    .map((id) => {
      const row = rowById.get(id);
      if (!row) {
        throw new AppError(500, "TEAM_RECOMMENDATION_INTERNAL", "Integrante sin datos de empleado");
      }
      const alreadyAssigned = existingIds.has(id);
      const locked = lockedIds.has(id);
      let role: TeamRecommendationMember["role"] = "SUGGESTED";
      if (alreadyAssigned) {
        role = "EXISTING";
      } else if (locked) {
        role = "LOCKED";
      }
      return {
        employee: toEmployeeSummary(row),
        alreadyAssigned,
        locked,
        role,
      };
    });

  return {
    rank: composed.rank,
    score: composed.breakdown.score,
    complete: true,
    members,
    reasons: composed.reasons,
  };
};

export interface TeamRecommendationRequest {
  teamSize: number;
  alternatives?: number;
  lockedEmployeeIds?: string[];
  effectiveDate?: string;
}

export interface WorkTeamRecommendationRequest {
  teamSize: number;
  alternatives?: number;
  lockedEmployeeIds?: string[];
  serviceId?: string | null;
}

const normalizeTeamSize = (teamSize: number): number => {
  if (
    !Number.isInteger(teamSize) ||
    teamSize < WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.minTeamSize ||
    teamSize > WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.maxTeamSize
  ) {
    throw new AppError(
      400,
      "INVALID_TEAM_SIZE",
      `teamSize debe estar entre ${WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.minTeamSize} y ${WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.maxTeamSize}`,
    );
  }
  return teamSize;
};

const normalizeAlternatives = (alternatives?: number): number => {
  const value = alternatives ?? WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.defaultAlternatives;
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.maxAlternatives
  ) {
    throw new AppError(
      400,
      "INVALID_ALTERNATIVES",
      `alternatives debe estar entre 1 y ${WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.maxAlternatives}`,
    );
  }
  return value;
};

const runComposition = async (input: {
  companyId: string;
  teamSize: number;
  alternatives: number;
  /** existing ∪ requested locks — always in the composed team */
  fixedMemberIds: string[];
  candidates: RecommendationCandidateRow[];
  fixedRows: RecommendationCandidateRow[];
  historyCutoffDate: string;
  todayDate: string;
  serviceContext: {
    serviceId: string;
    latitude: number | null;
    longitude: number | null;
    locationZoneId: string | null;
  } | null;
  excludeOperationId: string | null;
  existingIds: ReadonlySet<string>;
  lockedRequested: ReadonlySet<string>;
  operationId: string | null;
}): Promise<TeamRecommendationResponse & { prunedCandidateCount: number }> => {
  const {
    companyId,
    teamSize,
    alternatives,
    fixedMemberIds,
    candidates,
    fixedRows,
    historyCutoffDate,
    todayDate,
    serviceContext,
    excludeOperationId,
    existingIds,
    lockedRequested,
    operationId,
  } = input;

  if (fixedMemberIds.length + candidates.length < teamSize) {
    throw new AppError(
      409,
      "INSUFFICIENT_ELIGIBLE_EMPLOYEES",
      `No hay suficientes colaboradores disponibles para completar un equipo de ${teamSize} personas`,
      {
        requestedTeamSize: teamSize,
        fixedCount: fixedMemberIds.length,
        eligibleCount: candidates.length,
      },
    );
  }

  const serviceByEmployee = new Map<string, number>();
  if (serviceContext) {
    const rows = await recommendationFeatureRepository.listServiceExperience({
      companyId,
      serviceId: serviceContext.serviceId,
      excludedEmployeeIds: [],
      historyCutoffDate,
      excludeOperationId,
    });
    for (const row of rows) {
      serviceByEmployee.set(row.employeeId, row.serviceWorkdayCount);
    }
  }

  const serviceCtx = serviceContext
    ? {
        latitude: serviceContext.latitude,
        longitude: serviceContext.longitude,
        locationZoneId: serviceContext.locationZoneId,
      }
    : null;
  const serviceContextAvailable = Boolean(serviceContext);
  const locationContextAvailable = Boolean(
    serviceContext &&
      ((serviceContext.latitude !== null && serviceContext.longitude !== null) ||
        serviceContext.locationZoneId),
  );

  const candidateFeatures = candidates.map((row) =>
    toMemberFeatures(row, serviceByEmployee.get(row.employeeId) ?? 0, serviceCtx),
  );
  const lockedFeatures = new Map<string, TeamMemberFeatures>();
  const fixedById = new Map(fixedRows.map((row) => [row.employeeId, row]));
  for (const id of fixedMemberIds) {
    const row = fixedById.get(id);
    if (!row) {
      throw new AppError(
        400,
        "LOCKED_EMPLOYEE_INVALID",
        "Uno o más colaboradores fijos no están disponibles",
      );
    }
    lockedFeatures.set(id, toMemberFeatures(row, serviceByEmployee.get(id) ?? 0, serviceCtx));
  }

  const pruneLimit = WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.candidatePruneLimit;
  const eligibleIds = candidateFeatures.map((c) => c.employeeId);

  // Connectivity among eligible (+ fixed) for relational pre-pruning — aggregated, not N² DTO.
  const connectivityUniverse = [...new Set([...eligibleIds, ...fixedMemberIds])];
  const connectivityRows = await recommendationFeatureRepository.listCandidateConnectivitySummary({
    companyId,
    candidateIds: connectivityUniverse,
    historyCutoffDate,
    todayDate,
  });
  const connectivityById = new Map(connectivityRows.map((row) => [row.employeeId, row]));

  // Affinity of candidates to fixed members (batch; empty when no fixed).
  const affinityToFixedPairs =
    fixedMemberIds.length > 0
      ? await recommendationFeatureRepository.listAffinityPairs({
          companyId,
          assignedEmployeeIds: fixedMemberIds,
          historyCutoffDate,
          todayDate,
        })
      : [];
  const affinityToFixedByCandidate = new Map<string, number>();
  if (fixedMemberIds.length > 0) {
    const weightedByCandidate = new Map<string, number>();
    for (const pair of affinityToFixedPairs) {
      const weighted =
        pair.recent90 * WORKFORCE_RECOMMENDATION_V1_RECENCY.recentWeight +
        pair.mid365 * WORKFORCE_RECOMMENDATION_V1_RECENCY.midWeight +
        pair.older * WORKFORCE_RECOMMENDATION_V1_RECENCY.olderWeight;
      weightedByCandidate.set(
        pair.candidateId,
        (weightedByCandidate.get(pair.candidateId) ?? 0) +
          saturate(weighted, WORKFORCE_TEAM_RECOMMENDATION_V1_CAPS.pairAffinityCap),
      );
    }
    for (const [candidateId, sum] of weightedByCandidate) {
      affinityToFixedByCandidate.set(candidateId, sum / fixedMemberIds.length);
    }
  }

  const preselectInputs = candidateFeatures.map((features) => ({
    features,
    connectivity: connectivityById.get(features.employeeId) ?? null,
    affinityToFixed: affinityToFixedByCandidate.get(features.employeeId) ?? 0,
  }));

  const prunedIds = preselectCandidateIds(preselectInputs, {
    serviceContextAvailable,
    locationContextAvailable,
    pruneLimit,
  });
  const prunedSet = new Set(prunedIds);
  const pairUniverse = [...new Set([...fixedMemberIds, ...prunedIds])];

  const pairRows = await recommendationFeatureRepository.listCandidatePairAffinity({
    companyId,
    candidateIds: pairUniverse,
    historyCutoffDate,
    todayDate,
  });
  const pairMap = buildTeamPairMap(pairRows);
  const poolForCompose = candidateFeatures.filter((c) => prunedSet.has(c.employeeId));

  const alternativesResult = composeTeamAlternatives(
    {
      teamSize,
      lockedIds: fixedMemberIds,
      candidates: poolForCompose,
      pairMap,
      serviceContextAvailable,
      locationContextAvailable,
      alternatives,
      immutableIds: fixedMemberIds,
      pruneLimit,
    },
    lockedFeatures,
  );

  if (alternativesResult.length === 0) {
    throw new AppError(
      409,
      "INSUFFICIENT_ELIGIBLE_EMPLOYEES",
      `No hay suficientes colaboradores disponibles para completar un equipo de ${teamSize} personas`,
    );
  }

  const rowById = new Map<string, RecommendationCandidateRow>();
  for (const row of candidates) {
    rowById.set(row.employeeId, row);
  }
  for (const row of fixedRows) {
    rowById.set(row.employeeId, row);
  }

  const recommendations = alternativesResult.map((alt) =>
    mapOption(alt, rowById, existingIds, lockedRequested),
  );

  return {
    operationId,
    serviceId: serviceContext?.serviceId ?? null,
    algorithmVersion: WORKFORCE_TEAM_RECOMMENDATION_ALGORITHM_VERSION,
    generatedAt: new Date().toISOString(),
    requestedTeamSize: teamSize,
    existingMemberCount: existingIds.size,
    lockedMemberCount: [...lockedRequested].filter((id) => !existingIds.has(id)).length,
    slotsToFill: teamSize - fixedMemberIds.length,
    candidateCount: candidates.length,
    pairCount: pairRows.length,
    prunedCandidateCount: prunedIds.length,
    recommendations,
  };
};

export const teamRecommendationService = {
  /**
   * Read-only full-team recommendation for an operation.
   * Does not create assignments, work teams, or notifications.
   */
  async recommendTeamForOperation(
    companyId: string,
    operationId: string,
    request: TeamRecommendationRequest,
  ): Promise<TeamRecommendationResponse> {
    const startedAt = Date.now();
    const teamSize = normalizeTeamSize(request.teamSize);
    const alternatives = normalizeAlternatives(request.alternatives);
    const lockedRequested = [...new Set(request.lockedEmployeeIds ?? [])];

    console.info("[team_recommendation.requested]", {
      companyId,
      operationId,
      teamSize,
      alternatives,
      lockedCount: lockedRequested.length,
      algorithmVersion: WORKFORCE_TEAM_RECOMMENDATION_ALGORITHM_VERSION,
      effectiveDate: request.effectiveDate ?? null,
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
          "No se pueden recomendar equipos para operaciones canceladas o completadas",
        );
      }
      if (operation.operationKind !== "RECURRING" && request.effectiveDate) {
        throw new AppError(
          400,
          "EFFECTIVE_DATE_NOT_APPLICABLE",
          "effectiveDate solo aplica a operaciones recurrentes",
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
        request.effectiveDate,
      );
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
      const existingEmployeeIds = [
        ...new Set(activeAssignments.map((assignment) => assignment.employeeId)),
      ].sort((a, b) => a.localeCompare(b));
      const existingSet = new Set(existingEmployeeIds);

      if (teamSize < existingEmployeeIds.length) {
        throw new AppError(
          400,
          "TEAM_SIZE_BELOW_EXISTING",
          `Ya hay ${existingEmployeeIds.length} personas asignadas; teamSize debe ser al menos ese valor`,
          { existingMemberCount: existingEmployeeIds.length, requestedTeamSize: teamSize },
        );
      }

      // Existing may be inactive — still company-scoped and kept as EXISTING.
      const existingRows = await recommendationFeatureRepository.listEmployeesByIdsForExistingContext(
        companyId,
        existingEmployeeIds,
      );
      if (existingRows.length !== existingEmployeeIds.length) {
        throw new AppError(
          400,
          "EXISTING_EMPLOYEE_INVALID",
          "Uno o más colaboradores ya asignados no pertenecen a la empresa",
        );
      }

      // Requested locks that are not already assigned must be active & eligible.
      const requestedLockOnly = lockedRequested.filter((id) => !existingSet.has(id));
      const requestedLockRows = await recommendationFeatureRepository.listActiveEmployeesByIds(
        companyId,
        requestedLockOnly,
      );
      if (requestedLockRows.length !== requestedLockOnly.length) {
        throw new AppError(
          400,
          "LOCKED_EMPLOYEE_INVALID",
          "Uno o más colaboradores bloqueados no están activos o no pertenecen a la empresa",
        );
      }

      const fixedMemberIds = [...new Set([...existingEmployeeIds, ...lockedRequested])].sort(
        (a, b) => a.localeCompare(b),
      );
      if (fixedMemberIds.length > teamSize) {
        throw new AppError(
          400,
          "LOCKED_EXCEEDS_TEAM_SIZE",
          "Hay más integrantes fijos/bloqueados que el tamaño de equipo solicitado",
        );
      }

      const fixedRows = [...existingRows, ...requestedLockRows];
      const candidates = await recommendationFeatureRepository.listEligibleCandidates(
        companyId,
        fixedMemberIds,
      );

      const response = await runComposition({
        companyId,
        teamSize,
        alternatives,
        fixedMemberIds,
        candidates,
        fixedRows,
        historyCutoffDate,
        todayDate,
        serviceContext: {
          serviceId: operation.serviceId,
          latitude: service.latitude,
          longitude: service.longitude,
          locationZoneId: service.locationZoneId ?? null,
        },
        excludeOperationId: operationId,
        existingIds: existingSet,
        lockedRequested: new Set(lockedRequested),
        operationId,
      });

      console.info("[team_recommendation.generated]", {
        companyId,
        operationId,
        teamSize,
        existingMembers: existingEmployeeIds.length,
        algorithmVersion: WORKFORCE_TEAM_RECOMMENDATION_ALGORITHM_VERSION,
        candidateCount: response.candidateCount,
        eligibleCandidateCount: response.candidateCount,
        prunedCandidateCount: response.prunedCandidateCount,
        candidatePruneLimit: WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.candidatePruneLimit,
        pairCount: response.pairCount,
        alternativesReturned: response.recommendations.length,
        durationMs: Date.now() - startedAt,
      });

      const { prunedCandidateCount: _pruned, ...publicResponse } = response;
      return publicResponse;
    } catch (error) {
      console.info("[team_recommendation.error]", {
        companyId,
        operationId,
        teamSize,
        algorithmVersion: WORKFORCE_TEAM_RECOMMENDATION_ALGORITHM_VERSION,
        durationMs: Date.now() - startedAt,
        code: error instanceof AppError ? error.code : "UNEXPECTED",
      });
      throw error;
    }
  },

  /**
   * Read-only team composition for creating a reusable work team.
   * Optional serviceId supplies location/service-experience context.
   */
  async recommendTeamForWorkTeam(
    companyId: string,
    request: WorkTeamRecommendationRequest,
  ): Promise<TeamRecommendationResponse> {
    const startedAt = Date.now();
    const teamSize = normalizeTeamSize(request.teamSize);
    const alternatives = normalizeAlternatives(request.alternatives);
    const lockedRequested = [...new Set(request.lockedEmployeeIds ?? [])];

    console.info("[team_recommendation.requested]", {
      companyId,
      operationId: null,
      teamSize,
      alternatives,
      lockedCount: lockedRequested.length,
      algorithmVersion: WORKFORCE_TEAM_RECOMMENDATION_ALGORITHM_VERSION,
      serviceId: request.serviceId ?? null,
    });

    try {
      const settings = await companySettingsRepository.findByCompanyId(companyId);
      const timezone = resolveOperationTimezone(settings?.operationTimezone);
      const todayDate = getDateIsoInTimezone(new Date(), timezone);
      const historyCutoffDate = todayDate;

      let serviceContext: {
        serviceId: string;
        latitude: number | null;
        longitude: number | null;
        locationZoneId: string | null;
      } | null = null;
      if (request.serviceId) {
        const found = await serviceRepository.findById(companyId, request.serviceId);
        if (!found) {
          throw new AppError(404, "SERVICE_NOT_FOUND", "Servicio no encontrado");
        }
        serviceContext = {
          serviceId: found.id,
          latitude: found.latitude,
          longitude: found.longitude,
          locationZoneId: found.locationZoneId ?? null,
        };
      }

      const fixedMemberIds = [...lockedRequested].sort((a, b) => a.localeCompare(b));
      if (fixedMemberIds.length > teamSize) {
        throw new AppError(
          400,
          "LOCKED_EXCEEDS_TEAM_SIZE",
          "Hay más integrantes bloqueados que el tamaño de equipo solicitado",
        );
      }

      const fixedRows = await recommendationFeatureRepository.listActiveEmployeesByIds(
        companyId,
        fixedMemberIds,
      );
      if (fixedRows.length !== fixedMemberIds.length) {
        throw new AppError(
          400,
          "LOCKED_EMPLOYEE_INVALID",
          "Uno o más colaboradores bloqueados no están activos o no pertenecen a la empresa",
        );
      }

      const candidates = await recommendationFeatureRepository.listEligibleCandidates(
        companyId,
        fixedMemberIds,
      );

      const response = await runComposition({
        companyId,
        teamSize,
        alternatives,
        fixedMemberIds,
        candidates,
        fixedRows,
        historyCutoffDate,
        todayDate,
        serviceContext,
        excludeOperationId: null,
        existingIds: new Set(),
        lockedRequested: new Set(lockedRequested),
        operationId: null,
      });

      console.info("[team_recommendation.generated]", {
        companyId,
        operationId: null,
        teamSize,
        existingMembers: 0,
        algorithmVersion: WORKFORCE_TEAM_RECOMMENDATION_ALGORITHM_VERSION,
        candidateCount: response.candidateCount,
        eligibleCandidateCount: response.candidateCount,
        prunedCandidateCount: response.prunedCandidateCount,
        candidatePruneLimit: WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.candidatePruneLimit,
        pairCount: response.pairCount,
        alternativesReturned: response.recommendations.length,
        durationMs: Date.now() - startedAt,
      });

      const { prunedCandidateCount: _pruned, ...publicResponse } = response;
      return publicResponse;
    } catch (error) {
      console.info("[team_recommendation.error]", {
        companyId,
        operationId: null,
        teamSize,
        algorithmVersion: WORKFORCE_TEAM_RECOMMENDATION_ALGORITHM_VERSION,
        durationMs: Date.now() - startedAt,
        code: error instanceof AppError ? error.code : "UNEXPECTED",
      });
      throw error;
    }
  },
};
