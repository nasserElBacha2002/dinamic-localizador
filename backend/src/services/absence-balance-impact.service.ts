import sql from "mssql";
import type { AbsenceRequest } from "../types/absence";
import type { LedgerActor, YearQuantity } from "../types/absence-balance-ledger";
import { resolveYearAllocations } from "../utils/absence-year-allocations";
import { absenceBalanceLedgerService } from "./absence-balance-ledger.service";

type RequestBalanceRef = Pick<
  AbsenceRequest,
  | "id"
  | "employeeId"
  | "absenceTypeId"
  | "startDate"
  | "endDate"
  | "totalDays"
  | "reservationVersion"
  | "yearAllocationsJson"
>;

const toLedgerRequest = (request: RequestBalanceRef) => ({
  id: request.id,
  employeeId: request.employeeId,
  absenceTypeId: request.absenceTypeId,
  startDate: request.startDate,
  endDate: request.endDate,
  totalDays: request.totalDays,
  reservationVersion: request.reservationVersion ?? 1,
});

export const allocationsForAbsenceRequest = (
  request: Pick<
    AbsenceRequest,
    "startDate" | "endDate" | "totalDays" | "yearAllocationsJson"
  > & { breakdown?: Parameters<typeof resolveYearAllocations>[0]["breakdown"] },
): YearQuantity[] => {
  const resolved = resolveYearAllocations({
    breakdown: request.breakdown,
    persistedJson: request.yearAllocationsJson,
    startDate: request.startDate,
    endDate: request.endDate,
    totalDays: request.totalDays,
  });
  return resolved.allocations;
};

/**
 * Orchestrates ledger side-effects for absence request lifecycle.
 * Keeps request/review services free of dynamic imports into the ledger.
 */
export const absenceBalanceImpactService = {
  async onRequestCreated(
    companyId: string,
    request: RequestBalanceRef,
    actor: LedgerActor,
    transaction: sql.Transaction,
    options: { autoApproved: boolean },
  ): Promise<void> {
    if (!(await absenceBalanceLedgerService.isLedgerEnabled(companyId))) {
      return;
    }
    const allocations = allocationsForAbsenceRequest(request);
    const ref = toLedgerRequest(request);
    if (options.autoApproved) {
      await absenceBalanceLedgerService.consumeDirect(
        companyId,
        ref,
        allocations,
        actor,
        transaction,
      );
      return;
    }
    await absenceBalanceLedgerService.reserveForRequest(
      companyId,
      ref,
      allocations,
      actor,
      transaction,
    );
  },

  async onRequestEdited(
    companyId: string,
    input: {
      requestId: string;
      employeeId: string;
      previous: RequestBalanceRef;
      next: Omit<RequestBalanceRef, "id" | "employeeId"> & {
        absenceTypeId: string;
        startDate: string;
        endDate: string;
        totalDays: number;
        yearAllocationsJson: string | null;
      };
      nextReservationVersion: number;
    },
    actor: LedgerActor,
    transaction: sql.Transaction,
  ): Promise<void> {
    if (!(await absenceBalanceLedgerService.isLedgerEnabled(companyId))) {
      return;
    }
    await absenceBalanceLedgerService.syncReservationAfterEdit(
      companyId,
      {
        requestId: input.requestId,
        employeeId: input.employeeId,
        previousAbsenceTypeId: input.previous.absenceTypeId,
        nextAbsenceTypeId: input.next.absenceTypeId,
        previousVersion: input.previous.reservationVersion ?? 1,
        nextVersion: input.nextReservationVersion,
        previousAllocations: allocationsForAbsenceRequest(input.previous),
        nextAllocations: allocationsForAbsenceRequest(input.next),
        startDate: input.next.startDate,
        endDate: input.next.endDate,
        totalDays: input.next.totalDays,
      },
      actor,
      transaction,
    );
  },

  async onRequestApproved(
    companyId: string,
    request: RequestBalanceRef,
    actor: LedgerActor,
    transaction: sql.Transaction,
  ): Promise<void> {
    if (!(await absenceBalanceLedgerService.isLedgerEnabled(companyId))) {
      return;
    }
    await absenceBalanceLedgerService.consumeReservation(
      companyId,
      toLedgerRequest(request),
      allocationsForAbsenceRequest(request),
      actor,
      transaction,
    );
  },

  async onRequestRejectedOrCancelled(
    companyId: string,
    request: RequestBalanceRef,
    actor: LedgerActor,
    transaction: sql.Transaction,
  ): Promise<void> {
    if (!(await absenceBalanceLedgerService.isLedgerEnabled(companyId))) {
      return;
    }
    await absenceBalanceLedgerService.releaseReservation(
      companyId,
      toLedgerRequest(request),
      allocationsForAbsenceRequest(request),
      actor,
      transaction,
    );
  },

  async onRequestAutoApprovedFromResubmit(
    companyId: string,
    request: RequestBalanceRef,
    actor: LedgerActor,
    transaction: sql.Transaction,
  ): Promise<void> {
    if (!(await absenceBalanceLedgerService.isLedgerEnabled(companyId))) {
      return;
    }
    await absenceBalanceLedgerService.consumeReservation(
      companyId,
      toLedgerRequest(request),
      allocationsForAbsenceRequest(request),
      actor,
      transaction,
    );
  },
};
