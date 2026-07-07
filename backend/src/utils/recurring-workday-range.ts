import { getDateIsoInTimezone } from "./absence-date";
import { addDaysToDateIso, compareDateIso } from "./recurring-workday-instant";

export const computeMaterializationRange = (input: {
  timezone: string;
  validFrom: string;
  validUntil: string | null;
  horizonDays: number;
  referenceAt?: Date;
}): { rangeStart: string; rangeEnd: string } | null => {
  const localToday = getDateIsoInTimezone(input.referenceAt ?? new Date(), input.timezone);
  const rangeStart =
    compareDateIso(localToday, input.validFrom) > 0 ? localToday : input.validFrom;
  const horizonEnd = addDaysToDateIso(localToday, input.horizonDays - 1);

  let rangeEnd = horizonEnd;
  if (input.validUntil && compareDateIso(input.validUntil, rangeEnd) < 0) {
    rangeEnd = input.validUntil;
  }

  if (compareDateIso(rangeStart, rangeEnd) > 0) {
    return null;
  }

  return { rangeStart, rangeEnd };
};

export const iterateDateIsoRange = function* (
  rangeStart: string,
  rangeEnd: string,
): Generator<string> {
  let current = rangeStart;
  while (compareDateIso(current, rangeEnd) <= 0) {
    yield current;
    current = addDaysToDateIso(current, 1);
  }
};
