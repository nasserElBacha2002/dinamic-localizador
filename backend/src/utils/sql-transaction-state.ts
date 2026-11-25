import sql from "mssql";
import { AppError } from "../errors/app-error";

/** SQL Server XACT_STATE: 1 = committable active txn, 0 = no txn, -1 = uncommittable. */
export type XactState = -1 | 0 | 1;

export const readXactState = async (transaction: sql.Transaction): Promise<XactState> => {
  const result = await new sql.Request(transaction).query("SELECT XACT_STATE() AS xactState");
  const state = Number(result.recordset[0]?.xactState ?? 0);
  if (state === -1 || state === 0 || state === 1) {
    return state;
  }
  return 0;
};

export const assertActiveTransactionForMutation = (state: XactState): void => {
  if (state !== 1) {
    throw new AppError(
      409,
      "SQL_TRANSACTION_UNUSABLE",
      "La transacción no está activa o no es confirmable; reintentá la operación.",
    );
  }
};

/** Require XACT_STATE() = 1 before continuing a multi-statement employee mutation. */
export const assertTransactionActiveForMutation = async (
  transaction: sql.Transaction,
): Promise<void> => {
  const state = await readXactState(transaction);
  assertActiveTransactionForMutation(state);
};

/** @deprecated Use assertTransactionActiveForMutation (requires state 1, not only != -1). */
export const assertTransactionCommittable = assertTransactionActiveForMutation;