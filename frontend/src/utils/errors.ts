import axios from "axios";
import type { ApiErrorBody } from "../types/api";

export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export function isRecurringWorkdaySyncError(error: unknown): boolean {
  return parseApiError(error).code === "RECURRING_WORKDAY_SYNC_FAILED";
}

export function getApiErrorMessage(error: unknown, fallback = "Ocurrió un error inesperado"): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function getApiErrorCode(error: unknown): string | undefined {
  if (error instanceof ApiError) {
    return error.code;
  }

  return undefined;
}

export function parseApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const code = error.response?.data?.error?.code ?? "UNKNOWN_ERROR";
    const message = error.response?.data?.error?.message ?? error.message;
    return new ApiError(message, code, error.response?.status);
  }

  if (error instanceof Error) {
    return new ApiError(error.message, "UNKNOWN_ERROR");
  }

  return new ApiError("Ocurrió un error inesperado", "UNKNOWN_ERROR");
}
