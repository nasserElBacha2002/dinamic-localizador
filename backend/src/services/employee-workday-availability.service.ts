import { operationRepository } from "../repositories/operation.repository";
import { employeeWorkdayAvailabilityRepository } from "../repositories/employee-workday-availability.repository";
import { workdayMaterializationService } from "./workday-materialization.service";
import type {
  EmployeeWorkdayCheckInCandidate,
  EmployeeWorkdayCheckoutCandidate,
  WorkdaySelectionOption,
} from "../types/employee-workday-availability";
import { formatServiceReferenceFromFields } from "../utils/format-service-reference";
import {
  isWithinCheckInAvailabilityWindow,
  resolveCheckInCandidateRange,
} from "../utils/resolve-check-in-availability-window";
import { getSimulationSessionId } from "../utils/bot-runtime-context";

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
});

const mapCheckoutToSelectionOption = (
  candidate: EmployeeWorkdayCheckoutCandidate,
): WorkdaySelectionOption => ({
  ...mapCheckInToSelectionOption(candidate),
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
    if (
      candidate &&
      isWithinCheckInAvailabilityWindow(candidate, at)
    ) {
      fallbackCandidates.push(candidate);
    }
  }

  return fallbackCandidates;
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
    options?: { simulationSessionId?: string | null },
  ): Promise<EmployeeWorkdayCheckoutCandidate[]> {
    const simulationSessionId = options?.simulationSessionId ?? getSimulationSessionId();
    const candidates = await employeeWorkdayAvailabilityRepository.listCheckoutCandidates(
      companyId,
      employeeId,
      { simulationSessionId },
    );
    return sortCheckoutCandidates(candidates);
  },

  async revalidateCheckoutCandidate(
    companyId: string,
    employeeId: string,
    attendanceRecordId: string,
    options?: { simulationSessionId?: string | null },
  ): Promise<EmployeeWorkdayCheckoutCandidate | null> {
    const simulationSessionId = options?.simulationSessionId ?? getSimulationSessionId();
    return employeeWorkdayAvailabilityRepository.findCheckoutCandidateByAttendanceId(
      companyId,
      employeeId,
      attendanceRecordId,
      { simulationSessionId },
    );
  },

  mapCheckInCandidatesToSelectionOptions(
    candidates: EmployeeWorkdayCheckInCandidate[],
  ): WorkdaySelectionOption[] {
    return candidates.map(mapCheckInToSelectionOption);
  },

  mapCheckoutCandidatesToSelectionOptions(
    candidates: EmployeeWorkdayCheckoutCandidate[],
  ): WorkdaySelectionOption[] {
    return candidates.map(mapCheckoutToSelectionOption);
  },
};
