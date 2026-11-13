import { doEffectivePeriodsOverlap } from "./effective-period";

export const isSubscriptionEffectiveAt = (input: {
  subscriptionStatus: string;
  effectiveFrom: Date | string;
  effectiveTo: Date | string | null;
  at: Date;
}): boolean => {
  const from = new Date(input.effectiveFrom);
  const to = input.effectiveTo ? new Date(input.effectiveTo) : null;
  const atMs = input.at.getTime();

  const inWindow = from.getTime() <= atMs && (to === null || to.getTime() > atMs);

  if (input.subscriptionStatus === "ACTIVE" || input.subscriptionStatus === "SCHEDULED") {
    return inWindow;
  }

  return false;
};

export const isScheduledAwaitingStart = (input: {
  subscriptionStatus: string;
  effectiveFrom: Date | string;
  at: Date;
}): boolean =>
  input.subscriptionStatus === "SCHEDULED" &&
  new Date(input.effectiveFrom).getTime() > input.at.getTime();

export const assertTermWithinSubscriptionPeriod = (
  subscription: {
    effectiveFrom: Date | string;
    effectiveTo: Date | string | null;
  },
  termFrom: Date,
  termTo: Date | null,
): void => {
  const subFrom = new Date(subscription.effectiveFrom);
  const subTo = subscription.effectiveTo ? new Date(subscription.effectiveTo) : null;

  if (termFrom.getTime() < subFrom.getTime()) {
    throw new Error("term effective_from before subscription period");
  }

  if (subTo) {
    if (termFrom.getTime() >= subTo.getTime()) {
      throw new Error("term effective_from after subscription period");
    }
    if (termTo && termTo.getTime() > subTo.getTime()) {
      throw new Error("term effective_to after subscription period");
    }
    if (termTo === null) {
      throw new Error("open-ended term not allowed on bounded subscription");
    }
  }
};

export const resolveTermEffectiveTo = (
  subscription: { effectiveTo: Date | string | null },
  termTo: Date | null | undefined,
): Date | null => {
  if (termTo !== undefined && termTo !== null) {
    return termTo;
  }
  if (subscription.effectiveTo) {
    return new Date(subscription.effectiveTo);
  }
  return null;
};

export const assertNoOpenSubscriptionOverlap = (input: {
  candidateFrom: Date;
  candidateTo: Date | null;
  existing: Array<{
    effectiveFrom: Date | string;
    effectiveTo: Date | string | null;
  }>;
}): void => {
  for (const row of input.existing) {
    if (
      doEffectivePeriodsOverlap({
        effectiveFrom: input.candidateFrom,
        effectiveTo: input.candidateTo,
        otherEffectiveFrom: new Date(row.effectiveFrom),
        otherEffectiveTo: row.effectiveTo ? new Date(row.effectiveTo) : null,
      })
    ) {
      throw new Error("open subscription periods overlap");
    }
  }
};

export const assertStandardTierAgreedCapacity = (
  planKind: string,
  tier: { seatMin: number; seatMax: number | null },
  seatMin: number,
  seatMax: number | null,
  inputProvidedCustomSeats: boolean,
): void => {
  if (planKind !== "STANDARD") {
    return;
  }

  if (
    inputProvidedCustomSeats &&
    (seatMin !== tier.seatMin || seatMax !== tier.seatMax)
  ) {
    throw new Error("standard plan seat capacity must match tier");
  }
};
