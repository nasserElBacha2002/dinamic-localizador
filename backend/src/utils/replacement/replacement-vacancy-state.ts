/**
 * Whether an absent employee workday still represents a pending operational vacancy
 * for WhatsApp replacement selection.
 */
export const isAbsentWorkdayVacancyActive = (input: {
  workdayStatus: string;
  expectationStatus: string;
  unavailableAt: string | null;
  absenceRequestId: string | null;
  hasActiveCoverage?: boolean;
}): boolean => {
  if (input.hasActiveCoverage) {
    return false;
  }
  if (input.workdayStatus !== "ACTIVE") {
    return false;
  }
  if (input.expectationStatus === "JUSTIFIED") {
    return Boolean(input.absenceRequestId?.trim());
  }
  if (input.unavailableAt && input.expectationStatus === "EXPECTED") {
    return true;
  }
  return false;
};

/** Request states that must not be auto-reopened by a duplicate availability event. */
export const isReplacementRequestTerminalForRetry = (status: string): boolean =>
  status === "COVERED" || status === "EXPIRED";

/** Only in-flight work may continue without starting a new coverage cycle. */
export const isReplacementRequestContinuable = (status: string): boolean =>
  status === "PENDING" || status === "FAILED";

/** Legitimate new offer cycle (reopen); not used for technical retries. */
export const shouldStartNewReplacementCoverageCycle = (input: {
  latestStatus: string | null;
  vacancyActive: boolean;
}): boolean =>
  input.vacancyActive &&
  (input.latestStatus === "EXPIRED" ||
    input.latestStatus === "COVERED" ||
    input.latestStatus === null);