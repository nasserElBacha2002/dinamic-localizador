import { isDuplicateKeyError } from "./sql-server-errors";

export const OPERATIONAL_LOCATION_COMPANY_NAME_UNIQUE_INDEX =
  "UQ_operational_locations_company_id_name";

const includesIndexName = (error: unknown, indexName: string): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown }).message === "string"
        ? String((error as { message: string }).message)
        : String(error);

  return message.includes(indexName);
};

export const isOperationalLocationNameDuplicateKeyError = (error: unknown): boolean =>
  isDuplicateKeyError(error) &&
  includesIndexName(error, OPERATIONAL_LOCATION_COMPANY_NAME_UNIQUE_INDEX);
