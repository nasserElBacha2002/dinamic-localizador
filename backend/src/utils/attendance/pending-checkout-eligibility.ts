export type PendingCheckoutEligibilityInput = {
  expectedEndAt: Date | string;
  expirationHours: number;
  now: Date;
};

/**
 * Pending checkout remains eligible while now <= expectedEndAt + expirationHours.
 * Expired strictly when now > expirationAt (exact boundary stays eligible).
 */
export const resolvePendingCheckoutExpirationAt = (
  expectedEndAt: Date | string,
  expirationHours: number,
): Date => {
  const endMs = new Date(expectedEndAt).getTime();
  return new Date(endMs + expirationHours * 60 * 60 * 1000);
};

export const isPendingCheckoutEligible = (
  input: PendingCheckoutEligibilityInput,
): boolean => {
  if (!Number.isFinite(input.expirationHours) || input.expirationHours < 1) {
    return false;
  }

  const endMs = new Date(input.expectedEndAt).getTime();
  if (!Number.isFinite(endMs)) {
    return false;
  }

  const expirationAt = resolvePendingCheckoutExpirationAt(
    input.expectedEndAt,
    input.expirationHours,
  );
  return input.now.getTime() <= expirationAt.getTime();
};

/** Workday end instant used for pending checkout eligibility (matches SQL COALESCE). */
export const resolveCheckoutEligibilityEndAt = (input: {
  expectedEndAt: string | Date | null | undefined;
  expectedStartAt: string | Date;
}): Date | string => input.expectedEndAt ?? input.expectedStartAt;
