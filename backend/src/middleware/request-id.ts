import type { NextFunction, Request, Response } from "express";
import {
  createRequestId,
  isSafeRequestId,
  runWithRequestLogContext,
} from "../utils/system-logs/request-log-context";

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const headerRaw = req.header("x-request-id");
  const requestId =
    headerRaw && isSafeRequestId(headerRaw.trim()) ? headerRaw.trim() : createRequestId();

  res.setHeader("x-request-id", requestId);

  runWithRequestLogContext(
    {
      requestId,
      correlationId: null,
      jobExecutionId: null,
    },
    () => {
      next();
    },
  );
};
