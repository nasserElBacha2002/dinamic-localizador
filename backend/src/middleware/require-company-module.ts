import type { NextFunction, Request, Response } from "express";
import type { CompanyModuleKey } from "../constants/company-modules";
import { companyModuleService } from "../services/company-module.service";
import { requireRequestCompanyId } from "../utils/request-company";

declare module "express-serve-static-core" {
  interface Request {
    companyModuleStates?: ReadonlyMap<CompanyModuleKey, boolean>;
  }
}

export const loadCompanyModuleStates = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const companyId = requireRequestCompanyId(req);
    req.companyModuleStates = await companyModuleService.getModuleStates(companyId);
    next();
  } catch (error) {
    next(error);
  }
};

export const requireCompanyModule =
  (moduleKey: CompanyModuleKey) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.companyModuleStates?.get(moduleKey)) {
      res.status(403).json({
        error: {
          code: "MODULE_DISABLED",
          message: "Este módulo no está habilitado para esta empresa.",
        },
      });
      return;
    }

    next();
  };

export const requireAnyCompanyModule =
  (...moduleKeys: CompanyModuleKey[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const enabled = moduleKeys.some((moduleKey) => req.companyModuleStates?.get(moduleKey));
    if (!enabled) {
      res.status(403).json({
        error: {
          code: "MODULE_DISABLED",
          message: "Este módulo no está habilitado para esta empresa.",
        },
      });
      return;
    }

    next();
  };
