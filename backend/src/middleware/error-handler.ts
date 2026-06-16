import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import type { ApiErrorResponse } from "../types/http";

export const notFoundHandler = (_req: Request, res: Response<ApiErrorResponse>): void => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Recurso no encontrado",
    },
  });
};

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction,
): void => {
  if (env.NODE_ENV !== "production") {
    console.error(error);
  }

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Ocurrió un error inesperado",
    },
  });
};
