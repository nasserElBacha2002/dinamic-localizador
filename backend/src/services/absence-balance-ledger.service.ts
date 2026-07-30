import sql from "mssql";
import {
  buildAbsenceBalanceIdempotencyKey,
  type AbsenceBalanceMovementType,
} from "../constants/absence-balance-ledger";
import { AppError } from "../errors/app-error";
import { absenceBalanceLedgerRepository } from "../repositories/absence-balance-ledger.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import type {
  AbsenceBalanceMovement,
  LedgerActor,
  YearQuantity,
} from "../types/absence-balance-ledger";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import { auditService } from "./audit.service";

type RequestRef = {
  id: string;
  employeeId: string;
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
};

const assertPositiveAllocations = (allocations: YearQuantity[]) => {
  for (const row of allocations) {
    if (!Number.isFinite(row.quantity) || row.quantity <= 0) {
      throw new AppError(400, "INVALID_BALANCE_QUANTITY", "La cantidad debe ser mayor a cero");
    }
  }
};

const assertIdempotentMatch = (
  existing: AbsenceBalanceMovement,
  expected: { movementType: AbsenceBalanceMovementType; quantity: number },
) => {
  if (
    existing.movementType !== expected.movementType ||
    Number(existing.quantity) !== Number(expected.quantity)
  ) {
    throw new AppError(
      409,
      "ABSENCE_BALANCE_IDEMPOTENCY_CONFLICT",
      "La clave de idempotencia ya existe con un payload incompatible",
    );
  }
};

const applyMovement = async (input: {
  companyId: string;
  employeeId: string;
  absenceTypeId: string;
  year: number;
  absenceRequestId?: string | null;
  movementType: AbsenceBalanceMovementType;
  quantity: number;
  direction: "CREDIT" | "DEBIT";
  idempotencyKey: string;
  reason?: string | null;
  actor: LedgerActor;
  delta: {
    granted?: number;
    reserved?: number;
    consumed?: number;
    available?: number;
  };
  transaction: sql.Transaction;
}): Promise<AbsenceBalanceMovement> => {
  const existing = await absenceBalanceLedgerRepository.findMovementByIdempotencyKey(
    input.companyId,
    input.idempotencyKey,
    input.transaction,
  );
  if (existing) {
    assertIdempotentMatch(existing, {
      movementType: input.movementType,
      quantity: input.quantity,
    });
    return existing;
  }

  const balance = await absenceBalanceLedgerRepository.ensureBalanceRow(
    input.companyId,
    input.employeeId,
    input.absenceTypeId,
    input.year,
    input.transaction,
  );

  const updated = await absenceBalanceLedgerRepository.applyProjectionDelta(
    input.companyId,
    balance.id,
    input.delta,
    balance.version,
    input.transaction,
  );
  if (!updated) {
    throw new AppError(
      409,
      "INSUFFICIENT_ABSENCE_BALANCE",
      "El empleado no tiene saldo suficiente o hubo un conflicto de concurrencia",
    );
  }

  try {
    const movement = await absenceBalanceLedgerRepository.insertMovement(
      input.companyId,
      {
        balanceId: balance.id,
        employeeId: input.employeeId,
        absenceTypeId: input.absenceTypeId,
        periodYear: input.year,
        absenceRequestId: input.absenceRequestId ?? null,
        movementType: input.movementType,
        quantity: input.quantity,
        direction: input.direction,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason ?? null,
        performedByUserId: input.actor.userId ?? null,
        performedByEmployeeId: input.actor.employeeId ?? null,
      },
      input.transaction,
    );

    await auditService.log(
      input.companyId,
      {
        entityType: "employee_absence_balance_movement",
        entityId: movement.id,
        action: input.movementType,
        newData: movement as unknown as Record<string, unknown>,
        reason: input.reason ?? null,
        userId: input.actor.userId ?? null,
      },
      input.transaction,
    );

    return movement;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const raced = await absenceBalanceLedgerRepository.findMovementByIdempotencyKey(
        input.companyId,
        input.idempotencyKey,
        input.transaction,
      );
      if (raced) {
        assertIdempotentMatch(raced, {
          movementType: input.movementType,
          quantity: input.quantity,
        });
        return raced;
      }
    }
    throw error;
  }
};

export const absenceBalanceLedgerService = {
  async isLedgerEnabled(companyId: string): Promise<boolean> {
    const settings = await companySettingsRepository.findByCompanyId(companyId);
    return Boolean(settings?.absenceBalanceLedgerEnabled);
  },

  async manualAdjustment(
    companyId: string,
    input: {
      employeeId: string;
      absenceTypeId: string;
      year: number;
      quantity: number;
      operation: "CREDIT" | "DEBIT";
      reason: string;
      idempotencyKey: string;
      actor: LedgerActor;
    },
    transaction: sql.Transaction,
  ): Promise<AbsenceBalanceMovement> {
    if (!input.reason.trim()) {
      throw new AppError(400, "ABSENCE_BALANCE_REASON_REQUIRED", "El motivo es obligatorio");
    }
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new AppError(400, "INVALID_BALANCE_QUANTITY", "La cantidad debe ser mayor a cero");
    }

    const movementType: AbsenceBalanceMovementType =
      input.operation === "CREDIT" ? "MANUAL_CREDIT" : "MANUAL_DEBIT";
    const signed = input.operation === "CREDIT" ? input.quantity : -input.quantity;

    return applyMovement({
      companyId,
      employeeId: input.employeeId,
      absenceTypeId: input.absenceTypeId,
      year: input.year,
      movementType,
      quantity: input.quantity,
      direction: input.operation,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason.trim(),
      actor: input.actor,
      delta: {
        granted: signed,
        available: signed,
      },
      transaction,
    });
  },

  async reserveForRequest(
    companyId: string,
    request: RequestRef,
    allocations: YearQuantity[],
    actor: LedgerActor,
    transaction: sql.Transaction,
  ): Promise<AbsenceBalanceMovement[]> {
    const absenceType = await absenceTypeRepository.findById(companyId, request.absenceTypeId);
    if (!absenceType?.deductsBalance) {
      return [];
    }
    assertPositiveAllocations(allocations);

    const movements: AbsenceBalanceMovement[] = [];
    for (const allocation of allocations) {
      movements.push(
        await applyMovement({
          companyId,
          employeeId: request.employeeId,
          absenceTypeId: request.absenceTypeId,
          year: allocation.year,
          absenceRequestId: request.id,
          movementType: "RESERVE",
          quantity: allocation.quantity,
          direction: "DEBIT",
          idempotencyKey: buildAbsenceBalanceIdempotencyKey.reserve(request.id, allocation.year),
          reason: "Reserva por solicitud pendiente",
          actor,
          delta: {
            reserved: allocation.quantity,
            available: -allocation.quantity,
          },
          transaction,
        }),
      );
    }
    return movements;
  },

  async releaseReservation(
    companyId: string,
    request: RequestRef,
    allocations: YearQuantity[],
    actor: LedgerActor,
    transaction: sql.Transaction,
  ): Promise<AbsenceBalanceMovement[]> {
    const absenceType = await absenceTypeRepository.findById(companyId, request.absenceTypeId);
    if (!absenceType?.deductsBalance) {
      return [];
    }
    assertPositiveAllocations(allocations);

    const movements: AbsenceBalanceMovement[] = [];
    for (const allocation of allocations) {
      movements.push(
        await applyMovement({
          companyId,
          employeeId: request.employeeId,
          absenceTypeId: request.absenceTypeId,
          year: allocation.year,
          absenceRequestId: request.id,
          movementType: "RELEASE",
          quantity: allocation.quantity,
          direction: "CREDIT",
          idempotencyKey: buildAbsenceBalanceIdempotencyKey.release(request.id, allocation.year),
          reason: "Liberación de reserva",
          actor,
          delta: {
            reserved: -allocation.quantity,
            available: allocation.quantity,
          },
          transaction,
        }),
      );
    }
    return movements;
  },

  async consumeReservation(
    companyId: string,
    request: RequestRef,
    allocations: YearQuantity[],
    actor: LedgerActor,
    transaction: sql.Transaction,
  ): Promise<AbsenceBalanceMovement[]> {
    const absenceType = await absenceTypeRepository.findById(companyId, request.absenceTypeId);
    if (!absenceType?.deductsBalance) {
      return [];
    }
    assertPositiveAllocations(allocations);

    const movements: AbsenceBalanceMovement[] = [];
    for (const allocation of allocations) {
      // Convert reserve → consume without changing available.
      movements.push(
        await applyMovement({
          companyId,
          employeeId: request.employeeId,
          absenceTypeId: request.absenceTypeId,
          year: allocation.year,
          absenceRequestId: request.id,
          movementType: "CONSUME",
          quantity: allocation.quantity,
          direction: "DEBIT",
          idempotencyKey: buildAbsenceBalanceIdempotencyKey.consume(request.id, allocation.year),
          reason: "Consumo por aprobación",
          actor,
          delta: {
            reserved: -allocation.quantity,
            consumed: allocation.quantity,
          },
          transaction,
        }),
      );
    }
    return movements;
  },

  async consumeDirect(
    companyId: string,
    request: RequestRef,
    allocations: YearQuantity[],
    actor: LedgerActor,
    transaction: sql.Transaction,
  ): Promise<AbsenceBalanceMovement[]> {
    const absenceType = await absenceTypeRepository.findById(companyId, request.absenceTypeId);
    if (!absenceType?.deductsBalance) {
      return [];
    }
    assertPositiveAllocations(allocations);

    const movements: AbsenceBalanceMovement[] = [];
    for (const allocation of allocations) {
      movements.push(
        await applyMovement({
          companyId,
          employeeId: request.employeeId,
          absenceTypeId: request.absenceTypeId,
          year: allocation.year,
          absenceRequestId: request.id,
          movementType: "CONSUME",
          quantity: allocation.quantity,
          direction: "DEBIT",
          idempotencyKey: buildAbsenceBalanceIdempotencyKey.consume(request.id, allocation.year),
          reason: "Consumo por autoaprobación",
          actor,
          delta: {
            consumed: allocation.quantity,
            available: -allocation.quantity,
          },
          transaction,
        }),
      );
    }
    return movements;
  },

  async adjustReservation(
    companyId: string,
    request: RequestRef,
    previousAllocations: YearQuantity[],
    nextAllocations: YearQuantity[],
    actor: LedgerActor,
    transaction: sql.Transaction,
  ): Promise<void> {
    const absenceType = await absenceTypeRepository.findById(companyId, request.absenceTypeId);
    if (!absenceType?.deductsBalance) {
      return;
    }

    const prevMap = new Map(previousAllocations.map((row) => [row.year, row.quantity]));
    const nextMap = new Map(nextAllocations.map((row) => [row.year, row.quantity]));
    const years = new Set([...prevMap.keys(), ...nextMap.keys()]);
    const version = Date.now();

    for (const year of years) {
      const previous = prevMap.get(year) ?? 0;
      const next = nextMap.get(year) ?? 0;
      const delta = Number((next - previous).toFixed(1));
      if (delta === 0) {
        continue;
      }

      if (delta > 0) {
        await applyMovement({
          companyId,
          employeeId: request.employeeId,
          absenceTypeId: request.absenceTypeId,
          year,
          absenceRequestId: request.id,
          movementType: "RESERVE",
          quantity: delta,
          direction: "DEBIT",
          idempotencyKey: buildAbsenceBalanceIdempotencyKey.reservationAdjustment(
            request.id,
            year,
            version,
          ),
          reason: "Ajuste de reserva (aumento)",
          actor,
          delta: { reserved: delta, available: -delta },
          transaction,
        });
      } else {
        const releaseQty = Math.abs(delta);
        await applyMovement({
          companyId,
          employeeId: request.employeeId,
          absenceTypeId: request.absenceTypeId,
          year,
          absenceRequestId: request.id,
          movementType: "RELEASE",
          quantity: releaseQty,
          direction: "CREDIT",
          idempotencyKey: buildAbsenceBalanceIdempotencyKey.reservationAdjustment(
            request.id,
            year,
            version,
          ),
          reason: "Ajuste de reserva (reducción)",
          actor,
          delta: { reserved: -releaseQty, available: releaseQty },
          transaction,
        });
      }
    }
  },

  /**
   * Recalculates reservation after NEEDS_INFO edit (dates/type/duration).
   * Same type → net RESERVE/RELEASE deltas.
   * Type change → release previous type, reserve next type (adjustment keys; never reuse release:v1).
   */
  async syncReservationAfterEdit(
    companyId: string,
    input: {
      requestId: string;
      employeeId: string;
      previousAbsenceTypeId: string;
      nextAbsenceTypeId: string;
      previousAllocations: YearQuantity[];
      nextAllocations: YearQuantity[];
      nextRequest: RequestRef;
    },
    actor: LedgerActor,
    transaction: sql.Transaction,
  ): Promise<void> {
    const previousType = await absenceTypeRepository.findById(
      companyId,
      input.previousAbsenceTypeId,
    );
    const nextType = await absenceTypeRepository.findById(companyId, input.nextAbsenceTypeId);

    const previousAllocations = previousType?.deductsBalance ? input.previousAllocations : [];
    const nextAllocations = nextType?.deductsBalance ? input.nextAllocations : [];

    if (input.previousAbsenceTypeId === input.nextAbsenceTypeId) {
      if (!nextType?.deductsBalance) {
        return;
      }
      await this.adjustReservation(
        companyId,
        input.nextRequest,
        previousAllocations,
        nextAllocations,
        actor,
        transaction,
      );
      return;
    }

    const version = Date.now();
    for (const allocation of previousAllocations) {
      if (allocation.quantity <= 0) {
        continue;
      }
      await applyMovement({
        companyId,
        employeeId: input.employeeId,
        absenceTypeId: input.previousAbsenceTypeId,
        year: allocation.year,
        absenceRequestId: input.requestId,
        movementType: "RELEASE",
        quantity: allocation.quantity,
        direction: "CREDIT",
        idempotencyKey: buildAbsenceBalanceIdempotencyKey.reservationAdjustment(
          input.requestId,
          allocation.year,
          version,
        ),
        reason: "Liberación por cambio de tipo en NEEDS_INFO",
        actor,
        delta: { reserved: -allocation.quantity, available: allocation.quantity },
        transaction,
      });
    }

    // Offset version so type-change reserve keys cannot collide with release keys same ms.
    const reserveVersion = version + 1;
    for (const allocation of nextAllocations) {
      if (allocation.quantity <= 0) {
        continue;
      }
      await applyMovement({
        companyId,
        employeeId: input.employeeId,
        absenceTypeId: input.nextAbsenceTypeId,
        year: allocation.year,
        absenceRequestId: input.requestId,
        movementType: "RESERVE",
        quantity: allocation.quantity,
        direction: "DEBIT",
        idempotencyKey: buildAbsenceBalanceIdempotencyKey.reservationAdjustment(
          input.requestId,
          allocation.year,
          reserveVersion,
        ),
        reason: "Reserva por cambio de tipo en NEEDS_INFO",
        actor,
        delta: { reserved: allocation.quantity, available: -allocation.quantity },
        transaction,
      });
    }
  },

  async listMovements(
    companyId: string,
    employeeId: string,
    absenceTypeId: string,
    filters: {
      year?: number;
      movementType?: AbsenceBalanceMovementType;
      page: number;
      limit: number;
    },
  ) {
    return absenceBalanceLedgerRepository.listMovements(
      companyId,
      employeeId,
      absenceTypeId,
      filters,
    );
  },

  /**
   * Reverses a reversible ledger movement (manual grants/debits and initial grants).
   * Request-bound RESERVE/RELEASE/CONSUME must use domain operations, not REVERSAL.
   */
  async reverseMovement(
    companyId: string,
    movementId: string,
    actor: LedgerActor,
    reason: string,
    transaction: sql.Transaction,
  ): Promise<AbsenceBalanceMovement> {
    if (!reason.trim()) {
      throw new AppError(400, "ABSENCE_BALANCE_REASON_REQUIRED", "El motivo es obligatorio");
    }

    const original = await absenceBalanceLedgerRepository.findMovementById(
      companyId,
      movementId,
      transaction,
    );
    if (!original) {
      throw new AppError(404, "ABSENCE_BALANCE_MOVEMENT_NOT_FOUND", "Movimiento no encontrado");
    }
    if (original.movementType === "REVERSAL") {
      throw new AppError(
        409,
        "ABSENCE_BALANCE_MOVEMENT_NOT_REVERSIBLE",
        "No se puede revertir un movimiento de reversión",
      );
    }

    const reversible = new Set<AbsenceBalanceMovementType>([
      "MANUAL_CREDIT",
      "MANUAL_DEBIT",
      "INITIAL_GRANT",
      "MIGRATION_ADJUSTMENT",
    ]);
    if (!reversible.has(original.movementType)) {
      throw new AppError(
        409,
        "ABSENCE_BALANCE_MOVEMENT_NOT_REVERSIBLE",
        "Este tipo de movimiento no se revierte con REVERSAL; usá la operación de dominio correspondiente",
      );
    }

    const signed =
      original.direction === "CREDIT" ? -original.quantity : original.quantity;

    return applyMovement({
      companyId,
      employeeId: original.employeeId,
      absenceTypeId: original.absenceTypeId,
      year: original.periodYear,
      absenceRequestId: original.absenceRequestId,
      movementType: "REVERSAL",
      quantity: original.quantity,
      direction: original.direction === "CREDIT" ? "DEBIT" : "CREDIT",
      idempotencyKey: buildAbsenceBalanceIdempotencyKey.reversal(original.id),
      reason: reason.trim(),
      actor,
      delta: {
        granted: signed,
        available: signed,
      },
      transaction,
    });
  },
};
