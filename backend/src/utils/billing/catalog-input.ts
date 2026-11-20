/** Upper bound for SQL Server INT seat capacity columns. */
export const SQL_INT_MAX = 2_147_483_647;

export const assertValidEffectiveInstant = (value: Date): void => {
  if (Number.isNaN(value.getTime())) {
    throw new Error("invalid effective instant");
  }
};

export const assertPositiveInteger = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value < 0 || value > SQL_INT_MAX) {
    throw new Error(`invalid integer for ${field}`);
  }
};

export const assertSeatCapacity = (seatMin: number, seatMax: number | null): void => {
  assertPositiveInteger(seatMin, "seatMin");
  if (seatMin < 1) {
    throw new Error("seatMin must be >= 1");
  }
  if (seatMax !== null) {
    assertPositiveInteger(seatMax, "seatMax");
    if (seatMax < seatMin) {
      throw new Error("seatMax must be >= seatMin");
    }
  }
};
