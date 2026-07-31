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
  reserve: (
    requestId: string,
    reservationVersion: number,
    absenceTypeId: string,
    year: number,
  ): string =>
    `absence:${requestId}:reservation:${reservationVersion}:${absenceTypeId}:${year}:reserve`,
  release: (
    requestId: string,
    reservationVersion: number,
    absenceTypeId: string,
    year: number,
  ): string =>
    `absence:${requestId}:reservation:${reservationVersion}:${absenceTypeId}:${year}:release`,
  consume: (
    requestId: string,
    reservationVersion: number,
    absenceTypeId: string,
    year: number,
  ): string =>
    `absence:${requestId}:reservation:${reservationVersion}:${absenceTypeId}:${year}:consume`,
  manual: (balanceId: string, commandId: string): string =>
    `balance:${balanceId}:manual:${commandId}`,
  initialGrant: (balanceId: string): string => `migration:initial-grant:${balanceId}`,
  reversal: (movementId: string): string => `absence:movement:${movementId}:reversal:v1`,
};
