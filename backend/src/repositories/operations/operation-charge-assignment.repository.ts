import sql from "mssql";
import { randomUUID } from "node:crypto";
import { AppError } from "../../errors/app-error";
import { getPool } from "../../database/connection";
import type { OperationChargeAssignment } from "../../types/operation-charge";
import {
  assertValidAssignmentDateRange,
  assignmentPeriodsOverlap,
} from "../../utils/operations/assignment-period";
import {
  acquireTransactionAppLock,
  companyUserEmployeeLinkLockResource,
  operationChargeAssignmentLockResource,
} from "../../utils/sql-app-lock";
import { assertEmployeeIsOperationalChargeHolderInTransaction } from "../../utils/employees/operational-charge-holder";

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const toDateOnly = (value: Date | string): string => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
};

const mapRow = (row: Record<string, unknown>): OperationChargeAssignment => ({
  id: String(row.id),
  companyId: String(row.company_id),
  operationId: String(row.operation_id),
  employeeId: String(row.employee_id),
  userId: String(row.user_id),
  validFrom: toDateOnly(row.valid_from as Date | string),
  validUntil: row.valid_until ? toDateOnly(row.valid_until as Date | string) : null,
  cancelledAt: row.cancelled_at ? toIso(row.cancelled_at as Date | string) : null,
  createdAt: toIso(row.created_at as Date | string),
  updatedAt: toIso(row.updated_at as Date | string),
  createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : null,
  endedByUserId: row.ended_by_user_id ? String(row.ended_by_user_id) : null,
  cancelledByUserId: row.cancelled_by_user_id ? String(row.cancelled_by_user_id) : null,
});

const NOT_CANCELLED = `cancelled_at IS NULL`;

const OVERLAP_CLAUSE = `
  ${NOT_CANCELLED}
  AND valid_from <= ISNULL(@validUntil, '9999-12-31')
  AND @validFrom <= ISNULL(valid_until, '9999-12-31')
`;

const mapOverlapToError = (
  conflict: ReturnType<typeof assignmentPeriodsOverlap>,
): AppError => {
  if (conflict === "already_assigned") {
    return new AppError(
      409,
      "CHARGE_ASSIGNMENT_ALREADY_EXISTS",
      "El encargado ya está asignado a esta operación en el período indicado.",
    );
  }
  return new AppError(
    409,
    "CHARGE_ASSIGNMENT_PERIOD_OVERLAP",
    "El período solicitado se superpone con otra asignación del encargado en esta operación.",
  );
};

export const operationChargeAssignmentRepository = {
  /**
   * Single write entry point: applock + overlap scan (UPDLOCK) + insert in one transaction.
   */
  async assignInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      operationId: string;
      userId: string;
      validFrom: string;
      validUntil: string | null;
      createdByUserId: string | null;
    },
  ): Promise<OperationChargeAssignment> {
    assertValidAssignmentDateRange(input.validFrom, input.validUntil);

    await acquireTransactionAppLock(transaction, {
      resource: companyUserEmployeeLinkLockResource(companyId, input.userId),
    });

    const linkRow = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("userId", sql.UniqueIdentifier, input.userId)
      .query(`
        SELECT TOP 1 employee_id
        FROM company_user_employee_links WITH (UPDLOCK, ROWLOCK)
        WHERE company_id = @companyId AND user_id = @userId
      `);
    const linkedEmployeeId = linkRow.recordset[0]?.employee_id;
    if (!linkedEmployeeId) {
      throw new AppError(
        409,
        "CHARGE_HOLDER_LINK_REQUIRED",
        "El usuario debe estar vinculado a un colaborador Encargado antes de asignar operaciones.",
      );
    }
    const employeeId = String(linkedEmployeeId);
    await assertEmployeeIsOperationalChargeHolderInTransaction(companyId, employeeId, transaction);

    await acquireTransactionAppLock(transaction, {
      resource: operationChargeAssignmentLockResource(companyId, input.operationId, input.userId),
      timeoutError: new AppError(
        409,
        "CHARGE_ASSIGNMENT_LOCK_TIMEOUT",
        "No se pudo registrar la asignación del encargado. Reintentá.",
      ),
    });

    const overlapping = await this.findOverlappingInTransaction(companyId, transaction, {
      operationId: input.operationId,
      userId: input.userId,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
    });

    if (overlapping) {
      const conflict = assignmentPeriodsOverlap({
        existing: {
          validFrom: overlapping.validFrom,
          validUntil: overlapping.validUntil,
          cancelledAt: overlapping.cancelledAt,
        },
        requested: { validFrom: input.validFrom, validUntil: input.validUntil },
      });
      if (conflict !== "no_overlap") {
        throw mapOverlapToError(conflict);
      }
    }

    const assignmentId = randomUUID();
    const result = await new sql.Request(transaction)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("userId", sql.UniqueIdentifier, input.userId)
      .input("validFrom", sql.Date, input.validFrom)
      .input("validUntil", sql.Date, input.validUntil)
      .input("createdByUserId", sql.UniqueIdentifier, input.createdByUserId)
      .query(`
        INSERT INTO operation_charge_assignments (
          id, company_id, operation_id, employee_id, user_id, valid_from, valid_until, created_by_user_id
        )
        OUTPUT INSERTED.*
        VALUES (
          @assignmentId, @companyId, @operationId, @employeeId, @userId, @validFrom, @validUntil, @createdByUserId
        )
      `);
    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async findOverlappingInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      operationId: string;
      userId: string;
      validFrom: string;
      validUntil: string | null;
      excludeAssignmentId?: string;
    },
  ): Promise<OperationChargeAssignment | null> {
    const request = new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("userId", sql.UniqueIdentifier, input.userId)
      .input("validFrom", sql.Date, input.validFrom)
      .input("validUntil", sql.Date, input.validUntil);

    if (input.excludeAssignmentId) {
      request.input("excludeAssignmentId", sql.UniqueIdentifier, input.excludeAssignmentId);
    }

    const result = await request.query(`
      SELECT TOP 1 *
      FROM operation_charge_assignments WITH (UPDLOCK, HOLDLOCK)
      WHERE company_id = @companyId
        AND operation_id = @operationId
        AND user_id = @userId
        ${input.excludeAssignmentId ? "AND id <> @excludeAssignmentId" : ""}
        AND ${OVERLAP_CLAUSE}
    `);

    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async findByIdForUpdateInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    assignmentId: string,
  ): Promise<OperationChargeAssignment | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .query(`
        SELECT TOP 1 *
        FROM operation_charge_assignments WITH (UPDLOCK, ROWLOCK)
        WHERE company_id = @companyId AND id = @assignmentId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async findById(companyId: string, assignmentId: string): Promise<OperationChargeAssignment | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .query(`
        SELECT TOP 1 *
        FROM operation_charge_assignments
        WHERE company_id = @companyId AND id = @assignmentId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async findByIdInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    assignmentId: string,
  ): Promise<OperationChargeAssignment | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .query(`
        SELECT TOP 1 *
        FROM operation_charge_assignments
        WHERE company_id = @companyId AND id = @assignmentId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async listByOperation(companyId: string, operationId: string): Promise<OperationChargeAssignment[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT *
        FROM operation_charge_assignments
        WHERE company_id = @companyId AND operation_id = @operationId
        ORDER BY valid_from DESC, created_at DESC
      `);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async listEffectiveByUserInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    userId: string,
    referenceDate: string,
  ): Promise<OperationChargeAssignment[]> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("userId", sql.UniqueIdentifier, userId)
      .input("referenceDate", sql.Date, referenceDate)
      .query(`
        SELECT *
        FROM operation_charge_assignments WITH (UPDLOCK, ROWLOCK)
        WHERE company_id = @companyId
          AND user_id = @userId
          AND cancelled_at IS NULL
          AND (valid_until IS NULL OR valid_until >= @referenceDate)
        ORDER BY operation_id ASC, valid_from ASC, id ASC
      `);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async listByUser(companyId: string, userId: string): Promise<OperationChargeAssignment[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT *
        FROM operation_charge_assignments
        WHERE company_id = @companyId AND user_id = @userId
        ORDER BY valid_from DESC, created_at DESC
      `);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async endInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    assignmentId: string,
    effectiveDate: string,
    endedByUserId: string | null,
    options?: { linkLockHeld?: boolean },
  ): Promise<OperationChargeAssignment | null> {
    const snapshot = await this.findByIdInTransaction(companyId, transaction, assignmentId);
    if (!snapshot) {
      return null;
    }

    if (!options?.linkLockHeld) {
      await acquireTransactionAppLock(transaction, {
        resource: companyUserEmployeeLinkLockResource(companyId, snapshot.userId),
      });
    }

    await acquireTransactionAppLock(transaction, {
      resource: operationChargeAssignmentLockResource(
        companyId,
        snapshot.operationId,
        snapshot.userId,
      ),
      timeoutError: new AppError(
        409,
        "CHARGE_ASSIGNMENT_LOCK_TIMEOUT",
        "No se pudo finalizar la asignación del encargado. Reintentá.",
      ),
    });

    const locked = await this.findByIdForUpdateInTransaction(companyId, transaction, assignmentId);
    if (!locked) {
      return null;
    }

    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .input("effectiveDate", sql.Date, effectiveDate)
      .input("endedByUserId", sql.UniqueIdentifier, endedByUserId)
      .query(`
        UPDATE operation_charge_assignments
        SET
          valid_until = @effectiveDate,
          ended_by_user_id = @endedByUserId,
          updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND id = @assignmentId
          AND cancelled_at IS NULL
          AND valid_from <= @effectiveDate
          AND (valid_until IS NULL OR valid_until > @effectiveDate)
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async cancelInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    assignmentId: string,
    cancelledByUserId: string,
    options?: { linkLockHeld?: boolean },
  ): Promise<OperationChargeAssignment | null> {
    const snapshot = await this.findByIdInTransaction(companyId, transaction, assignmentId);
    if (!snapshot) {
      return null;
    }

    if (!options?.linkLockHeld) {
      await acquireTransactionAppLock(transaction, {
        resource: companyUserEmployeeLinkLockResource(companyId, snapshot.userId),
      });
    }

    await acquireTransactionAppLock(transaction, {
      resource: operationChargeAssignmentLockResource(
        companyId,
        snapshot.operationId,
        snapshot.userId,
      ),
      timeoutError: new AppError(
        409,
        "CHARGE_ASSIGNMENT_LOCK_TIMEOUT",
        "No se pudo cancelar la asignación del encargado. Reintentá.",
      ),
    });

    const locked = await this.findByIdForUpdateInTransaction(companyId, transaction, assignmentId);
    if (!locked) {
      return null;
    }

    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .input("cancelledByUserId", sql.UniqueIdentifier, cancelledByUserId)
      .query(`
        UPDATE operation_charge_assignments
        SET
          cancelled_at = SYSUTCDATETIME(),
          cancelled_by_user_id = @cancelledByUserId,
          updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND id = @assignmentId
          AND cancelled_at IS NULL
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },
};
