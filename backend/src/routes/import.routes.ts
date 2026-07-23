import { Router } from "express";
import { importController } from "../controllers/import.controller";
import { importStrategyRegistry } from "../imports/registry";
import { asyncHandler } from "../middleware/async-handler";
import { validate } from "../middleware/validate";
import {
  importEntityTypeParamSchema,
  importFileBodySchema,
} from "../schemas/import.schema";
import type { NextFunction, Request, Response } from "express";

const requireImportStrategyAccess = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const entityType = String(req.params.entityType ?? "");
    const strategy = importStrategyRegistry.get(entityType);

    if (!req.permissions?.has(strategy.permission)) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "No tiene permisos para esta operación." },
      });
      return;
    }

    const moduleEnabled = strategy.moduleKeys.some(
      (moduleKey) => req.companyModuleStates?.get(moduleKey),
    );
    if (!moduleEnabled) {
      res.status(403).json({
        error: {
          code: "MODULE_DISABLED",
          message: "Este módulo no está habilitado para esta empresa.",
        },
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const importRouter = Router({ mergeParams: true });

importRouter.get(
  "/:entityType/template",
  validate(importEntityTypeParamSchema, "params"),
  requireImportStrategyAccess,
  asyncHandler(importController.template),
);

importRouter.post(
  "/:entityType/preview",
  validate(importEntityTypeParamSchema, "params"),
  requireImportStrategyAccess,
  validate(importFileBodySchema),
  asyncHandler(importController.preview),
);

importRouter.post(
  "/:entityType/execute",
  validate(importEntityTypeParamSchema, "params"),
  requireImportStrategyAccess,
  validate(importFileBodySchema),
  asyncHandler(importController.execute),
);
