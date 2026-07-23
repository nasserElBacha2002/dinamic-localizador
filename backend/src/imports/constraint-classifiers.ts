import { isDuplicateKeyError } from "../utils/sql-server-errors";
import { OPERATIONAL_LOCATION_COMPANY_NAME_UNIQUE_INDEX } from "../utils/service-name-duplicate-errors";

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

const includesIndex = (error: unknown, indexName: string): boolean =>
  errorMessage(error).includes(indexName);

export const EMPLOYEE_COMPANY_PHONE_UNIQUE_INDEX = "UQ_employees_company_phone_number";

export type ClassifiedConstraintError = {
  code: string;
  field: string;
  message: string;
};

export const classifyEmployeeUniqueViolation = (
  error: unknown,
): ClassifiedConstraintError | null => {
  if (!isDuplicateKeyError(error)) {
    return null;
  }

  if (includesIndex(error, EMPLOYEE_COMPANY_PHONE_UNIQUE_INDEX)) {
    return {
      code: "EMPLOYEE_PHONE_ALREADY_EXISTS",
      field: "phoneNumber",
      message: "El teléfono ya está registrado",
    };
  }

  return {
    code: "EMPLOYEE_UNIQUE_CONSTRAINT_CONFLICT",
    field: "unknown",
    message: "Conflicto de unicidad al crear el colaborador.",
  };
};

export const classifyServiceUniqueViolation = (
  error: unknown,
): ClassifiedConstraintError | null => {
  if (!isDuplicateKeyError(error)) {
    return null;
  }

  if (includesIndex(error, OPERATIONAL_LOCATION_COMPANY_NAME_UNIQUE_INDEX)) {
    return {
      code: "SERVICE_NAME_ALREADY_EXISTS",
      field: "name",
      message: "Ya existe un servicio con este nombre en la compañía.",
    };
  }

  return {
    code: "SERVICE_UNIQUE_CONSTRAINT_CONFLICT",
    field: "unknown",
    message: "Conflicto de unicidad al crear el servicio.",
  };
};
