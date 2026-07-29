import type sql from "mssql";

/**
 * Rolls back a SQL transaction and logs structured context if rollback itself fails.
 * Always rethrows the original error.
 */
export const rollbackTransactionSafely = async (
  transaction: sql.Transaction,
  context: {
    operation: string;
    companyId?: string;
    entityId?: string;
    correlationId?: string | null;
  },
  originalError: unknown,
): Promise<never> => {
  try {
    await transaction.rollback();
  } catch (rollbackError) {
    console.error("[sql-transaction] rollback failed", {
      operation: context.operation,
      companyId: context.companyId ?? null,
      entityId: context.entityId ?? null,
      correlationId: context.correlationId ?? null,
      rollbackError:
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      originalError:
        originalError instanceof Error ? originalError.message : String(originalError),
    });
  }
  throw originalError;
};
