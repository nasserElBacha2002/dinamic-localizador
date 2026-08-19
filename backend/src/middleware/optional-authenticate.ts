import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { userRepository } from "../repositories/user.repository";
import { authService, isSessionValid } from "../services/auth.service";

/** Attaches auth when Bearer token is present; does not require it. */
export const optionalAuthenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    next();
    return;
  }

  void (async () => {
    try {
      const payload = authService.verifyToken(token);
      const user = await userRepository.findById(payload.userId);
      if (!user || !isSessionValid(user, payload.tokenVersion)) {
        next(new AppError(401, "INVALID_TOKEN", "Token inválido o expirado."));
        return;
      }
      req.auth = payload;
      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      next(new AppError(401, "INVALID_TOKEN", "Token inválido o expirado."));
    }
  })();
};
