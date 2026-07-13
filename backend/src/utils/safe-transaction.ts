import sql from "mssql";

export const safeRollback = async (transaction: sql.Transaction): Promise<void> => {
  try {
    await transaction.rollback();
  } catch {
    // Transaction may already be committed or rolled back.
  }
};
