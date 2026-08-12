import { getDuplicateKeyConstraint, isDuplicateKeyError } from "./sql-server-errors";

const ACTIVE_OPERATION_UNIQUE = "UQ_scheduled_operations_active_service_start";

export const isActiveOperationDuplicateError = (error: unknown): boolean =>
  isDuplicateKeyError(error) &&
  (getDuplicateKeyConstraint(error) === ACTIVE_OPERATION_UNIQUE ||
    (typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string" &&
      String((error as { message: string }).message).includes(ACTIVE_OPERATION_UNIQUE)));
