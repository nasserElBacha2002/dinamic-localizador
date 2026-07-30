import type {
  AbsenceBalanceMovementDirection,
  AbsenceBalanceMovementType,
} from "../constants/absence-balance-ledger";

export interface AbsenceBalanceMovement {
  id: string;
  companyId: string;
  balanceId: string;
  employeeId: string;
  absenceTypeId: string;
  periodYear: number;
  absenceRequestId: string | null;
  movementType: AbsenceBalanceMovementType;
  quantity: number;
  direction: AbsenceBalanceMovementDirection;
  idempotencyKey: string;
  reason: string | null;
  metadataJson: string | null;
  performedByUserId: string | null;
  performedByEmployeeId: string | null;
  reversedMovementId: string | null;
  createdAt: string;
}

export interface AbsenceBalanceProjection {
  id: string;
  companyId: string;
  employeeId: string;
  absenceTypeId: string;
  year: number;
  grantedDays: number;
  reservedDays: number;
  consumedDays: number;
  availableDays: number;
  totalDays: number;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerActor {
  userId?: string | null;
  employeeId?: string | null;
}

export interface YearQuantity {
  year: number;
  quantity: number;
}
