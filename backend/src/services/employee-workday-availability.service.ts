import { operationRepository } from "../repositories/operation.repository";
import { employeeWorkdayAvailabilityRepository } from "../repositories/employee-workday-availability.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { workdayMaterializationService } from "./workday-materialization.service";
import type {
  EmployeeWorkdayCheckInCandidate,
  EmployeeWorkdayCheckoutCandidate,
  WorkdaySelectionOption,
} from "../types/employee-workday-availability";
import { formatServiceReferenceFromFields } from "../utils/format-service-reference";
import {
  evaluateCheckInWindow,
  isWithinCheckInAvailabilityWindow,
  resolveCheckInCandidateRange,
} from "../utils/resolve-check-in-availability-window";
import { getSimulationSessionId } from "../utils/bot-runtime-context";
import { getPendingOperationExpirationHours } from "../utils/bot-runtime-settings-scope";
import {
  isPendingCheckoutEligible,
  resolveCheckoutEligibilityEndAt,
} from "../utils/pending-checkout-eligibility";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import { resolveOperationTimezone } from "../utils/operation-timezone";

export type CheckInCandidateRejectionReason =
  | "BEFORE_CHECK_IN_WINDOW"
  | "AFTER_EXPECTED_END"
  | "OPERATION_NOT_AVAILABLE"
  | "WORKDAY_NOT_ACTIVE"
  | "EMPLOYEE_NOT_EXPECTED"
  | "PRIOR_ATTENDANCE"
  | "JUSTIFIED_ABSENCE"
  | "LOCATION_INACTIVE";

export type CheckInCandidateEvaluation = {
  companyId: string;
  employeeId: string;
  operationId: string;
  operationKind: string;
  operationWorkdayId: string;
  employeeWorkdayId: string;
  expectedStartAt: string;
  expectedEndAt: string | null;
  opensAt: string;
  closesAt: string;
  evaluatedAt: string;
  operationStatus: string;
  workdayStatus: string;
  expectationStatus: string;
  priorAttendanceId: string | null;
  eligible: boolean;
  rejectionReasons: CheckInCandidateRejectionReason[];
  timezone: string;
};

const resolvePendingExpirationHours = (explicit?: number): number => {
  if (explicit != null && Number.isFinite(explicit) && explicit >= 1) {
    return explicit;
  }
  return (
    getPendingOperationExpirationHours() ||
    DEFAULT_COMPANY_OPERATIONAL_SETTINGS.pendingOperationExpirationHours
  );
};

const isCheckoutCandidateStillEligible = (
  candidate: EmployeeWorkdayCheckoutCandidate,
  now: Date,
  expirationHours: number,
): boolean =>
  isPendingCheckoutEligible({
    expectedEndAt: resolveCheckoutEligibilityEndAt({
      expectedEndAt: candidate.expectedEndAt,
      expectedStartAt: candidate.expectedStartAt,
    }),
    expirationHours,
    now,
  });

const sortCheckInCandidates = (
  candidates: EmployeeWorkdayCheckInCandidate[],
): EmployeeWorkdayCheckInCandidate[] =>
  [...candidates].sort((left, right) => {
    const startCompare = left.expectedStartAt.localeCompare(right.expectedStartAt);
    if (startCompare !== 0) {
      return startCompare;
    }

    const descriptorCompare = formatServiceReferenceFromFields(left).localeCompare(
      formatServiceReferenceFromFields(right),
      "es-AR",
    );
    if (descriptorCompare !== 0) {
      return descriptorCompare;
    }

    return left.employeeWorkdayId.localeCompare(right.employeeWorkdayId);
  });

const sortCheckoutCandidates = (
  candidates: EmployeeWorkdayCheckoutCandidate[],
): EmployeeWorkdayCheckoutCandidate[] =>
  [...candidates].sort((left, right) => {
    const checkInCompare = left.checkInAt.localeCompare(right.checkInAt);
    if (checkInCompare !== 0) {
      return checkInCompare;
    }

    const descriptorCompare = formatServiceReferenceFromFields(left).localeCompare(
      formatServiceReferenceFromFields(right),
      "es-AR",
    );
    if (descriptorCompare !== 0) {
      return descriptorCompare;
    }

    return left.employeeWorkdayId.localeCompare(right.employeeWorkdayId);
  });

const mapCheckInToSelectionOption = (
  candidate: EmployeeWorkdayCheckInCandidate,
  attendanceAction?: "CHECK_IN" | "CHECK_OUT",
): WorkdaySelectionOption => ({
  employeeWorkdayId: candidate.employeeWorkdayId,
  operationWorkdayId: candidate.operationWorkdayId,
  operationId: candidate.operationId,
  serviceName: candidate.serviceName,
  serviceAddress: candidate.serviceAddress,
  serviceLocality: candidate.serviceLocality,
  expectedStartAt: candidate.expectedStartAt,
  expectedEndAt: candidate.expectedEndAt,
  workDate: candidate.workDate,
  ...(attendanceAction ? { attendanceAction } : {}),
});

const mapCheckoutToSelectionOption = (
  candidate: EmployeeWorkdayCheckoutCandidate,
  attendanceAction?: "CHECK_IN" | "CHECK_OUT",
): WorkdaySelectionOption => ({
  ...mapCheckInToSelectionOption(candidate, attendanceAction),
  attendanceRecordId: candidate.attendanceRecordId,
  checkInAt: candidate.checkInAt,
});

const loadOneTimeFallbackCandidates = async (
  companyId: string,
  employeeId: string,
  at: Date,
  existingIds: Set<string>,
  simulationSessionId: string | null,
): Promise<EmployeeWorkdayCheckInCandidate[]> => {
  const compatibleOperations = await operationRepository.findCompatibleForEmployee(
    companyId,
    employeeId,
    at,
  );
  const fallbackCandidates: EmployeeWorkdayCheckInCandidate[] = [];

  for (const operation of compatibleOperations) {
    const employeeWorkday = await workdayMaterializationService.ensureEmployeeWorkday(
      companyId,
      operation.id,
      employeeId,
    );
    if (existingIds.has(employeeWorkday.id)) {
      continue;
    }

    const candidate = await employeeWorkdayAvailabilityRepository.findCheckInCandidateById(
      companyId,
      employeeId,
      employeeWorkday.id,
      { simulationSessionId },
    );
    if (candidate && isWithinCheckInAvailabilityWindow(candidate, at)) {
      fallbackCandidates.push(candidate);
    }
  }

  return fallbackCandidates;
};

const evaluateNearbyCandidate = (
  companyId: string,
  employeeId: string,
  at: Date,
  timezone: string,
  row: Awaited<
    ReturnType<typeof employeeWorkdayAvailabilityRepository.listNearbyWorkdayDiagnostics>
  >[number],
): CheckInCandidateEvaluation => {
  const rejectionReasons: CheckInCandidateRejectionReason[] = [];

  if (row.operationStatus === "COMPLETED" || row.operationStatus === "CANCELLED") {
    rejectionReasons.push("OPERATION_NOT_AVAILABLE");
  }
  if (row.operationWorkdayStatus !== "ACTIVE") {
    rejectionReasons.push("WORKDAY_NOT_ACTIVE");
  }
  if (row.expectationStatus === "JUSTIFIED") {
    rejectionReasons.push("JUSTIFIED_ABSENCE");
  } else if (row.expectationStatus !== "EXPECTED") {
    rejectionReasons.push("EMPLOYEE_NOT_EXPECTED");
  }
  if (!row.locationActive) {
    rejectionReasons.push("LOCATION_INACTIVE");
  }
  if (row.priorAttendanceId) {
    rejectionReasons.push("PRIOR_ATTENDANCE");
  }

  const window = evaluateCheckInWindow(
    {
      expectedStartAt: row.expectedStartAt,
      expectedEndAt: row.expectedEndAt,
      earlyToleranceMinutes: row.earlyToleranceMinutes,
      lateToleranceMinutes: row.lateToleranceMinutes,
    },
    at,
  );

  if (window.rejectionReason === "BEFORE_CHECK_IN_WINDOW") {
    rejectionReasons.push("BEFORE_CHECK_IN_WINDOW");
  }
  if (window.rejectionReason === "AFTER_EXPECTED_END") {
    rejectionReasons.push("AFTER_EXPECTED_END");
  }

  const eligible = rejectionReasons.length === 0;

  return {
    companyId,
    employeeId,
    operationId: row.operationId,
    operationKind: row.operationKind,
    operationWorkdayId: row.operationWorkdayId,
    employeeWorkdayId: row.employeeWorkdayId,
    expectedStartAt: row.expectedStartAt,
    expectedEndAt: row.expectedEndAt,
    opensAt: window.opensAt.toISOString(),
    closesAt: window.closesAt.toISOString(),
    evaluatedAt: at.toISOString(),
    operationStatus: row.operationStatus,
    workdayStatus: row.operationWorkdayStatus,
    expectationStatus: row.expectationStatus,
    priorAttendanceId: row.priorAttendanceId,
    eligible,
    rejectionReasons,
    timezone,
  };
};

export const employeeWorkdayAvailabilityService = {
  async listAvailableForCheckIn(
    companyId: string,
    employeeId: string,
    at: Date,
    options?: { simulationSessionId?: string | null },
  ): Promise<{
    candidates: EmployeeWorkdayCheckInCandidate[];
    hasJustifiedWorkdayInWindow: boolean;
  }> {
    const simulationSessionId = options?.simulationSessionId ?? getSimulationSessionId();
    const range = resolveCheckInCandidateRange(at);
    const rawCandidates = await employeeWorkdayAvailabilityRepository.listCheckInCandidates(
      companyId,
      employeeId,
      {
        candidateFrom: range.candidateFrom,
        candidateTo: range.candidateTo,
        simulationSessionId,
      },
    );

    const existingIds = new Set(rawCandidates.map((candidate) => candidate.employeeWorkdayId));
    const oneTimeFallback = await loadOneTimeFallbackCandidates(
      companyId,
      employeeId,
      at,
      existingIds,
      simulationSessionId,
    );

    const candidates = sortCheckInCandidates(
      [...rawCandidates, ...oneTimeFallback].filter((candidate) =>
        isWithinCheckInAvailabilityWindow(candidate, at),
      ),
    );

    const hasJustifiedWorkdayInWindow =
      candidates.length === 0
        ? await employeeWorkdayAvailabilityRepository.hasJustifiedWorkdayInRange(
            companyId,
            employeeId,
            range,
          )
        : false;

    return { candidates, hasJustifiedWorkdayInWindow };
  },

  /**
   * Best-effort diagnostics for empty check-in. Prefer passing precomputed
   * availability context to avoid duplicate queries. Never throw to callers
   * that wrap this in try/catch for bot telemetry.
   */
  async diagnoseCheckInUnavailability(
    companyId: string,
    employeeId: string,
    at: Date,
    precomputed?: {
      candidateFrom?: Date;
      candidateTo?: Date;
      rawCandidateCount?: number;
      eligibleCandidateCount?: number;
      hasJustifiedWorkdayInWindow?: boolean;
    },
  ): Promise<{
    candidateFrom: string;
    candidateTo: string;
    rawCandidateCount: number;
    eligibleCandidateCount: number;
    hasJustifiedWorkdayInWindow: boolean;
    reasonCodes: string[];
    candidateEvaluations: CheckInCandidateEvaluation[];
    nearbyWorkdayCount: number;
    assignedOperationCount: number;
    operationIds: string[];
    workdayIds: string[];
    timezone: string;
  }> {
    const range = resolveCheckInCandidateRange(at);
    const candidateFrom = precomputed?.candidateFrom ?? range.candidateFrom;
    const candidateTo = precomputed?.candidateTo ?? range.candidateTo;

    const [nearby, settings] = await Promise.all([
      employeeWorkdayAvailabilityRepository.listNearbyWorkdayDiagnostics(
        companyId,
        employeeId,
        at,
      ),
      companySettingsRepository.findByCompanyId(companyId),
    ]);

    const timezone = resolveOperationTimezone(settings?.operationTimezone);

    let rawCandidateCount = precomputed?.rawCandidateCount;
    let eligibleCandidateCount = precomputed?.eligibleCandidateCount;
    let hasJustifiedWorkdayInWindow = precomputed?.hasJustifiedWorkdayInWindow;

    if (rawCandidateCount == null || eligibleCandidateCount == null) {
      const rawCandidates = await employeeWorkdayAvailabilityRepository.listCheckInCandidates(
        companyId,
        employeeId,
        { candidateFrom, candidateTo },
      );
      rawCandidateCount = rawCandidates.length;
      eligibleCandidateCount = rawCandidates.filter((candidate) =>
        isWithinCheckInAvailabilityWindow(candidate, at),
      ).length;
    }

    if (hasJustifiedWorkdayInWindow == null) {
      hasJustifiedWorkdayInWindow =
        await employeeWorkdayAvailabilityRepository.hasJustifiedWorkdayInRange(
          companyId,
          employeeId,
          { candidateFrom, candidateTo },
        );
    }

    const candidateEvaluations = nearby
      .filter((row) => {
        const start = new Date(row.expectedStartAt).getTime();
        const end = row.expectedEndAt
          ? new Date(row.expectedEndAt).getTime()
          : start + row.lateToleranceMinutes * 60_000;
        return end >= candidateFrom.getTime() && start <= candidateTo.getTime();
      })
      .map((row) => evaluateNearbyCandidate(companyId, employeeId, at, timezone, row));

    for (const evaluation of candidateEvaluations) {
      console.info("[whatsapp-bot] check-in candidate evaluated", {
        companyId: evaluation.companyId,
        employeeId: evaluation.employeeId,
        employeeWorkdayId: evaluation.employeeWorkdayId,
        operationWorkdayId: evaluation.operationWorkdayId,
        operationId: evaluation.operationId,
        operationKind: evaluation.operationKind,
        expectedStartAt: evaluation.expectedStartAt,
        expectedEndAt: evaluation.expectedEndAt,
        opensAt: evaluation.opensAt,
        closesAt: evaluation.closesAt,
        evaluatedAt: evaluation.evaluatedAt,
        operationStatus: evaluation.operationStatus,
        workdayStatus: evaluation.workdayStatus,
        expectationStatus: evaluation.expectationStatus,
        priorAttendanceId: evaluation.priorAttendanceId,
        eligible: evaluation.eligible,
        rejectionReasons: evaluation.rejectionReasons,
        timezone: evaluation.timezone,
      });
    }

    const reasonCodes = new Set<string>();
    for (const evaluation of candidateEvaluations) {
      for (const reason of evaluation.rejectionReasons) {
        reasonCodes.add(reason);
      }
    }

    if (hasJustifiedWorkdayInWindow) {
      reasonCodes.add("HAS_JUSTIFIED_WORKDAY_IN_WINDOW");
    }
    if (candidateEvaluations.length === 0 && reasonCodes.size === 0) {
      reasonCodes.add("NO_AVAILABLE_EMPLOYEE_WORKDAY");
    }

    const rejected = candidateEvaluations.filter((evaluation) => !evaluation.eligible);

    return {
      candidateFrom: candidateFrom.toISOString(),
      candidateTo: candidateTo.toISOString(),
      rawCandidateCount,
      eligibleCandidateCount,
      hasJustifiedWorkdayInWindow,
      reasonCodes: [...reasonCodes].sort(),
      candidateEvaluations,
      nearbyWorkdayCount: nearby.length,
      assignedOperationCount: candidateEvaluations.length,
      operationIds: [...new Set(rejected.map((row) => row.operationId))],
      workdayIds: rejected.map((row) => row.operationWorkdayId),
      timezone,
    };
  },

  async revalidateCheckInCandidate(
    companyId: string,
    employeeId: string,
    employeeWorkdayId: string,
    at: Date,
    options?: { simulationSessionId?: string | null },
  ): Promise<EmployeeWorkdayCheckInCandidate | null> {
    const simulationSessionId = options?.simulationSessionId ?? getSimulationSessionId();
    const candidate = await employeeWorkdayAvailabilityRepository.findCheckInCandidateById(
      companyId,
      employeeId,
      employeeWorkdayId,
      { simulationSessionId },
    );

    if (!candidate || !isWithinCheckInAvailabilityWindow(candidate, at)) {
      return null;
    }

    return candidate;
  },

  async listOpenForCheckout(
    companyId: string,
    employeeId: string,
    at: Date,
    options?: {
      simulationSessionId?: string | null;
      pendingOperationExpirationHours?: number;
    },
  ): Promise<EmployeeWorkdayCheckoutCandidate[]> {
    const simulationSessionId = options?.simulationSessionId ?? getSimulationSessionId();
    const pendingOperationExpirationHours = resolvePendingExpirationHours(
      options?.pendingOperationExpirationHours,
    );
    const candidates = await employeeWorkdayAvailabilityRepository.listCheckoutCandidates(
      companyId,
      employeeId,
      {
        now: at,
        pendingOperationExpirationHours,
        simulationSessionId,
      },
    );
    return sortCheckoutCandidates(
      candidates.filter((candidate) =>
        isCheckoutCandidateStillEligible(candidate, at, pendingOperationExpirationHours),
      ),
    );
  },

  async revalidateCheckoutCandidate(
    companyId: string,
    employeeId: string,
    attendanceRecordId: string,
    at: Date,
    options?: {
      simulationSessionId?: string | null;
      pendingOperationExpirationHours?: number;
    },
  ): Promise<
    | { kind: "eligible"; candidate: EmployeeWorkdayCheckoutCandidate }
    | { kind: "expired" }
    | { kind: "not_available" }
  > {
    const simulationSessionId = options?.simulationSessionId ?? getSimulationSessionId();
    const pendingOperationExpirationHours = resolvePendingExpirationHours(
      options?.pendingOperationExpirationHours,
    );

    const openContext =
      await employeeWorkdayAvailabilityRepository.findOpenCheckoutAttendanceContext(
        companyId,
        employeeId,
        attendanceRecordId,
        { simulationSessionId },
      );

    if (!openContext) {
      return { kind: "not_available" };
    }

    if (!isCheckoutCandidateStillEligible(openContext, at, pendingOperationExpirationHours)) {
      return { kind: "expired" };
    }

    const eligible =
      await employeeWorkdayAvailabilityRepository.findCheckoutCandidateByAttendanceId(
        companyId,
        employeeId,
        attendanceRecordId,
        {
          now: at,
          pendingOperationExpirationHours,
          simulationSessionId,
        },
      );

    if (
      !eligible ||
      !isCheckoutCandidateStillEligible(eligible, at, pendingOperationExpirationHours)
    ) {
      return { kind: "expired" };
    }

    return { kind: "eligible", candidate: eligible };
  },

  mapCheckInCandidatesToSelectionOptions(
    candidates: EmployeeWorkdayCheckInCandidate[],
  ): WorkdaySelectionOption[] {
    return candidates.map((candidate) => mapCheckInToSelectionOption(candidate));
  },

  mapCheckoutCandidatesToSelectionOptions(
    candidates: EmployeeWorkdayCheckoutCandidate[],
  ): WorkdaySelectionOption[] {
    return candidates.map((candidate) => mapCheckoutToSelectionOption(candidate));
  },

  /** Checkout options first, then check-in — matches mixed LOCATION action prompt order. */
  mapMixedAttendanceActionOptions(
    checkInCandidates: EmployeeWorkdayCheckInCandidate[],
    checkoutCandidates: EmployeeWorkdayCheckoutCandidate[],
  ): WorkdaySelectionOption[] {
    return [
      ...checkoutCandidates.map((candidate) =>
        mapCheckoutToSelectionOption(candidate, "CHECK_OUT"),
      ),
      ...checkInCandidates.map((candidate) =>
        mapCheckInToSelectionOption(candidate, "CHECK_IN"),
      ),
    ];
  },
};

export type CheckoutCandidateRevalidationResult = Awaited<
  ReturnType<typeof employeeWorkdayAvailabilityService.revalidateCheckoutCandidate>
>;
