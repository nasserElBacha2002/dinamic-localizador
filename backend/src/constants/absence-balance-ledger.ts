export const ABSENCE_BALANCE_MOVEMENT_TYPES = [
  "INITIAL_GRANT",
  "MANUAL_CREDIT",
  "MANUAL_DEBIT",
  "RESERVE",
  "RELEASE",
  "CONSUME",
  "REVERSAL",
  "MIGRATION_ADJUSTMENT",
] as const;

export type AbsenceBalanceMovementType = (typeof ABSENCE_BALANCE_MOVEMENT_TYPES)[number];

export const ABSENCE_BALANCE_MOVEMENT_DIRECTIONS = ["CREDIT", "DEBIT"] as const;
export type AbsenceBalanceMovementDirection = (typeof ABSENCE_BALANCE_MOVEMENT_DIRECTIONS)[number];

export const buildAbsenceBalanceIdempotencyKey = {
  reserve: (requestId: string, year: number): string =>
    `absence:${requestId}:reserve:${year}:v1`,
  release: (requestId: string, year: number): string =>
    `absence:${requestId}:release:${year}:v1`,
  consume: (requestId: string, year: number): string =>
    `absence:${requestId}:consume:${year}:v1`,
  reservationAdjustment: (requestId: string, year: number, version: number): string =>
    `absence:${requestId}:reservation-adjustment:${year}:v${version}`,
  manual: (balanceId: string, nonce: string): string => `balance:${balanceId}:manual:${nonce}`,
  initialGrant: (balanceId: string): string => `migration:initial-grant:${balanceId}`,
  reversal: (movementId: string): string => `absence:movement:${movementId}:reversal:v1`,
};
