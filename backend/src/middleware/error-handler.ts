import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import type { ApiErrorResponse } from "../types/http";
import { systemLogger } from "../utils/system-logs/logger";

export const notFoundHandler = (_req: Request, res: Response<ApiErrorResponse>): void => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Recurso no encontrado",
    },
  });
};

const normalizeRoute = (req: Request): string => {
  const base = req.baseUrl || "";
  const path = req.route?.path ? String(req.route.path) : req.path || "";
  return `${base}${path}`.slice(0, 200) || req.path.slice(0, 200);
};

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction,
): void => {
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      systemLogger.error({
        module: "http",
        event: "http.request.failed",
        message: error.message,
        errorCode: error.code,
        error,
        metadata: {
          method: req.method,
          route: normalizeRoute(req),
          statusCode: error.statusCode,
        },
      });
    } else if (error.statusCode >= 400 && env.NODE_ENV !== "production") {
      systemLogger.warn({
        module: "http",
        event: "http.request.rejected",
        message: error.message,
        errorCode: error.code,
        metadata: {
          method: req.method,
          route: normalizeRoute(req),
          statusCode: error.statusCode,
        },
      });
    }

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
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Los datos enviados son inválidos.",
        details: {
          issues: error.issues.map((issue) => ({
            path: issue.path,
            code: issue.code,
            message: issue.message,
          })),
        },
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

  systemLogger.error({
    module: "http",
    event: "http.request.failed",
    message: "Unhandled server error",
    errorCode: "INTERNAL_SERVER_ERROR",
    error,
    metadata: {
      method: req.method,
      route: normalizeRoute(req),
      statusCode: 500,
    },
  });

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Ocurrió un error inesperado",
    },
  });
};
