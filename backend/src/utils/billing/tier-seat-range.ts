const OPEN_SEAT_MAX = Number.MAX_SAFE_INTEGER;

export const seatRangeEnd = (seatMax: number | null): number => seatMax ?? OPEN_SEAT_MAX;

export const doSeatRangesOverlap = (input: {
  seatMin: number;
  seatMax: number | null;
  otherSeatMin: number;
  otherSeatMax: number | null;
}): boolean =>
  input.seatMin <= seatRangeEnd(input.otherSeatMax) &&
  input.otherSeatMin <= seatRangeEnd(input.seatMax);

export const assertValidSeatRange = (seatMin: number, seatMax: number | null): void => {
  if (seatMin < 1) {
    throw new Error("seat_min must be >= 1");
  }
  if (seatMax !== null && seatMax < seatMin) {
    throw new Error("seat_max must be >= seat_min when set");
  }
};
