import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { operationalManagerEligibilityService } from "../services/companies/operational-manager-eligibility.service";

export const enforceOperationalManagerEligibility = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (req.isPlatformAdmin || req.companyRole !== "OPERATIONAL_MANAGER") {
    next();
    return;
  }

  if (!req.auth?.userId || !req.companyId) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Autenticación requerida." },
    });
    return;
  }

  try {
    await operationalManagerEligibilityService.assertEligible(req.companyId, req.auth.userId);
    next();
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
      return;
    }
    next(error);
  }
};
