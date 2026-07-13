import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
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

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => issue.message).join("; ");
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message,
      },
    });
    return;
  }

  if (error instanceof Error && error.message === "INVALID_PHONE_FORMAT") {
    res.status(400).json({
      error: {
        code: "INVALID_PHONE_FORMAT",
        message: "El teléfono debe estar en formato E.164, por ejemplo +5491112345678",
      },
    });
    return;
  }

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Ocurrió un error inesperado",
    },
  });
};
