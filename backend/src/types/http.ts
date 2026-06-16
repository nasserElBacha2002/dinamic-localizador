import type { Request } from "express";

export interface ApiSuccessResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type ValidatedRequest<T> = Request & {
  validatedQuery: T;
};

declare module "express-serve-static-core" {
  interface Request {
    validatedQuery?: unknown;
  }
}
