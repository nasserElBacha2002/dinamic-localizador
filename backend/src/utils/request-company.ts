import type { Request } from "express";
import { AppError } from "../errors/app-error";

export const requireRequestCompanyId = (req: Request): string => {
  if (!req.companyId) {
    throw new AppError(
      403,
      "COMPANY_CONTEXT_REQUIRED",
      "Se requiere contexto de empresa para esta operación.",
    );
  }

  return req.companyId;
};
