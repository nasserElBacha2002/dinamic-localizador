const OPEN_ENDED_SENTINEL_MS = Date.parse("9999-12-31T23:59:59.999Z");

export const effectivePeriodEndMs = (effectiveTo: Date | null): number =>
  effectiveTo?.getTime() ?? OPEN_ENDED_SENTINEL_MS;

/**
 * Half-open intervals [effective_from, effective_to).
 * Null effective_to means open-ended.
 */
export const doEffectivePeriodsOverlap = (input: {
  effectiveFrom: Date;
  effectiveTo: Date | null;
  otherEffectiveFrom: Date;
  otherEffectiveTo: Date | null;
}): boolean => {
  const leftEnd = effectivePeriodEndMs(input.effectiveTo);
  const rightEnd = effectivePeriodEndMs(input.otherEffectiveTo);

  return (
    input.effectiveFrom.getTime() < rightEnd &&
    input.otherEffectiveFrom.getTime() < leftEnd
  );
};

export const assertValidEffectiveRange = (
  effectiveFrom: Date,
  effectiveTo: Date | null,
): void => {
  if (effectiveTo && effectiveTo.getTime() <= effectiveFrom.getTime()) {
    throw new Error("effective_to must be after effective_from");
  }
};
