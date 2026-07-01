import type { NextFunction, Request, Response } from "express";
import { resolvePermissionsForRole } from "../constants/company-permissions";
import { AppError } from "../errors/app-error";
import { companyContextService } from "../services/company-context.service";
import type { AuthTokenPayload } from "../types/auth";
import type { Company, CompanyPermission, CompanyRole, UserCompanyMembership } from "../types/company";

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthTokenPayload;
    companyId?: string;
    company?: Company;
    membership?: UserCompanyMembership;
    companyRole?: CompanyRole;
    permissions?: Set<CompanyPermission>;
  }
}

const attachCompanyContext = (
  req: Request,
  companyId: string,
  company: Company,
  membership: UserCompanyMembership,
): void => {
  req.companyId = companyId;
  req.company = company;
  req.membership = membership;
  req.companyRole = membership.role;
  req.permissions = resolvePermissionsForRole(membership.role);
};

export const resolveCompanyContext = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Autenticación requerida." },
    });
    return;
  }

  try {
    const companyIdFromParams =
      typeof req.params.companyId === "string" ? req.params.companyId : undefined;

    const { company, membership } = await companyContextService.resolveCompanyContext(
      req.auth.userId,
      companyIdFromParams,
    );

    attachCompanyContext(req, company.id, company, membership);
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

export const requirePermission = (permission: CompanyPermission) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.permissions?.has(permission)) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "No tiene permisos para esta operación." },
      });
      return;
    }

    next();
  };
};
