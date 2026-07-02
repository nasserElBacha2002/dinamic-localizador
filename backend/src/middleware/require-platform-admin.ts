import type { NextFunction, Request, Response } from "express";
import { userRepository } from "../repositories/user.repository";
import { platformAdminService } from "../services/platform-admin.service";

export const requirePlatformAdmin = async (
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

  const user = await userRepository.findById(req.auth.userId);
  if (!user || !user.active || !platformAdminService.isPlatformAdmin(user)) {
    res.status(403).json({
      error: {
        code: "PLATFORM_ADMIN_REQUIRED",
        message: "Solo un superadministrador de plataforma puede realizar esta operación.",
      },
    });
    return;
  }

  req.isPlatformAdmin = true;
  next();
};
